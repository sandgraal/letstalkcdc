// @ts-check
import { test, expect } from "@playwright/test";
import { expectHittable } from "./helpers/hit-test.js";

/**
 * P15-34: every code block has exactly one visible, labelled, reachable copy
 * control. The static `button.copy` / `button.copy-btn` markup that used to
 * sit inside the `pre` on /troubleshooting/ and /snapshotting/ was removed
 * from the templates (P15-50); the legacy selectors stay in COPY_BUTTONS so
 * that reintroducing one fails this test.
 */

const PAGES = [
  "/event-envelope/",
  "/materialization/",
  "/troubleshooting/",
  "/troubleshooting/failure-drills/",
  "/merge-cookbook/",
  "/which-row-wins/",
  "/snapshotting/",
];

/** Copy-like buttons anywhere in a code block's wrapper (or its pre). */
const COPY_BUTTONS =
  "button.code-copy-button, button.copy, button.copy-btn, button.copy-snippet";

/**
 * Many blocks sit inside a collapsed <details>; a user opens it before using
 * the control, so measure the controls the way a user meets them.
 * @param {import('@playwright/test').Page} page
 */
const openAllDetails = (page) =>
  page.evaluate(() =>
    document.querySelectorAll("details").forEach((d) => (d.open = true)),
  );

test.describe("one copy control per code block", () => {
  for (const path of PAGES) {
    test(`${path} has exactly one visible, reachable, labelled copy button per block`, async ({
      page,
    }) => {
      await page.goto(path);
      await openAllDetails(page);
      const wrappers = page.locator(".code-block-wrapper");
      await expect(wrappers.first()).toBeVisible();
      const blocks = await wrappers.count();
      expect(blocks).toBeGreaterThan(0);

      // No code block escaped the wrapper, so none is without a control.
      await expect(page.locator("pre:has(> code)")).toHaveCount(blocks);

      const report = await page.evaluate((selector) => {
        const isVisible = (/** @type {Element} */ el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        };
        return Array.from(document.querySelectorAll(".code-block-wrapper")).map(
          (wrapper) => {
            const buttons = Array.from(wrapper.querySelectorAll(selector));
            return {
              total: buttons.length,
              visible: buttons.filter(isVisible).length,
              labelled: buttons.every(
                (b) =>
                  (b.getAttribute("aria-label") || b.textContent || "").trim()
                    .length > 0,
              ),
              inPre: wrapper.querySelectorAll("pre button").length,
            };
          },
        );
      }, COPY_BUTTONS);

      expect(report).toHaveLength(blocks);
      for (const [i, block] of report.entries()) {
        expect(block, `block #${i} on ${path}`).toEqual({
          total: 1,
          visible: 1,
          labelled: true,
          inPre: 0,
        });
      }

      // A user can reach every one: scrolled into view, nothing painted over
      // it, and focusable from the keyboard.
      for (let i = 0; i < blocks; i++) {
        const button = wrappers.nth(i).locator("button.code-copy-button");
        await button.evaluate((el) =>
          // "instant": the site sets smooth scrolling, which would leave the
          // button mid-flight when it is hit-tested.
          el.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "instant",
          }),
        );
        await expectHittable(button, `copy button #${i} on ${path}`);
        await button.focus();
        await expect(button).toBeFocused();
      }
    });
  }

  test.describe("clipboard", () => {
    test.beforeEach(({ browserName }) => {
      // Only Chromium lets a test grant and read the clipboard.
      test.skip(browserName !== "chromium", "clipboard permissions: chromium");
    });

    for (const path of [
      "/event-envelope/",
      "/troubleshooting/failure-drills/",
    ]) {
      test(`${path} copy button copies that block's code`, async ({
        page,
        context,
      }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.goto(path);
        await openAllDetails(page);

        const wrappers = page.locator(".code-block-wrapper");
        const count = await wrappers.count();
        for (const index of new Set([0, Math.floor(count / 2), count - 1])) {
          const wrapper = wrappers.nth(index);
          const expected = await wrapper.locator("pre > code").textContent();
          const button = wrapper.locator("button.code-copy-button");

          await button.scrollIntoViewIfNeeded();
          await button.click();
          await expect(button).toHaveText("Copied!");
          // The visible "Copied!" is hidden behind the button's aria-label,
          // so a screen-reader user hears the confirmation from the polite
          // live region instead.
          const live = page.locator(".toast-live-region");
          await expect(live).toHaveAttribute("role", "status");
          await expect(live).toHaveAttribute("aria-live", "polite");
          await expect(live).toContainText("code copied to clipboard");

          const copied = await page.evaluate(() =>
            navigator.clipboard.readText(),
          );
          expect(copied).toBe(expected);
          expect(copied).not.toMatch(/^copy\b/i);
        }
      });
    }
  });
});
