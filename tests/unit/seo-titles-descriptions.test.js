/**
 * Guard for the <title> and meta description of every indexable page (P16-6).
 *
 * Runs one real production Eleventy build into a scratch directory and reads
 * the HTML a crawler would read, so it catches a page whose front matter and
 * head_extra disagree, a brand typed into a title that base.njk already
 * suffixes, and copy that search results would truncate.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** Titles are truncated by search results from about here. */
const TITLE_TARGET = 60;
/** Hard ceiling: nothing may exceed this, allowlisted or not. */
const TITLE_MAX = 70;
const DESCRIPTION_MAX = 160;

// Explicit, reviewed exceptions. Each is a decision, not an accident; remove
// the entry when the page is fixed.
//  - "/": the home page uses site.seoTitle (62 chars), the brand plus
//    tagline, and is not a page title with a suffix.
//  - "/merge-cookbook/": 65 chars; the page is covered by another open PR.
const TITLE_OVER_TARGET_OK = new Set(["/", "/merge-cookbook/"]);
//  - "/compare/": 186 chars; the page is covered by another open PR.
const DESCRIPTION_OVER_MAX_OK = new Set(["/compare/"]);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
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

describe("titles and descriptions in the built site", () => {
  let outDir;
  /** @type {{ url: string, title: string, descriptions: string[] }[]} */
  let pages = [];

  beforeAll(() => {
    outDir = mkdtempSync(path.join(os.tmpdir(), "ltcdc-titles-"));
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
          SITE_HOST: "https://titles-check.example.org",
          ELEVENTY_PATH_PREFIX: "/guide",
        },
      },
    );

    pages = walk(outDir)
      .filter((f) => f.endsWith(".html"))
      .map((file) => {
        const html = readFileSync(file, "utf8");
        const rel = path.relative(outDir, file).split(path.sep).join("/");
        const head = html.split("</head>")[0];
        return {
          url: `/${rel.replace(/index\.html$/, "")}`,
          // Pages rendered by base.njk: skips redirects, the 404 and the
          // standalone sandbox pages, which have their own head.
          usesBaseLayout: html.includes("data-path-prefix="),
          noindex: /noindex/i.test(head),
          title: decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ""),
          descriptions: [
            ...head.matchAll(/<meta\s+name="description"\s+content="([^"]*)"/g),
          ].map((m) => decode(m[1])),
        };
      })
      .filter((p) => p.usesBaseLayout && !p.noindex);
  }, 240_000);

  afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("finds a realistic sample of indexable pages", () => {
    expect(pages.length).toBeGreaterThan(40);
  });

  it("gives every page a title no longer than the hard ceiling", () => {
    const bad = pages
      .filter((p) => p.title.length === 0 || p.title.length > TITLE_MAX)
      .map((p) => `${p.url}: ${p.title.length} chars`);
    expect(bad).toEqual([]);
  });

  it("keeps titles within the target, bar the reviewed exceptions", () => {
    const bad = pages
      .filter(
        (p) =>
          p.title.length > TITLE_TARGET && !TITLE_OVER_TARGET_OK.has(p.url),
      )
      .map((p) => `${p.url}: ${p.title.length} chars: ${p.title}`);
    expect(bad).toEqual([]);
  });

  it("never repeats the brand in a title", () => {
    const bad = pages
      .filter((p) => p.title.split(site.title).length > 2)
      .map((p) => `${p.url}: ${p.title}`);
    expect(bad).toEqual([]);
  });

  it("emits exactly one description meta per page", () => {
    const bad = pages
      .filter((p) => p.descriptions.length !== 1)
      .map((p) => `${p.url}: ${p.descriptions.length} description metas`);
    expect(bad).toEqual([]);
  });

  it("keeps descriptions non-empty and within the limit, bar the reviewed exceptions", () => {
    const bad = pages
      .filter((p) => {
        const d = p.descriptions[0] ?? "";
        if (d.length === 0) return true;
        return (
          d.length > DESCRIPTION_MAX && !DESCRIPTION_OVER_MAX_OK.has(p.url)
        );
      })
      .map((p) => `${p.url}: ${(p.descriptions[0] ?? "").length} chars`);
    expect(bad).toEqual([]);
  });

  it("does not let two pages share a title or a description", () => {
    const seen = { title: new Map(), description: new Map() };
    const dupes = [];
    for (const p of pages) {
      for (const [kind, value] of [
        ["title", p.title],
        ["description", p.descriptions[0] ?? ""],
      ]) {
        const first = seen[kind].get(value);
        if (first) dupes.push(`${kind}: ${first} and ${p.url}`);
        else seen[kind].set(value, p.url);
      }
    }
    expect(dupes).toEqual([]);
  });
});
