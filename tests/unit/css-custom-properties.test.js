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
      const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
      const lineOf = (index) => text.slice(0, index).split("\n").length;

      for (const m of text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g))
        defined.add(m[1]);

      // Scanned over the whole file rather than line by line: `var()` is
      // routinely wrapped across lines in this codebase (see the
      // `--dropdown-max-height` call in 03-layout.css), and a line-based regex
      // silently matches none of those — a false pass, the worst kind of gate.
      // `\s*` spans newlines, so this catches both formattings.
      for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)/g)) {
        if (m[2] === ",") continue; // has a fallback — safe
        used.push({ token: m[1], file: rel, line: lineOf(m.index) });
      }
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
