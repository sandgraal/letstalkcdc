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

test.describe("font swap does not shift layout (P13-6)", () => {
  // `layout-shift` entries are Chromium-only. The metric-matched fallback
  // faces in 01-variables.css exist so the Plex swap is invisible; the bound
  // is far below the 0.1 "good" line so a regression to a late, unmatched
  // font shows up here rather than only in Lighthouse.
  test("/intro/ accumulates no meaningful layout shift", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "layout-shift is Chromium-only");
    await page.addInitScript(() => {
      window.__cls = 0;
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__cls += e.value;
          window.__shifts.push({
            value: e.value,
            nodes: (e.sources || []).map((s) =>
              s.node ? s.node.nodeName + "." + (s.node.className || "") : "?",
            ),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/intro/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const { cls, shifts } = await page.evaluate(() => ({
      cls: window.__cls,
      shifts: window.__shifts,
    }));
    expect(cls, JSON.stringify(shifts)).toBeLessThan(0.01);
  });
});
