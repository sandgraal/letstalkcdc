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

  test("a Mermaid file altered by one byte is refused, and the page stays usable", async ({
    page,
  }) => {
    const warnings = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    let served = 0;
    await page.route(
      /\/assets\/vendor\/mermaid\.[0-9a-f]{12}\.min\.js$/,
      async (route) => {
        const response = await route.fetch();
        const body = Buffer.from(await response.body());
        // Flip one byte in the middle; the length stays the same.
        body[Math.floor(body.length / 2)] ^= 0x01;
        served += 1;
        await route.fulfill({ response, body });
      },
    );

    await page.goto("/overview/");

    await expect
      .poll(() => warnings.join("\n"), { timeout: 30_000 })
      .toMatch(/Mermaid\.js failed to load/);
    expect(served).toBeGreaterThan(0);
    expect(await page.evaluate(() => typeof window.mermaid)).toBe("undefined");
    await expect(page.locator(".mermaid svg")).toHaveCount(0);
    await expect(page.locator(".diagram-loading")).toHaveCount(0);

    // The page still works: the theme toggle responds to a click.
    const toggle = page
      .getByRole("button", { name: /toggle dark mode/i })
      .first();
    await expect(toggle).toBeVisible();
    const before = await page.locator("html").getAttribute("data-theme");
    await toggle.click();
    await expect
      .poll(() => page.locator("html").getAttribute("data-theme"))
      .not.toBe(before);
  });
});
