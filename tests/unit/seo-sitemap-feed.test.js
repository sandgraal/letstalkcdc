/**
 * Guard: sitemap.xml, robots.txt and feed.xml are honest (P16-5, P16-10).
 *
 * The first half drives the real sitemap template with hand-built
 * collections, so every branch of the exclusion and lastmod rules is pinned.
 * The second half runs one real production Eleventy build into a scratch
 * directory (on a made-up host and prefix, so nothing here depends on the
 * live domain) and checks the three files against the pages they describe.
 * The playground is copied in by the deploy script, not by Eleventy, so it is
 * out of scope here (P16-11).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const require = createRequire(import.meta.url);

const HOST = "https://example.org";
const PREFIX = "/site";
const BASE = `${HOST}${PREFIX}`;

const SitemapTemplate = require(path.join(ROOT, "src/sitemap.11ty.cjs"));
const FeedSource = readFileSync(path.join(ROOT, "src/feed.11ty.cjs"), "utf8");

const parseXml = (xml) => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  return doc;
};
const texts = (doc, tag) =>
  [...doc.getElementsByTagName(tag)].map((el) => el.textContent);

describe("sitemap template rules", () => {
  const page = (url, data = {}, extra = {}) => ({
    url,
    inputPath: `./src${url}index.njk`,
    fileSlug: url.replace(/\//g, "") || "index",
    data,
    ...extra,
  });
  const render = (items) => {
    const tpl = new SitemapTemplate();
    return tpl.render({
      collections: { all: items },
      site: { host: BASE },
      exclusionTags: tpl.data().exclusionTags,
    });
  };

  it("uses dateModified, then datePublished, and omits lastmod otherwise", () => {
    const xml = render([
      page("/a/", { dateModified: "2026-08-25", datePublished: "2026-02-06" }),
      page("/b/", { datePublished: "2026-02-06" }),
      page("/c/", {}),
      page("/d/", { dateModified: new Date("2026-05-18") }),
      page("/e/", { dateModified: "not a date", datePublished: "2026-13-40" }),
    ]);
    const entry = (slug) =>
      xml.match(
        new RegExp(`<url>\\s*<loc>${BASE}/${slug}/</loc>[\\s\\S]*?</url>`),
      )[0];
    expect(entry("a")).toContain("<lastmod>2026-08-25</lastmod>");
    expect(entry("b")).toContain("<lastmod>2026-02-06</lastmod>");
    expect(entry("c")).not.toContain("lastmod");
    expect(entry("d")).toContain("<lastmod>2026-05-18</lastmod>");
    expect(entry("e")).not.toContain("lastmod");
  });

  it("never falls back to the build or file date", () => {
    const xml = render([page("/a/", {}, { date: new Date() })]);
    expect(xml).not.toContain("lastmod");
  });

  it("leaves out stubs, the 404, excluded pages and noindex/draft tags", () => {
    const xml = render([
      page("/keep/", { dateModified: "2026-08-25" }),
      page("/stub/", {}, { inputPath: "./src/_redirects/stub.njk" }),
      page("/404.html", {}, { fileSlug: "404" }),
      page("/excluded/", { eleventyExcludeFromSitemap: true }),
      page("/noindex/", { tags: ["noindex"] }),
      page("/draft/", { tags: ["draft"] }),
      { ...page("/nourl/"), url: false },
    ]);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${BASE}/keep/`]);
  });

  it("lists a URL once", () => {
    const xml = render([page("/a/"), page("/a/")]);
    expect(xml.match(/<loc>/g)).toHaveLength(1);
  });
});

function walkHtml(dir, rel = "") {
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(
    (e) => {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) return walkHtml(dir, r);
      return r.endsWith(".html") ? [r] : [];
    },
  );
}

describe("built site", () => {
  let out;
  let pages; // relative html path -> html
  let sitemap;
  let robots;
  let feed;

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-seo-"));
    execFileSync(
      process.execPath,
      [ELEVENTY_BIN, "--config=eleventy.config.mjs", `--output=${out}`],
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
    pages = new Map(
      walkHtml(out).map((f) => [f, readFileSync(path.join(out, f), "utf8")]),
    );
    sitemap = readFileSync(path.join(out, "sitemap.xml"), "utf8");
    robots = readFileSync(path.join(out, "robots.txt"), "utf8");
    feed = readFileSync(path.join(out, "feed.xml"), "utf8");
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  const fileFor = (url) => {
    expect(url.startsWith(`${BASE}/`)).toBe(true);
    const rel = url.slice(BASE.length + 1);
    return rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel;
  };
  const robotsMeta = (html) =>
    html.match(/<meta[^>]*name="robots"[^>]*>/gi)?.join(" ") ?? "";
  const isNoindex = (html) => /noindex/i.test(robotsMeta(html));
  const isStub = (html) => /http-equiv="refresh"/i.test(html);
  const titleOf = (html) =>
    html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "";
  const modifiedOf = (html) =>
    html.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1];

  describe("sitemap.xml", () => {
    it("is well-formed XML in the sitemap namespace", () => {
      const doc = parseXml(sitemap);
      expect(doc.documentElement.localName).toBe("urlset");
      expect(doc.documentElement.namespaceURI).toBe(
        "http://www.sitemaps.org/schemas/sitemap/0.9",
      );
    });

    it("has unique, absolute URLs on the configured host and prefix", () => {
      const locs = texts(parseXml(sitemap), "loc");
      expect(locs.length).toBeGreaterThan(30);
      expect(new Set(locs).size).toBe(locs.length);
      for (const loc of locs) expect(loc.startsWith(`${BASE}/`)).toBe(true);
    });

    it("has a real YYYY-MM-DD lastmod, more than one distinct value, and none from the build date", () => {
      const doc = parseXml(sitemap);
      const mods = texts(doc, "lastmod");
      expect(mods.length).toBeGreaterThan(30);
      for (const m of mods) {
        expect(m).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(`${m}T00:00:00Z`).toISOString().slice(0, 10)).toBe(m);
      }
      expect(new Set(mods).size).toBeGreaterThan(1);
    });

    it("points every URL at a built page that is indexable and has a title", () => {
      const problems = [];
      for (const loc of texts(parseXml(sitemap), "loc")) {
        const file = fileFor(loc);
        const html = pages.get(file);
        if (!html) problems.push(`${loc}: no built page ${file}`);
        else if (isNoindex(html)) problems.push(`${loc}: noindex`);
        else if (isStub(html)) problems.push(`${loc}: redirect stub`);
        else if (file === "404.html") problems.push(`${loc}: 404 page`);
        else if (!titleOf(html)) problems.push(`${loc}: no <title>`);
      }
      expect(problems).toEqual([]);
    });

    it("lists every indexable page the site builds, and only those", () => {
      const listed = new Set(
        texts(parseXml(sitemap), "loc").map((loc) => fileFor(loc)),
      );
      const indexable = [...pages]
        .filter(
          ([file, html]) =>
            file !== "404.html" && !isNoindex(html) && !isStub(html),
        )
        .map(([file]) => file);
      expect(indexable.filter((f) => !listed.has(f))).toEqual([]);
      expect([...listed].filter((f) => !indexable.includes(f))).toEqual([]);
    });

    it("keeps the non-content pages out and marks them noindex", () => {
      const locs = texts(parseXml(sitemap), "loc");
      for (const slug of ["dashboard", "mermaid-sandbox", "styleguide"]) {
        expect(locs).not.toContain(`${BASE}/${slug}/`);
        const html = pages.get(`${slug}/index.html`);
        expect(html, slug).toBeTruthy();
        expect(isNoindex(html), `${slug} robots meta`).toBe(true);
      }
      expect(locs.some((l) => l.includes("404"))).toBe(false);
    });

    it("carries the page's own dateModified for module pages", () => {
      const mods = new Map(
        [...parseXml(sitemap).getElementsByTagName("url")].map((u) => [
          u.getElementsByTagName("loc")[0].textContent,
          u.getElementsByTagName("lastmod")[0]?.textContent,
        ]),
      );
      let checked = 0;
      for (const [loc, lastmod] of mods) {
        const modified = modifiedOf(pages.get(fileFor(loc)));
        if (!modified) continue;
        checked += 1;
        expect(lastmod, loc).toBe(modified);
      }
      expect(checked).toBeGreaterThan(20);
    });

    it("never dates a page in the future or modified before it was published", () => {
      const today = new Date().toISOString().slice(0, 10);
      for (const [file, html] of pages) {
        const modified = modifiedOf(html);
        if (!modified) continue;
        const published = html.match(
          /<meta property="article:published_time" content="([^"]+)"/,
        )?.[1];
        // An unquoted YAML date becomes a JS Date and renders as
        // "Thu Oct 08 2026 ...", timezone-shifted; dates must be quoted.
        expect(modified, `${file} dateModified format`).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
        expect(published, `${file} datePublished format`).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
        expect(modified <= today, `${file} modified in the future`).toBe(true);
        expect(published <= modified, `${file} modified < published`).toBe(
          true,
        );
      }
    });
  });

  describe("robots.txt", () => {
    it("allows crawling and names the sitemap exactly once, on the configured host", () => {
      const lines = robots.split("\n").map((l) => l.trim());
      expect(lines).toContain("User-agent: *");
      expect(lines.filter((l) => /^Disallow:\s*\/\s*$/.test(l))).toEqual([]);
      const sitemaps = lines.filter((l) => /^sitemap:/i.test(l));
      expect(sitemaps).toEqual([`Sitemap: ${BASE}/sitemap.xml`]);
      expect(existsSync(path.join(out, "sitemap.xml"))).toBe(true);
    });
  });

  describe("feed.xml", () => {
    // The feed lists items with a `seriesKey` (src/feed.11ty.cjs); base.njk
    // renders that as <body data-journey-slug>, so this mirrors the feed's
    // own filter without depending on which pages emit article:* meta.
    const moduleFiles = () =>
      [...pages]
        .filter(([, html]) => /<body[^>]*\sdata-journey-slug="/.test(html))
        .map(([file]) => file);

    it("is well-formed RSS 2.0 pointing at the configured host", () => {
      const doc = parseXml(feed);
      expect(doc.documentElement.getAttribute("version")).toBe("2.0");
      const channel = doc.getElementsByTagName("channel")[0];
      expect(channel.getElementsByTagName("link")[0].textContent).toBe(BASE);
      expect(
        doc.getElementsByTagName("atom:link")[0].getAttribute("href"),
      ).toBe(`${BASE}/feed.xml`);
    });

    it("lists every module page, so the limit never drops one", () => {
      const items = [...parseXml(feed).getElementsByTagName("item")];
      const files = moduleFiles();
      expect(files.length).toBeGreaterThan(25);
      expect(items).toHaveLength(files.length);

      const limit = Number(FeedSource.match(/feedLimit:\s*(\d+)/)[1]);
      expect(limit).toBeGreaterThan(files.length);
    });

    it("gives every item a title, description, absolute link and matching guid", () => {
      for (const item of parseXml(feed).getElementsByTagName("item")) {
        const get = (tag) =>
          item.getElementsByTagName(tag)[0]?.textContent ?? "";
        const link = get("link");
        expect(get("title").trim(), link).not.toBe("");
        expect(get("description").trim(), `${link} description`).not.toBe("");
        expect(get("guid")).toBe(link);
        expect(pages.has(fileFor(link)), `${link} resolves`).toBe(true);
      }
    });

    it("dates each item from the page's dateModified, newest first", () => {
      const items = [...parseXml(feed).getElementsByTagName("item")];
      const stamps = [];
      for (const item of items) {
        const link = item.getElementsByTagName("link")[0].textContent;
        const pub = new Date(
          item.getElementsByTagName("pubDate")[0].textContent,
        );
        expect(Number.isNaN(pub.getTime()), link).toBe(false);
        expect(pub.toISOString().slice(0, 10), link).toBe(
          modifiedOf(pages.get(fileFor(link))),
        );
        stamps.push(pub.getTime());
      }
      expect(stamps).toEqual([...stamps].sort((a, b) => b - a));

      const built = new Date(
        parseXml(feed).getElementsByTagName("lastBuildDate")[0].textContent,
      );
      expect(built.getTime()).toBe(stamps[0]);
    });
  });
});
