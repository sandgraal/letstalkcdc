/**
 * Guard for scripts/seo-audit.mjs (P16-12).
 *
 * The audit is only worth keeping if its numbers can be trusted, so the first
 * half runs it on a tiny hand-made site with one known defect per
 * measurement and asserts it finds exactly those. The second half runs it on
 * the real `_site/` when one has been built (npm run build) and checks the
 * shape of the answer, not its values: values belong in
 * docs/seo-baseline-2026-10-after.md and in the other SEO tests.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditSite, formatTable } from "../../scripts/seo-audit.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const HOST = "https://example.org/guide";
const SCRIPT = path.join(ROOT, "scripts", "seo-audit.mjs");

const head = ({ title, description, canonical, extra = "" }) => `<!doctype html>
<html lang="en"><head>
<title>${title}</title>
${description ? `<meta name="description" content="${description}">` : ""}
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
<link rel="alternate" type="application/rss+xml" href="/guide/feed.xml">
${extra}
</head>`;

const og = (url) => `<meta property="og:title" content="t">
<meta property="og:image" content="${HOST}/i.jpg">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">`;

const article = (url, extra = {}) =>
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "h",
    description: "d",
    datePublished: "2026-01-01",
    dateModified: "2026-01-01",
    author: { "@type": "Person", name: "a" },
    publisher: { "@type": "Organization", name: "p" },
    mainEntityOfPage: { "@id": url },
    ...extra,
  })}</script>`;

const LONG_TITLE = `${"A very long page title ".repeat(4)}| CDC: The Missing Manual`;
const SAME_DESC = "Same description on two pages.";

/**
 * Pages:
 *  /          clean home, links to everything, glossary-style hub
 *  /a/        title > 70, duplicate description, h2->h4 skip, broken
 *             fragment, broken internal link, link to /playground/
 *  /b/        no <h1>, no og tags, unparseable JSON-LD, Article without image
 *  /c/        clean; reachable only through the header (chrome)
 *  /old.html  meta-refresh redirect stub to /a/
 */
function writeFixture(dir) {
  const put = (rel, body) => {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  put(
    "index.html",
    `${head({
      title: "Home | CDC: The Missing Manual",
      description: "The home page of the fixture site, long enough to pass.",
      canonical: `${HOST}/`,
      extra: og(`${HOST}/`),
    })}<body>
<header class="global-header"><a href="/guide/c/">C</a></header>
<main><h1>Home</h1><p><a href="/guide/a/">A page</a> <a href="/guide/b/">B page</a></p></main>
<footer class="site-footer"></footer></body></html>`,
  );
  put(
    "a/index.html",
    `${head({
      title: LONG_TITLE,
      description: SAME_DESC,
      canonical: `${HOST}/a/`,
      extra: `${og(`${HOST}/a/`)}${article(`${HOST}/a/`, { image: "x.jpg" })}`,
    })}<body><main><h1 id="top">A</h1><h2>Section</h2><h4>Skipped</h4>
<a href="/guide/b/#nope">to b</a> <a href="/guide/missing/">gone</a>
<a href="/guide/playground/">play</a> <a href="/guide/">home</a>
<a href="/guide/b/">here</a></main></body></html>`,
  );
  put(
    "b/index.html",
    `${head({
      title: "B | CDC: The Missing Manual",
      description: SAME_DESC,
      canonical: `${HOST}/b/`,
      extra: `<script type="application/ld+json">{not json</script>${article(`${HOST}/b/`)}`,
    })}<body><main><h2>No h1 here</h2><a href="/guide/">home</a></main></body></html>`,
  );
  put(
    "c/index.html",
    `${head({
      title: "C | CDC: The Missing Manual",
      description:
        "A third, clean page with its own description of decent length.",
      canonical: `${HOST}/c/`,
      extra: `${og(`${HOST}/c/`)}<meta name="robots" content="index,follow"><meta name="robots" content="noarchive">`,
    })}<body><main><h1>C</h1></main></body></html>`,
  );
  put(
    "old.html",
    `<!doctype html><html><head><meta http-equiv="refresh" content="0; url=/guide/a/"><link rel="canonical" href="${HOST}/a/"></head><body></body></html>`,
  );
  put(
    "404.html",
    "<!doctype html><html><head><title>nope</title></head><body></body></html>",
  );
  put(
    "sitemap.xml",
    `<?xml version="1.0"?><urlset>
<url><loc>${HOST}/</loc><lastmod>2026-10-09</lastmod></url>
<url><loc>${HOST}/a/</loc><lastmod>2026-10-09</lastmod></url>
<url><loc>${HOST}/b/</loc><lastmod>2026-10-09</lastmod></url>
<url><loc>${HOST}/playground/</loc></url>
</urlset>`,
  );
  put(
    "robots.txt",
    "User-agent: *\nAllow: /\nSitemap: https://elsewhere.example/sitemap.xml\n",
  );
  put(
    "feed.xml",
    `<rss><channel><item><title>a</title><link>${HOST}/a/</link><description></description><pubDate>Fri, 09 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
  );
}

describe("seo-audit on a fixture site with known defects", () => {
  let dir;
  let result;
  let metrics;

  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "ltcdc-seo-audit-"));
    writeFixture(dir);
    result = auditSite(dir, { host: HOST, git: false });
    metrics = result.metrics;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("separates content pages from stubs and the 404", () => {
    expect(metrics["inventory.htmlFiles"]).toBe(6);
    expect(metrics["inventory.contentPages"]).toBe(4);
    expect(metrics["inventory.redirectStubs"]).toBe(1);
    expect(metrics["canonical.stubsNotPointingAtLiveTarget"]).toBe(0);
  });

  it("reports a page that carries two robots metas, and honours noindex in either", () => {
    expect(metrics["inventory.pagesWithMoreThanOneRobotsMeta"]).toBe(1);
    expect(metrics["inventory.noindexContentPages"]).toBe(0);
    const dir2 = mkdtempSync(path.join(os.tmpdir(), "ltcdc-seo-audit-ni-"));
    try {
      writeFixture(dir2);
      const file = path.join(dir2, "c/index.html");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace("noarchive", "noindex"),
      );
      const r = auditSite(dir2, { host: HOST, git: false });
      expect(r.details["inventory.noindexContentPages"]).toEqual(["/c/"]);
      expect(r.details["sitemap.indexablePagesMissing"]).toEqual([]);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("counts long titles and duplicate descriptions", () => {
    expect(metrics["titles.over60"]).toBe(1);
    expect(metrics["titles.over70"]).toBe(1);
    expect(metrics["titles.duplicateGroups"]).toBe(0);
    expect(metrics["titles.brandSuffix"]).toBe("CDC: The Missing Manual");
    expect(metrics["descriptions.duplicateGroups"]).toBe(1);
    expect(result.details["descriptions.duplicateGroups"][0].urls).toEqual([
      "/a/",
      "/b/",
    ]);
  });

  it("finds a missing h1 and a skipped heading level", () => {
    expect(metrics["headings.pagesWithNoH1"]).toBe(1);
    expect(metrics["headings.pagesWithLevelSkips"]).toBe(1);
    expect(result.details["headings.pagesWithLevelSkips"][0].url).toBe("/a/");
  });

  it("finds broken links and fragments, and sets the playground aside", () => {
    expect(metrics["links.brokenInternal"]).toBe(1);
    expect(result.details["links.brokenInternal"]).toEqual([
      "/a/ -> /missing/",
    ]);
    expect(metrics["links.toPagesPublishedAfterBuild"]).toBe(1);
    expect(metrics["links.brokenFragments"]).toBe(1);
    expect(result.details["links.brokenFragments"]).toEqual([
      "/a/ -> /b/#nope",
    ]);
    expect(metrics["links.genericLinkText"]).toBe(1);
  });

  it("separates content inbound links from header and footer links", () => {
    const table = Object.fromEntries(
      result.details["links.inboundTable"].map((r) => [r.url, r]),
    );
    // /c/ is linked only from the header on /: one link overall, none in content.
    expect(table["/c/"]).toMatchObject({ all: 1, content: 0 });
    // /b/ is linked from / and /a/ in content.
    expect(table["/b/"]).toMatchObject({ all: 2, content: 2 });
    expect(
      result.details["links.indexablePagesWithZeroContentInbound"],
    ).toEqual(["/c/"]);
    expect(metrics["links.indexablePagesWithFewerThan3ContentInbound"]).toBe(4);
  });

  it("measures Open Graph, Twitter and feed autodiscovery completeness", () => {
    expect(result.details["social.pagesWithoutOgImage"]).toEqual(["/b/"]);
    expect(metrics["social.pagesWithoutTwitterCard"]).toBe(1);
    expect(metrics["social.pagesWithoutOgImageDimensions"]).toBe(4);
    expect(metrics["social.distinctOgImages"]).toBe(1);
    expect(metrics["social.pagesWithoutFeedAutodiscovery"]).toBe(0);
  });

  it("validates JSON-LD, including a block that does not parse", () => {
    expect(metrics["jsonld.parseFailures"]).toBe(1);
    expect(metrics["jsonld.articlePages"]).toBe(2);
    expect(result.details["jsonld.articlesWithoutImage"]).toEqual(["/b/"]);
    expect(metrics["jsonld.pagesWithBreadcrumbList"]).toBe(0);
    expect(result.details["jsonld.pagesWithNone"]).toEqual(["/", "/c/"]);
  });

  it("reads the sitemap, robots.txt and feed", () => {
    expect(metrics["sitemap.entries"]).toBe(4);
    expect(metrics["sitemap.distinctLastmodValues"]).toBe(2);
    expect(metrics["sitemap.entriesWithoutLastmod"]).toBe(1);
    expect(result.details["sitemap.indexablePagesMissing"]).toEqual(["/c/"]);
    expect(result.details["sitemap.publishedAfterBuild"]).toEqual([
      "/playground/",
    ]);
    expect(metrics["sitemap.entriesWithNoBuiltPage"]).toBe(0);
    expect(metrics["robots.txtSitemapMatchesRealSitemap"]).toBe("no");
    expect(metrics["feed.items"]).toBe(1);
    expect(metrics["feed.itemsWithoutDescription"]).toBe(1);
  });

  it("emits one row per content page and a printable table", () => {
    expect(result.pages.map((p) => p.url).sort()).toEqual([
      "/",
      "/a/",
      "/b/",
      "/c/",
    ]);
    const a = result.pages.find((p) => p.url === "/a/");
    expect(a.inFeed).toBe(true);
    expect(a.sitemapLastmod).toBe("2026-10-09");
    const table = formatTable(result);
    expect(table).toContain("titles.over70");
    expect(table.split("\n").length).toBeGreaterThan(30);
  });

  it("derives the host from the home page canonical when none is given", () => {
    expect(auditSite(dir, { git: false }).meta.host).toBe(HOST);
  });

  it("fails clearly on a missing directory", () => {
    expect(() => auditSite(path.join(dir, "nope"))).toThrow(/not found/);
  });

  it("runs as a command and writes JSON", () => {
    const out = path.join(dir, "out.json");
    const stdout = execFileSync(
      process.execPath,
      [SCRIPT, "--site", dir, "--json", out, "--no-git"],
      { encoding: "utf8" },
    );
    expect(stdout).toContain("titles.over70");
    const json = JSON.parse(readFileSync(out, "utf8"));
    expect(json.metrics["inventory.contentPages"]).toBe(4);
    expect(Array.isArray(json.pages)).toBe(true);
  });
});

const SITE_DIR = path.join(ROOT, "_site");
describe.skipIf(!existsSync(path.join(SITE_DIR, "index.html")))(
  "seo-audit on the real build in _site/",
  () => {
    it("measures every area and finds a realistic number of pages", () => {
      const result = auditSite(SITE_DIR, { git: false });
      const m = result.metrics;
      expect(m["inventory.contentPages"]).toBeGreaterThan(40);
      expect(result.pages).toHaveLength(m["inventory.contentPages"]);
      for (const key of [
        "titles.over60",
        "descriptions.over160",
        "headings.pagesWithLevelSkips",
        "social.pagesWithoutOgImage",
        "jsonld.parseFailures",
        "sitemap.distinctLastmodValues",
        "feed.items",
        "links.brokenFragments",
        "links.indexablePagesWithFewerThan3ContentInbound",
      ]) {
        expect(typeof m[key], key).toBe("number");
      }
      expect(m["jsonld.parseFailures"]).toBe(0);
      expect(m["images.missingAlt"]).toBe(0);
    }, 60_000);
  },
);
