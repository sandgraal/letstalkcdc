/**
 * Guard: /is-cdc-exactly-once/ (content-gap plan M2). Reads the real page
 * source. Scope: every exactly-once statement is per hop, the Debezium hedge
 * and the Kafka issue statuses are kept, links resolve, and the page's SQL is
 * executed (in SQLite, which shares the ON CONFLICT ... WHERE form; it is not
 * run on PostgreSQL).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import glossary from "../../src/_data/glossary.mjs";
import series from "../../src/_data/series.mjs";
import { parseAssistantYaml } from "../../lib/assistant-yaml.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const require = createRequire(import.meta.url);

const page = read("src/is-cdc-exactly-once/index.njk");
const data = require(
  path.join(ROOT, "src/is-cdc-exactly-once/index.11tydata.cjs"),
);
const flat = (s) => s.replace(/\s+/g, " ");
const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html) =>
  flat(
    decode(html.replace(/<[^>]+>/g, " ").replace(/&[lr]dquo;/g, '"')),
  ).trim();
const prose = text(page.replace(/<pre>[\s\S]*?<\/pre>/g, ""));
const codeBlocks = [
  ...page.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g),
].map((m) => decode(m[1]));

describe("front matter and registration", () => {
  const fm = page.match(/^---\n([\s\S]*?)\n---/)[1];
  const title = fm.match(/^title: "(.+)"$/m)[1];
  const description = fm.match(/^description: "(.+)"$/m)[1];

  it("fits title and description limits", () => {
    expect(title.length).toBeLessThanOrEqual(34);
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("has dates, canonical path and a matching series entry", () => {
    expect(fm).toMatch(/^canonicalPath: "\/is-cdc-exactly-once\/"$/m);
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
    expect(data.seriesKey).toBe("is-cdc-exactly-once");
    const entry = series.find((s) => s.key === "is-cdc-exactly-once");
    expect(entry.href).toBe("is-cdc-exactly-once/");
  });

  it("has one h1 source (the hero) and five valid quiz questions", () => {
    expect(page).not.toMatch(/<h1[\s>]/);
    expect(page).toContain("{{ ui.hero(heroConfig) | safe }}");
    expect(data.quizConfig.questions).toHaveLength(5);
    for (const q of data.quizConfig.questions) {
      expect(q.options).toHaveLength(4);
      expect(Number(q.correct)).toBeGreaterThanOrEqual(1);
      expect(Number(q.correct)).toBeLessThanOrEqual(4);
    }
  });
});

describe("required sections", () => {
  it.each([
    "claims",
    "hops",
    "connect-eos",
    "kafka-to-kafka",
    "sink",
    "decide",
    "verify",
    "try-it",
    "resources",
  ])("has section %s", (id) => {
    expect(page).toContain(
      `<section id="${id}" aria-labelledby="${id}-title">`,
    );
    expect(page).toContain(`<h2 id="${id}-title">`);
  });

  it("asks the five scoping questions and has a four-hop table", () => {
    for (const q of [
      "Which hop?",
      "Which producer or connector",
      "Which sink?",
      "What happens on failover?",
      "What dedupes",
    ]) {
      expect(prose).toContain(q);
    }
    const hops = page.slice(
      page.indexOf('id="hops"'),
      page.indexOf('id="connect-eos"'),
    );
    const body = hops.slice(hops.indexOf("<tbody>"), hops.indexOf("</tbody>"));
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    expect(rows).toHaveLength(4);
    for (const r of rows)
      expect([...r.matchAll(/<t[dh][ >]/g)]).toHaveLength(4);
  });
});

describe("the Kafka Connect opt-in and the Debezium hedge", () => {
  it("states the prerequisites, settings and connectors", () => {
    for (const s of [
      "exactly.once.source.support=enabled",
      "exactly.once.support",
      "transaction.boundary",
      "3.3.0",
      "distributed mode",
      "KIP-618",
      "KIP-98",
      "KIP-447",
      "KIP-890",
      "preparing",
      "Debezium 3.7",
      "2026-10-09",
    ]) {
      expect(page, s).toContain(s);
    }
    for (const db of [
      "MariaDB",
      "MongoDB",
      "MySQL",
      "Oracle",
      "PostgreSQL",
      "SQL Server",
    ]) {
      expect(prose, db).toContain(db);
    }
  });

  it("keeps the hedge and the issue statuses", () => {
    expect(prose).toMatch(
      /unclear whether the implementation is fully correct/,
    );
    expect(prose).toMatch(/Jepsen/);
    expect(prose).toMatch(/no internal deduplication layer/);
    for (const k of ["KAFKA-17734", "KAFKA-17754", "KAFKA-17582"]) {
      expect(prose, k).toContain(k);
    }
    expect(prose).toMatch(
      /KAFKA-17754 .{0,160}Resolved \(Fixed\) on 2026-08-12/,
    );
    expect(prose).toMatch(
      /lists all three as open, so the page and JIRA disagree/,
    );
    expect(prose).not.toMatch(/KAFKA-17754[^;,.]{0,40}\bis open\b/);
  });

  it("does not accuse a vendor and calls its phrases examples", () => {
    expect(prose).toMatch(/not\s+claims we found to be wrong/);
  });
});

describe("wording", () => {
  it("never calls end-to-end exactly-once achievable", () => {
    expect(prose).not.toMatch(/exactly-once (is|holds|is guaranteed)\b/i);
    expect(prose).not.toMatch(/guarantees? exactly[- ]once/i);
    expect(prose).not.toMatch(/exactly-once end to end/i);
    expect(prose).not.toMatch(
      /order(ed|ing)? by (ts_ms|op_ts|updated_at|timestamp)/i,
    );
  });

  it("scopes every denial to independent systems, delivery or an external sink", () => {
    const ABSOLUTE =
      /\b(impossible|never possible|not achievable|not possible)\b/i;
    const SCOPED = /(independent|external|as delivery|delivery)/i;
    for (const s of prose
      .split(/(?<=[.!?])\s+/)
      .filter((x) => ABSOLUTE.test(x))) {
      expect(s, s).toMatch(SCOPED);
    }
    expect(prose).not.toMatch(/\bimpossible\b/i);
  });

  it("keeps at-least-once and the idempotent, position-ordered sink as the default", () => {
    expect(prose).toMatch(/at-least-once/);
    expect(prose).toMatch(/required even where the first hop is exactly-once/);
    expect(prose).toMatch(/source log position/);
  });

  it("says what was not run", () => {
    expect(prose).toMatch(/not run on PostgreSQL by this repository/);
    expect(prose).toMatch(
      /None of these ran against a live Debezium and Kafka stack/,
    );
  });

  it("links the testing lesson only if it exists", () => {
    const linked = page.includes("/test-your-pipeline/");
    expect(linked).toBe(
      linked && existsSync(path.join(ROOT, "src/test-your-pipeline/index.njk")),
    );
  });
});

describe("links", () => {
  const links = [
    ...page.matchAll(/\{\{ '(\/[^']*)' \| url \}\}(#[A-Za-z0-9_-]+)?/g),
  ].map((m) => `${m[1]}${m[2] ?? ""}`);

  it("uses | url and no root-absolute href", () => {
    expect(page).not.toMatch(/href="\/(?!\/)/);
    expect(links.length).toBeGreaterThan(10);
  });

  it.each([...new Set(links)])("%s exists", (target) => {
    const [p, anchor] = target.split("#");
    if (p === "/glossary/") {
      expect(glossary.map((g) => g.slug)).toContain(anchor);
      return;
    }
    if (p === "/playground/") {
      // A separate published artifact (playground/), not a page under src/.
      expect(existsSync(path.join(ROOT, "playground", "index.html"))).toBe(
        true,
      );
      return;
    }
    const file = path.join(ROOT, `src${p}index.njk`);
    expect(existsSync(file), p).toBe(true);
    if (anchor) {
      expect(readFileSync(file, "utf8")).toMatch(
        new RegExp(`id=["']${anchor}["']|id: ['"]${anchor}['"]`),
      );
    }
  });

  it("adds three glossary terms and is linked from at least three lessons", () => {
    const slugs = glossary.map((g) => g.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        "kafka-transaction",
        "fencing",
        "offsets-in-sink-transaction",
      ]),
    );
    const from = [
      "src/exactly-once/index.njk",
      "src/errata/index.njk",
      "src/event-envelope/index.njk",
      "src/tooling/index.njk",
      "src/compare/index.njk",
    ].filter((f) => read(f).includes("{{ '/is-cdc-exactly-once/' | url }}"));
    expect(from.length).toBeGreaterThanOrEqual(3);
  });

  it("registers two assistant intents that link to the page", () => {
    const kb = parseAssistantYaml(read("src/data/assistant.yml"));
    for (const id of [
      "exactly_once_claims",
      "kafka_transactions_sink_offsets",
    ]) {
      const i = kb.intents.find((x) => x.id === id);
      expect(i.triggers.length).toBeGreaterThanOrEqual(5);
      expect(i.links.map((l) => l.url)).toContain("/is-cdc-exactly-once/");
    }
  });
});

describe("the page's SQL runs and behaves as the table says", async () => {
  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    DatabaseSync = null;
  }
  const sql = codeBlocks.find((c) => c.includes("CREATE TABLE customers"));

  it.skipIf(!DatabaseSync)(
    "guards on position, rejects a duplicate and a late change",
    () => {
      expect(sql).toMatch(/WHERE customers\.src_lsn < EXCLUDED\.src_lsn/);
      expect(sql).not.toMatch(/ts_ms|updated_at/);
      const db = new DatabaseSync(":memory:");
      const [ddl, tx] = sql.split("BEGIN;");
      db.exec(ddl);
      const stmts = tx
        .replace(/COMMIT;\s*$/, "")
        .replace(/--.*$/gm, "")
        .replace(/\$\d/g, "?")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s));
      const apply = (offset, name, lsn) => {
        db.exec("BEGIN");
        const r = stmts[0].run(1, name, 0, lsn);
        stmts[1].run("cdc.customers", 0, offset + 1);
        db.exec("COMMIT");
        return Number(r.changes);
      };
      expect(apply(40, "a", 100)).toBe(1);
      expect(apply(41, "b", 110)).toBe(1);
      expect(apply(57, "b", 110)).toBe(0);
      expect(apply(58, "a", 100)).toBe(0);
      expect(db.prepare("SELECT name, src_lsn FROM customers").get()).toEqual({
        name: "b",
        src_lsn: 110,
      });
      expect(
        db.prepare("SELECT next_offset FROM sink_offsets").get().next_offset,
      ).toBe(59);
    },
  );
});
