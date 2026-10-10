/**
 * Thesis lint (P17-7): no page may re-introduce a claim that contradicts the
 * accuracy thesis (at-least-once delivery; correctness from an idempotent
 * sink ordered by source log position, never a timestamp; no end-to-end
 * exactly-once). The last block runs the lint over the real tree, which is
 * what puts it inside `npm test`.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  lintContent,
  applyAllowlist,
  lintTree,
  loadAllowlist,
  formatReport,
  extractSegments,
} from "../../lib/thesis-lint.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** Rule ids fired for a fixture page. */
const rules = (content, file = "src/fixture/index.njk") =>
  lintContent(file, content).map((f) => f.rule);
const page = (body) => `---\ntitle: "Fixture"\n---\n${body}\n`;

describe("R1 timestamp-as-order: prose", () => {
  const violations = [
    "<p>The latest timestamp wins, so keep one row per key.</p>",
    "<p>Resolve conflicts with last-write-wins by timestamp.</p>",
    "<p>Order by timestamp to find the current row.</p>",
    "<p>To decide which change applies, compare ts_ms on both rows.</p>",
    "<p>The sink keeps the row with the newest updated_at.</p>",
  ];
  it.each(violations)("fails on %s", (html) => {
    expect(rules(page(html))).toEqual(["R1"]);
  });

  const teaching = [
    "<p>Never order by ts_ms; order by the log position instead.</p>",
    "<p>Last-write-wins by timestamp is wrong for CDC because clocks skew.</p>",
    "<p>Comparing ts_ms is an anti-pattern: two changes can share a millisecond.</p>",
    "<p>Use ts_ms only as a tie-break. Order by timestamp is not safe on its own.</p>",
    "<p>Polling sources have no log position, so the latest timestamp wins by default.</p>",
  ];
  it.each(teaching)("passes the contrasted sentence %s", (html) => {
    expect(rules(page(html))).toEqual([]);
  });

  it("reads a contrast in the neighbouring sentence of the same paragraph", () => {
    expect(
      rules(
        page(
          "<p>Some tools say the latest timestamp wins. That is the bug this page exists to fix.</p>",
        ),
      ),
    ).toEqual([]);
  });

  it("does not let a contrast in a different paragraph excuse a claim", () => {
    expect(
      rules(
        page("<p>Never do this.</p><p>The latest timestamp wins here.</p>"),
      ),
    ).toEqual(["R1"]);
  });
});

describe("R1 timestamp-as-order: SQL", () => {
  const sql = (body, before = "<p>Deduplicate the batch.</p>") =>
    page(`${before}\n<pre><code class="language-sql">${body}</code></pre>`);

  const violations = {
    "ROW_NUMBER ordered by ts_ms":
      "SELECT * FROM events\nQUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_ms DESC) = 1;",
    "subquery ROW_NUMBER ordered by updated_at":
      "SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) rn FROM e) WHERE rn = 1;",
    "QUALIFY keyed on event_time":
      "SELECT * FROM e QUALIFY event_time = MAX(event_time) OVER (PARTITION BY id);",
    "DISTINCT ON ordered by ts_ms":
      "INSERT INTO t SELECT DISTINCT ON (id) id, v FROM e ORDER BY id, ts_ms DESC ON CONFLICT (id) DO NOTHING;",
    "ORDER BY created_at LIMIT 1":
      "SELECT v FROM e WHERE id = 1 ORDER BY created_at DESC LIMIT 1;",
    "guard comparing ts_ms":
      "MERGE INTO t USING s ON t.id = s.id\nWHEN MATCHED AND s.ts_ms &gt; t.ts_ms THEN UPDATE SET v = s.v;",
    "guard comparing updated_at (decoded <)":
      "ON CONFLICT (id) DO UPDATE SET v = EXCLUDED.v WHERE t.updated_at &lt;= EXCLUDED.updated_at;",
    "USEMAX on updated_at":
      "RESOLVECONFLICT (UPDATEROWEXISTS, (DEFAULT, USEMAX(updated_at)))",
  };
  it.each(Object.entries(violations))("fails: %s", (_name, body) => {
    expect(rules(sql(body))).toEqual(["R1"]);
  });

  it("reports the line of the offending SQL line, not of the block", () => {
    const content = page(
      `<pre><code>SELECT 1;\nSELECT * FROM e\nQUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_ms DESC) = 1;</code></pre>`,
    );
    const [f] = lintContent("src/fixture/index.njk", content);
    expect(content.split("\n")[f.line - 1]).toContain("QUALIFY");
  });

  const clean = {
    "ORDER BY the log position":
      "SELECT * FROM e QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY lsn DESC) = 1;",
    "guard on the log position":
      "WHEN MATCHED AND t.source_lsn &lt; s.lsn THEN UPDATE SET v = s.v;",
    "a display sort that picks no winner":
      "SELECT id, email, updated_at FROM customers ORDER BY updated_at DESC\nLIMIT 100;",
    "a polling watermark against a literal":
      "SELECT * FROM customers WHERE updated_at &gt;= '2024-01-01';",
    "a comment that names the anti-pattern":
      "-- never ORDER BY ts_ms; order by lsn\nSELECT * FROM e ORDER BY lsn DESC LIMIT 1;",
  };
  it.each(Object.entries(clean))("passes: %s", (_name, body) => {
    expect(rules(sql(body))).toEqual([]);
  });

  it("passes a timestamp ordering that the preceding paragraph labels as broken", () => {
    const body = violations["ROW_NUMBER ordered by ts_ms"];
    expect(
      rules(sql(body, "<p>Broken sink B: it keeps the newest timestamp.</p>")),
    ).toEqual([]);
  });

  it("passes a timestamp ordering that the following caveat paragraph labels as wrong", () => {
    const body = violations["USEMAX on updated_at"];
    const content = `${sql(body)}<p>Caveat: wall-clock last-writer-wins is unsafe under clock skew.</p>`;
    expect(rules(content)).toEqual([]);
  });

  it("passes a timestamp ordering that its own SQL comment labels as the wrong example", () => {
    expect(
      rules(
        sql(
          "-- WRONG: ordering by a timestamp\nSELECT * FROM e QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_ms DESC) = 1;",
        ),
      ),
    ).toEqual([]);
  });

  it("finds the same violation in a fenced markdown block", () => {
    const md =
      "# Guide\n\nDeduplicate:\n\n```sql\nSELECT * FROM e QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_ms DESC) = 1;\n```\n";
    expect(rules(md, "src/resources/GUIDE.md")).toEqual(["R1"]);
  });
});

describe("R2 end-to-end exactly-once", () => {
  const violations = [
    "<p>This pipeline gives you end-to-end exactly-once.</p>",
    "<p>The platform provides exactly-once delivery from the database to the warehouse.</p>",
    "<p>Debezium guarantees exactly-once for every sink.</p>",
    "<p>With this setup you get exactly-once end to end.</p>",
    "<p>Exactly-once delivery is on by default.</p>",
  ];
  it.each(violations)("fails on %s", (html) => {
    expect(rules(page(html))).toEqual(["R2"]);
  });

  const teaching = [
    "<p>End-to-end exactly-once across independent systems is not achievable.</p>",
    "<p>There is no end-to-end exactly-once at any point in this runbook.</p>",
    "<p>Exactly-once delivery is a per-hop question.</p>",
    "<p>A vendor that claims end-to-end exactly-once is describing one hop.</p>",
    "<p>Debezium 3.3+ offers opt-in exactly-once delivery for Kafka Connect source connectors via exactly.once.support.</p>",
    "<p>Pub/Sub exactly-once delivery is a pull-subscription feature.</p>",
    "<p>What you can build is exactly-once processing on top of at-least-once transport.</p>",
  ];
  it.each(teaching)("passes the negated or scoped sentence %s", (html) => {
    expect(rules(page(html))).toEqual([]);
  });

  it("does not treat the title of a cited external page as an assertion", () => {
    const cite =
      '<li><a href="https://debezium.io/documentation/reference/stable/configuration/eos.html" rel="noopener">Debezium: exactly-once delivery</a></li>';
    expect(rules(page(`<ul>${cite}</ul>`))).toEqual([]);
  });

  it("still flags the same words when they are an internal link or plain text", () => {
    expect(
      rules(page('<ul><li><a href="#x">Exactly-once delivery</a></li></ul>')),
    ).toEqual(["R2"]);
  });

  it("reads a quiz item as one unit, so a wrong option sits beside its explanation", () => {
    const cjs = `module.exports = { quiz: [ {
      question: "What does the page document?",
      options: ["Exactly-once delivery is on by default for every connector", "An opt-in mode for one hop"],
      explanation: "The default is at-least-once, so the first option is not true.",
    } ] };`;
    expect(rules(cjs, "src/x/index.11tydata.cjs")).toEqual([]);
    const bare = `module.exports = { tip: "Exactly-once delivery is on by default for every connector." };`;
    expect(rules(bare, "src/x/index.11tydata.cjs")).toEqual(["R2"]);
  });

  it("covers .yml and .mjs sources", () => {
    expect(
      rules(
        "- id: x\n  answer: >\n    Debezium guarantees exactly-once for every sink.\n",
        "src/data/assistant.yml",
      ),
    ).toEqual(["R2"]);
    expect(
      rules(
        'export default [{ blurb: "Our platform provides exactly-once delivery." }];',
        "src/_data/x.mjs",
      ),
    ).toEqual(["R2"]);
  });
});

describe("extraction", () => {
  it("keeps Nunjucks tags and comments out of the prose, and line numbers stable", () => {
    const content = page(
      "{% set x = 1 %}\n{# The latest timestamp wins #}\n<!-- The latest timestamp wins -->\n<p>Plain text {{ '/a/' | url }} here.</p>\n<p>The latest timestamp wins.</p>",
    );
    const found = lintContent("src/fixture/index.njk", content);
    expect(found).toHaveLength(1);
    expect(content.split("\n")[found[0].line - 1]).toContain(
      "The latest timestamp wins.</p>",
    );
  });

  it("keeps a <pre> block as its own code segment and decodes entities", () => {
    const segs = extractSegments(
      "a.njk",
      "<p>Intro.</p>\n<pre><code>a &lt; b\nc</code></pre>",
    );
    expect(segs.map((s) => s.kind)).toEqual(["prose", "code"]);
    expect(segs[1].text).toBe("a < b\nc");
    expect(segs[1].line).toBe(2);
  });

  it("does not read script or style bodies as prose", () => {
    expect(
      rules(
        page(
          "<script>const s = 'the latest timestamp wins';</script><style>.a{}</style>",
        ),
      ),
    ).toEqual([]);
  });
});

describe("allowlist", () => {
  const finding = {
    file: "src/a/index.njk",
    line: 3,
    rule: "R1",
    text: "Use QUALIFY ROW_NUMBER() OVER (ORDER BY updated_at DESC)",
  };
  const entry = {
    file: "src/a/index.njk",
    textIncludes: "ORDER BY updated_at DESC",
    reason: "polling source",
    owner: "needs-editor-review",
  };

  it("suppresses a finding that an entry matches", () => {
    const r = applyAllowlist([finding], [entry]);
    expect(r.findings).toEqual([]);
    expect(r.allowed).toHaveLength(1);
    expect(r.stale).toEqual([]);
  });

  it("does not suppress the same text in another file", () => {
    const r = applyAllowlist(
      [finding],
      [{ ...entry, file: "src/b/index.njk" }],
    );
    expect(r.findings).toEqual([finding]);
  });

  it("treats an entry that matches nothing as stale, so the list cannot rot", () => {
    const r = applyAllowlist([], [entry]);
    expect(r.stale).toEqual([entry]);
    expect(formatReport(r)).toMatch(/STALE/);
  });

  it("rejects entries with no reason or an unknown owner", () => {
    const bad = [
      { ...entry, reason: "" },
      { ...entry, owner: "someone" },
      { file: "x" },
    ];
    expect(applyAllowlist([finding], bad).invalid).toHaveLength(3);
  });
});

describe("the real tree", () => {
  const result = lintTree(ROOT, loadAllowlist(ROOT));

  it("reads the content it is meant to protect", () => {
    expect(result.fileCount).toBeGreaterThan(100);
    const files = extractSegments(
      "src/merge-cookbook/index.njk",
      "<pre><code>x</code></pre>",
    );
    expect(files.some((s) => s.kind === "code")).toBe(true);
  });

  it("has no un-allowlisted thesis violation, stale allowlist entry or invalid entry", () => {
    expect(formatReport(result)).toBe("");
  });

  it("only allowlists entries that name an owner and a reason", () => {
    for (const e of loadAllowlist(ROOT)) {
      expect(["needs-editor-review", "accepted"]).toContain(e.owner);
      expect(e.reason.length).toBeGreaterThan(20);
    }
  });

  it("runs from the CLI and exits 0", () => {
    const out = execFileSync("node", ["scripts/thesis-lint.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out).toMatch(/^thesis-lint: ok - \d+ files/);
  });
});
