/**
 * Guard: internal links and fragments resolve, ids are unique, every content
 * page has one <h1> (P16-8, P16-9).
 *
 * Runs one production Eleventy build into a scratch directory under a
 * made-up prefix. `/playground/` is copied in by the deploy script, not by
 * Eleventy, so links to it are out of scope here.
 *
 * The heading outline is measured by scripts/seo-audit.mjs (its definition of
 * one <h1> and no skipped level inside <main>), not re-implemented here.
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
import { auditSite } from "../../scripts/seo-audit.mjs";

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
const PREFIX = "/guide";

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}

const idsOf = (html) =>
  [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]);

describe("internal links and headings (built site)", () => {
  let out;
  /** @type {Map<string,string>} url -> html, content pages only */
  const pages = new Map();

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-links-"));
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
          SITE_HOST: "https://links.example.org",
          ELEVENTY_PATH_PREFIX: PREFIX,
        },
      },
    );
    for (const f of walk(out)) {
      if (!f.endsWith("index.html")) continue;
      const html = readFileSync(f, "utf8");
      if (/http-equiv=["']refresh["']/i.test(html)) continue;
      const rel = path.relative(out, path.dirname(f));
      pages.set(rel ? `/${rel}/` : "/", html);
    }
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it("every content page has one h1 and no skipped heading level", () => {
    const audit = auditSite(out, {
      host: `https://links.example.org${PREFIX}`,
      git: false,
    });
    const bad = audit.details["headings.pagesWithAnyIssue"].map(
      (p) => `${p.url}: ${p.issues.join("; ")}`,
    );
    expect(bad).toEqual([]);
    expect(audit.metrics["headings.pagesWithMultipleH1"]).toBe(0);
  }, 60_000);

  it("ids are unique within each page", () => {
    const dups = [];
    for (const [url, html] of pages) {
      const seen = new Set();
      for (const id of idsOf(html)) {
        if (seen.has(id)) dups.push(`${url}#${id}`);
        seen.add(id);
      }
    }
    expect(dups).toEqual([]);
  });

  it("internal links and their fragments resolve", () => {
    const broken = [];
    for (const [url, html] of pages) {
      for (const m of html.matchAll(/<a\s[^>]*?href=["']([^"']+)["']/g)) {
        const href = m[1].replace(/&amp;/g, "&");
        if (href.includes("${")) continue;
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
        const target = new URL(href, `https://x.test${PREFIX}${url}`);
        if (!target.pathname.startsWith(`${PREFIX}/`)) continue;
        const rel = target.pathname.slice(PREFIX.length);
        if (rel.startsWith("/playground/")) continue;
        const pageUrl = rel.endsWith("/") ? rel : `${rel}/`;
        const hasFile = existsSync(path.join(out, rel)) && !rel.endsWith("/");
        const targetHtml = pages.get(pageUrl);
        if (
          !targetHtml &&
          !hasFile &&
          !existsSync(path.join(out, rel, "index.html"))
        ) {
          broken.push(`${url} -> ${href}`);
          continue;
        }
        const frag = decodeURIComponent(target.hash.slice(1));
        if (frag && targetHtml && !idsOf(targetHtml).includes(frag)) {
          broken.push(`${url} -> ${href}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
