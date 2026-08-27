// @ts-check
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Site-wide runtime health gate.
 *
 * The unit suite proves modules parse; `smoke:core` proves files exist;
 * pa11y proves the DOM is accessible. None of them load a real page and watch
 * what happens, which is how these all reached production at once:
 *
 *   - `app.js` threw on /404.html and /mermaid-sandbox/ because those pages
 *     loaded raw source with a bare `fuse.js` specifier (search, theme toggle
 *     and nav all dead).
 *   - `components/panels.css` 404'd on eight pages, leaving panels unstyled.
 *   - chart.js 404'd on all 43 pages, disabling every chart.
 *
 * This spec renders every built page and fails on:
 *   1. any uncaught JS exception, and
 *   2. any same-origin request that 404s.
 *
 * Third-party/CDN failures are reported but not failed on — they are outside
 * our control and would make CI flaky.
 */

const SITE_DIR = path.resolve("_site");

/**
 * Every built page, as a server path.
 *
 * Collects *all* `.html` output, not just `index.html`. Standalone pages —
 * `404.html`, `connector-builder.html` — are exactly the ones that skip
 * `base.njk` and hand-roll their own `<script>` tags, which is how
 * `/404.html` ended up shipping raw, unbundled `app.js`. An earlier version of
 * this walker only matched `index.html` and sailed straight past that bug.
 */
const pagePaths = (() => {
  if (!fs.existsSync(SITE_DIR)) return [];
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      // `_site/letstalkcdc` is a self-symlink created by the webServer command.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) {
        const rel = path.relative(SITE_DIR, full);
        out.push("/" + rel.replace(/(^|\/)index\.html$/, "$1"));
      }
    }
  })(SITE_DIR);
  return [...new Set(out)].sort();
})();

test.describe("runtime health", () => {
  test("every page has been discovered", () => {
    expect(
      pagePaths.length,
      "No built pages found — run `npm run build` before the e2e suite.",
    ).toBeGreaterThan(20);
  });

  for (const pagePath of pagePaths) {
    test(`renders without JS errors or missing assets: ${pagePath}`, async ({
      page,
      baseURL,
    }) => {
      /** @type {string[]} */
      const jsErrors = [];
      /** @type {string[]} */
      const localMisses = [];
      /** @type {string[]} */
      const thirdPartyMisses = [];

      const origin = new URL(baseURL ?? "http://localhost:4173").origin;

      page.on("pageerror", (err) => jsErrors.push(String(err)));
      page.on("response", (res) => {
        if (res.status() < 400) return;
        const url = res.url();
        const entry = `${res.status()} ${url}`;
        if (url.startsWith(origin)) localMisses.push(entry);
        else thirdPartyMisses.push(entry);
      });

      await page.goto(pagePath, { waitUntil: "load" });
      // Let deferred modules run and any lazy imports fire.
      await page.waitForTimeout(400);

      if (thirdPartyMisses.length) {
        // Visible in the report without failing the run.
        console.warn(
          `[${pagePath}] third-party asset(s) unavailable:\n  ${thirdPartyMisses.join("\n  ")}`,
        );
      }

      expect(jsErrors, `Uncaught JS on ${pagePath}`).toEqual([]);
      expect(
        localMisses,
        `Missing same-origin asset(s) on ${pagePath}`,
      ).toEqual([]);
    });
  }
});
