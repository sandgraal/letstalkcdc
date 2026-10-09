import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards text that is clipped to a gradient (`background-clip: text`).
 *
 * axe cannot score it: the glyph colour is `transparent` and the visible
 * colour comes from a background gradient, so a gradient that drifts into low
 * contrast passes every automated check. P15-35 measured each one by hand
 * (scripts/measure-gradient-contrast.mjs renders the built site and compares
 * the gradient colour under every fully covered glyph pixel with the real
 * background behind it).
 *
 * This test fails when a new gradient-clipped element is added without being
 * listed here with a measurement. To add one: extend TARGETS in
 * scripts/measure-gradient-contrast.mjs, run it against a production build,
 * paste the minimum contrast below, and fix the gradient if it is under the
 * threshold. If you change the gradient or the tokens it uses, re-run it and
 * update `measured`.
 *
 * Contrast thresholds (WCAG 2.x): large text (>= 24px, or >= 18.66px bold)
 * 3:1, everything else 4.5:1.
 */

/** Measured minimum contrast, 2026-10-09, Chromium, 52 pages for the hero. */
const ALLOWLIST = [
  {
    file: "src/assets/css/03-layout.css",
    selector: ".hero-section h1",
    large: true,
    measured: {
      light: { 375: 7.48, 1280: 7.2 },
      dark: { 375: 9.46, 1280: 9.62 },
    },
  },
  {
    file: "src/assets/css/pages/styleguide.css",
    selector: ".hero h1 .accent",
    large: true,
    measured: {
      light: { 375: 4.41, 1280: 4.2 },
      dark: { 375: 6.85, 1280: 6.66 },
    },
  },
];

const SRC = path.resolve("src");
const CLIP = /(?:-webkit-)?background-clip\s*:\s*text/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (
      !/\.min\.css$/.test(entry.name) &&
      !/\.(png|jpe?g|webp|avif|svg|woff2?|ico|gif)$/i.test(entry.name)
    )
      out.push(full);
  }
  return out;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** @returns {{file: string, selector: string}[]} one entry per rule, per file */
function findClipped() {
  const found = [];
  for (const abs of walk(SRC)) {
    const rel = path.relative(process.cwd(), abs).split(path.sep).join("/");
    const text = fs.readFileSync(abs, "utf8");
    if (!CLIP.test(text)) continue;
    if (!abs.endsWith(".css")) {
      // Inline style, <style> block or JS: no selector to match, so it can
      // never be allowlisted. Move it into a stylesheet and list it.
      found.push({ file: rel, selector: "(not in a stylesheet)" });
      continue;
    }
    const css = stripComments(text);
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(css))) {
      if (!CLIP.test(m[2])) continue;
      const selector = m[1].trim().replace(/\s+/g, " ");
      if (seen.has(selector)) continue;
      seen.add(selector);
      found.push({ file: rel, selector });
    }
  }
  return found;
}

describe("gradient-clipped text (background-clip: text)", () => {
  const found = findClipped();

  it("finds the known gradient-clipped rules", () => {
    expect(found.length).toBeGreaterThan(0);
  });

  it("lists every gradient-clipped rule in the allowlist with a measurement", () => {
    const key = (e) => `${e.file} :: ${e.selector}`;
    const allowed = new Set(ALLOWLIST.map(key));
    const unlisted = found.map(key).filter((k) => !allowed.has(k));
    expect(
      unlisted,
      `New background-clip:text rule(s) without a measured contrast. ` +
        `axe cannot score them. Run scripts/measure-gradient-contrast.mjs ` +
        `(add a TARGETS entry), then list them in ALLOWLIST:\n${unlisted.join("\n")}`,
    ).toEqual([]);
  });

  it("has no stale allowlist entries", () => {
    const present = new Set(found.map((e) => `${e.file} :: ${e.selector}`));
    const stale = ALLOWLIST.map((e) => `${e.file} :: ${e.selector}`).filter(
      (k) => !present.has(k),
    );
    expect(stale).toEqual([]);
  });

  it("records a passing measurement for every theme and viewport", () => {
    for (const entry of ALLOWLIST) {
      const need = entry.large ? 3 : 4.5;
      for (const theme of ["light", "dark"]) {
        for (const vw of [375, 1280]) {
          const v = entry.measured[theme]?.[vw];
          expect(
            v,
            `${entry.selector} ${theme} ${vw}px`,
          ).toBeGreaterThanOrEqual(need);
        }
      }
    }
  });

  it("is measured by the script that produces the numbers", () => {
    const script = fs.readFileSync(
      path.resolve("scripts/measure-gradient-contrast.mjs"),
      "utf8",
    );
    for (const entry of ALLOWLIST) {
      expect(script).toContain(entry.selector);
    }
  });
});
