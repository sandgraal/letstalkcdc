// @ts-check
import { test, expect } from "@playwright/test";

/**
 * Mermaid and Chart.js are self-hosted (P17-23). These tests load real pages
 * and check what a reader gets: diagrams drawn, the chart library fetched from
 * the site itself, and nothing requested from another origin.
 */

test.describe("vendored libraries", () => {
  test("diagrams on /overview/ render from the site's own Mermaid file", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "http://localhost:4173").origin;
    const foreign = [];
    page.on("request", (req) => {
      if (!req.url().startsWith(origin) && !req.url().startsWith("data:"))
        foreign.push(req.url());
    });
    const mermaidResponse = page.waitForResponse(
      /\/assets\/vendor\/mermaid\.[0-9a-f]{12}\.min\.js$/,
    );

    await page.goto("/overview/");

    expect((await mermaidResponse).status()).toBe(200);
    await expect(page.locator(".mermaid svg").first()).toBeVisible({
      timeout: 30_000,
    });
    const script = page.locator('script[src*="/assets/vendor/mermaid."]');
    await expect(script).toHaveAttribute(
      "integrity",
      /^sha384-[A-Za-z0-9+/]+=*$/,
    );
    await expect(script).toHaveAttribute("crossorigin", "anonymous");
    expect(foreign).toEqual([]);
  });

  test("a page without diagrams never downloads Mermaid", async ({ page }) => {
    const requested = [];
    page.on("request", (req) => requested.push(req.url()));
    await page.goto("/glossary/", { waitUntil: "load" });
    await page.waitForTimeout(500);
    expect(requested.filter((u) => /mermaid/.test(u))).toEqual([]);
  });

  test("the progress charts load Chart.js from the site's own hashed chunk", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "http://localhost:4173").origin;
    const foreign = [];
    page.on("request", (req) => {
      if (!req.url().startsWith(origin) && !req.url().startsWith("data:"))
        foreign.push(req.url());
    });
    const chunk = page.waitForResponse(
      /\/assets\/js\/chart-vendor\.[\w-]+\.js$/,
    );

    await page.goto("/snapshotting/");

    expect((await chunk).status()).toBe(200);
    expect(foreign).toEqual([]);
  });
});
