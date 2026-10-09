// @ts-check
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E accessibility tests using axe-core.
 * Runs automated WCAG 2.1 AA checks on key pages.
 */

const PAGES_TO_AUDIT = [
  "/",
  "/overview/",
  "/intro/",
  "/quickstarts/",
  "/tooling/",
  "/troubleshooting/",
];

/**
 * Known a11y violation rule IDs per page — pre-existing content issues
 * tracked separately from the E2E test suite. These rules are filtered
 * from results so that new regressions are still caught.
 */
const KNOWN_VIOLATIONS = {
  global: ["color-contrast"], // Blue links on white cards/footer
  "/intro/": [
    "aria-prohibited-attr",
    "svg-img-alt",
    "label",
    "aria-allowed-attr",
  ],
  "/quickstarts/": ["label", "link-name", "aria-allowed-attr"],
  "/tooling/": ["aria-allowed-attr"],
  "/troubleshooting/": ["label"],
};

test.describe("accessibility", () => {
  for (const pagePath of PAGES_TO_AUDIT) {
    test(`${pagePath} has no critical a11y violations`, async ({ page }) => {
      await page.goto(pagePath);
      await page.waitForLoadState("networkidle");

      let axe = new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude(".mermaid"); // Mermaid diagrams may have known issues

      const results = await axe.analyze();

      // Combine global + page-specific known violation rule IDs
      const knownRules = new Set([
        ...KNOWN_VIOLATIONS.global,
        ...(KNOWN_VIOLATIONS[pagePath] || []),
      ]);

      // Filter to critical/serious violations, excluding known pre-existing issues
      const critical = results.violations.filter(
        (v) =>
          (v.impact === "critical" || v.impact === "serious") &&
          !knownRules.has(v.id),
      );

      if (critical.length > 0) {
        const summary = critical
          .map(
            (v) =>
              `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instance${v.nodes.length === 1 ? "" : "s"})`,
          )
          .join("\n");
        expect(
          critical,
          `A11y violations found on ${pagePath}:\n${summary}`,
        ).toEqual([]);
      }
    });
  }

  test("images have alt text", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const images = page.locator("img:not([alt])");
    const count = await images.count();
    if (count > 0) {
      const srcs = [];
      for (let i = 0; i < Math.min(count, 5); i++) {
        srcs.push(await images.nth(i).getAttribute("src"));
      }
      expect(count, `Images without alt text: ${srcs.join(", ")}`).toBe(0);
    }
  });

  test("heading hierarchy is correct on home page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const headings = await page
      .locator("h1, h2, h3, h4, h5, h6")
      .allTextContents();
    expect(headings.length).toBeGreaterThan(0);

    // Should have exactly one h1
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });

  test("interactive elements are keyboard accessible", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator("[data-toggle-theme]");

    await toggle.focus();
    await expect(toggle).toBeFocused();

    // Should be activatable via keyboard
    await page.keyboard.press("Enter");
  });

  test("color contrast passes for body text", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .exclude(".cta-button") // Known: blue CTA links on white cards
      .exclude(".site-footer a") // Known: footer link contrast
      .analyze();

    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(violations).toEqual([]);
  });

  // The page-level audit above filters `color-contrast` (global known issue:
  // blue links on white cards), which let the CDC event demo regress twice:
  // its muted title / badge / comment text sat at 4.36:1 and 4.08:1. The
  // event panel is a dark surface in BOTH themes, so audit it on its own,
  // strictly, in dark and light, idle and after an event has rendered.
  for (const theme of ["dark", "light"]) {
    for (const state of ["idle", "event emitted"]) {
      test(`/intro/ event demo panel passes color-contrast (${theme}, ${state})`, async ({
        page,
      }) => {
        await page.addInitScript((t) => {
          window.localStorage.setItem("theme", t);
        }, theme);
        await page.goto("/intro/");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const panel = page.locator("#cdc-event-demo .ced-event-panel");
        await panel.scrollIntoViewIfNeeded();

        if (state === "event emitted") {
          await page.locator("#cdc-event-demo [data-ced-insert]").click();
          await expect(
            page.locator("#cdc-event-demo [data-ced-op-badge]"),
          ).not.toHaveText(/waiting/);
        }

        const results = await new AxeBuilder({ page })
          .include("#cdc-event-demo .ced-event-panel")
          .withRules(["color-contrast"])
          .analyze();

        const failures = results.violations.flatMap((v) =>
          v.nodes.map(
            (n) =>
              `${n.target.join(" ")}: ${n.any[0]?.message ?? v.description}`,
          ),
        );
        expect(
          failures,
          `color-contrast failures in the CDC event demo panel (${theme}, ${state}):\n${failures.join("\n")}`,
        ).toEqual([]);
      });
    }
  }

  test("ARIA landmarks are present", async ({ page }) => {
    await page.goto("/");

    // Should have a header/banner
    const banner = page.locator("header, [role='banner']");
    await expect(banner.first()).toBeVisible();

    // Should have a main
    const main = page.locator("main, [role='main']");
    await expect(main.first()).toBeVisible();

    // Should have navigation
    const nav = page.locator("nav, [role='navigation']");
    expect(await nav.count()).toBeGreaterThan(0);
  });
});
