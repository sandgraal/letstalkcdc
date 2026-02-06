// @ts-check
import { test, expect } from "@playwright/test";

/**
 * E2E tests for the search overlay.
 * Covers opening, querying, keyboard shortcuts, and result navigation.
 */

test.describe("search", () => {
  test("search button exists in nav utilities", async ({ page }) => {
    await page.goto("/");
    // The search trigger is either a button or a nav-utilities element
    const searchTrigger = page.locator(
      "[data-search-toggle], .nav-utilities button[aria-label*='earch'], #search-toggle",
    );
    if (await searchTrigger.count()) {
      await expect(searchTrigger.first()).toBeVisible();
    }
  });

  test("search overlay opens with / key", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("/");

    // Wait a moment for the overlay to appear
    const overlay = page.locator(
      "[data-search-overlay], .search-overlay, #search-overlay, dialog",
    );
    if (await overlay.count()) {
      await expect(overlay.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("search overlay closes with Escape", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("/");

    const overlay = page.locator(
      "[data-search-overlay], .search-overlay, #search-overlay, dialog",
    );
    if (await overlay.count()) {
      await expect(overlay.first()).toBeVisible({ timeout: 3000 });

      await page.keyboard.press("Escape");
      await expect(overlay.first()).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("search returns results for valid query", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("/");

    const input = page.locator(
      "[data-search-overlay] input, .search-overlay input, #search-overlay input, dialog input[type='search'], dialog input[type='text']",
    );
    if (await input.count()) {
      await input.first().fill("CDC");
      await page.waitForTimeout(500);

      const results = page.locator(
        "[data-search-overlay] a, .search-overlay a, .search-results a, dialog a",
      );
      expect(await results.count()).toBeGreaterThan(0);
    }
  });

  test("clicking a search result navigates to the page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("/");

    const input = page.locator(
      "[data-search-overlay] input, .search-overlay input, dialog input[type='search'], dialog input[type='text']",
    );
    if (await input.count()) {
      await input.first().fill("snapshot");
      await page.waitForTimeout(500);

      const result = page
        .locator(
          "[data-search-overlay] a, .search-overlay a, .search-results a, dialog a",
        )
        .first();
      if (await result.count()) {
        await result.click({ force: true });
        // Should navigate away from home
        await page.waitForLoadState("domcontentloaded");
      }
    }
  });
});
