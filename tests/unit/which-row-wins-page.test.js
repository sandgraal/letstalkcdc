/**
 * Guard for /which-row-wins/ (module M1): ordering and delete markers in six
 * targets. Reads the real page and data sources. Holds the site thesis:
 * at-least-once delivery, idempotent sinks keyed on the primary key ordered by
 * source log position (never a timestamp), delete markers, no end-to-end
 * exactly-once.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import series from "../../src/_data/series.mjs";
import glossary from "../../src/_data/glossary.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const page = read("src/which-row-wins/index.njk");
const data = require(path.join(ROOT, "src/which-row-wins/index.11tydata.cjs"));
const flat = (s) => s.replace(/\s+/g, " ");
const text = flat(page.replace(/<[^>]+>/g, " "));
const front = /^---\n([\s\S]*?)\n---/.exec(page)[1];
const fm = (key) => new RegExp(`^${key}:\\s*"(.*)"\\s*$`, "m").exec(front)?.[1];

describe("/which-row-wins/ metadata and registration", () => {
  it("has a title of at most 50 characters and a description of 120 to 160", () => {
    expect(fm("title").length).toBeLessThanOrEqual(50);
    expect(fm("description").length).toBeGreaterThanOrEqual(120);
    expect(fm("description").length).toBeLessThanOrEqual(160);
  });

  it("has dates, a canonical path and a series entry", () => {
    expect(data.datePublished).toBe("2026-10-09");
    expect(data.dateModified).toBe("2026-10-09");
    expect(fm("canonicalPath")).toBe("/which-row-wins/");
    expect(data.seriesKey).toBe("which-row-wins");
    const entry = series.find((s) => s.key === "which-row-wins");
    expect(entry.href).toBe("which-row-wins/");
    expect(entry.description.length).toBeLessThanOrEqual(200);
  });

  it("renders its one h1 through the hero, and no other h1", () => {
    expect(page).not.toMatch(/<h1/i);
    expect(page).toMatch(/ui\.hero\(heroConfig\)/);
    expect(data.heroConfig.title).toBe("Which Row Wins in Your Target");
  });

  it("has a short quiz", () => {
    expect(data.quizConfig.questions.length).toBeGreaterThanOrEqual(3);
    expect(page).toMatch(/quizMacro\.quiz\(quizConfig\)/);
  });
});

describe("/which-row-wins/ content", () => {
  it.each([
    ["question-title"],
    ["at-a-glance-title"],
    ["replay-title"],
    ["deletes-title"],
    ["eos-title"],
    ["try-it-title"],
    ["monday-title"],
    ["resources-title"],
  ])("has the section #%s", (id) => {
    expect(page).toContain(`id="${id}"`);
  });

  it.each([
    ["BigQuery", /_CHANGE_SEQUENCE_NUMBER/, /_CHANGE_TYPE/],
    ["Databricks", /SEQUENCE BY/, /APPLY AS DELETE WHEN/],
    ["Hudi", /hoodie\.table\.ordering\.fields/, /_hoodie_is_deleted/],
    ["Iceberg", /equality/i, /MERGE INTO/],
    ["Delta", /change data feed/i, /MERGE/],
    ["Snowflake", /METADATA\$ACTION/, /ERROR_ON_NONDETERMINISTIC_MERGE/],
  ])("covers %s: ordering and delete handling", (_name, a, b) => {
    expect(page).toMatch(a);
    expect(page).toMatch(b);
  });

  it("gives each target a snippet marked untested", () => {
    const snippets = page.match(/<summary>[^<]*\(untested\)<\/summary>/g);
    expect(snippets.length).toBeGreaterThanOrEqual(6);
  });

  it("states what was not tested and uses 'check your version' notes", () => {
    expect(text).toMatch(/Nothing was run against a live product/);
    expect(text).toMatch(/check your version/i);
  });

  it("holds the thesis", () => {
    expect(text).toMatch(/at-least-once/);
    expect(text).toMatch(/idempotent sink/);
    expect(text).toMatch(/source log position/);
    expect(text).toMatch(/delete markers?/);
    expect(text).toMatch(/not achievable in general/);
    expect(text).toMatch(/exactly-once processing/i);
  });

  it("words Debezium's exactly-once mode per hop", () => {
    expect(text).toMatch(/exactly\.once\.source\.support=enabled/);
    expect(text).toMatch(/covers that one hop/);
    expect(text).toMatch(/from 3\.3/);
  });

  it("never teaches a timestamp or offset as the ordering key", () => {
    expect(text).not.toMatch(
      /order(?:ed|ing)? by (?:ts_ms|OP_TS|a timestamp)/i,
    );
    expect(text).not.toMatch(/(?:sequence by|ordering field)[^.]{0,40}ts_ms/i);
    for (const m of page.matchAll(/ts_ms|OP_TS/g)) {
      // May appear only to be ruled out.
      expect(page.slice(Math.max(0, m.index - 160), m.index + 80)).toMatch(
        /wrong|not|never|Do not|ruled/i,
      );
    }
  });

  it("never claims end-to-end exactly-once is achievable or advises physical deletes", () => {
    expect(text).not.toMatch(/exactly-once end[- ]to[- ]end (?:is|can)/i);
    expect(text).not.toMatch(/guarantees? exactly-once (?:delivery )?end/i);
    expect(text).not.toMatch(
      /(?:simply|just|safe to) (?:physically )?delete the row/i,
    );
    expect(text).not.toMatch(/use a hard delete/i);
  });

  it("uses no timestamp as a sequence in any snippet", () => {
    const code = [...page.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)]
      .map((m) => m[1])
      .filter((c) => c.includes("\n"))
      .join("\n");
    expect(code).not.toMatch(/ts_ms|op_ts|updated_at|ORDER BY\s+\w*ts\b/i);
    expect(code).toMatch(/source_lsn/);
  });

  it("is escaped for HTML and Nunjucks in snippets", () => {
    const code = [...page.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code>/g)].map(
      (m) => m[1],
    );
    for (const c of code) {
      expect(c).not.toMatch(/[<>]/);
      expect(c).not.toMatch(/\{\{|\{%/);
    }
  });
});

describe("/which-row-wins/ links", () => {
  const internal = [
    ...page.matchAll(/href="\{\{ '([^']+)' \| url \}\}"?(#[\w-]+)?/g),
  ];
  const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

  it("never hardcodes a root-absolute href", () => {
    for (const h of hrefs) expect(h).not.toMatch(/^\/(?!\/)/);
  });

  it("links at least 3 existing lessons and the playground", () => {
    const targets = new Set(internal.map((m) => m[1]));
    for (const t of [
      "/event-envelope/",
      "/materialization/",
      "/partitioning/",
      "/exactly-once/",
      "/playground/",
    ]) {
      expect(targets.has(t), t).toBe(true);
    }
    expect(text).toMatch(/snapshot-replay/);
  });

  it("internal pages and anchors resolve", () => {
    for (const m of internal) {
      const p = m[1];
      if (p === "/playground/") continue;
      const dir = path.join(ROOT, "src", p.replace(/^\/|\/$/g, ""));
      expect(
        existsSync(path.join(dir, "index.njk")) ||
          existsSync(path.join(dir, "index.html")),
        p,
      ).toBe(true);
    }
    const slugs = new Set(glossary.map((g) => g.slug));
    for (const m of page.matchAll(/'\/glossary\/' \| url \}\}#([\w-]+)/g)) {
      expect(slugs.has(m[1]), m[1]).toBe(true);
    }
    const anchors = {
      "/event-envelope/": read("src/event-envelope/index.njk"),
      "/materialization/": read("src/materialization/index.njk"),
      "/partitioning/": read("src/partitioning/index.njk"),
      "/exactly-once/": read("src/exactly-once/index.njk"),
    };
    for (const m of internal) {
      if (m[2] && anchors[m[1]]) {
        expect(anchors[m[1]], `${m[1]}${m[2]}`).toContain(
          `id="${m[2].slice(1)}"`,
        );
      }
    }
  });

  it("is linked from at least 4 existing lessons", () => {
    for (const rel of [
      "src/materialization/index.njk",
      "src/partitioning/index.njk",
      "src/exactly-once/index.njk",
      "src/use-cases/index.njk",
    ]) {
      expect(read(rel), rel).toContain("/which-row-wins/' | url");
    }
  });

  it("cites a primary vendor page for each target", () => {
    for (const host of [
      "docs.cloud.google.com/bigquery",
      "docs.databricks.com",
      "hudi.apache.org",
      "iceberg.apache.org",
      "docs.delta.io",
      "docs.snowflake.com",
      "debezium.io",
    ]) {
      expect(page, host).toContain(host);
    }
  });
});
