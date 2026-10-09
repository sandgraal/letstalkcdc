/**
 * Author identity surfaces in base.njk: the byline photo, the Article
 * JSON-LD author block, and the "Get in touch" CTA. Renders the real
 * fragments from base.njk (not copies) with nunjucks, using the real
 * src/_data/author.mjs, so a data or template regression fails here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
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

function slice(startMarker, endMarker) {
  const start = template.indexOf(startMarker);
  expect(start, `${startMarker} not found in base.njk`).toBeGreaterThan(-1);
  const end = template.indexOf(endMarker, start) + endMarker.length;
  return template.slice(start, end);
}

const jsonLdFragment = slice(
  '<script type="application/ld+json">',
  "</script>",
);
const pageMetaFragment = slice('<aside class="page-meta"', "</aside>");

const HOST = "https://sandgraal.github.io/letstalkcdc";
const env = new nunjucks.Environment(null, { autoescape: true });
// Stand-in for Eleventy's `url` filter with a production path prefix.
env.addFilter("url", (p) => `/letstalkcdc${p}`);

const context = (overrides = {}) => ({
  author: { ...author, ...overrides },
  site: { host: HOST, title: "CDC: The Missing Manual" },
  title: "Intro",
  // Computed earlier in base.njk's <head>; the fragment reads them.
  pageHeadline: "Intro",
  ogImageUrl: `${HOST}/images/cdc-cover.jpg`,
  description: "d",
  pageDescription: "d",
  datePublished: "2026-01-01",
  dateModified: "2026-02-02",
  canonicalUrl: "/intro/",
});

const renderJsonLd = (overrides) => {
  const html = env.renderString(jsonLdFragment, context(overrides));
  const body = html
    .replace(/^<script\b[^>]*>/i, "")
    .replace(/<\/script\b[^>]*>$/i, "")
    .trim();
  return JSON.parse(body); // throws if the template emitted invalid JSON
};
const renderMeta = (overrides) =>
  env.renderString(pageMetaFragment, context(overrides));

describe("author data", () => {
  it("points at assets that exist under src/static", () => {
    for (const p of [author.image, author.imageSmall]) {
      expect(p.startsWith("/")).toBe(true);
      expect(existsSync(path.join(ROOT, "src/static", p))).toBe(true);
    }
  });

  it("lists GitHub and LinkedIn in sameAs", () => {
    expect(author.sameAs).toEqual([
      "https://github.com/sandgraal",
      "https://www.linkedin.com/in/cennis/",
    ]);
  });
});

describe("Article JSON-LD author", () => {
  it("includes an absolute image URL and the full sameAs array", () => {
    const { author: a } = renderJsonLd();
    expect(a["@type"]).toBe("Person");
    expect(a.name).toBe("Christopher Ennis");
    expect(a.image).toBe(`${HOST}/author/christopher.jpg`);
    expect(a.sameAs).toEqual([
      "https://github.com/sandgraal",
      "https://www.linkedin.com/in/cennis/",
    ]);
  });

  it("stays valid JSON and omits image/sameAs when unset", () => {
    const { author: a } = renderJsonLd({ image: null, sameAs: [], url: null });
    expect(a).toEqual({ "@type": "Person", name: "Christopher Ennis" });
  });
});

describe("page-meta byline photo", () => {
  it("renders a sized, lazy, prefix-aware img with srcset", () => {
    const html = renderMeta();
    const img = html.match(/<img class="author-photo"[^>]*>/)?.[0];
    expect(img).toBeTruthy();
    expect(img).toContain('src="/letstalkcdc/author/christopher-128.jpg"');
    expect(img).toContain(
      'srcset="/letstalkcdc/author/christopher-128.jpg 128w, /letstalkcdc/author/christopher.jpg 400w"',
    );
    expect(img).toContain('width="48"');
    expect(img).toContain('height="48"');
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
    // Decorative: the name is printed right beside it.
    expect(img).toContain('alt=""');
    expect(html).toContain(">Christopher Ennis</a>");
  });

  it("renders no img when author.image is unset", () => {
    expect(renderMeta({ image: null })).not.toContain("<img");
  });
});

describe("Get in touch CTA", () => {
  it("shows an external noopener LinkedIn link when advisoryUrl is set", () => {
    const html = renderMeta();
    const cta = html.match(/<a href="[^"]*"[^>]*>Get in touch[^<]*<\/a>/)?.[0];
    expect(cta).toBeTruthy();
    expect(cta).toContain('href="https://www.linkedin.com/in/cennis/"');
    expect(cta).toContain('rel="noopener"');
  });

  it("is hidden when advisoryUrl is null", () => {
    const html = renderMeta({ advisoryUrl: null });
    expect(html).not.toContain("Get in touch");
    expect(html).not.toContain("page-meta__cta");
  });
});
