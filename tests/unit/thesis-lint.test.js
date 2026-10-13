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
  collectFiles,
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
          "<p>Some tools say the latest timestamp wins. That is wrong, because clocks skew.</p>",
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

describe("review hardening: weak words and SQL keywords never excuse code", () => {
  const sql = (body, before = "<p>Deduplicate the batch.</p>", after = "") =>
    page(
      `${before}\n<pre><code class="language-sql">${body}</code></pre>${after}`,
    );
  const MERGE =
    "MERGE INTO t USING s ON t.id = s.id\nWHEN MATCHED AND s.ts_ms &gt; t.ts_ms THEN UPDATE SET v = s.v\nWHEN NOT MATCHED THEN INSERT (id, v) VALUES (s.id, s.v);";

  it("flags a standard MERGE that guards on ts_ms, despite WHEN NOT MATCHED", () => {
    expect(rules(sql(MERGE))).toEqual(["R1"]);
  });

  it("is not excused by IS NOT NULL in the same block", () => {
    expect(
      rules(
        sql(
          "SELECT * FROM e WHERE id IS NOT NULL\nQUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_ms DESC) = 1;",
        ),
      ),
    ).toEqual(["R1"]);
  });

  it("is not excused by a weak word in the block's own comment", () => {
    for (const comment of [
      "-- not a problem",
      "/* only for the demo, no fail */",
      "-- this fails over to the replica",
    ]) {
      expect(rules(sql(`${comment}\n${MERGE}`))).toEqual(["R1"]);
    }
  });

  it("is not excused by a string literal that contains a strong word", () => {
    expect(
      rules(
        sql(
          "SELECT 'never wrong' AS note FROM e\nQUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_ms DESC) = 1;",
        ),
      ),
    ).toEqual(["R1"]);
  });

  it("is not excused by a neighbouring paragraph such as 'No further steps.'", () => {
    expect(
      rules(
        sql(MERGE, "<p>Deduplicate the batch.</p>", "<p>No further steps.</p>"),
      ),
    ).toEqual(["R1"]);
    expect(rules(sql(MERGE, "<p>Only three settings matter.</p>"))).toEqual([
      "R1",
    ]);
  });

  it("is excused by its own comment when that comment carries a strong marker", () => {
    expect(rules(sql(`-- WRONG: orders by timestamp\n${MERGE}`))).toEqual([]);
    expect(rules(sql(`/* anti-pattern: do not copy */\n${MERGE}`))).toEqual([]);
  });

  it("is excused by the paragraph that labels it wrong, before or after", () => {
    expect(rules(sql(MERGE, "<p>Never do this.</p>"))).toEqual([]);
    expect(
      rules(
        sql(
          MERGE,
          "<p>Deduplicate the batch.</p>",
          "<p>This is unsafe: timestamps tie and clocks skew.</p>",
        ),
      ),
    ).toEqual([]);
  });

  it("does not let a strong marker off the topic excuse code", () => {
    expect(
      rules(sql(MERGE, "<p>Never touch the network settings.</p>")),
    ).toEqual(["R1"]);
  });
});

describe("review hardening: neighbouring sentences", () => {
  it("is not excused by an unrelated negation next door", () => {
    expect(
      rules(
        page(
          "<p>We do not cover Oracle. Whichever change has the latest updated_at wins.</p>",
        ),
      ),
    ).toEqual(["R1"]);
  });

  it("is not excused by 'Only ...' before or after an exactly-once claim", () => {
    expect(
      rules(
        page(
          "<p>Debezium guarantees exactly-once for every sink. Only three settings matter.</p>",
        ),
      ),
    ).toEqual(["R2"]);
    expect(
      rules(
        page(
          "<p>Only three settings matter. Debezium guarantees exactly-once for every sink.</p>",
        ),
      ),
    ).toEqual(["R2"]);
  });

  it("is not excused by a strong marker that is off the topic", () => {
    expect(
      rules(
        page(
          "<p>Never touch the network settings. The latest timestamp wins.</p>",
        ),
      ),
    ).toEqual(["R1"]);
  });

  it("is excused by a strong neighbour that is on the topic", () => {
    expect(
      rules(
        page(
          "<p>Some tools say the newest timestamp wins. That is an anti-pattern: timestamps tie.</p>",
        ),
      ),
    ).toEqual([]);
  });

  it("keeps the one-line teaching sentences clean", () => {
    for (const html of [
      "<p>Never order by ts_ms; use the LSN.</p>",
      "<p>There is no end-to-end exactly-once across independent systems.</p>",
      "<p>None of these tools gives you exactly-once across systems.</p>",
      "<p>Which version of a row wins is decided by log position, never by that timestamp.</p>",
    ]) {
      expect(rules(page(html))).toEqual([]);
    }
  });
});

describe("review hardening: bare exactly-once claims (R2)", () => {
  const violations = [
    "<p>Our pipeline is exactly-once, so you can skip dedup.</p>",
    "<p>The connector is exactly-once from MySQL to Snowflake.</p>",
    "<p>Delivery is exactly-once, so no dedupe is needed.</p>",
    "<p>The sink is fully exactly-once.</p>",
  ];
  it.each(violations)("fails on %s", (html) => {
    expect(rules(page(html))).toEqual(["R2"]);
  });

  const legitimate = [
    "<p>The pipeline is not exactly-once.</p>",
    "<p>Delivery is exactly-once per hop, not across hops.</p>",
    "<p>Kafka Streams is exactly-once processing within Kafka.</p>",
    "<p>With Kafka transactions the producer hop is exactly-once.</p>",
    "<p>Debezium 3.3+ offers opt-in exactly-once delivery for Kafka Connect source connectors via exactly.once.support.</p>",
    "<p>Can it be exactly-once?</p>",
    "<p>The pragmatic alternative to exactly-once: an idempotent sink whose end state matches an exactly-once delivery.</p>",
  ];
  it.each(legitimate)("passes the per-hop or negated statement %s", (html) => {
    expect(rules(page(html))).toEqual([]);
  });
});

describe("P17-52: exactly-once scope words must qualify the claim itself", () => {
  // Each sentence holds a scope word the old sentence-wide test accepted, but
  // the claim is made in a clause (or at a distance) the word does not reach.
  const violations = {
    "transactions in another clause":
      "<p>Transactions are fine, but the pipeline is exactly-once.</p>",
    "transactions after the claim, after a conjunction":
      "<p>Our pipeline is exactly-once and it handles transactions for you.</p>",
    "processing in another clause":
      "<p>Processing is fast; the whole pipeline is exactly-once.</p>",
    "hop in another clause":
      "<p>We added a hop last week, so the platform is exactly-once.</p>",
    "hop far from the claim":
      "<p>The hop we added last week to the whole pipeline across every system you run is exactly-once.</p>",
    "opt-in elsewhere in the sentence":
      "<p>Our newsletter is opt-in: the platform is exactly-once.</p>",
    "single system far away":
      "<p>It runs on a single system and then the vendor says the service is exactly-once.</p>",
  };
  it.each(Object.entries(violations))("fails: %s", (_n, html) => {
    expect(rules(page(html))).toEqual(["R2"]);
  });

  const legitimate = {
    "hop beside the claim": "<p>The producer hop is exactly-once.</p>",
    "hop in a question, a few words away":
      "<p>Which hops of a pipeline can be exactly-once?</p>",
    "processing beside the claim":
      "<p>Flink gives exactly-once processing inside its own state.</p>",
    "transactions before the claim":
      "<p>With Kafka transactions a step is exactly-once.</p>",
    "observable effect":
      "<p>Compose the stages so the observable effect is exactly-once.</p>",
    "with respect to":
      "<p>The step is exactly-once with respect to its input and output topics.</p>",
    "for source connectors":
      "<p>Kafka Connect supports exactly-once for source connectors, in distributed mode only.</p>",
    "vendor quotation with the scope inside the quote":
      '<p>The docs say exactly-once delivery "for other destination systems generally requires cooperation with such systems".</p>',
  };
  it.each(Object.entries(legitimate))("passes: %s", (_n, html) => {
    expect(rules(page(html))).toEqual([]);
  });
});

describe("review hardening: more timestamp-as-order patterns (R1)", () => {
  const prose = [
    "<p>Sort the events by their commit timestamp and keep the newest.</p>",
    "<p>Sort the changes by the update timestamp, then keep the last one.</p>",
    "<p>The event with the higher ts_ms is applied.</p>",
    "<p>The event with the larger ts_ms wins.</p>",
    "<p>The newest timestamp wins.</p>",
  ];
  it.each(prose)("fails on %s", (html) => {
    expect(rules(page(html))).toEqual(["R1"]);
  });

  const code = (lang, body) =>
    page(
      `<p>Deduplicate the batch.</p><pre><code class="language-${lang}">${body}</code></pre>`,
    );
  const violations = {
    "JS guard on ts_ms":
      "if (incoming.ts_ms &gt; current.ts_ms) {\n  apply(incoming);\n}",
    "JS guard on camelCase updatedAt":
      "const win = incoming.updatedAt &gt;= current.updatedAt;",
    "Python guard on ts_ms":
      "if event['ts_ms'] &gt;= row['ts_ms']:\n    apply(event)",
    "JS sort then take the first":
      "const latest = events.sort((a, b) =&gt; b.ts_ms - a.ts_ms)[0];",
    "Python max with a ts key":
      "latest = max(events, key=lambda e: e['ts_ms'])",
    "WHERE ts_ms = (SELECT MAX(ts_ms) ...)":
      "SELECT * FROM e WHERE ts_ms = (SELECT MAX(ts_ms) FROM e WHERE id = 1);",
    "MAX(updated_at) GROUP BY id joined back":
      "SELECT e.* FROM e JOIN (SELECT id, MAX(updated_at) AS m FROM e GROUP BY id) x ON x.id = e.id AND x.m = e.updated_at;",
    "ON CONFLICT DO UPDATE WHERE t.updated_at < EXCLUDED.updated_at":
      "INSERT INTO t SELECT * FROM s ON CONFLICT (id) DO UPDATE SET v = EXCLUDED.v\nWHERE t.updated_at &lt; EXCLUDED.updated_at;",
  };
  it.each(Object.entries(violations))("fails: %s", (_n, body) => {
    expect(rules(code("js", body))).toEqual(["R1"]);
  });

  const exempt = {
    "a display sort that takes a page":
      "const rows = users.sort((a, b) =&gt; b.updated_at - a.updated_at).slice(0, 20);",
    "a polling watermark against a variable":
      "if (row.updated_at &gt; lastSeen) { queue.push(row); }",
    "the watermark query itself": "SELECT MAX(updated_at) FROM customers;",
    "a log-position guard in JS":
      "if (incoming.lsn &gt; current.lsn) apply(incoming);",
  };
  it.each(Object.entries(exempt))("passes: %s", (_n, body) => {
    expect(rules(code("js", body))).toEqual([]);
  });

  it("flags the JS and Python guards in a fenced markdown block too", () => {
    const md =
      "# Guide\n\nApply it:\n\n```python\nif event['ts_ms'] >= row['ts_ms']:\n    apply(event)\n```\n";
    expect(rules(md, "src/resources/GUIDE.md")).toEqual(["R1"]);
  });
});

describe("review hardening: wider scope", () => {
  it("reads JSON data under src", () => {
    const json = JSON.stringify({ tip: "The latest timestamp wins." });
    expect(rules(json, "src/data/x.json")).toEqual(["R1"]);
  });

  it("reads user-visible strings in src/js, but not its comments", () => {
    const js =
      '// The latest timestamp wins (a note, not copy)\nconst a = { text: "Debezium guarantees exactly-once for every sink." };';
    expect(rules(js, "src/js/assistant-ui.js")).toEqual(["R2"]);
    expect(
      rules("// The latest timestamp wins\nconst x = 1;", "src/js/a.js"),
    ).toEqual([]);
  });

  it("reads JSX text and string literals in playground tsx", () => {
    const tsx =
      'export const A = () => <p>Delivery is exactly-once, so no dedupe is needed.</p>;\nexport const b = "The newest timestamp wins here.";';
    expect(rules(tsx, "playground/web/A.tsx")).toEqual(["R2", "R1"]);
  });

  it("reads playground markdown and scenario descriptions", () => {
    expect(
      rules("# Lab\n\nThe latest timestamp wins.\n", "playground/docs/x.md"),
    ).toEqual(["R1"]);
    expect(
      rules(
        JSON.stringify({
          description: "This scenario gives you end-to-end exactly-once.",
        }),
        "playground/scenarios/01/scenario.json",
      ),
    ).toEqual(["R2"]);
  });

  it("reads strings inside Nunjucks tags and macro calls", () => {
    expect(
      rules(page('{% set note = "The latest timestamp wins." %}\n<p>x</p>')),
    ).toEqual(["R1"]);
    expect(
      rules(
        page(
          '{{ callout("Debezium guarantees exactly-once for every sink.") }}',
        ),
      ),
    ).toEqual(["R2"]);
    expect(
      rules(page('{% set ok = "Never order by ts_ms; use the LSN." %}')),
    ).toEqual([]);
  });

  it("skips wrong answers in a quiz but lints the correct one", () => {
    const quiz = (correct) =>
      `module.exports = { quiz: [ { question: "What does the page say about delivery?", options: ["Exactly-once delivery is on by default for every connector", "It is at-least-once, so the sink must be idempotent"], correct: "${correct}", explanation: "Delivery is at-least-once." } ] };`;
    expect(rules(quiz(2), "src/x/index.11tydata.cjs")).toEqual([]);
    expect(rules(quiz(1), "src/x/index.11tydata.cjs")).toEqual(["R2"]);
  });

  it("lists the exact files read and excludes top-level docs and generated bundles", () => {
    const files = collectFiles(ROOT);
    expect(files.some((f) => f.startsWith("playground/web/"))).toBe(true);
    expect(files.some((f) => f.startsWith("playground/docs/"))).toBe(true);
    expect(files.some((f) => /^src\/.*\.json$/.test(f))).toBe(true);
    expect(files.some((f) => f.startsWith("src/js/"))).toBe(true);
    expect(files.some((f) => f.startsWith("docs/"))).toBe(false);
    expect(files.some((f) => f.includes("/generated/"))).toBe(false);
    expect(files.some((f) => /^(?:dist|_site)\//.test(f))).toBe(false);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });
});

describe("review hardening: no catastrophic backtracking", () => {
  const big = (unit, n) => unit.repeat(n);
  const timeOf = (file, content) => {
    const t = performance.now();
    lintContent(file, content);
    return performance.now() - t;
  };
  const inputs = {
    "dotted tokens": big("a.b.c.d.", 25000),
    "underscored tokens": big("a_b_", 50000),
    "dotted timestamp tokens": big("updated_at.", 18000),
    "ts_ms chain": big("x.ts_ms.", 25000),
  };
  it.each(Object.entries(inputs))(
    "lints 200 KB of %s in under 2 seconds",
    (_n, token) => {
      expect(timeOf("src/x/index.njk", `<p>${token}</p>`)).toBeLessThan(2000);
      expect(
        timeOf("src/x/index.njk", `<pre><code>${token}</code></pre>`),
      ).toBeLessThan(2000);
      expect(timeOf("src/x/a.md", `${token}\n`)).toBeLessThan(2000);
    },
  );
});

describe("round 3: neighbouring sentences are excused rule by rule", () => {
  const R2_CLAIM = "Debezium gives you exactly-once end to end.";
  const R1_CLAIM = "Whichever change has the latest updated_at wins.";
  const offTopic = [
    "We do not deliver on weekends.",
    "Don't forget the created_at column.",
    "Do not skip the offsets table.",
    "Do not panic about ordering.",
    "Never order by ts_ms.",
    "Never order the pizza.",
    "Don't forget the updated_at column.",
    "Debezium has no deduplication layer.",
  ];
  it.each(offTopic)(
    "%s does not excuse an end-to-end exactly-once claim next to it",
    (neighbour) => {
      expect(rules(page(`<p>${neighbour} ${R2_CLAIM}</p>`))).toEqual(["R2"]);
      expect(rules(page(`<p>${R2_CLAIM} ${neighbour}</p>`))).toEqual(["R2"]);
    },
  );

  const r1Neighbours = [
    "We do not deliver on weekends.",
    "Don't forget the created_at column.",
    "Do not skip the offsets table.",
    "Do not panic about ordering.",
    "Never order the pizza.",
    "Don't forget the updated_at column.",
    "There is no end-to-end exactly-once across systems.",
  ];
  it.each(r1Neighbours)(
    "%s does not excuse a timestamp-ordering claim next to it",
    (neighbour) => {
      expect(rules(page(`<p>${neighbour} ${R1_CLAIM}</p>`))).toEqual(["R1"]);
      expect(rules(page(`<p>${R1_CLAIM} ${neighbour}</p>`))).toEqual(["R1"]);
    },
  );

  it("flags the exactly-once claim beside an ordering warning, in both orders", () => {
    for (const html of [
      "<p>Never order by ts_ms. Debezium gives you exactly-once end to end.</p>",
      "<p>Debezium gives you exactly-once end to end. Never order by ts_ms.</p>",
      "<p>Do not panic about ordering. Our pipeline is exactly-once, so you can skip dedup.</p>",
    ])
      expect(rules(page(html))).toEqual(["R2"]);
  });

  it("flags the timestamp claim beside an exactly-once warning", () => {
    for (const html of [
      "<p>There is no end-to-end exactly-once across systems. The newest timestamp wins.</p>",
      "<p>The newest timestamp wins. There is no end-to-end exactly-once across systems.</p>",
    ])
      expect(rules(page(html))).toEqual(["R1"]);
  });

  it("still lets a warning about the same rule excuse its neighbour", () => {
    expect(
      rules(
        page(
          "<p>Pipelines give you exactly-once end to end. There is no end-to-end exactly-once across systems.</p>",
        ),
      ),
    ).toEqual([]);
    expect(
      rules(
        page(
          "<p>The latest timestamp wins here. Never order by ts_ms; use the LSN.</p>",
        ),
      ),
    ).toEqual([]);
    expect(
      rules(
        page(
          "<p>Never order by ts_ms; use the LSN. The latest timestamp wins on a polling source.</p>",
        ),
      ),
    ).toEqual([]);
  });

  it("reads 'That is wrong.' only as a comment on the sentence before it", () => {
    expect(
      rules(
        page("<p>The latest timestamp wins. That is wrong: clocks skew.</p>"),
      ),
    ).toEqual([]);
    expect(
      rules(
        page("<p>That is wrong. The latest timestamp wins, say the docs.</p>"),
      ),
    ).toEqual(["R1"]);
  });

  it("does not let the sentence before a 'But ...' excuse the claim after it", () => {
    expect(
      rules(
        page(
          "<p>Order by timestamp is not safe on its own. But the newest timestamp wins here.</p>",
        ),
      ),
    ).toEqual(["R1"]);
  });

  it("does not let a sibling table cell of the other rule excuse a claim", () => {
    const table = (a, b) =>
      page(
        `<table><tr><td>${a}</td><td>${b}</td></tr></table>`.replace(
          /<td>/g,
          "<td><p>",
        ),
      );
    expect(
      rules(
        table(
          "Debezium gives you exactly-once end to end.",
          "Never order by ts_ms.",
        ),
      ),
    ).toEqual(["R2"]);
  });
});

describe("round 3: quiz `correct` must be a valid index to hide a distractor", () => {
  const quiz = (correct) =>
    `module.exports = { quiz: [ { question: "What does the page say about delivery?", options: ["Exactly-once delivery is on by default for every connector", "It is at-least-once, so the sink must be idempotent"], ${correct} explanation: "Delivery is at-least-once." } ] };`;
  const q = (correct) => rules(quiz(correct), "src/x/index.11tydata.cjs");

  it.each([
    ['correct: "2",', []],
    ["correct: 2,", []],
    ["correct: '2',", []],
    ['correct: "1",', ["R2"]],
    ["correct: 1,", ["R2"]],
  ])("in range: %s", (c, want) => {
    expect(q(c)).toEqual(want);
  });

  it.each([
    'correct: "0",',
    'correct: "9",',
    'correct: "99",',
    'correct: "02",',
  ])("an invalid index (%s) hides no option", (c) => {
    expect(q(c)).toEqual(["R2"]);
  });

  it.each(["correct: 0,", "correct: 3,", "correct: 99,", "correct: two,"])(
    "an invalid unquoted index (%s) hides no option",
    (c) => {
      expect(q(c)).toEqual(["R2"]);
    },
  );

  it("lints every option when `correct` is missing", () => {
    expect(q("")).toEqual(["R2"]);
  });

  it("does not let the explanation excuse an option of a quiz with a bad index", () => {
    const bad = `module.exports = { quiz: [ { question: "Which is right about delivery here?", options: ["Exactly-once delivery is on by default for every connector", "At-least-once"], correct: "9", explanation: "The default is at-least-once, so the first option is not true." } ] };`;
    expect(rules(bad, "src/x/index.11tydata.cjs")).toEqual(["R2"]);
  });

  it("reads quoted keys in JSON data too", () => {
    const json = (c) =>
      JSON.stringify({
        options: [
          "Exactly-once delivery is on by default for every connector",
          "It is at-least-once",
        ],
        correct: c,
      });
    expect(rules(json("2"), "src/data/q.json")).toEqual([]);
    expect(rules(json("0"), "src/data/q.json")).toEqual(["R2"]);
  });
});

describe("round 3: hyphen, entity and escape evasions", () => {
  const claim = (word) => `<p>Debezium gives you ${word} end to end.</p>`;
  const spellings = {
    "non-breaking hyphen U+2011": "exactly‑once",
    "hyphen U+2010": "exactly‐once",
    "figure dash U+2012": "exactly‒once",
    "en dash U+2013": "exactly–once",
    "minus sign U+2212": "exactly−once",
    "soft hyphen after the hyphen": "exactly-­once",
    "soft hyphen alone": "exactly­once",
    "zero-width space": "exactly-​once",
    "&#8209;": "exactly&#8209;once",
    "&#x2011;": "exactly&#x2011;once",
    "&shy;": "exactly&shy;once",
    "&shy; after the hyphen": "exactly-&shy;once",
    "&hyphen;": "exactly&hyphen;once",
    "hard hyphenation across a newline": "exactly-\nonce",
    "a space before the hyphen": "exactly -once",
    "a space after the hyphen": "exactly- once",
    "two hyphens": "exactly--once",
  };
  it.each(Object.entries(spellings))("catches %s", (_n, word) => {
    expect(rules(page(claim(word)))).toEqual(["R2"]);
  });

  it("catches a hyphenated end-to-end too", () => {
    expect(
      rules(page("<p>It gives you exactly-once end&#8209;to&#8209;end.</p>")),
    ).toEqual(["R2"]);
  });

  it("catches an evaded timestamp claim", () => {
    expect(
      rules(page("<p>The last&#8209;write&#8209;wins timestamp is used.</p>")),
    ).toEqual(["R1"]);
  });

  it("still passes the negated sentence when it uses a Unicode hyphen", () => {
    expect(
      rules(page("<p>There is no end‑to‑end exactly‑once across systems.</p>")),
    ).toEqual([]);
  });

  it("decodes entities and JS escapes in markdown, YAML and JS strings", () => {
    expect(
      rules(
        "# G\n\nDebezium gives you exactly&#8209;once end to end.\n",
        "src/r/G.md",
      ),
    ).toEqual(["R2"]);
    expect(
      rules(
        "- id: x\n  answer: Debezium gives you exactly&shy;once end to end.\n",
        "src/data/assistant.yml",
      ),
    ).toEqual(["R2"]);
    expect(
      rules(
        'export default { tip: "Debezium gives you exactly\\u2011once end to end." };',
        "src/_data/x.mjs",
      ),
    ).toEqual(["R2"]);
    expect(
      rules(
        'export default { tip: "Debezium gives you exactly\\u{2011}once end to end." };',
        "src/_data/x.mjs",
      ),
    ).toEqual(["R2"]);
  });

  it("does not throw on an out-of-range numeric entity", () => {
    expect(() =>
      rules(page("<p>Odd &#99999999; and &#xFFFFFF; entities here.</p>")),
    ).not.toThrow();
  });
});

describe("round 3: prose in attributes, JSON-LD and code fences", () => {
  const R2 = "Debezium gives you exactly-once end to end.";
  it.each([
    ["title", `<a href="#x" title="${R2}">more</a>`],
    ["alt", `<img src="a.png" alt="${R2}">`],
    ["aria-label", `<button aria-label="${R2}">x</button>`],
    ["meta content", `<meta name="description" content="${R2}">`],
    ["single quotes", `<a href='#x' title='${R2}'>more</a>`],
    [
      "an entity-encoded value",
      `<a title="Debezium gives you exactly&#8209;once end to end.">x</a>`,
    ],
  ])("reads %s", (_n, html) => {
    expect(rules(page(html))).toEqual(["R2"]);
  });

  it("reads a timestamp claim in an attribute and reports its line", () => {
    const content = page(
      '<p>Fine.</p>\n<img src="a.png" alt="The newest timestamp wins when two changes collide.">',
    );
    const [f] = lintContent("src/fixture/index.njk", content);
    expect(f.rule).toBe("R1");
    expect(content.split("\n")[f.line - 1]).toContain("<img");
  });

  it("does not read content= on tags other than <meta>, or short attributes", () => {
    expect(rules(page(`<div content="${R2}">x</div>`))).toEqual([]);
    expect(rules(page('<a title="Exactly-once">x</a>'))).toEqual([]);
  });

  it("passes a teaching attribute", () => {
    expect(
      rules(
        page(
          '<aside aria-label="There is no end-to-end exactly-once"><p>x</p></aside>',
        ),
      ),
    ).toEqual([]);
  });

  it("reads JSON-LD bodies, and only those scripts", () => {
    const ld = (json) =>
      page(`<script type="application/ld+json">${json}</script>`);
    expect(
      rules(ld(JSON.stringify({ "@type": "FAQPage", description: R2 }))),
    ).toEqual(["R2"]);
    expect(
      rules(
        ld(
          JSON.stringify({
            description: "There is no end-to-end exactly-once across systems.",
          }),
        ),
      ),
    ).toEqual([]);
    expect(rules(page(`<script>const a = "${R2}";</script>`))).toEqual([]);
  });

  it("reads a plain-words line inside a markdown fence as prose", () => {
    expect(
      rules(`# G\n\nIntro text.\n\n\`\`\`\n${R2}\n\`\`\`\n`, "src/r/G.md"),
    ).toEqual(["R2"]);
    expect(
      rules(
        "# G\n\nIntro text.\n\n```text\nThe latest timestamp wins when two changes collide.\n```\n",
        "src/r/G.md",
      ),
    ).toEqual(["R1"]);
    expect(rules(page(`<pre>${R2}</pre>`))).toEqual(["R2"]);
  });

  it("reports the fenced line, not the fence", () => {
    const md = `# G\n\nIntro text.\n\n\`\`\`\n$ run the thing\n${R2}\n\`\`\`\n`;
    const [f] = lintContent("src/r/G.md", md);
    expect(md.split("\n")[f.line - 1]).toBe(R2);
  });

  it("leaves SQL, config and shell lines in a fence alone", () => {
    for (const body of [
      "SELECT id, email, updated_at FROM customers ORDER BY updated_at DESC\nLIMIT 100;",
      "exactly.once.support=requested",
      "npm run start with exactly once flag set today",
      "kafka-topics --describe the topic that gives you exactly-once",
    ])
      expect(
        rules(`# G\n\nIntro text.\n\n\`\`\`\n${body}\n\`\`\`\n`, "src/r/G.md"),
      ).toEqual([]);
  });

  it("lets a teaching sentence inside a fence pass", () => {
    expect(
      rules(
        "# G\n\nIntro text.\n\n```\nThere is no end-to-end exactly-once across systems.\n```\n",
        "src/r/G.md",
      ),
    ).toEqual([]);
  });
});

describe("round 3: more R1 code forms", () => {
  const code = (lang, body) =>
    page(
      `<p>Deduplicate the batch.</p><pre><code class="language-${lang}">${body
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</code></pre>`,
    );
  const violations = {
    'sequence_by="ts_ms"':
      'dlt.apply_changes(target="t", source="s", keys=["id"], sequence_by="ts_ms")',
    'sequence_by=col("ts_ms")': 'dlt.apply_changes(sequence_by=col("ts_ms"))',
    "sequence_by: ts_ms (yaml)": "sequence_by: ts_ms",
    "order_by: updated_at (yaml)": "order_by: updated_at",
    "version.field=ts_ms": "version.field=ts_ms",
    "sort then forEach(apply)":
      "events.sort((a, b) => a.updated_at - b.updated_at).forEach(apply);",
    "sort then forEach with an arrow that upserts":
      "events.sort((a, b) => a.ts_ms - b.ts_ms).forEach((e) => upsert(e));",
    "for-of over a sorted array":
      "for (const e of events.sort((a, b) => a.ts_ms - b.ts_ms)) apply(e);",
    "python for over sorted":
      'for e in sorted(events, key=lambda e: e["ts_ms"]):\n    apply(e)',
    "new Date comparison":
      "if (new Date(a.updated_at) > new Date(b.updated_at)) keep(a);",
    "ON DUPLICATE KEY UPDATE with IF(VALUES(ts_ms) > ts_ms)":
      "INSERT INTO t (id, v, ts_ms) VALUES (1, 2, 3) ON DUPLICATE KEY UPDATE v = IF(VALUES(ts_ms) > ts_ms, VALUES(v), v);",
    "GREATEST(t.ts_ms, s.ts_ms)":
      "UPDATE t SET ts_ms = GREATEST(t.ts_ms, s.ts_ms);",
    "Math.max of two updated_at":
      "const w = Math.max(a.updated_at, b.updated_at);",
    "ORDER BY ts_ms DESC, lsn DESC LIMIT 1":
      "SELECT * FROM e WHERE id = 1 ORDER BY ts_ms DESC, lsn DESC LIMIT 1;",
    "TOP (1) ordered by ts_ms first":
      "SELECT TOP (1) * FROM e WHERE id = 1 ORDER BY ts_ms DESC, lsn DESC;",
    "ROW_NUMBER ordered by ts_ms DESC, lsn DESC":
      "SELECT * FROM e QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_ms DESC, lsn DESC) = 1;",
    "a named window":
      "SELECT * FROM e WINDOW w AS (PARTITION BY id ORDER BY ts_ms DESC, lsn DESC) QUALIFY ROW_NUMBER() OVER w = 1;",
  };
  it.each(Object.entries(violations))("fails: %s", (_n, body) => {
    expect(rules(code("js", body))).toEqual(["R1"]);
  });

  const exempt = {
    "a log-position sequence_by": "sequence_by: lsn",
    "an ordering setting on the LSN": "version.field=source_lsn",
    "a display sort that renders":
      "rows.sort((a, b) => a.updated_at - b.updated_at).forEach(render);",
    "a bare ORDER BY": "SELECT * FROM e ORDER BY ts_ms;",
    "a bare ORDER BY ts_ms DESC, lsn DESC":
      "SELECT * FROM e ORDER BY ts_ms DESC, lsn DESC;",
    "a watermark via Math.max over one list":
      "const hi = Math.max(...rows.map((r) => r.updated_at));",
    "one timestamp in GREATEST": "SELECT GREATEST(a.lsn, b.lsn, 0) FROM a, b;",
    "ts_ms only as the tie-break after the LSN":
      "SELECT * FROM e QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY lsn DESC, ts_ms DESC) = 1;",
    "LIMIT 1 ordered by lsn then ts_ms":
      "SELECT * FROM e WHERE id = 1 ORDER BY lsn DESC, ts_ms DESC LIMIT 1;",
    "a comparison with a literal date":
      "if (new Date(row.updated_at) > new Date(lastSeen)) queue.push(row);",
  };
  it.each(Object.entries(exempt))("passes: %s", (_n, body) => {
    expect(rules(code("js", body))).toEqual([]);
  });
});

describe("round 3: more R1 phrasings (prose)", () => {
  const violations = [
    "Changes are applied in timestamp order.",
    "The most recent change by clock time is kept.",
    "Dedupe by timestamp and keep one row per key.",
    "Events are ordered by when they happened.",
    "Replay events in wall-clock order.",
    "Replay the events in commit time order.",
    "Use created_at to break ties.",
    "A change is dropped if its timestamp is older than the stored row.",
    "If its timestamp is older than the stored row, the change is dropped.",
    "Take the record whose updated_at is largest.",
    "Use updated_at as the version column.",
    "Use the timestamp as the ordering key.",
    "Set the ordering column to ts_ms.",
    "The version column is updated_at.",
    "Keep the newest change by timestamp.",
  ];
  it.each(violations)("fails on %s", (text) => {
    expect(rules(page(`<p>${text}</p>`))).toEqual(["R1"]);
  });

  const legitimate = [
    "Never apply changes in timestamp order.",
    "Do not use updated_at as the version column.",
    "Never set the ordering column to ts_ms.",
    "Use created_at to break ties, after the LSN decides first.",
    "The log position is primary; use created_at to break ties.",
    "Changes are applied in log position order.",
    "Events are ordered by their log position.",
    "A change is dropped if its LSN is older than the stored row.",
    "Use updated_at as the version column is a common mistake.",
  ];
  it.each(legitimate)("passes %s", (text) => {
    expect(rules(page(`<p>${text}</p>`))).toEqual([]);
  });

  it("does not let 'tie-break' excuse a timestamp tie-break claim", () => {
    expect(
      rules(page("<p>Use created_at as the tie-break for change events.</p>")),
    ).toEqual(["R1"]);
  });
});

describe("round 3: more R2 phrasings (prose)", () => {
  const violations = [
    "Exactly once, end-to-end, no duplicates.",
    "Exactly-once, end to end.",
    "We guarantee no duplicates and no loss.",
    "We promise zero duplicates and zero data loss.",
    "CDC delivers every change exactly once.",
    "Each change is applied exactly once.",
    "Debezium is an exactly-once system.",
    "You will never see a duplicate downstream.",
    "You do not need an idempotent sink because the connector deduplicates for you.",
    "There is no need for an idempotent sink here.",
    "The platform removes the duplicates for you.",
  ];
  it.each(violations)("fails on %s", (text) => {
    expect(rules(page(`<p>${text}</p>`))).toEqual(["R2"]);
  });

  const legitimate = [
    "There is no end-to-end exactly-once across independent systems.",
    "Kafka transactions give exactly-once processing inside Kafka.",
    "Exactly-once end to end is a myth.",
    "Debezium 3.3+ offers opt-in exactly-once delivery via exactly.once.support.",
    "Do not assume you will never see a duplicate downstream.",
    "No tool can guarantee no duplicates and no loss; it is a myth.",
    "An idempotent upsert leaves no duplicate rows in the target.",
    "A vendor page says its CDC service delivers 'with exactly-once semantics'.",
    "Delivery is at-least-once, so you will see duplicates.",
  ];
  it.each(legitimate)("passes %s", (text) => {
    expect(rules(page(`<p>${text}</p>`))).toEqual([]);
  });
});

describe("round 3: same-sentence excuses are scoped to the claim", () => {
  it("does not let a label before a 'but' excuse a claim made after it", () => {
    for (const html of [
      "<p>Some people say it is wrong, but the newest timestamp wins.</p>",
      "<p>That is a myth, however the latest timestamp wins.</p>",
    ])
      expect(rules(page(html))).toEqual(["R1"]);
    expect(
      rules(
        page(
          "<p>Some people say it is wrong, but Debezium gives you exactly-once end to end.</p>",
        ),
      ),
    ).toEqual(["R2"]);
  });

  it("still lets a label in the claim's own clause, or after it, excuse it", () => {
    for (const html of [
      "<p>The newest timestamp wins, but that is wrong.</p>",
      "<p>It is common, but the newest timestamp wins is a myth.</p>",
      "<p>Some people say the newest timestamp wins, but that is wrong.</p>",
    ])
      expect(rules(page(html))).toEqual([]);
  });

  it("does not let a negator after the claim excuse it", () => {
    expect(
      rules(
        page("<p>The newest timestamp wins and you do not need to worry.</p>"),
      ),
    ).toEqual(["R1"]);
    expect(
      rules(
        page(
          "<p>Debezium gives you exactly-once end to end and you do not need to worry.</p>",
        ),
      ),
    ).toEqual(["R2"]);
  });

  it("does not read 'do not forget / never worry that ...' as a negation of what follows", () => {
    expect(
      rules(page("<p>Do not forget that the newest timestamp wins.</p>")),
    ).toEqual(["R1"]);
    expect(
      rules(
        page(
          "<p>Never forget that Debezium gives you exactly-once end to end.</p>",
        ),
      ),
    ).toEqual(["R2"]);
    expect(
      rules(page("<p>Don't worry: the latest timestamp wins here.</p>")),
    ).toEqual(["R1"]);
  });

  it("does not let a negator in an earlier clause excuse it", () => {
    expect(
      rules(
        page(
          "<p>You do not need to worry because the newest timestamp wins.</p>",
        ),
      ),
    ).toEqual(["R1"]);
  });

  it("still reads a negator that scopes the claim", () => {
    for (const html of [
      "<p>Never order by ts_ms; use the LSN.</p>",
      "<p>Do not assert that rows come out sorted by a timestamp.</p>",
      "<p>Exactly-once delivery across systems is not achievable.</p>",
      "<p>End-to-end exactly-once across independent systems is not possible.</p>",
      "<p>Exactly-once end to end does not exist.</p>",
      "<p>There is no end-to-end exactly-once across independent systems.</p>",
    ])
      expect(rules(page(html))).toEqual([]);
  });
});

describe("round 3: no catastrophic backtracking in the new patterns", () => {
  const units = [
    "dropped if updated_at is older ",
    "the most recent change by ",
    "exactly once end to end ",
    "delivers a b c d e f ",
    "use the timestamp as the ",
    "never see a ",
    "dedupe on the commit ",
    "exactly - - - - once ",
    "sequence_by = ",
    "GREATEST(ts_ms, ",
    "sorted(",
    "WINDOW w AS (",
    "ORDER BY ts_ms, ",
    "whose updated_at is ",
    "­",
  ];
  it.each(units)("lints 200 KB of %j in under 2 seconds", (unit) => {
    const body = unit.repeat(Math.ceil(200000 / unit.length));
    for (const [file, content] of [
      ["src/x/index.njk", `<p>${body}</p>`],
      ["src/x/index.njk", `<pre><code>${body}</code></pre>`],
      ["src/x/a.md", `${body}\n`],
      ["src/x/a.md", `\`\`\`\n${body}\n\`\`\`\n`],
    ]) {
      const t = performance.now();
      lintContent(file, content);
      expect(performance.now() - t).toBeLessThan(2000);
    }
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
    expect(out).toMatch(/^thesis-lint: ok - read \d+ files \(/);
  });
});
