// @ts-check
import { test, expect } from "@playwright/test";
import {
  expectHittable,
  expectNotClipped,
  expectFixedNotTrapped,
} from "./helpers/hit-test.js";

/**
 * E2E tests for site navigation.
 * Covers desktop nav links, mobile menu, dropdown menus, and keyboard navigation.
 *
 * NOTE ON ASSERTIONS: prefer `expectHittable` over `toBeVisible()` for anything
 * a user has to click, and never pass `{ force: true }` to `click()` in this
 * file. Both shortcuts previously let real bugs through CI — see the comment
 * block in ./helpers/hit-test.js for the specific failures.
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

    // Regression guard: the menu used to satisfy every assertion above while
    // being clipped by `.nav-links` (overflow) and painted under the hero, so
    // none of it could be clicked. Assert the user-facing property instead.
    await expectNotClipped(menu, "the open dropdown menu");
    const items = menu.locator("a[role='menuitem']");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await expectHittable(
        item,
        `dropdown item "${(await item.textContent())?.trim()}"`,
      );
    }
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

    // The drawer is `position: fixed` inside the sticky header. When the header
    // carried `backdrop-filter` it became the containing block for the drawer,
    // which collapsed it to the header's 64px and hid all 12 links in
    // production. `links.count() > 0` still passed, so assert geometry.
    await expectFixedNotTrapped(mobileNav, "the mobile drawer");
    const box = await mobileNav.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "drawer should have a layout box").not.toBeNull();
    expect(
      box.height,
      `drawer should span the viewport height (${viewport?.height}px), got ${box.height}px`,
    ).toBeGreaterThan((viewport?.height ?? 0) * 0.8);

    // Every top-level drawer link must be genuinely clickable. Items inside a
    // collapsed dropdown are excluded — they are legitimately hidden until the
    // user expands their parent.
    const links = mobileNav.locator("a:not(.nav-dropdown-menu a)");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      await expectHittable(
        link,
        `drawer link "${(await link.textContent())?.trim()}"`,
      );
    }
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

    // Deliberately NOT `{ force: true }`. Forcing skips Playwright's
    // actionability checks — including "receives pointer events" — which is
    // exactly the check that would have caught the collapsed drawer. A real
    // click here is the regression guard.
    const link = mobileNav.locator("a[href]:not(.nav-dropdown-menu a)").first();
    await link.click();

    // After clicking a link, page navigates; verify navigation occurred
    await page.waitForLoadState("networkidle");
    // Mobile nav should not be open on the new page
    await expect(
      page.locator("[data-mobile-nav][data-mobile-nav-open]"),
    ).toHaveCount(0);
  });
});
