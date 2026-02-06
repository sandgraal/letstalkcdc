// @ts-check
import { test, expect } from "@playwright/test";

/**
 * E2E tests for the theme toggle (dark/light mode).
 * Verifies toggling, persistence across reloads, and correct aria attributes.
 */

test.describe("theme", () => {
  test("theme toggle button exists and is accessible", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator("[data-toggle-theme]");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", /dark mode/i);
  });

  test("clicking theme toggle changes the theme", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    const toggle = page.locator("[data-toggle-theme]");

    // Wait for JS to initialize the theme (sets data-theme attribute)
    await expect(html).toHaveAttribute("data-theme", /.+/);

    const initialTheme = await html.getAttribute("data-theme");

    await toggle.click();

    const newTheme = await html.getAttribute("data-theme");
    expect(newTheme).not.toBe(initialTheme);
  });

  test("theme persists across page reload", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    const toggle = page.locator("[data-toggle-theme]");

    // Wait for JS to initialize
    await expect(html).toHaveAttribute("data-theme", /.+/);

    // Toggle theme
    await toggle.click();
    const themeAfterToggle = await html.getAttribute("data-theme");

    // Reload
    await page.reload();
    await page.waitForLoadState("networkidle");

    const themeAfterReload = await page
      .locator("html")
      .getAttribute("data-theme");
    expect(themeAfterReload).toBe(themeAfterToggle);
  });

  test("theme persists across navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("[data-toggle-theme]");

    // Wait for JS to initialize
    await expect(page.locator("html")).toHaveAttribute("data-theme", /.+/);

    await toggle.click();
    const themeAfterToggle = await page
      .locator("html")
      .getAttribute("data-theme");

    // Navigate to another page
    await page.goto("/overview/");
    await page.waitForLoadState("networkidle");

    const themeOnNewPage = await page
      .locator("html")
      .getAttribute("data-theme");
    expect(themeOnNewPage).toBe(themeAfterToggle);
  });

  test("respects prefers-color-scheme when no stored preference", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: "dark",
    });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for JS to initialize
    await expect(page.locator("html")).toHaveAttribute("data-theme", /.+/);

    const theme = await page.locator("html").getAttribute("data-theme");
    expect(theme).toBe("dark");

    await context.close();
  });
});
