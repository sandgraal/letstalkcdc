/**
 * P17-26: the "Technically reviewed by NAME on DATE" line and the JSON-LD
 * `reviewedBy` appear only when a page sets BOTH `reviewedBy` and
 * `reviewedOn`. Renders the real fragments from base.njk. The byline date
 * is "Last updated" (dateModified records an edit, not a review).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import author from "../../src/_data/author.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const template = readFileSync(
  path.join(ROOT, "src/_includes/layouts/base.njk"),
  "utf8",
);

function slice(startMarker, endMarker, inclusive = true) {
  const start = template.indexOf(startMarker);
  expect(start, `${startMarker} not found`).toBeGreaterThan(-1);
  const end = template.indexOf(endMarker, start);
  expect(end, `${endMarker} not found`).toBeGreaterThan(start);
  return template.slice(start, inclusive ? end + endMarker.length : end);
}

// The normalisation block (hasReview) sits between the date normalisation
// and `isArticle`; the page-meta and JSON-LD fragments read its result.
const normalise = slice(
  "{% if reviewedOn.toISOString %}",
  "{% set isArticle",
  false,
);
const jsonLdFragment = slice(
  '<script type="application/ld+json">',
  "</script>",
);
const pageMetaFragment = slice('<aside class="page-meta"', "</aside>");

const HOST = "https://sandgraal.github.io/letstalkcdc";
const env = new nunjucks.Environment(null, { autoescape: true });
env.addFilter("url", (p) => `/letstalkcdc${p}`);

const context = (overrides = {}) => ({
  author,
  site: { host: HOST, title: "CDC: The Missing Manual" },
  seriesKey: "intro",
  pageHeadline: "Intro",
  ogImageUrl: `${HOST}/images/cdc-cover.jpg`,
  pageDescription: "d",
  datePublished: "2026-01-01",
  dateModified: "2026-02-02",
  canonicalUrl: "/intro/",
  ...overrides,
});
const render = (fragment, overrides) =>
  env.renderString(`${normalise}${fragment}`, context(overrides));
const meta = (o) => render(pageMetaFragment, o);
const jsonLd = (o) =>
  JSON.parse(
    render(jsonLdFragment, o)
      .replace(/^\s*<script\b[^>]*>/i, "")
      .replace(/<\/script\b[^>]*>$/i, "")
      .trim(),
  );

const LINE = "Technically reviewed by";

describe("review provenance line", () => {
  it("shows reviewer and date when both are set", () => {
    const html = meta({ reviewedBy: "Ada Lovelace", reviewedOn: "2026-03-04" });
    expect(html).toContain(
      `${LINE} Ada Lovelace on <time datetime="2026-03-04">2026-03-04</time>`,
    );
  });

  it("accepts an unquoted YAML date (Date object) for reviewedOn", () => {
    const html = meta({
      reviewedBy: "Ada Lovelace",
      reviewedOn: new Date("2026-03-04T00:00:00Z"),
    });
    expect(html).toContain('<time datetime="2026-03-04">2026-03-04</time>');
  });

  it("shows nothing with neither field", () => {
    expect(meta({})).not.toContain(LINE);
    expect(meta({})).not.toContain("page-meta__review");
  });

  it("shows nothing with only reviewedBy", () => {
    expect(meta({ reviewedBy: "Ada Lovelace" })).not.toContain(LINE);
  });

  it("shows nothing with only reviewedOn", () => {
    expect(meta({ reviewedOn: "2026-03-04" })).not.toContain(LINE);
  });

  it.each([
    ["not a date but long", "not a date but long"],
    ["empty-ish text", "soon"],
  ])("shows nothing when reviewedOn is not a date (%s)", (_n, v) => {
    const html = meta({ reviewedBy: "Ada Lovelace", reviewedOn: v });
    expect(html).not.toContain(LINE);
    expect(jsonLd({ reviewedBy: "Ada Lovelace", reviewedOn: v })).toBeTruthy();
    expect(
      JSON.stringify(jsonLd({ reviewedBy: "Ada Lovelace", reviewedOn: v })),
    ).not.toContain("lastReviewed");
  });

  it("accepts any YYYY-MM-DD shape (no calendar validation)", () => {
    const html = meta({ reviewedBy: "Ada Lovelace", reviewedOn: "2026-13-45" });
    expect(html).toContain(LINE);
  });

  it("escapes the reviewer name", () => {
    const html = meta({ reviewedBy: "<b>x</b>", reviewedOn: "2026-03-04" });
    expect(html).not.toContain("<b>x</b>");
  });

  it("labels dateModified as an update, never a review", () => {
    const html = meta({});
    expect(html).toContain("Last updated 2026-02-02");
    expect(html).not.toContain("Last reviewed");
    expect(template).not.toContain("Last reviewed");
  });
});

describe("review provenance JSON-LD", () => {
  it("adds reviewedBy and lastReviewed only when both are set", () => {
    const page = jsonLd({
      reviewedBy: "Ada Lovelace",
      reviewedOn: "2026-03-04",
    }).mainEntityOfPage;
    expect(page.reviewedBy).toEqual({
      "@type": "Person",
      name: "Ada Lovelace",
    });
    expect(page.lastReviewed).toBe("2026-03-04");
  });

  it.each([
    ["neither", {}],
    ["only reviewedBy", { reviewedBy: "Ada Lovelace" }],
    ["only reviewedOn", { reviewedOn: "2026-03-04" }],
  ])("omits both keys with %s", (_n, o) => {
    const ld = jsonLd(o);
    expect(JSON.stringify(ld)).not.toContain("reviewedBy");
    expect(JSON.stringify(ld)).not.toContain("lastReviewed");
  });
});

describe("review provenance data", () => {
  // Setting these is an editorial act by the maintainer. A page that sets
  // one without the other is a bug, because the layout would silently drop
  // it. Scans every page's data file and template front matter.
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(njk|cjs|md)$/.test(e.name) && e.name !== "base.njk")
        files.push(full);
    }
  })(path.join(ROOT, "src"));

  it("no page sets only one of reviewedBy / reviewedOn", () => {
    const bad = files.filter((f) => {
      const t = readFileSync(f, "utf8");
      return /\breviewedBy\b/.test(t) !== /\breviewedOn\b/.test(t);
    });
    expect(bad).toEqual([]);
  });

  it("no page sets either field yet (P17-26 ships the mechanism only)", () => {
    const set = files.filter((f) =>
      /\breview(edBy|edOn)\s*:/.test(readFileSync(f, "utf8")),
    );
    expect(set).toEqual([]);
  });
});
