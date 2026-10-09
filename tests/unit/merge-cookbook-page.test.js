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

  it("never windows or partitions on commit time; staging uses load time", () => {
    // a commit-date window drops a change committed on day 1 that is
    // loaded on day 5, so the key is never merged
    expect(allCode).not.toMatch(/DATE\(\s*OP_TS\s*\)/i);
    expect(allCode).not.toMatch(/PARTITION BY[^\n]*OP_TS/i);
    const uses = [...allCode.matchAll(/DATE\(INGESTED_AT\)/g)];
    expect(uses.length).toBeGreaterThan(0);
    for (const m of uses) {
      const line = allCode.slice(
        allCode.lastIndexOf("\n", m.index) + 1,
        allCode.indexOf("\n", m.index),
      );
      expect(line).toMatch(
        /PARTITION BY DATE\(INGESTED_AT\)|optional pruning, on LOAD time/,
      );
    }
    // ... and the partitioned table is staging, not the target.
    const bq = cards.find((c) => c.name === "bigquery");
    const targetDdl = bq.code.match(
      /CREATE TABLE `dataset\.TARGET_CUSTOMERS`[\s\S]*?;/,
    )[0];
    expect(targetDdl).not.toMatch(/OP_TS|INGESTED_AT|PARTITION BY/);
    expect(prose).toMatch(/window on load time, never on commit time/);
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
      // row/tuple form: (a, b) >= (c, d) and (a, b) <= (c, d)
      expect(c.code).not.toMatch(/\)\s*(?:>=|<=)\s*\(/);
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

  // The exact guard, direction and strictness included, plus the delete
  // branch: it must set the marker from op = 'd' and carry the position.
  // Whitespace is normalised so the SQL can be re-flowed.
  const flat = (name) =>
    cards
      .find((c) => c.name === name)
      .code.replace(/--.*$/gm, "")
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
  const guard = (l, r, pos, ord) =>
    `(${l}.${pos} > ${r}.${pos} OR (${l}.${pos} = ${r}.${pos} AND ${l}.${ord} > ${r}.${ord}))`;

  it.each(["snowflake", "bigquery", "databricks delta"])(
    "%s: exact guard WHEN MATCHED AND (s > t OR (s = t AND s.SEQ > t.SEQ)) and marker from op",
    (name) => {
      const sql = flat(name);
      expect(sql).toContain(
        `WHEN MATCHED AND ${guard("s", "t", "SOURCE_LSN", "SEQ")} THEN`,
      );
      expect(sql).toContain("IS_DELETED = (s.OP = 'd')");
      expect(sql).toContain("SOURCE_LSN = s.SOURCE_LSN");
      expect(sql).toContain("SEQ = s.SEQ");
      expect(sql).toContain(
        "INSERT (ID, EMAIL, IS_DELETED, SOURCE_LSN, SEQ) VALUES (s.ID, s.EMAIL, (s.OP = 'd'), s.SOURCE_LSN, s.SEQ)",
      );
      // the direction is not flipped and not made non-strict
      expect(sql).not.toMatch(/s\.SOURCE_LSN < t\.SOURCE_LSN/);
      expect(sql).not.toMatch(/IS_DELETED = (?:0|FALSE)/i);
    },
  );

  it("oracle: guard in the update WHERE, marker from op, scn loaded with TO_NUMBER", () => {
    const sql = flat("oracle");
    expect(sql).toContain(
      `WHERE s.source_scn > t.source_scn OR (s.source_scn = t.source_scn AND s.seq > t.seq) WHEN NOT MATCHED`,
    );
    expect(sql).toContain(
      "t.is_deleted = CASE WHEN s.op = 'd' THEN 1 ELSE 0 END",
    );
    expect(sql).toContain("t.source_scn = s.source_scn");
    expect(sql).toContain("t.seq = s.seq");
    expect(sql).toContain("TO_NUMBER(scn)");
    expect(sql).toContain("COALESCE(ssn, 0)");
    expect(sql).not.toMatch(/is_deleted = (?:0|1)\b/);
  });

  it("sql server: exact three-level guard, marker from op, snapshot NULLs coalesced on load", () => {
    const sql = flat("sql server");
    expect(sql).toContain(
      "WHEN MATCHED AND (s.commit_lsn > t.commit_lsn OR (s.commit_lsn = t.commit_lsn AND s.change_lsn > t.change_lsn) OR (s.commit_lsn = t.commit_lsn AND s.change_lsn = t.change_lsn AND s.event_serial_no > t.event_serial_no)) THEN",
    );
    expect(sql).toContain(
      "is_deleted = CASE WHEN s.op = 'd' THEN 1 ELSE 0 END, commit_lsn = s.commit_lsn, change_lsn = s.change_lsn, event_serial_no = s.event_serial_no",
    );
    expect(sql).not.toMatch(/is_deleted = (?:0|1)\b/);
    // snapshot rows carry NULL change_lsn / event_serial_no
    expect(sql).toContain("COALESCE(CONVERT(BINARY(10)");
    expect(sql).toContain("0x00000000000000000000");
    expect(sql).toContain("COALESCE(event_serial_no, 0)");
    expect(sql).toMatch(/CREATE TABLE dbo\.target_customers/);
    expect(sql).toMatch(/change_lsn BINARY\(10\) NOT NULL/);
  });

  it("postgres: exact guard (t.source_lsn, t.seq) < (EXCLUDED...), marker from op", () => {
    const sql = flat("postgres");
    expect(sql).toContain(
      "WHERE (t.source_lsn, t.seq) < (EXCLUDED.source_lsn, EXCLUDED.seq);",
    );
    expect(sql).toContain(
      "SELECT s.id, s.email, (s.op = 'd'), s.source_lsn, s.seq",
    );
    expect(sql).toContain("is_deleted = EXCLUDED.is_deleted");
    expect(sql).toContain("source_lsn = EXCLUDED.source_lsn");
    expect(sql).toContain("seq = EXCLUDED.seq");
  });

  it("mysql: exact tuple guard (s) > (t), marker from op, temp table dropped first", () => {
    const sql = flat("mysql");
    expect(sql).toContain(
      "WHERE (s.binlog_file, s.binlog_pos, s.row_idx) > (t.binlog_file, t.binlog_pos, t.row_idx);",
    );
    expect(sql).toContain("t.is_deleted = (s.op = 'd')");
    expect(sql).toContain("t.binlog_file = s.binlog_file");
    expect(sql).toContain("t.binlog_pos = s.binlog_pos");
    expect(sql).toContain("t.row_idx = s.row_idx");
    expect(sql).toContain("SELECT s.id, s.email, (s.op = 'd'), s.binlog_file");
    expect(
      sql.indexOf("DROP TEMPORARY TABLE IF EXISTS tmp_latest"),
    ).toBeGreaterThan(-1);
    expect(sql.indexOf("DROP TEMPORARY TABLE")).toBeLessThan(
      sql.indexOf("CREATE TEMPORARY TABLE"),
    );
  });

  it("redshift: exact guard in UPDATE ... FROM, marker from op, temp table dropped first", () => {
    const sql = flat("redshift");
    expect(sql).toContain(
      `AND ${guard("s", "target_customers", "source_lsn", "seq")};`,
    );
    expect(sql).toContain("is_deleted = (s.op = 'd')");
    expect(sql).toContain(
      "SELECT s.id, s.email, (s.op = 'd'), s.source_lsn, s.seq",
    );
    expect(sql.indexOf("DROP TABLE IF EXISTS stg_dedup")).toBeLessThan(
      sql.indexOf("CREATE TEMP TABLE stg_dedup"),
    );
  });

  it.each(["snowflake", "bigquery", "databricks delta"])(
    "%s: a key the target has never seen always inserts, a delete as a marker",
    (name) => {
      // no extra condition on the insert branch (AND s.OP <> 'd' would drop
      // the delete marker and let a late older insert create the row)
      expect(flat(name)).toContain(
        "WHEN NOT MATCHED THEN INSERT (ID, EMAIL, IS_DELETED, SOURCE_LSN, SEQ) VALUES (s.ID, s.EMAIL, (s.OP = 'd'), s.SOURCE_LSN, s.SEQ);",
      );
    },
  );

  it("oracle and sql server: the insert branch is unconditional and writes the marker from op", () => {
    expect(flat("oracle")).toContain(
      "WHEN NOT MATCHED THEN INSERT (id, email, is_deleted, source_scn, seq) VALUES (s.id, s.email, CASE WHEN s.op = 'd' THEN 1 ELSE 0 END, s.source_scn, s.seq);",
    );
    expect(flat("sql server")).toContain(
      "WHEN NOT MATCHED BY TARGET THEN INSERT (id, email, is_deleted, commit_lsn, change_lsn, event_serial_no) VALUES (s.id, s.email, CASE WHEN s.op = 'd' THEN 1 ELSE 0 END, s.commit_lsn, s.change_lsn, s.event_serial_no);",
    );
  });

  // The dedupe must rank by the same key the guard compares by, newest first,
  // on every column (an ASC ordinal would pick the older of two changes that
  // share a position).
  it.each([
    ["snowflake", "PARTITION BY ID ORDER BY SOURCE_LSN DESC, SEQ DESC"],
    ["bigquery", "PARTITION BY ID ORDER BY SOURCE_LSN DESC, SEQ DESC"],
    ["databricks delta", "PARTITION BY ID ORDER BY SOURCE_LSN DESC, SEQ DESC"],
    ["oracle", "PARTITION BY c.id ORDER BY c.source_scn DESC, c.seq DESC"],
    [
      "sql server",
      "PARTITION BY id ORDER BY commit_lsn DESC, change_lsn DESC, event_serial_no DESC",
    ],
    ["postgres", "PARTITION BY id ORDER BY source_lsn DESC, seq DESC"],
    [
      "mysql",
      "PARTITION BY id ORDER BY binlog_file DESC, binlog_pos DESC, row_idx DESC",
    ],
    ["redshift", "PARTITION BY id ORDER BY source_lsn DESC, seq DESC"],
  ])("%s: dedupe ranks by the full key, every column DESC", (name, clause) => {
    const sql = flat(name);
    expect(sql).toContain(`ROW_NUMBER() OVER (${clause})`);
    expect(sql).not.toMatch(/ORDER BY[^)]*\bASC\b/i);
  });

  it("bigquery: INGESTED_AT is set by a default, and DEFAULT precedes NOT NULL", () => {
    expect(flat("bigquery")).toContain(
      "INGESTED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP() NOT NULL",
    );
  });

  it("oracle rs_id text comparison is qualified, and agrees with the general rule", () => {
    expect(prose).toMatch(
      /fixed-width, zero-padded, single-case hex under a binary sort/,
    );
    expect(prose).toMatch(
      /the one text form that is safe is a fixed-width, zero-padded, single-case hex string/,
    );
  });

  it("redshift and mysql insert only keys the target has never seen", () => {
    expect(flat("redshift")).toContain(
      "LEFT JOIN target_customers t ON t.id = s.id WHERE t.id IS NULL;",
    );
    expect(flat("mysql")).toContain(
      "FROM tmp_latest s WHERE NOT EXISTS (SELECT 1 FROM target_customers t WHERE t.id = s.id);",
    );
  });

  it("states the NULL-ordering and no-tie-break caveats, and the commit-date window pitfall", () => {
    expect(prose).toMatch(/NOT NULL on staging too/);
    expect(prose).toMatch(
      /NULL sorts first under DESC in Postgres, Redshift, Snowflake and Oracle/,
    );
    expect(prose).toMatch(/no final tie-break/);
    expect(prose).toMatch(/committed on day 1 that reaches staging on day 5/);
    expect(prose).toMatch(/scn.*string/i);
    expect(prose).toMatch(/I found no statement about ON DUPLICATE KEY UPDATE/);
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
