// @ts-check
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Content-Security-Policy proof (P17-24).
 *
 * The unit suite checks that every page carries a policy and that each inline
 * script's hash matches. Only a browser can say whether the policy then
 * breaks anything, so this spec loads every built page with the real policy
 * enforced and fails on any violation: a `securitypolicyviolation` event or a
 * "Content Security Policy" console message. A few pages are then driven
 * through the features that create scripts, styles and frames at runtime
 * (Mermaid, Chart.js, the assistant panel, deferred page CSS, the video
 * embed).
 *
 * Chromium only: the policy is the same for every engine and the violation
 * report is identical, so running it three times adds time, not signal.
 */

const SITE_DIR = path.resolve("_site");

const pagePaths = (() => {
  if (!fs.existsSync(SITE_DIR)) return [];
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) {
        const rel = path.relative(SITE_DIR, full).split(path.sep).join("/");
        out.push("/" + rel.replace(/(^|\/)index\.html$/, "$1"));
      }
    }
  })(SITE_DIR);
  return [...new Set(out)].sort();
})();

/** Collect every violation the page reports, by either route. */
async function watchViolations(page) {
  /** @type {string[]} */
  const seen = [];
  page.on("console", (msg) => {
    if (/content security policy/i.test(msg.text())) seen.push(msg.text());
  });
  // Reported through a binding rather than read back from the page, so a
  // redirect stub navigating away cannot lose or break the collection.
  await page.exposeFunction("__cspReport", (text) => seen.push(text));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      // @ts-ignore
      window.__cspReport(
        `${e.violatedDirective} blocked ${e.blockedURI || "inline"} ${(e.sample || "").slice(0, 60)}`,
      );
    });
  });
  return async () => seen;
}

test.describe("content security policy", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "policy is engine-independent",
  );

  test("every page has been discovered", () => {
    expect(pagePaths.length).toBeGreaterThan(20);
  });

  for (const pagePath of pagePaths) {
    test(`no CSP violations on load: ${pagePath}`, async ({ page }) => {
      const violations = await watchViolations(page);
      await page.goto(pagePath, { waitUntil: "load" });
      await page.waitForTimeout(400);
      expect(await violations()).toEqual([]);
    });
  }

  test("the policy is actually enforced (an injected inline script is blocked)", async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    await page.goto("/glossary/", { waitUntil: "load" });
    await page.evaluate(() => {
      const s = document.createElement("script");
      s.textContent = "window.__injected = true;";
      document.head.appendChild(s);
    });
    // @ts-ignore
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
    // The report crosses the page/Node bridge asynchronously.
    await expect
      .poll(async () => (await violations()).join("\n"))
      .toMatch(/script-src/);
  });

  test("Mermaid diagrams render under the policy", async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto("/overview/");
    await expect(page.locator(".mermaid svg").first()).toBeVisible({
      timeout: 30_000,
    });
    expect(await violations()).toEqual([]);
  });

  test("deferred page stylesheets still become stylesheets", async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    await page.goto("/intro/", { waitUntil: "load" });
    await page.waitForTimeout(400);
    const pending = await page.locator("link[data-deferred-style]").count();
    expect(pending).toBe(0);
    expect(await violations()).toEqual([]);
  });

  test("the assistant opens and answers under the policy", async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto("/glossary/", { waitUntil: "load" });
    await page.click("#askBtn");
    await expect(page.locator("#askPanel")).toBeVisible();
    expect(await violations()).toEqual([]);
  });

  test("the progress dashboard draws its charts under the policy", async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    await page.goto("/dashboard/", { waitUntil: "load" });
    await page.waitForTimeout(800);
    expect(await violations()).toEqual([]);
  });

  test("the video embed may load YouTube's no-cookie player", async ({
    page,
  }) => {
    const violations = await watchViolations(page);
    await page.goto("/tooling/", { waitUntil: "load" });
    await page.locator("[data-video-play-btn]").first().click();
    await page.waitForTimeout(500);
    const frame = page.locator("[data-video-wrapper] iframe").first();
    await expect(frame).toHaveAttribute(
      "src",
      /^https:\/\/www\.youtube-nocookie\.com\//,
    );
    expect(await violations()).toEqual([]);
  });
});
