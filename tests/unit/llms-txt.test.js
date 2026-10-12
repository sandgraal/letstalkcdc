/**
 * Guard: /llms.txt is an honest, drift-free index of the site (P17-21).
 *
 * The first half drives the real template with hand-built collections, so the
 * exclusion, ordering, host and attribution rules are pinned. The second half
 * runs one real production Eleventy build into a scratch directory (on a
 * made-up host and prefix, so nothing here depends on the live domain) and
 * checks that every URL in llms.txt is a built, indexable page and that the
 * list equals the sitemap's.
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
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

// Assembled at runtime so a repo-wide search for the host does not match
// this file's own assertions.
const OLD_HOST = ["sandgraal", "github", "io"].join(".");

const LlmsTemplate = require(path.join(ROOT, "src/llms.txt.11ty.cjs"));
const llmsSource = readFileSync(
  path.join(ROOT, "src/llms.txt.11ty.cjs"),
  "utf8",
);

const linksOf = (txt) =>
  [...txt.matchAll(/^- \[([^\]]*)\]\(([^)]+)\)/gm)].map((m) => ({
    title: m[1],
    url: m[2],
  }));

describe("llms.txt template rules", () => {
  const page = (url, data = {}, extra = {}) => ({
    url,
    inputPath: `./src${url}index.njk`,
    fileSlug: url.replace(/\//g, "") || "index",
    data: { title: `Title ${url}`, description: `About ${url}`, ...data },
    ...extra,
  });
  const site = {
    host: BASE,
    title: "Test Manual",
    author: "Test Author",
    description: "A test summary.",
  };
  const series = [{ key: "first" }, { key: "second" }];
  const render = (items, over = {}) =>
    new LlmsTemplate().render({
      collections: { all: items },
      site,
      series,
      ...over,
    });

  it("is served at /llms.txt and kept out of collections", () => {
    const data = new LlmsTemplate().data();
    expect(data.permalink).toBe("/llms.txt");
    expect(data.eleventyExcludeFromCollections).toBe(true);
  });

  it("leaves out stubs, the 404, excluded pages and noindex/draft tags", () => {
    const txt = render([
      page("/keep/"),
      page("/stub/", {}, { inputPath: "./src/_redirects/stub.njk" }),
      page("/404.html", {}, { fileSlug: "404" }),
      page("/excluded/", { eleventyExcludeFromSitemap: true }),
      page("/noindex/", { tags: ["noindex"] }),
      page("/draft/", { tags: ["draft"] }),
      { ...page("/nourl/"), url: false },
    ]);
    expect(linksOf(txt).map((l) => l.url)).toEqual([
      `${BASE}/keep/`,
      `${BASE}/playground/`,
    ]);
  });

  it("builds every URL from site.host and the page url, never a literal host", () => {
    const txt = render([page("/a/"), page("/b/")]);
    for (const { url } of linksOf(txt))
      expect(url.startsWith(`${BASE}/`)).toBe(true);
    const moved = render([page("/a/")], {
      site: { ...site, host: "https://moved.example" },
    });
    for (const { url } of linksOf(moved))
      expect(url.startsWith("https://moved.example/")).toBe(true);
    expect(moved).not.toContain(BASE);
    // The generator itself carries no host to forget to change.
    expect(llmsSource).not.toContain(OLD_HOST);
    expect(llmsSource).not.toMatch(/https?:\/\/(?!creativecommons\.org)/);
    expect(txt).not.toContain(OLD_HOST);
  });

  it("states the licence and that attribution is required", () => {
    const txt = render([]);
    expect(txt).toContain(LICENSE_URL);
    expect(txt).toMatch(/CC BY 4\.0/);
    expect(txt).toMatch(/Attribution is required/);
    expect(txt).toContain("Test Manual, by Test Author");
    expect(txt).toContain(`(${BASE}/)`);
  });

  it("lists lessons in series.mjs order, then the other pages", () => {
    const txt = render([
      page("/zzz/"),
      page("/b/", { seriesKey: "second" }),
      page("/aaa/"),
      page("/a/", { seriesKey: "first" }),
    ]);
    expect(txt.indexOf("## Lessons")).toBeLessThan(
      txt.indexOf("## Other pages"),
    );
    expect(linksOf(txt).map((l) => l.url)).toEqual([
      `${BASE}/a/`,
      `${BASE}/b/`,
      `${BASE}/aaa/`,
      `${BASE}/playground/`,
      `${BASE}/zzz/`,
    ]);
  });

  it("keeps each entry on one line and drops a page with no title", () => {
    const txt = render([
      page("/m/", { title: "Two\nlines [x]", description: "a\n  b" }),
      page("/untitled/", { title: "", description: "no title" }),
    ]);
    expect(txt).toContain(`- [Two lines (x)](${BASE}/m/): a b`);
    expect(txt).not.toContain("/untitled/");
  });
});

function walkHtml(dir, rel = "") {
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(
    (e) => {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) return walkHtml(dir, r);
      if (/^google[0-9a-f]+\.html$/.test(e.name)) return [];
      return r.endsWith(".html") ? [r] : [];
    },
  );
}

describe("built llms.txt", () => {
  let out;
  let pages; // relative html path -> html
  let llms;
  let sitemap;

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-llms-"));
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
    llms = readFileSync(path.join(out, "llms.txt"), "utf8");
    sitemap = readFileSync(path.join(out, "sitemap.xml"), "utf8");
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  // The playground is copied in by scripts/publish-playground.sh, not built
  // by Eleventy, so no built page backs it (same exception as the sitemap).
  const PLAYGROUND = `${BASE}/playground/`;
  const fileFor = (url) => {
    expect(url.startsWith(`${BASE}/`)).toBe(true);
    const rel = url.slice(BASE.length + 1);
    return rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel;
  };
  const robotsMeta = (html) =>
    html.match(/<meta[^>]*name="robots"[^>]*>/gi)?.join(" ") ?? "";

  it("starts with the site title and a summary, and lists many pages", () => {
    expect(llms.startsWith("# CDC: The Missing Manual\n")).toBe(true);
    expect(llms).toMatch(/^> .+/m);
    expect(linksOf(llms).length).toBeGreaterThan(30);
  });

  it("points every URL at a built page that is not noindex or a redirect stub", () => {
    const problems = [];
    for (const { url } of linksOf(llms)) {
      if (url === PLAYGROUND) continue;
      const file = fileFor(url);
      const html = pages.get(file);
      if (!html) problems.push(`${url}: no built page ${file}`);
      else if (/noindex/i.test(robotsMeta(html)))
        problems.push(`${url}: noindex`);
      else if (/http-equiv="refresh"/i.test(html))
        problems.push(`${url}: redirect stub`);
      else if (file === "404.html") problems.push(`${url}: 404 page`);
    }
    expect(problems).toEqual([]);
  });

  it("lists exactly the URLs in sitemap.xml, each once", () => {
    const listed = linksOf(llms).map((l) => l.url);
    const mapped = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    );
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...mapped].sort());
  });

  it("lists the non-content pages nowhere", () => {
    for (const slug of ["dashboard", "mermaid-sandbox", "styleguide"]) {
      expect(existsSync(path.join(out, slug, "index.html"))).toBe(true);
      expect(llms).not.toContain(`${BASE}/${slug}/`);
    }
  });

  it("carries the configured host and the attribution requirement", () => {
    expect(llms).not.toContain(OLD_HOST);
    expect(llms).toContain(LICENSE_URL);
    expect(llms).toMatch(/Attribution is required/);
    expect(llms).toContain(
      `CDC: The Missing Manual, by Christopher Ennis (${BASE}/)`,
    );
  });
});
