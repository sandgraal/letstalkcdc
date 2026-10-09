import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The main site stylesheet must be render-blocking.
 *
 * It used to load through `rel="preload" as="style" onload="...rel='stylesheet'"`.
 * That paints the unstyled page first (full-width `.page-wrap`, browser-default
 * type) and re-flows it when the swap runs: a single ~0.28 layout shift on
 * /intro/ at a desktop viewport under Slow 4G + 4x CPU. The stylesheet is
 * ~18 KB gzipped and was already fetched at high priority, so blocking costs
 * almost no FCP. If this test fails, measure CLS (tests/e2e/cls.spec.js)
 * before changing the pattern back.
 */

const base = fs.readFileSync(
  path.resolve("src/_includes/layouts/base.njk"),
  "utf8",
);
// Drop Nunjucks comments so prose in {# ... #} cannot satisfy or break a match.
const markup = base.replace(/\{#[\s\S]*?#\}/g, "");

describe("base layout main stylesheet", () => {
  it("is a plain render-blocking <link rel=stylesheet> that keeps | url", () => {
    expect(markup).toMatch(
      /<link rel="stylesheet" href="\{\{ '\/assets\/css\/styles\.css' \| url \}\}">/,
    );
  });

  it("is not loaded through the preload + onload swap", () => {
    const swapped = [
      ...markup.matchAll(/<link[^>]*rel="preload"[^>]*as="style"[^>]*>/g),
    ].map((m) => m[0]);
    expect(swapped.filter((tag) => tag.includes("styles.css"))).toEqual([]);
  });

  it("appears exactly once, outside <noscript>", () => {
    const all = markup.match(/<link[^>]*assets\/css\/styles\.css[^>]*>/g) ?? [];
    expect(all).toHaveLength(1);
    expect(markup).not.toMatch(
      /<noscript>\s*<link[^>]*assets\/css\/styles\.css/,
    );
  });
});
