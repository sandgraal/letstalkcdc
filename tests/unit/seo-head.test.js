/**
 * Guard for the social cards and structured data emitted by
 * src/_includes/layouts/base.njk (P16-4, P16-7).
 *
 * Runs one real production Eleventy build into a scratch directory under a
 * made-up host and path prefix, then reads the HTML a crawler would read.
 * Asserting on the built output (not the template) is the point: it catches
 * a page whose front matter or head_extra fights the layout.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import series from "../../src/_data/series.mjs";
import seo from "../../src/_data/seo.mjs";
import site from "../../src/_data/site.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ELEVENTY_BIN = path.join(
  ROOT,
  "node_modules",
  "@11ty",
  "eleventy",
  "cmd.cjs",
);

const HOST = "https://seo-check.example.org";
const PREFIX = "/guide";
const BASE = `${HOST}${PREFIX}`;

const ARTICLE_TYPES = new Set(["Article", "TechArticle"]);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

/** All `<meta>` tags as { attr -> [content, ...] }, keyed by property/name. */
function metaMap(html) {
  const map = {};
  for (const m of html.matchAll(/<meta\s+([^>]*?)\/?>/g)) {
    const key = /(?:property|name)="([^"]+)"/.exec(m[1])?.[1];
    const content = /content="([^"]*)"/.exec(m[1])?.[1];
    if (key && content !== undefined) (map[key] ??= []).push(content);
  }
  return map;
}

function jsonLd(html) {
  return [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1]));
}

// Single pass over a lookup map, so "&amp;lt;" decodes to "&lt;", not "<".
const ENTITIES = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};
const decode = (s) =>
  s.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity]);

/** True when `value` is an absolute URL whose origin is HOST and whose path is under PREFIX. */
const isUnderBase = (value) => {
  const url = new URL(value);
  return (
    url.origin === HOST &&
    (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`))
  );
};

describe("social cards and structured data in the built site", () => {
  let outDir;
  /** @type {{ rel: string, url: string, html: string, meta: object, ld: object[] }[]} */
  let pages = [];
  /** Every built HTML file, whether or not it is in the sample. */
  let allFiles = [];

  beforeAll(() => {
    outDir = mkdtempSync(path.join(os.tmpdir(), "ltcdc-seo-"));
    execFileSync(
      process.execPath,
      [ELEVENTY_BIN, "--config=eleventy.config.mjs", `--output=${outDir}`],
      {
        cwd: ROOT,
        stdio: "pipe",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "",
          NODE_ENV: "production",
          SITE_HOST: HOST,
          ELEVENTY_PATH_PREFIX: PREFIX,
        },
      },
    );

    allFiles = walk(outDir)
      .filter((f) => f.endsWith(".html"))
      .map((file) => {
        const html = readFileSync(file, "utf8");
        const rel = path.relative(outDir, file).split(path.sep).join("/");
        const head = html.split("</head>")[0];
        return {
          rel,
          url: `/${rel.replace(/index\.html$/, "")}`,
          html,
          // Rendered by base.njk (skips redirects, the standalone sandbox
          // pages and the playground copy).
          usesBaseLayout: html.includes("data-path-prefix="),
          noindex: /noindex/i.test(head),
        };
      });

    pages = allFiles
      .filter((f) => f.usesBaseLayout && !f.noindex)
      .map((f) => ({ ...f, meta: metaMap(f.html), ld: jsonLd(f.html) }));
  }, 240_000);

  afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  describe("the sample is deliberate", () => {
    const sampled = () => new Set(pages.map((p) => p.url));

    it("samples every sitemap URL, bar pages the base layout does not render", () => {
      const sitemap = readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
      const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (m) => m[1],
      );
      expect(locs.length).toBeGreaterThan(40);

      // Pages that may be in the sitemap but are not built from base.njk
      // (standalone HTML), so they have no card to check. Keep this list
      // explicit: a new entry should be a decision, not an accident.
      const notFromBaseLayout = new Set(["/mermaid-sandbox/", "/playground/"]);

      const missing = [];
      for (const loc of locs) {
        const u = new URL(loc);
        expect(u.origin, loc).toBe(HOST);
        const rel = u.pathname.slice(PREFIX.length) || "/";
        if (notFromBaseLayout.has(rel)) continue;
        if (!sampled().has(rel)) missing.push(rel);
      }
      expect(missing).toEqual([]);
    });

    it("no page rendered by base.njk has silently become noindex", () => {
      // None are expected today. If one is added on purpose, list it here.
      const expectedNoindex = [];
      const actual = allFiles
        .filter((f) => f.usesBaseLayout && f.noindex)
        .map((f) => f.url)
        .sort();
      expect(actual).toEqual(expectedNoindex);
    });

    it("keeps 404, the styleguide and the retired teaser noindex and out of the sample", () => {
      for (const rel of [
        "404.html",
        "styleguide/index.html",
        "from-change-capture-to-ci/index.html",
      ]) {
        const f = allFiles.find((x) => x.rel === rel);
        expect(f, `${rel} should be built`).toBeTruthy();
        expect(f.noindex, `${rel} should stay noindex`).toBe(true);
        expect(sampled().has(f.url), `${rel} must not be sampled`).toBe(false);
      }
    });

    it("keeps the mermaid sandbox out of the sample on purpose", () => {
      const f = allFiles.find((x) => x.rel === "mermaid-sandbox/index.html");
      expect(f, "mermaid-sandbox should be built").toBeTruthy();
      // Standalone page with its own head: either it is noindex (P16-5) or
      // it is not built from base.njk. Either way it is not sampled, and a
      // switch to the base layout without noindex fails here.
      expect(f.noindex || !f.usesBaseLayout).toBe(true);
      expect(sampled().has(f.url)).toBe(false);
    });
  });

  it("finds a realistic sample of indexable pages", () => {
    expect(pages.length).toBeGreaterThan(40);
    const urls = pages.map((p) => p.url);
    for (const must of ["/", "/intro/", "/overview/", "/exactly-once/"]) {
      expect(urls).toContain(must);
    }
  });

  describe("canonical", () => {
    it("is single, absolute, on the configured host, never localhost", () => {
      const bad = [];
      for (const p of pages) {
        const found = [
          ...p.html.matchAll(/<link rel="canonical" href="([^"]*)">/g),
        ].map((m) => m[1]);
        if (found.length !== 1)
          bad.push(`${p.url}: ${found.length} canonicals`);
        else if (found[0] !== `${BASE}${p.url}`)
          bad.push(`${p.url}: canonical is ${found[0]}`);
      }
      expect(bad).toEqual([]);
    });

    it("is unique across pages", () => {
      const seen = new Map();
      const dupes = [];
      for (const p of pages) {
        const c = `${BASE}${p.url}`;
        if (seen.has(c)) dupes.push(`${p.url} and ${seen.get(c)}`);
        seen.set(c, p.url);
      }
      expect(dupes).toEqual([]);
    });
  });

  describe("Open Graph and Twitter cards", () => {
    it("every indexable page has the full set, once each", () => {
      const required = [
        "og:type",
        "og:url",
        "og:title",
        "og:description",
        "og:image",
        "og:image:width",
        "og:image:height",
        "og:image:alt",
        "twitter:card",
        "twitter:title",
        "twitter:description",
        "twitter:image",
      ];
      const bad = [];
      for (const p of pages) {
        for (const key of required) {
          const v = p.meta[key];
          if (!v || v.length !== 1 || !v[0].trim())
            bad.push(`${p.url}: ${key} -> ${JSON.stringify(v)}`);
        }
      }
      expect(bad).toEqual([]);
    });

    it("og:url equals the canonical URL", () => {
      const bad = pages
        .filter((p) => p.meta["og:url"]?.[0] !== `${BASE}${p.url}`)
        .map((p) => `${p.url}: ${p.meta["og:url"]}`);
      expect(bad).toEqual([]);
    });

    it("uses a large-image card and the same image for og and twitter", () => {
      for (const p of pages) {
        expect(p.meta["twitter:card"]).toEqual(["summary_large_image"]);
        expect(p.meta["twitter:image"]).toEqual(p.meta["og:image"]);
      }
    });

    it("og:image is absolute, on the host, 1200x630, and exists in the build", () => {
      const images = new Set();
      for (const p of pages) {
        const img = p.meta["og:image"][0];
        expect(isUnderBase(img), img).toBe(true);
        expect(img).not.toMatch(/localhost|127\.0\.0\.1/);
        expect(p.meta["og:image:width"]).toEqual(["1200"]);
        expect(p.meta["og:image:height"]).toEqual(["630"]);
        images.add(img);
      }
      for (const img of images) {
        const file = path.join(outDir, img.slice(BASE.length));
        expect(existsSync(file), `${img} should be built`).toBe(true);
      }
      expect(seo.ogImage.width).toBe(1200);
      expect(seo.ogImage.height).toBe(630);
    });

    it("titles and descriptions come from the page, not a stale copy", () => {
      const bad = [];
      for (const p of pages) {
        const desc = decode(
          /<meta name="description" content="([^"]*)">/.exec(p.html)[1],
        );
        if (decode(p.meta["og:description"][0]) !== desc)
          bad.push(`${p.url}: og:description differs from description`);
        if (decode(p.meta["twitter:description"][0]) !== desc)
          bad.push(`${p.url}: twitter:description differs from description`);
      }
      expect(bad).toEqual([]);
    });

    it("falls back to the hero copy, not the site default, when a page has no description", () => {
      const byUrl = Object.fromEntries(pages.map((p) => [p.url, p]));
      for (const url of [
        "/strategy/",
        "/schema-evolution/",
        "/tooling/",
        "/use-cases/",
      ]) {
        const p = byUrl[url];
        expect(p, url).toBeTruthy();
        const metaDesc = decode(
          /<meta name="description" content="([^"]*)">/.exec(p.html)[1],
        );
        expect(metaDesc, url).not.toBe(site.description);
        expect(metaDesc, url).not.toMatch(/[<>]/);
        expect(decode(p.meta["og:description"][0]), url).toBe(metaDesc);
        expect(decode(p.meta["twitter:description"][0]), url).toBe(metaDesc);
        const article = p.ld.find((b) => ARTICLE_TYPES.has(b["@type"]));
        expect(article.description, url).toBe(metaDesc);
      }
    });

    it("marks lessons as articles and the home page as a website", () => {
      const byUrl = Object.fromEntries(pages.map((p) => [p.url, p]));
      expect(byUrl["/"].meta["og:type"]).toEqual(["website"]);
      expect(byUrl["/intro/"].meta["og:type"]).toEqual(["article"]);
      expect(byUrl["/snapshotting/"].meta["og:type"]).toEqual(["article"]);
    });
  });

  describe("JSON-LD", () => {
    it("every block parses and uses the schema.org context", () => {
      // jsonLd() already throws on a parse failure; this also checks shape.
      for (const p of pages) {
        for (const block of p.ld) {
          expect(block["@context"], p.url).toBe("https://schema.org");
          expect(typeof block["@type"], p.url).toBe("string");
        }
      }
    });

    it("has no localhost URL and no relative or foreign-host site URL", () => {
      const bad = [];
      for (const p of pages) {
        const urls = JSON.stringify(p.ld).match(/https?:\/\/[^"\\]+/g) ?? [];
        for (const u of urls) {
          if (/localhost|127\.0\.0\.1/.test(u)) bad.push(`${p.url}: ${u}`);
        }
        // Same host name with a wrong prefix would be a prefix bug.
        for (const u of urls) {
          if (new URL(u).origin === HOST && !isUnderBase(u))
            bad.push(`${p.url}: ${u} is on the host but outside the prefix`);
        }
      }
      expect(bad).toEqual([]);
    });

    it("each page carries at most one Article/TechArticle block", () => {
      const bad = pages
        .map((p) => ({
          url: p.url,
          n: p.ld.filter((b) => ARTICLE_TYPES.has(b["@type"])).length,
        }))
        .filter((x) => x.n > 1)
        .map((x) => `${x.url}: ${x.n}`);
      expect(bad).toEqual([]);
    });

    it("every Article has the required fields, an image and the canonical id", () => {
      const bad = [];
      let seen = 0;
      for (const p of pages) {
        for (const a of p.ld.filter((b) => ARTICLE_TYPES.has(b["@type"]))) {
          seen += 1;
          for (const f of [
            "headline",
            "description",
            "datePublished",
            "dateModified",
            "image",
            "url",
          ]) {
            if (!a[f]) bad.push(`${p.url}: missing ${f}`);
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.datePublished)))
            bad.push(`${p.url}: datePublished ${a.datePublished}`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.dateModified)))
            bad.push(`${p.url}: dateModified ${a.dateModified}`);
          if (!a.author?.name) bad.push(`${p.url}: missing author.name`);
          if (!a.publisher?.name) bad.push(`${p.url}: missing publisher.name`);
          if (a.image !== p.meta["og:image"][0])
            bad.push(`${p.url}: image ${a.image} differs from og:image`);
          if (a.mainEntityOfPage?.["@id"] !== `${BASE}${p.url}`)
            bad.push(`${p.url}: mainEntityOfPage id`);
          if (a.url !== `${BASE}${p.url}`) bad.push(`${p.url}: url ${a.url}`);
        }
      }
      expect(seen).toBeGreaterThan(30);
      expect(bad).toEqual([]);
    });

    it("merges Article and TechArticle into one TechArticle where a page asks for it", () => {
      const byUrl = Object.fromEntries(pages.map((p) => [p.url, p]));
      for (const url of ["/intro/", "/exactly-once/", "/multi-tenancy/"]) {
        const articles = byUrl[url].ld.filter((b) =>
          ARTICLE_TYPES.has(b["@type"]),
        );
        expect(articles, url).toHaveLength(1);
        expect(articles[0]["@type"], url).toBe("TechArticle");
        expect(articles[0].about.length, url).toBeGreaterThan(0);
        expect(articles[0].author.name, url).toBeTruthy();
      }
    });

    it("every indexable page has an Article or is classified in seo.noArticle", () => {
      const bad = [];
      for (const p of pages) {
        const hasArticle = p.ld.some((b) => ARTICLE_TYPES.has(b["@type"]));
        const excluded = p.url in seo.noArticle;
        if (excluded && hasArticle)
          bad.push(`${p.url}: listed in noArticle but has an Article`);
        if (!excluded && !hasArticle)
          bad.push(`${p.url}: no Article and not listed in noArticle`);
      }
      expect(bad).toEqual([]);
    });

    it("every series page has one BreadcrumbList that matches the visible trail", () => {
      const seriesPages = pages.filter((p) =>
        p.html.includes("data-journey-slug="),
      );
      expect(seriesPages.length).toBeGreaterThan(20);

      const bad = [];
      for (const p of seriesPages) {
        const lists = p.ld.filter((b) => b["@type"] === "BreadcrumbList");
        if (lists.length !== 1) {
          bad.push(`${p.url}: ${lists.length} BreadcrumbLists`);
          continue;
        }
        const items = lists[0].itemListElement;
        if (items.length !== 2) bad.push(`${p.url}: ${items.length} items`);
        if (items[0]?.name !== "Series Overview")
          bad.push(`${p.url}: first crumb is ${items[0]?.name}`);
        if (items[0]?.item !== `${BASE}/overview/`)
          bad.push(`${p.url}: first crumb item ${items[0]?.item}`);
        if (items[items.length - 1]?.item !== `${BASE}${p.url}`)
          bad.push(
            `${p.url}: last crumb item ${items[items.length - 1]?.item}`,
          );
        items.forEach((it, i) => {
          if (it.position !== i + 1)
            bad.push(`${p.url}: position ${it.position}`);
        });

        const nav = /<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/.exec(p.html);
        if (!nav) {
          bad.push(`${p.url}: no visible breadcrumb`);
          continue;
        }
        const visible = [
          ...nav[0].matchAll(/<li>\s*(?:<a [^>]*>|<span [^>]*>)([^<]*)</g),
        ].map((m) => decode(m[1]).trim());
        if (
          JSON.stringify(visible) !== JSON.stringify(items.map((i) => i.name))
        )
          bad.push(`${p.url}: visible ${JSON.stringify(visible)}`);
        if (/typeof="BreadcrumbList"/.test(p.html))
          bad.push(`${p.url}: duplicate BreadcrumbList microdata`);
      }
      expect(bad).toEqual([]);
    });

    it("lists every series entry in the /overview/ ItemList, generated from series.mjs", () => {
      const overview = pages.find((p) => p.url === "/overview/");
      const list = overview.ld.find((b) => b["@type"] === "ItemList");
      expect(list).toBeTruthy();
      expect(list.numberOfItems).toBe(series.length);
      expect(list.itemListElement).toHaveLength(series.length);
      list.itemListElement.forEach((el, i) => {
        expect(el.position).toBe(i + 1);
        expect(el.name).toBe(series[i].title);
        expect(el.url).toBe(`${BASE}/${series[i].href}`);
      });
    });

    it("keeps the home page WebSite block on the new host", () => {
      const home = pages.find((p) => p.url === "/");
      const site = home.ld.find((b) => b["@type"] === "WebSite");
      expect(site?.url).toBe(`${BASE}/`);
    });
  });
});
