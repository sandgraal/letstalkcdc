import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards against dangling `var(--token)` references.
 *
 * An undefined custom property with no fallback is invalid at computed-value
 * time, which makes the *entire declaration* it appears in unset — silently.
 * Nothing else in the toolchain catches this: the CSS still parses, the build
 * still succeeds, and the byte-check happily hashes the broken output.
 *
 * The Phase 2c token retirement left 14 of these behind. Between them they
 * killed the site-wide link underline gradient, every button hover shadow, the
 * case-study callout colours, card shadows on four pages, and the video-embed
 * type scale — all of it invisible to CI.
 *
 * A reference WITH a fallback (`var(--x, 1rem)`) is fine and is ignored here.
 */

const CSS_ROOT = path.resolve("src/assets/css");

const cssFiles = (() => {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // styles.min.css is generated output, not a source file.
      else if (entry.name.endsWith(".css") && !entry.name.includes(".min."))
        out.push(full);
    }
  })(CSS_ROOT);
  return out;
})();

/** Strip comments so prose like `var(--color-*)` in a note isn't parsed as code. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("CSS custom properties", () => {
  it("finds source stylesheets to scan", () => {
    expect(cssFiles.length).toBeGreaterThan(10);
  });

  it("has no var() reference to an undefined token without a fallback", () => {
    const defined = new Set();
    /** @type {{token: string, file: string, line: number}[]} */
    const used = [];

    for (const file of cssFiles) {
      const text = stripComments(fs.readFileSync(file, "utf8"));
      text.split("\n").forEach((line, index) => {
        for (const m of line.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g))
          defined.add(m[1]);
        // Capture whether a comma (i.e. a fallback) follows the token name.
        for (const m of line.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)/g)) {
          if (m[2] === ",") continue; // has a fallback — safe
          used.push({
            token: m[1],
            file: path.relative(process.cwd(), file),
            line: index + 1,
          });
        }
      });
    }

    const dangling = used.filter((u) => !defined.has(u.token));
    const report = dangling
      .map((d) => `  ${d.token}  ->  ${d.file}:${d.line}`)
      .join("\n");

    expect(
      dangling,
      dangling.length
        ? `Undefined custom properties with no fallback (each one silently ` +
            `voids its whole declaration):\n${report}`
        : "",
    ).toEqual([]);
  });
});
