/**
 * Guard: /merge-cookbook/ teaches the site's thesis (P15-22) and the old
 * timestamp-ordered teaching cannot come back.
 *
 * Thesis: delivery is at-least-once; correctness comes from an idempotent
 * sink keyed on the primary key and ordered by the SOURCE LOG POSITION (with
 * an ordinal where positions repeat), never by OP_TS / ts_ms or a Kafka
 * offset; deletes are markers that carry a position. Timestamps stay for
 * partition pruning, retention and lag metrics only.
 *
 * This reads the page source. It cannot prove the SQL is valid in each
 * dialect (the page marks everything except Postgres as untested); it pins
 * the teaching.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = readFileSync(
  path.join(ROOT, "src/merge-cookbook/index.njk"),
  "utf8",
);

const unescape = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Every <pre><code> block, unescaped, in page order.
const codeBlocks = [
  ...source.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g),
].map((m) => unescape(m[1]));
const allCode = codeBlocks.join("\n\n");

// The per-dialect cards: { name, code, html }.
const cards = [
  ...source.matchAll(
    /<article class="box">\s*<h2>([^<]+)<\/h2>([\s\S]*?)<\/article>/g,
  ),
].map((m) => ({
  name: m[1].trim(),
  html: m[2],
  code: unescape(m[2].match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)?.[1] ?? ""),
}));

// Prose with the code stripped, unescaped, for wording checks.
const prose = unescape(
  source
    .replace(/<pre><code>[\s\S]*?<\/code><\/pre>/g, "")
    .replace(/<[^>]+>/g, " "),
)
  .replace(/\s+/g, " ")
  .trim();

describe("merge cookbook: front matter", () => {
  it("has the required keys, a dated change and a description within 160 chars", () => {
    expect(source).toMatch(/^layout: base\.njk$/m);
    expect(source).toMatch(/^canonicalPath: "\/merge-cookbook\/"$/m);
    expect(source).toMatch(/^datePublished: "2026-02-06"$/m);
    const modified = source.match(
      /^dateModified: "(\d{4}-\d{2}-\d{2})"$/m,
    )?.[1];
    expect(modified).toBeDefined();
    expect(modified >= "2026-10-09").toBe(true);
    const desc = source.match(/^description: "(.+)"$/m)?.[1] ?? "";
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(160);
  });
});

describe("merge cookbook: banned patterns stay out of the examples", () => {
  it("never orders or ranks by OP_TS", () => {
    expect(allCode).not.toMatch(/ORDER\s+BY\s+(\w+\.)?OP_TS/i);
    expect(allCode).not.toMatch(/ORDER\s+BY[^;)]*,\s*(\w+\.)?OP_TS/i);
    expect(source).not.toMatch(/ORDER\s+BY\s+(\w+\.)?OP_TS/i);
  });

  it("never compares OP_TS with an operator, in code or in prose", () => {
    // s.OP_TS >= t.OP_TS, OP_TS >= NOW() - ..., t.op_ts < d.op_ts, etc.
    const text = `${allCode}\n${prose}`;
    expect(text).not.toMatch(/\bop_ts\s*(?:>=|<=|>|<|=)/i);
    expect(text).not.toMatch(/(?:>=|<=|>|<)\s*(?:\w+\.)?op_ts\b/i);
    expect(text).not.toMatch(/GREATEST\s*\(/i);
    expect(text).not.toMatch(/NOW\(\)\s*-\s*INTERVAL/i);
  });

  it("uses DATE(OP_TS) only to partition the staging table", () => {
    const uses = [...allCode.matchAll(/DATE\(OP_TS\)/g)];
    expect(uses.length).toBeGreaterThan(0);
    for (const m of uses) {
      const line = allCode.slice(
        allCode.lastIndexOf("\n", m.index) + 1,
        allCode.indexOf("\n", m.index),
      );
      // PARTITION BY DATE(OP_TS), or the optional pruning comment.
      expect(line).toMatch(/PARTITION BY DATE\(OP_TS\)|optional pruning/);
    }
    // ... and the partitioned table is staging, not the target.
    const bq = cards.find((c) => c.name === "bigquery");
    const targetDdl = bq.code.match(
      /CREATE TABLE `dataset\.TARGET_CUSTOMERS`[\s\S]*?;/,
    )[0];
    expect(targetDdl).not.toMatch(/OP_TS|PARTITION BY/);
  });

  it("never physically deletes, except one marked purge of old markers", () => {
    // MERGE ... THEN DELETE, Oracle DELETE WHERE, MySQL DELETE t FROM ...
    expect(allCode).not.toMatch(/\bTHEN\s+DELETE\b/i);
    expect(allCode).not.toMatch(/\bDELETE\s+WHERE\b/i);
    expect(allCode).not.toMatch(/\bDELETE\s+\w+\s+FROM\b/i);
    const deletes = codeBlocks.filter((b) => /\bDELETE\s+FROM\b/i.test(b));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatch(/-- physical delete \(purge\)/);
    expect(deletes[0]).toMatch(/WHERE is_deleted AND source_lsn </);
    // the cards themselves contain no DELETE statement at all
    for (const c of cards) {
      expect(c.code.replace(/--.*$/gm, "")).not.toMatch(/\bDELETE\b/i);
    }
  });

  it("does not teach a timestamp, a Kafka offset or a weak guard as the ordering key", () => {
    expect(prose).not.toMatch(/we accept an incoming row if its OP_TS/i);
    expect(prose).not.toMatch(/ordering surrogate/i);
    expect(prose).not.toMatch(/either actually delete or/i);
    expect(prose).not.toMatch(/latest-wins[^.]*max OP_TS/i);
  });

  it("never uses a non-strict comparison on a log position in an apply guard", () => {
    for (const c of cards) {
      expect(c.code).not.toMatch(
        /\b\w*\.?(?:source_lsn|source_scn|commit_lsn|change_lsn|binlog_pos|seq|row_idx|event_serial_no)\s*(?:>=|<=)/i,
      );
    }
  });
});

describe("merge cookbook: every dialect applies the log-position rule", () => {
  const dialects = [
    "snowflake",
    "bigquery",
    "databricks delta",
    "oracle",
    "sql server",
    "postgres",
    "mysql",
    "redshift",
  ];

  it("has exactly the expected cards", () => {
    expect(cards.map((c) => c.name)).toEqual(dialects);
  });

  it.each(dialects)(
    "%s: strict guard on (position, ordinal), delete marker, ordered dedupe",
    (name) => {
      const { code } = cards.find((c) => c.name === name);
      // strict comparison on (position, ordinal): either expanded
      // (a > b OR (a = b AND seq > seq)) or a row comparison (a, seq) < (b, seq)
      const POS = "(?:source_lsn|source_scn|commit_lsn|binlog_file)";
      const ORD = "(?:seq|event_serial_no|row_idx)";
      const expanded =
        new RegExp(`${POS}\\b[^\\n]*[<>]`, "i").test(code) &&
        new RegExp(`${ORD}\\b[^\\n]*[<>]`, "i").test(code);
      const tuple = new RegExp(
        `\\([^)]*${POS}[^)]*${ORD}[^)]*\\)\\s*[<>]\\s*\\(`,
        "i",
      ).test(code);
      expect(expanded || tuple).toBe(true);
      // the delete is a marker carrying a position, not a removal
      expect(code).toMatch(/is_deleted/i);
      expect(code).toMatch(/op\s*=\s*'d'/i);
      // dedupe to one row per key, newest position first
      expect(code).toMatch(/ROW_NUMBER\(\)/i);
      expect(code).toMatch(
        /ORDER BY\s+(?:\w+\.)?(?:source_lsn|source_scn|commit_lsn|binlog_file)\s+DESC/i,
      );
      // a delete of an unseen key still lands as a marker
      expect(code).toMatch(
        /\(\s*(?:s\.)?op\s*=\s*'d'\s*\)|CASE WHEN s\.op = 'd'/i,
      );
    },
  );

  it.each(dialects)("%s: states whether the SQL was run", (name) => {
    const { html } = cards.find((c) => c.name === name);
    expect(html).toMatch(/<strong>status:<\/strong>\s*(?:untested|executed)/);
    if (name !== "postgres") {
      expect(html).toMatch(/<strong>status:<\/strong>\s*untested/);
    }
  });

  it("SQL Server compares the full (commit_lsn, change_lsn, event_serial_no) tuple", () => {
    const { code } = cards.find((c) => c.name === "sql server");
    expect(code).toMatch(/s\.commit_lsn > t\.commit_lsn/);
    expect(code).toMatch(/s\.change_lsn > t\.change_lsn/);
    expect(code).toMatch(/s\.event_serial_no > t\.event_serial_no/);
    expect(code).toMatch(/WHEN NOT MATCHED BY TARGET/);
    expect(code.trimEnd().endsWith(";")).toBe(true);
  });

  it("Redshift does not put an AND condition on a MERGE WHEN clause", () => {
    const { code } = cards.find((c) => c.name === "redshift");
    expect(code).not.toMatch(/\bMERGE\b/i);
    expect(code).not.toMatch(/WHEN\s+(?:NOT\s+)?MATCHED\s+AND/i);
  });
});

describe("merge cookbook: the page agrees with the rest of the site", () => {
  it("states the delivery guarantee and the exactly-once limit", () => {
    expect(prose).toMatch(/at-least-once/i);
    expect(prose).toMatch(
      /end-to-end exactly-once across independent systems is not achievable/i,
    );
    expect(prose).toMatch(/exactly-once processing/i);
    expect(source).toContain("{{ '/exactly-once/' | url }}");
  });

  it("names log position as the ordering key and rejects the timestamp and the offset", () => {
    expect(prose).toMatch(/source log position/i);
    expect(prose).toMatch(/strictly greater/i);
    expect(prose).toMatch(/not by a clock and not by a Kafka offset/i);
    expect(prose).toMatch(/two changes to one row can share a millisecond/i);
    expect(prose).toMatch(
      /partition pruning, retention windows and lag metrics only/i,
    );
  });

  it("names each source's position field", () => {
    for (const field of [
      "source.lsn",
      "binlog file",
      "scn",
      "commit_lsn",
      "change_lsn",
      "event_serial_no",
    ]) {
      expect(prose.toLowerCase()).toContain(field);
    }
  });

  it("explains delete markers and lineage, and links the sibling pages by url filter", () => {
    expect(prose).toMatch(/delete markers/i);
    expect(prose).toMatch(/source_epoch/);
    expect(source).toContain("{{ '/partitioning/' | url }}#recon");
    // no hardcoded absolute internal links
    expect(source).not.toMatch(/href="\/(?!\/)/);
  });

  it("marks everything that was not run as untested, on the page and in the box", () => {
    expect(prose).toMatch(/every other statement is untested/i);
  });
});
