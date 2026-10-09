/**
 * Guard: /test-your-pipeline/ (content-gap plan M5). Reads the real page
 * source. The JavaScript examples on the page are extracted and executed, and
 * their output is compared with the output the page prints. The SQL examples
 * cannot run here (the repo has no database dependency), so they are checked
 * structurally and the page labels them as not run by CI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nunjucks from "nunjucks";
import glossary from "../../src/_data/glossary.mjs";
import series from "../../src/_data/series.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const require = createRequire(import.meta.url);

const page = read("src/test-your-pipeline/index.njk");
const data = require(
  path.join(ROOT, "src/test-your-pipeline/index.11tydata.cjs"),
);
const flat = (s) => s.replace(/\s+/g, " ");
const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Decoded body of the first <pre><code> that follows `marker`. */
const codeAfter = (marker) => {
  const i = page.indexOf(marker);
  expect(i, `missing: ${marker}`).toBeGreaterThan(-1);
  const m = /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/.exec(page.slice(i));
  return decode(m[1]);
};
const allCode = [
  ...page.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g),
].map((m) => decode(m[1]));

describe("front matter and registration", () => {
  const fm = page.match(/^---\n([\s\S]*?)\n---/)[1];
  const title = fm.match(/^title: "(.+)"$/m)[1];
  const description = fm.match(/^description: "(.+)"$/m)[1];

  it("has a title of 34 characters or fewer (the site adds a suffix) and a description of 120 to 160", () => {
    expect(title.length).toBeLessThanOrEqual(34);
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("has dates, a canonical path and a series entry that match the key", () => {
    expect(fm).toMatch(/^canonicalPath: "\/test-your-pipeline\/"$/m);
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
    expect(data.seriesKey).toBe("test-your-pipeline");
    const entry = series.find((s) => s.key === "test-your-pipeline");
    expect(entry.href).toBe("test-your-pipeline/");
    expect(entry.description.length).toBeGreaterThan(0);
  });

  it("has exactly one h1 source: the hero, not the body", () => {
    expect(page).not.toMatch(/<h1[\s>]/);
    expect(page).toContain("{{ ui.hero(heroConfig) | safe }}");
    expect(data.heroConfig.title).toBeTruthy();
  });

  it("has five quiz questions with a valid answer and explanation", () => {
    expect(data.quizConfig.questions).toHaveLength(5);
    for (const q of data.quizConfig.questions) {
      expect(q.options).toHaveLength(4);
      expect(Number(q.correct)).toBeGreaterThanOrEqual(1);
      expect(Number(q.correct)).toBeLessThanOrEqual(4);
      expect(q.explanation.length).toBeGreaterThan(40);
    }
  });
});

describe("required sections", () => {
  it.each([
    "what-to-test",
    "fixture",
    "contract",
    "sink",
    "duplicates",
    "reorder",
    "resurrection",
    "broken",
    "crash",
    "reconciliation",
    "property",
    "not-to-test",
    "try-it",
    "resources",
  ])("has section %s with a labelled heading", (id) => {
    expect(page).toContain(
      `<section id="${id}" aria-labelledby="${id}-title">`,
    );
    expect(page).toContain(`<h2 id="${id}-title">`);
  });

  it("separates this page from /tests/ and links both ways", () => {
    expect(flat(page)).toMatch(/checks the <em>lab stack<\/em>/);
    expect(page).toContain("{{ '/tests/' | url }}");
    expect(read("src/tests/index.njk")).toContain(
      "{{ '/test-your-pipeline/' | url }}",
    );
  });

  it("is linked from at least three existing lessons", () => {
    const from = [
      "src/tests/index.njk",
      "src/materialization/index.njk",
      "src/observability/index.njk",
      "src/lab-kafka-debezium/index.njk",
    ].filter((f) => read(f).includes("{{ '/test-your-pipeline/' | url }}"));
    expect(from.length).toBeGreaterThanOrEqual(3);
  });
});

describe("links resolve", () => {
  const links = [
    ...page.matchAll(/\{\{ '(\/[^']*)' \| url \}\}(#[A-Za-z0-9_-]+)?/g),
  ].map((m) => [m[1], m[2]]);

  it("uses | url for every internal link and no root-absolute href", () => {
    expect(page).not.toMatch(/href="\/(?!\/)/);
    expect(links.length).toBeGreaterThan(15);
  });

  it.each([...new Set(links.map(([p, a]) => `${p}${a ?? ""}`))])(
    "%s exists",
    (target) => {
      const [p, anchor] = target.split("#");
      if (p === "/playground/") return; // built from playground/, not src/
      if (p === "/glossary/") {
        expect(glossary.map((g) => g.slug)).toContain(anchor);
        return;
      }
      const candidates = [
        `src${p}index.njk`,
        `src${p.replace(/\/$/, "")}.njk`,
      ].filter((f) => existsSync(path.join(ROOT, f)));
      expect(candidates.length, p).toBeGreaterThan(0);
      if (anchor) {
        // Section ids can be given by macros, so look for the id text.
        expect(read(candidates[0])).toMatch(
          new RegExp(`id=["']${anchor}["']|id: ['"]${anchor}['"]`),
        );
      }
    },
  );

  it("adds both new glossary terms with unique slugs", () => {
    const slugs = glossary.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(
      expect.arrayContaining(["convergence-test", "resurrection"]),
    );
  });
});

describe("renders", () => {
  it("survives Nunjucks with the real hero and quiz data", () => {
    const env = new nunjucks.Environment(null, { autoescape: false });
    env.addFilter("url", (p) => `/letstalkcdc${p}`);
    const body = page.slice(page.indexOf("}) | safe }}") + 1);
    const out = env.renderString(
      body
        .replace(/\{\{ ui\.hero[^}]*\}\}/, "")
        .replace(/\{\{ quizMacro\.quiz\(quizConfig\) \| safe \}\}/, "")
        .replace(/\{% import[^%]*%\}/g, ""),
      data,
    );
    expect(out).toContain('href="/letstalkcdc/exactly-once/"');
    expect(out).toContain("record with the same key and a null value");
  });
});

describe("wording", () => {
  const prose = flat(page.replace(/<pre>[\s\S]*?<\/pre>/g, ""));

  it("never claims exactly-once across systems or timestamp ordering", () => {
    expect(prose).not.toMatch(/exactly-once (is|holds|is guaranteed)/i);
    expect(prose).not.toMatch(/guarantees? exactly[- ]once/i);
    expect(prose).not.toMatch(
      /order(ed|ing)? by (ts_ms|op_ts|updated_at|timestamp)/i,
    );
    expect(prose).not.toMatch(/latest timestamp/i);
  });

  it("tells the reader not to assert 'no duplicates'", () => {
    expect(prose).toMatch(/None of them asserts &ldquo;no duplicates&rdquo;/);
    expect(prose).toMatch(/Do not assert|test that fails on a repeated event/i);
  });

  it("labels what CI does not run", () => {
    expect(prose).toMatch(/Not run by this repository's CI/);
    expect(prose).toMatch(/<strong>Untested\.<\/strong>/);
  });

  it("names each section's failure on a broken sink", () => {
    expect(
      (prose.match(/On a broken sink\./g) ?? []).length,
    ).toBeGreaterThanOrEqual(6);
  });
});

describe("SQL examples (structural; not run here)", () => {
  const sink = codeAfter("sink.sql (events, target table, apply function)");
  const sqlBlocks = allCode.filter(
    (c) =>
      /\b(SELECT|INSERT|CREATE)\b/.test(c) && !/broken on purpose/i.test(c),
  );

  it("guards the update on log position and keeps the delete as a marker", () => {
    expect(sink).toMatch(
      /WHERE target_customers\.source_lsn < EXCLUDED\.source_lsn/,
    );
    expect(sink).toMatch(/op = 'd'/);
    expect(sink).toMatch(/SELECT DISTINCT ON \(id\)/);
    expect(sink).toMatch(/ORDER BY id, coalesce\(lsn, -1\) DESC/);
    expect(sink).not.toMatch(/DELETE FROM target_customers/);
  });

  it("never orders or compares on a timestamp in SQL", () => {
    for (const c of sqlBlocks) {
      expect(c).not.toMatch(/ORDER BY[^;\n]*ts_ms/i);
      expect(c).not.toMatch(/ts_ms\s*(<|>|<=|>=)/);
      expect(c).not.toMatch(/op_ts|updated_at/i);
    }
  });

  it("test script covers duplicate, replay, reorder and resurrection", () => {
    const t = codeAfter("tests.sql (the whole script, all four checks)");
    for (const name of [
      "duplicate: same batch twice",
      "replay: whole log again",
      "reorder: 200 shuffled deliveries",
      "resurrection: key 2 stays deleted",
    ]) {
      expect(t).toContain(name);
    }
  });

  it("the fixture's SQL events match the fixture lines", () => {
    const fixture = codeAfter("Save this as <code>fixture.jsonl</code>")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .filter((r) => r.value);
    const lsns = fixture.map((r) => r.value.source.lsn);
    for (const lsn of lsns) {
      expect(sink).toMatch(new RegExp(`\\b${lsn ?? "NULL"},\\s+\\d+\\)`));
    }
  });
});

describe("JavaScript examples run", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "m5-"));
  const fixture = codeAfter("Save this as <code>fixture.jsonl</code>");
  const contract = codeAfter("contract.test.mjs (Node 20+, no dependencies)");
  const prop = codeAfter("prop.mjs (Node 20+, no dependencies");
  writeFileSync(path.join(dir, "fixture.jsonl"), fixture);
  writeFileSync(path.join(dir, "contract.test.mjs"), contract);
  writeFileSync(path.join(dir, "prop.mjs"), prop);

  it("contract tests pass on the fixture, as the page says", () => {
    const out = execFileSync(
      process.execPath,
      ["--test", path.join(dir, "contract.test.mjs")],
      { cwd: dir, encoding: "utf8" },
    );
    expect(out).toMatch(/ℹ tests 4/);
    expect(out).toMatch(/ℹ pass 4/);
    expect(out).toMatch(/ℹ fail 0/);
    expect(codeAfter("Run it next to")).toContain("pass 4");
  });

  it("the property script prints exactly what the page shows, exiting 0", () => {
    const out = execFileSync(process.execPath, [path.join(dir, "prop.mjs")], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(out.trim()).toBe(codeAfter("Output of this run").trim());
    expect(out).toMatch(/PASS {2}guarded on lsn, delete marker: 0\/500/);
    expect(out.match(/FAIL {2}control:/g)).toHaveLength(3);
  });

  it("the property script uses a timestamp only in the labelled control", () => {
    const sinkSrc = prop.slice(prop.indexOf("const sinks = ["));
    const lines = sinkSrc.split("\n");
    const bad = lines.filter((l) => /\.ts\b/.test(l));
    expect(bad).toHaveLength(1); // the labelled ts_ms control only
  });

  it("the crash script's jq filter finds the redelivered change", () => {
    const sh = codeAfter("crash.sh (lab stack; untested, see below)");
    expect(sh).toContain("docker kill connect");
    expect(sh).toMatch(/uniq -d/);
    expect(sh).toMatch(/\[ "\$after" -gt "\$before" \]/);
  });
});

describe("review fixes", () => {
  const fixtureLines = codeAfter("Save this as <code>fixture.jsonl</code>")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const sink = codeAfter("sink.sql (events, target table, apply function)");
  const variants = codeAfter("variants.sql (broken on purpose");
  const flatPage = flat(page);

  it("source.snapshot is a string in the fixture, with positionless incremental reads", () => {
    const values = fixtureLines.filter((r) => r.value).map((r) => r.value);
    for (const v of values) expect(typeof v.source.snapshot).toBe("string");
    const incremental = values.filter(
      (v) => v.source.snapshot === "incremental",
    );
    expect(incremental.length).toBeGreaterThanOrEqual(2);
    for (const v of incremental) {
      expect(v.op).toBe("r");
      expect(v.source.lsn).toBeNull();
      expect(v.source.txId).toBeNull();
    }
  });

  it("the sink stores a missing position as -1 and the SQL rows match", () => {
    expect(sink).toMatch(/coalesce\(lsn, -1\)/);
    expect(sink).toMatch(/NULL, 1030\)/);
    expect(flatPage).toMatch(/incremental-snapshot reads/);
    expect(flatPage).toMatch(/no position/);
  });

  it("publishes all three broken variants and every number matches the table", () => {
    for (const label of ["-- A. ", "-- B. ", "-- C. "]) {
      expect(variants).toContain(label);
    }
    expect(variants).toMatch(/ORDER BY id, arrival DESC/);
    expect(variants).toMatch(/ADD COLUMN ts_ms/);
    expect(variants).toMatch(/target_customers\.ts_ms <= EXCLUDED\.ts_ms/);
    expect(variants).toMatch(/DELETE FROM target_customers/);
    for (const n of ["188 differ", "141 differ", "130 differ", "65 of 200"]) {
      expect(flatPage).toContain(n);
    }
  });

  it("recon_positions starts from the log with a left join", () => {
    const recon = codeAfter("recon.sql (run after sink.sql");
    expect(recon).toMatch(/LEFT JOIN target_customers t USING \(id\)/);
  });

  it("owns up to the stale-row gap in the playground and to the crash replay", () => {
    expect(flatPage).toMatch(/no scenario there reproduces/);
    expect(flatPage).not.toMatch(/never goes backwards/);
    expect(flatPage).toMatch(
      /after a crash it resumes from its last recorded offset/,
    );
    expect(flatPage).not.toMatch(/reorder does not come from the broker/);
  });

  it("crash.sh needs the count to grow, bounds its waits and does not claim to run the sink checks", () => {
    const sh = codeAfter("crash.sh (lab stack; untested, see below)");
    expect(sh).toMatch(/before=\$\(count_dupes\)/);
    expect(sh).toMatch(/seq 1 60/);
    expect(sh).toMatch(/FAILED/);
    expect(flatPage).toMatch(/run the sink checks yourself afterwards/);
  });
});
