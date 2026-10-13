/**
 * Guard: every indexable page has a clean Markdown twin (P17-22).
 *
 * The first half tests the HTML-to-Markdown converter and the path rule on
 * small inputs. The second half runs one real production Eleventy build into
 * a scratch directory (made-up host and prefix) and checks the twins that
 * build wrote: one per indexable page, linked from that page's HTML, with the
 * same headings and code blocks, the page title, and no template syntax.
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
import { JSDOM } from "jsdom";
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
const { htmlToMarkdown, twinPath, renderTwin } = require(
  path.join(ROOT, "lib/markdown-twin.cjs"),
);
const LlmsTemplate = require(path.join(ROOT, "src/llms.txt.11ty.cjs"));
const TwinTemplate = require(path.join(ROOT, "src/markdown-twins.11ty.cjs"));

const HOST = "https://example.org";
const PREFIX = "/site";
const BASE = `${HOST}${PREFIX}`;

describe("twinPath", () => {
  it("puts index.md beside the HTML of a directory URL", () => {
    expect(twinPath("/")).toBe("/index.md");
    expect(twinPath("/a/b/")).toBe("/a/b/index.md");
  });
  it("swaps the extension of a file URL and ignores anything else", () => {
    expect(twinPath("/x.html")).toBe("/x.md");
    expect(twinPath("/feed.xml")).toBeNull();
    expect(twinPath(false)).toBeNull();
    expect(twinPath(undefined)).toBeNull();
  });
});

describe("htmlToMarkdown", () => {
  const md = (html) => htmlToMarkdown(html, { baseUrl: `${BASE}/page/` });

  it("keeps headings, paragraphs and inline formatting", () => {
    expect(
      md(
        "<h2 id=x>Why &amp; how</h2><p>Use <strong>the key</strong>, <em>not</em> <code>ts_ms</code>.</p>",
      ),
    ).toBe("## Why & how\n\nUse **the key**, *not* `ts_ms`.");
  });

  it("turns links and images absolute against the page URL", () => {
    expect(md('<p><a href="/site/glossary/#lsn">LSN</a></p>')).toBe(
      `[LSN](${HOST}/site/glossary/#lsn)`,
    );
    expect(md('<p><a href="../b/">B</a> <a href="#top">top</a></p>')).toBe(
      `[B](${BASE}/b/) top`,
    );
    expect(md('<img src="/site/i.png" alt="A diagram">')).toBe(
      `![A diagram](${HOST}/site/i.png)`,
    );
  });

  it("writes code blocks verbatim in a fence with the language", () => {
    const out = md(
      '<pre><code class="language-sql">SELECT *\n  FROM t\n WHERE a &lt; 1;\n</code></pre>',
    );
    expect(out).toBe("```sql\nSELECT *\n  FROM t\n WHERE a < 1;\n```");
  });

  it("uses a longer fence when the code contains one", () => {
    const out = md("<pre>a\n```\nb</pre>");
    expect(out).toBe("````\na\n```\nb\n````");
  });

  it("renders nested lists and ordered lists", () => {
    expect(
      md("<ul><li>a<ul><li>b</li></ul></li></ul><ol><li>x</li><li>y</li></ol>"),
    ).toBe("- a\n  - b\n\n1. x\n2. y");
  });

  it("keeps backslashes in table cells, link text and alt text", () => {
    expect(
      md(
        "<table><tr><th>h</th></tr><tr><td>a\\|b</td></tr><tr><td>end\\</td></tr></table>",
      ),
    ).toBe("| h |\n| --- |\n| a\\\\\\|b |\n| end\\\\ |");
    expect(md('<p><a href="/x">a\\]b\\</a></p>')).toContain("[a\\\\\\]b\\\\](");
    expect(md('<p><img alt="p\\q]" src="/i.png"></p>')).toContain(
      "![p\\\\q\\]](",
    );
  });

  it("decodes entities exactly once", () => {
    expect(md("<p>&amp;lt; &amp;amp; &#39; &quot;</p>")).toBe(
      "&lt; &amp; ' \"",
    );
  });

  it("renders tables with a header row and escapes pipes", () => {
    expect(
      md(
        "<table><thead><tr><th>Op</th><th>Meaning</th></tr></thead><tbody><tr><td>c</td><td>a | b</td></tr></tbody></table>",
      ),
    ).toBe("| Op | Meaning |\n| --- | --- |\n| c | a \\| b |");
  });

  it("drops scripts, styles, navigation, SVG, forms, buttons and hidden nodes", () => {
    const out = md(
      '<nav><a href="/">Home</a></nav><script>var x = "<p>no</p>";</script><style>p{}</style><svg><title>icon</title></svg><button>Go</button><form><input></form><p aria-hidden="true">hidden</p><p hidden>hidden</p><p>Kept</p>',
    );
    expect(out).toBe("Kept");
  });

  it("keeps a callout aside as a blockquote, with errata title, paragraphs and list items", () => {
    const out = md(
      '<aside class="errata-callout"><details><summary>Known errata (1)</summary><ul><li><p><strong>Corrected: SCN alone</strong></p><div><p>Not run against Oracle.</p><ul><li>use a tie-break</li></ul></div></li></ul></details></aside>',
    );
    expect(out).toContain("> **Known errata (1)**");
    expect(out).toContain("Corrected: SCN alone");
    expect(out).toContain("Not run against Oracle.");
    expect(out).toContain("use a tie-break");
    for (const line of out.split("\n")) expect(line.startsWith(">")).toBe(true);
  });

  it("keeps a plain callout aside but drops navigation asides", () => {
    const out = md(
      '<aside class="callout"><p>Tested on PostgreSQL only.</p></aside><aside class="page-meta"><p>By Someone</p></aside><aside class="discussion-callout"><p>Join the discussion</p></aside>',
    );
    expect(out).toBe("> Tested on PostgreSQL only.");
  });

  it("pads inline code that starts or ends with a backtick", () => {
    expect(md("<p><code>`a</code> <code>b`</code> <code>c`d</code></p>")).toBe(
      "`` `a `` `` b` `` ``c`d``",
    );
    expect(md("<p><code>x</code></p>")).toBe("`x`");
  });

  it("returns an empty string for empty input", () => {
    expect(md("")).toBe("");
    expect(htmlToMarkdown(undefined)).toBe("");
  });
});

describe("renderTwin", () => {
  const site = {
    host: BASE,
    title: "Test Manual",
    author: "Test Author",
    brand: "Test Brand",
  };
  it("leads with the page H1, then description and canonical URL", () => {
    const out = renderTwin({
      title: "Front title",
      description: "About it.",
      url: "/p/",
      bodyHtml: "<h1>Hero</h1><p>Body</p>",
      site,
    });
    expect(out.startsWith("# Hero\n\nPage title: Front title\n\n")).toBe(true);
    expect(out).toContain("> About it.");
    expect(out).toContain(`Canonical page: <${BASE}/p/>`);
    expect(out).toContain("Body");
    expect(out).toContain("CC BY 4.0");
  });
  it("escapes quotes, angle brackets and ampersands in errata attributes", () => {
    const out = renderTwin({
      title: "T",
      url: "/p/",
      bodyHtml: "<p>Body</p>",
      site: { ...site, host: 'https://e.org/a"b' },
      errata: [{ title: 'a"<script>&', body: "<p>x</p>" }],
    });
    expect(out).toContain('**a"<script>&**');
    // A quote in the host must not terminate the href attribute early.
    expect(out).toContain("(https://e.org/a%22b/errata/)");
  });
  it("adds the title as H1 when the body has none", () => {
    const out = renderTwin({
      title: "Only title",
      url: "/p/",
      bodyHtml: "<p>Body</p>",
      site,
    });
    expect(out.startsWith("# Only title\n\n")).toBe(true);
  });
});

describe("twin template and llms.txt", () => {
  const item = (url, data = {}, extra = {}) => ({
    url,
    inputPath: `./src${url}index.njk`,
    fileSlug: url.replace(/\//g, "") || "index",
    data: { title: `Title ${url}`, description: `About ${url}`, ...data },
    ...extra,
  });

  it("is kept out of collections and paginates only indexable pages", () => {
    const d = new TwinTemplate().data();
    expect(d.eleventyExcludeFromCollections).toBe(true);
    const kept = d.pagination.before([
      item("/keep/"),
      item("/noindex/", { tags: ["noindex"] }),
      item("/draft/", { tags: ["draft"] }),
      item("/excluded/", { eleventyExcludeFromSitemap: true }),
      item("/stub/", {}, { inputPath: "./src/_redirects/stub.njk" }),
      item("/404.html", {}, { fileSlug: "404" }),
      { ...item("/nourl/"), url: false },
    ]);
    expect(kept.map((i) => i.url)).toEqual(["/keep/"]);
    expect(d.permalink({ twin: { url: "/keep/" } })).toBe("/keep/index.md");
  });

  it("llms.txt gives each page its twin URL, and the playground none", () => {
    const txt = new LlmsTemplate().render({
      collections: { all: [item("/a/")] },
      site: { host: BASE, title: "T", author: "A", brand: "B" },
      series: [],
    });
    expect(txt).toContain(
      `(${BASE}/a/): About /a/ Markdown: ${BASE}/a/index.md`,
    );
    const playground = txt.split("\n").find((l) => l.includes("/playground/"));
    expect(playground).not.toContain("Markdown:");
  });
});

const walk = (dir, rel = "") =>
  readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = path.join(rel, e.name);
    return e.isDirectory() ? walk(dir, r) : [r];
  });

// Text of an HTML fragment as a parser sees it: no regex tag stripping or
// entity decoding, so nothing here can be double-unescaped or half-sanitised.
const textOf = (html) => {
  const t = new JSDOM("").window.document.createElement("template");
  t.innerHTML = html;
  return t.content.textContent;
};

const decode = (s) => textOf(s).replace(/\s+/g, " ").trim();

/** Headings and code blocks outside fences, in order. */
const mdParts = (md) => {
  const headings = [];
  const code = [];
  let fence = null;
  for (const line of md.split("\n")) {
    const f = line.match(/^(`{3,})/);
    if (f && fence === null) {
      fence = { ticks: f[1], lines: [] };
    } else if (
      fence &&
      line.startsWith(fence.ticks) &&
      !line.slice(fence.ticks.length).trim()
    ) {
      code.push(fence.lines.join("\n").trimEnd());
      fence = null;
    } else if (fence) {
      fence.lines.push(line);
    } else if (/^#{1,6} /.test(line)) {
      headings.push(line);
    }
  }
  return { headings, code };
};

const htmlParts = (html) => {
  const start = html.indexOf('<main id="main">');
  const main = html.slice(start, html.indexOf("</main>"));
  const headings = [...main.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map(
    (m) => `${"#".repeat(Number(m[1]))} ${decode(m[2])}`,
  );
  const code = [...main.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) =>
    textOf(m[1]).replace(/^\n/, "").trimEnd(),
  );
  return { headings, code };
};

describe("built Markdown twins", () => {
  let out;
  let files;
  let sitemapUrls;

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-md-"));
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
    files = walk(out);
    const sitemap = readFileSync(path.join(out, "sitemap.xml"), "utf8");
    sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    );
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  const PLAYGROUND = `${BASE}/playground/`;
  const rel = (url) => url.slice(BASE.length + 1);
  const read = (p) => readFileSync(path.join(out, p), "utf8");

  it("writes a twin beside the HTML of every sitemap page (the playground apart)", () => {
    const urls = sitemapUrls.filter((u) => u !== PLAYGROUND);
    expect(urls.length).toBeGreaterThan(40);
    const missing = urls.filter(
      (u) => !existsSync(path.join(out, rel(u), "index.md")),
    );
    expect(missing).toEqual([]);
  });

  it("writes no twin for a page that is not in the sitemap", () => {
    const listed = new Set(
      sitemapUrls.map((u) => path.join(rel(u), "index.md")),
    );
    const twins = files.filter(
      (f) =>
        f.endsWith("index.md") &&
        !f.includes(`downloads${path.sep}`) &&
        !f.startsWith(`downloads${path.sep}`),
    );
    expect(twins.length).toBeGreaterThan(40);
    expect(twins.filter((f) => !listed.has(f))).toEqual([]);
    expect(existsSync(path.join(out, "404.md"))).toBe(false);
  });

  it("links each HTML page to its twin, and only those that have one", () => {
    const htmlFiles = files.filter((f) => f.endsWith("index.html"));
    let linked = 0;
    for (const f of htmlFiles) {
      const m = read(f).match(
        /<link rel="alternate" type="text\/markdown" href="([^"]+)">/,
      );
      const twin = path.join(path.dirname(f), "index.md");
      if (m) {
        linked++;
        expect(m[1]).toBe(`${PREFIX}/${twin}`);
        expect(existsSync(path.join(out, twin))).toBe(true);
      } else {
        expect(
          existsSync(path.join(out, twin)),
          `${f} has a twin but no link`,
        ).toBe(false);
      }
    }
    expect(linked).toBeGreaterThan(40);
  });

  it("gives every twin its page title, a canonical pointer and no markup or template syntax", () => {
    const urls = sitemapUrls.filter((u) => u !== PLAYGROUND);
    for (const u of urls) {
      const dir = rel(u);
      const html = read(path.join(dir, "index.html"));
      const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)[1])
        .replace(/ \| [^|]+$/, "")
        .trim();
      const md = read(path.join(dir, "index.md"));
      // The front-matter title is either the H1 or a "Page title:" line. The
      // home page has no front-matter title (its <title> is the SEO title).
      if (dir === "") expect(md.startsWith("# ")).toBe(true);
      else
        expect(md, `${u} lacks its title`).toMatch(
          new RegExp(
            `^(# |Page title: )${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "m",
          ),
        );
      expect(md).toContain(`Canonical page: <${u}>`);
      const prose = md.replace(/^(`{3,}).*?^\1\s*$/gms, "");
      expect(prose, `${u} has template syntax`).not.toMatch(/\{\{|\{%|\{#/);
      expect(prose, `${u} has script or nav markup`).not.toMatch(
        /<(script|style|nav|svg|button|form)\b/i,
      );
      expect(md.trim().length).toBeGreaterThan(200);
    }
  });

  it("matches the HTML headings and code blocks on three sample pages", () => {
    for (const dir of [
      "merge-cookbook",
      "quickstarts/quickstart-postgres",
      "methodology",
    ]) {
      const h = htmlParts(read(path.join(dir, "index.html")));
      const m = mdParts(read(path.join(dir, "index.md")));
      expect(m.headings, dir).toEqual(h.headings);
      expect(m.code, dir).toEqual(h.code);
    }
    // The samples must exercise code blocks, not match on emptiness.
    expect(
      mdParts(read("merge-cookbook/index.md")).code.length,
    ).toBeGreaterThan(5);
  });

  it("carries the errata callout into the twin of every page that has errata", async () => {
    const { default: errata } = await import("../../src/_data/errata.mjs");
    const pages = new Set(errata.flatMap((e) => e.urls));
    expect(pages.size).toBeGreaterThan(5);
    for (const url of pages) {
      const md = read(`${url.slice(1)}index.md`);
      expect(md, url).toContain("**Known errata for this page (");
      for (const e of errata.filter((x) => x.urls.includes(url)))
        expect(md, `${url} ${e.id}`).toContain(e.title);
    }
  });

  it("puts the Oracle SCN correction and the not-run label in the /oracle-notes/ twin", () => {
    const md = read("oracle-notes/index.md");
    expect(md).toContain("Corrected: an Oracle SCN alone is not a safe guard");
    expect(md).toMatch(
      /Oracle SQL on the page is now labelled as not run against an\s+(?:> )?Oracle database/,
    );
    expect(md).toContain(`(${BASE}/errata/)`);
  });

  it("makes links in a twin absolute under the host and prefix", () => {
    const md = read("is-cdc-exactly-once/index.md");
    expect(md).toContain(`(${BASE}/glossary/#at-least-once)`);
    expect(md).not.toMatch(/\]\(\/(?!\/)/);
  });

  it("lists the twin in llms.txt for every page that has one", () => {
    const llms = read("llms.txt");
    const listed = [...llms.matchAll(/ Markdown: (\S+)$/gm)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThan(40);
    for (const u of listed) {
      expect(u.startsWith(`${BASE}/`)).toBe(true);
      expect(existsSync(path.join(out, rel(u)))).toBe(true);
    }
  });
});
