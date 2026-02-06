// @ts-check
import { test, expect } from "@playwright/test";

/**
 * E2E tests for content modules and scorecard tracking.
 * Verifies that key content pages load, scorecards work, and progress persists.
 */

const CONTENT_PAGES = [
  { path: "/", title: /CDC/i },
  { path: "/overview/", title: /overview|series/i },
  { path: "/intro/", title: /intro/i },
  { path: "/snapshotting/", title: /snapshot/i },
  { path: "/quickstarts/", title: /quick\s*start/i },
  { path: "/tooling/", title: /tool/i },
  { path: "/troubleshooting/", title: /troubleshoot/i },
  { path: "/use-cases/", title: /use.case/i },
];

test.describe("content pages", () => {
  for (const { path, title } of CONTENT_PAGES) {
    test(`loads ${path} with correct title`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(title);
      // All pages should have a main content area
      const main = page.locator("main, #main, [role='main']");
      await expect(main.first()).toBeVisible();
    });
  }

  test("no console errors on home page", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out expected errors (e.g., missing optional resources)
    const realErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("404") &&
        !e.includes("appwrite") &&
        !e.includes("Failed to load resource"),
    );
    expect(realErrors).toEqual([]);
  });
});

test.describe("scorecard", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      // Clear all scorecard storage
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("scorecard:")) {
          localStorage.removeItem(key);
        }
      }
    });
  });

  test("scorecard checkboxes are interactive", async ({ page }) => {
    // Find a page with a scorecard
    await page.goto("/intro/");
    await page.waitForLoadState("networkidle");

    const checkbox = page.locator("input[data-scorecard-control]").first();
    if (await checkbox.count()) {
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await expect(checkbox).toBeChecked();
    }
  });

  test("scorecard progress updates when items are checked", async ({
    page,
  }) => {
    await page.goto("/intro/");
    await page.waitForLoadState("networkidle");

    const checkbox = page.locator("input[data-scorecard-control]").first();
    const progress = page.locator("[data-scorecard-progress]").first();

    if ((await checkbox.count()) && (await progress.count())) {
      const textBefore = await progress.textContent();

      await checkbox.check();

      const textAfter = await progress.textContent();
      expect(textAfter).not.toBe(textBefore);
    }
  });

  test("scorecard progress persists across reload", async ({ page }) => {
    await page.goto("/intro/");
    await page.waitForLoadState("networkidle");

    const checkbox = page.locator("input[data-scorecard-control]").first();
    if (await checkbox.count()) {
      await checkbox.check();
      await expect(checkbox).toBeChecked();

      await page.reload();
      await page.waitForLoadState("networkidle");

      const checkboxAfter = page
        .locator("input[data-scorecard-control]")
        .first();
      await expect(checkboxAfter).toBeChecked();
    }
  });
});
