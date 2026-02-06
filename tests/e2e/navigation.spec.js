// @ts-check
import { test, expect } from "@playwright/test";

/**
 * E2E tests for site navigation.
 * Covers desktop nav links, mobile menu, dropdown menus, and keyboard navigation.
 */

test.describe("navigation", () => {
  test("home page loads and has correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CDC/i);
  });

  test("primary nav links are visible on desktop", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav[aria-label='Primary']");
    await expect(nav).toBeVisible();
    await expect(nav.locator("a", { hasText: "Home" })).toBeVisible();
    await expect(nav.locator("a", { hasText: "Series" })).toBeVisible();
  });

  test("navigates to overview page", async ({ page }) => {
    await page.goto("/");
    await page.click("a[href*='overview']");
    await expect(page).toHaveURL(/overview/);
    await expect(
      page.locator("main, #main, [role='main']").first(),
    ).toBeVisible();
  });

  test("skip-to-content link works", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator("a.skip-link");
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
    await skipLink.click();
    // Verify the URL hash changed to #main (focus may not move without tabindex)
    await expect(page).toHaveURL(/#main/);
  });

  test("dropdown menu opens on click", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const dropdown = page.locator(".nav-dropdown").first();
    const toggle = dropdown.locator(".nav-dropdown-toggle");
    const menu = dropdown.locator(".nav-dropdown-menu");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
  });

  test("dropdown menu closes on Escape", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const dropdown = page.locator(".nav-dropdown").first();
    const toggle = dropdown.locator(".nav-dropdown-toggle");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("dropdown links navigate correctly", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const dropdown = page.locator(".nav-dropdown").first();
    const toggle = dropdown.locator(".nav-dropdown-toggle");

    await toggle.click();
    const menuLink = dropdown
      .locator(".nav-dropdown-menu a[role='menuitem']")
      .first();
    const href = await menuLink.getAttribute("href");
    await menuLink.click();

    if (href) {
      await expect(page).toHaveURL(new RegExp(href.replace(/\//g, "\\/")));
    }
  });

  test("404 page shows when navigating to nonexistent page", async ({
    page,
  }) => {
    const response = await page.goto("/this-page-does-not-exist/");
    // Static servers may return 200 for SPA or 404
    const content = await page.content();
    expect(
      response?.status() === 404 ||
        content.includes("404") ||
        content.includes("not found"),
    ).toBeTruthy();
  });
});

test.describe("navigation (mobile)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("mobile menu toggle is visible", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator("[data-mobile-menu-toggle]");
    await expect(toggle).toBeVisible();
  });

  test("mobile menu opens and shows links", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("[data-mobile-menu-toggle]");
    const mobileNav = page.locator("[data-mobile-nav]");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Nav links should be accessible
    const links = mobileNav.locator("a");
    expect(await links.count()).toBeGreaterThan(0);
  });

  test("mobile menu closes on Escape", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("[data-mobile-menu-toggle]");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("mobile menu closes when a link is clicked", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("[data-mobile-menu-toggle]");
    const mobileNav = page.locator("[data-mobile-nav]");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const link = mobileNav.locator("a[href]").first();
    await link.click({ force: true });

    // After clicking a link, page navigates; verify navigation occurred
    await page.waitForLoadState("networkidle");
    // Mobile nav should not be open on the new page
    await expect(
      page.locator("[data-mobile-nav][data-mobile-nav-open]"),
    ).toHaveCount(0);
  });
});
