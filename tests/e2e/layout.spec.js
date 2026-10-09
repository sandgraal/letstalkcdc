// @ts-check
import { test, expect } from "@playwright/test";

/**
 * Layout regressions that only show up as pixels: the community box hugging
 * the screen edges, and stray floating controls competing with the assistant
 * button.
 */

test.describe("community box", () => {
  for (const [width, height] of [
    [320, 700],
    [393, 852],
    [1280, 800],
  ]) {
    test(`is inset from the viewport edges at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/snapshotting/");
      await page.waitForLoadState("networkidle");

      const box = page.locator(".discussion-callout");
      await box.scrollIntoViewIfNeeded();
      const m = await box.evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const text = el
          .querySelector(".callout__content p")
          .getBoundingClientRect();
        return {
          padLeft: parseFloat(cs.paddingLeft),
          padRight: parseFloat(cs.paddingRight),
          left: r.left,
          right: r.right,
          textLeft: text.left,
          textRight: text.right,
          vw: document.documentElement.clientWidth,
        };
      });

      expect(m.padLeft).toBeGreaterThan(0);
      expect(m.padRight).toBeGreaterThan(0);
      // Neither the box nor its text may touch the screen edge.
      expect(m.left).toBeGreaterThanOrEqual(12);
      expect(m.vw - m.right).toBeGreaterThanOrEqual(12);
      expect(m.textLeft).toBeGreaterThanOrEqual(12);
      expect(m.vw - m.textRight).toBeGreaterThanOrEqual(12);
    });
  }
});

test.describe("floating controls", () => {
  // The orphaned dashboard-activity chip (`#statsButton`, a "📊 0" button) was
  // removed: its stylesheet had been deleted, so it rendered in normal flow
  // after the footer, and when restored it floated over lesson text on phones.
  test("the dashboard-activity chip is gone from lesson pages", async ({
    page,
  }) => {
    await page.goto("/snapshotting/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#statsButton")).toHaveCount(0);
    await expect(page.locator(".stats-wrapper")).toHaveCount(0);
    await expect(page.locator("#sessionModal")).toHaveCount(0);
  });

  for (const [width, height] of [
    [320, 700],
    [393, 852],
    [768, 1024],
    [1280, 800],
  ]) {
    test(`only the assistant button owns its centre point at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/snapshotting/");
      await page.waitForLoadState("networkidle");

      const ask = page.locator("#askBtn");
      await expect(ask).toBeVisible();
      // assistant.css loads async; wait until the FAB is actually fixed.
      await expect
        .poll(() => ask.evaluate((el) => getComputedStyle(el).position))
        .toBe("fixed");

      const a = /** @type {any} */ (await ask.boundingBox());
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("#askBtn")?.id,
        { x: a.x + a.width / 2, y: a.y + a.height / 2 },
      );
      expect(hit).toBe("askBtn");
    });
  }

  test("pages load without uncaught errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const path of ["/", "/snapshotting/", "/dashboard/", "/intro/"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(errors).toEqual([]);
  });
});
