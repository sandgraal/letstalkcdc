/**
 * Guard for P16-13: /tooling/ and /compare/ have two different jobs and say
 * so. /compare/ is the decision matrix ("which fits my situation");
 * /tooling/ holds the tool profiles ("what does each tool do"). Reads the
 * real page sources and 11tydata, not copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { platforms } from "../../src/_data/cdcCompare.mjs";
import site from "../../src/_data/site.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const require_ = createRequire(import.meta.url);

function load(dir) {
  const src = read(`src/${dir}/index.njk`);
  const fm = src.match(/^---\n([\s\S]*?)\n---/)[1];
  const field = (name) => fm.match(new RegExp(`^${name}: "(.+)"$`, "m"))?.[1];
  const body = src.slice(src.indexOf("---", 3) + 3);
  return {
    src,
    body,
    title: field("title"),
    description: field("description"),
    descriptionTags: (fm.match(/^description:/gm) || []).length,
    data: require_(path.join(ROOT, `src/${dir}/index.11tydata.cjs`)),
  };
}

const tooling = load("tooling");
const compare = load("compare");

const headings = (body, level) =>
  [
    ...body.matchAll(
      new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, "g"),
    ),
  ]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    // template loops render one heading per platform, not a literal title
    .filter((t) => !t.includes("{{"));
const ids = (body) => [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

describe("/tooling/ and /compare/ have two jobs", () => {
  it("have distinct titles that state each page's job", () => {
    expect(tooling.title).toBeTruthy();
    expect(compare.title).toBeTruthy();
    expect(tooling.title).not.toBe(compare.title);
    expect(tooling.title).toMatch(/profiles?/i);
    expect(compare.title).toMatch(/which fits/i);
    // Hero h1 matches the page's job, not an older editorial name.
    expect(tooling.data.heroConfig.title).toMatch(/profiles/i);
  });

  it("keep the rendered <title> (with the brand suffix) within 60 characters", () => {
    for (const p of [tooling, compare]) {
      expect(`${p.title} | ${site.title}`.length).toBeLessThanOrEqual(60);
    }
  });

  it("have distinct descriptions, one tag each, at most 160 characters", () => {
    for (const p of [tooling, compare]) {
      expect(p.descriptionTags).toBe(1);
      expect(p.description.length).toBeGreaterThan(70);
      expect(p.description.length).toBeLessThanOrEqual(160);
    }
    expect(tooling.description).not.toBe(compare.description);
  });

  it("do not let the hero copy repeat across the two pages", () => {
    expect(tooling.data.heroConfig.description).not.toBe(
      compare.data.heroConfig.description,
    );
  });

  it("each render exactly one h1 (the hero), never one in the body", () => {
    for (const p of [tooling, compare]) {
      expect(p.data.heroConfig.title).toBeTruthy();
      expect(p.body).not.toMatch(/<h1[\s>]/i);
      expect(p.src).toContain("ui.hero(heroConfig)");
    }
    expect(tooling.data.heroConfig.title).not.toBe(
      compare.data.heroConfig.title,
    );
  });

  it("link to each other in the body, before any reader scrolls to the footer", () => {
    expect(tooling.body).toContain("'/compare/' | url");
    expect(tooling.body).toContain("'/compare/#decide' | url");
    expect(tooling.body).toContain("'/compare/#matrix' | url");
    expect(compare.body).toContain("'/tooling/' | url");
    // The opening paragraph (first <p>) of each page names the other page.
    const opening = (body) => body.match(/<p>[\s\S]*?<\/p>/)[0];
    expect(opening(tooling.body)).toContain("/compare/");
    expect(opening(compare.body)).toContain("/tooling/");
  });

  it("never hardcode a root-relative href (every internal link uses | url)", () => {
    for (const p of [tooling, compare]) {
      expect(p.body).not.toMatch(/href="\//);
    }
  });

  it("have no duplicated h2 or h3 headings between them", () => {
    for (const level of [2, 3]) {
      const a = new Set(
        headings(tooling.body, level).map((t) => t.toLowerCase()),
      );
      const b = headings(compare.body, level).map((t) => t.toLowerCase());
      expect(b.filter((t) => a.has(t))).toEqual([]);
    }
  });

  it("the old high-level comparison table is gone from /tooling/", () => {
    expect(tooling.body).not.toContain("<table");
    expect(compare.body).toContain("compare-matrix");
  });

  it("every platform card on /compare/ links to a profile anchor that exists on /tooling/", () => {
    expect(compare.body).toContain("'/tooling/' | url }}#{{ p.slug }}");
    const toolingIds = new Set(ids(tooling.body));
    const missing = platforms
      .map((p) => p.slug)
      .filter((slug) => !toolingIds.has(slug));
    expect(missing).toEqual([]);
  });

  it("keeps the anchors other pages and the assistant link to", () => {
    for (const id of ["open-source", "managed-cloud", "commercial"]) {
      expect(ids(tooling.body), id).toContain(id);
    }
    expect(ids(tooling.body)).toContain("capabilities");
    expect(ids(tooling.body)).toContain("gotchas");
    expect(ids(tooling.body)).toContain("comparison-table");
    for (const id of [
      "matrix",
      "platforms",
      "decide",
      "matrix-title",
      "decide-title",
    ]) {
      expect(ids(compare.body), id).toContain(id);
    }
  });

  it("holds the site thesis: at-least-once, idempotent sink, log position", () => {
    expect(tooling.body).toMatch(/at-least-once/i);
    expect(tooling.body).toMatch(/idempotent/i);
    expect(tooling.body).toMatch(/log\s+position/i);
    expect(tooling.body).not.toMatch(/exactly-once at the sink/i);
    expect(compare.body).toMatch(/at-least-once/i);
    expect(compare.body).toMatch(/log position/i);
  });

  it("keeps dateModified at or after the day the pages were re-scoped", () => {
    for (const p of [tooling, compare]) {
      expect(p.data.dateModified >= "2026-10-09").toBe(true);
    }
  });

  it("compare data states the verified DMS, Airbyte and Debezium facts", () => {
    const by = Object.fromEntries(platforms.map((p) => [p.slug, p]));
    expect(by["aws-dms"].targets).toMatch(/on-premises/);
    expect(by["aws-dms"].targets).toMatch(/Kafka/);
    expect(by["aws-dms"].tradeoffs.join(" ")).not.toMatch(/AWS targets only/);
    expect(by.airbyte.license).toMatch(/Elastic License 2\.0/);
    expect(by.airbyte.license).not.toMatch(/^Open source/);
    // Airbyte is source-available (ELv2), not open source: no OSS wording.
    expect(JSON.stringify(by.airbyte)).not.toMatch(/\bOSS\b|open[- ]source/i);
    expect(tooling.body).not.toMatch(/Airbyte \(OSS/);
    expect(by.debezium.delivery).toMatch(/^At-least-once by default/);
    expect(by.debezium.delivery).toMatch(/Kafka Connect exactly-once/);
  });
});
