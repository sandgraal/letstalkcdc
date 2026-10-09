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
 * `color-contrast` is NOT exempted by rule any more (it used to be, globally,
 * because the light-theme accent blue was 3.77:1 on white). It is audited
 * for every page in both themes, minus the exact elements below, which have
 * contrast failures that do not come from the accent token and are tracked
 * separately. A new failure anywhere else, including a regression of the
 * accent colour, fails the test.
 */
const KNOWN_CONTRAST_ELEMENTS = {
  // Light theme: hard-coded status colours (#10b981 / #f59e0b / #ef4444 on
  // the page ground for the three simulator buttons; pale red / cyan /
  // indigo severity pills at 1.5-2.2:1).
  "/intro/": [
    "#sim-insert",
    "#sim-update",
    "#sim-delete",
    ".severity-must",
    ".severity-should",
    ".severity-nice",
  ],
  // Dark theme: the code-block copy buttons inherit the browser default
  // black button text (1.1-1.2:1 on the dark code surface).
  "/troubleshooting/": [".code-copy-button", ".copy-snippet"],
};

/**
 * Known a11y violation rule IDs per page — pre-existing content issues
 * tracked separately from the E2E test suite. These rules are filtered
 * from results so that new regressions are still caught.
 */
const KNOWN_VIOLATIONS = {
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

      // Page-specific known violation rule IDs (color-contrast is audited
      // separately, per theme, below)
      const knownRules = new Set([
        "color-contrast",
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

    for (const theme of ["light", "dark"]) {
      test(`${pagePath} passes color-contrast (${theme} theme)`, async ({
        page,
      }) => {
        await page.addInitScript((t) => {
          window.localStorage.setItem("theme", t);
        }, theme);
        await page.goto(pagePath);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        let axe = new AxeBuilder({ page })
          .withRules(["color-contrast"])
          .exclude(".mermaid");
        for (const selector of KNOWN_CONTRAST_ELEMENTS[pagePath] || []) {
          axe = axe.exclude(selector);
        }
        const results = await axe.analyze();

        const failures = results.violations.flatMap((v) =>
          v.nodes.map(
            (n) =>
              `${n.target.join(" ")}: ${n.any[0]?.message ?? v.description}`,
          ),
        );
        expect(
          failures,
          `color-contrast failures on ${pagePath} (${theme}):\n${failures.join("\n")}`,
        ).toEqual([]);
      });
    }
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
      .analyze();

    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(violations).toEqual([]);
  });

  // The per-page contrast audit above skips a few known elements on /intro/,
  // and the event demo regressed twice before it was audited: its muted
  // title / badge / comment text sat at 4.36:1 and 4.08:1. The event panel
  // is a dark surface in BOTH themes, so also audit it on its own, strictly,
  // in dark and light, idle and after an event has rendered.
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

// Buttons inside `.prose` regressed twice at rest because a link-colour rule
// with higher specificity than `.button` repainted their text: `html[data-theme=
// "dark"] .prose a` (cyan on the cyan gradient, 1.08:1 on /snapshotting/) and
// the inline `html[data-theme="light"] a` (link blue on the cyan gradient,
// 1.55:1 on /tooling/ and /cloud-labs/). A third hole was the base `a:hover`
// rule (0,1,1), which beat `.button` (0,1,0) and painted link-hover colour on
// the button gradient in :hover and :active. axe's color-contrast cannot score
// a gradient background (it reports "needs review"), so measure it directly:
// the worst case is the text colour against each gradient stop.
const BUTTON_PAGES = [
  ...PAGES_TO_AUDIT,
  "/snapshotting/",
  "/cloud-labs/",
  "/cloud-labs/goldengate/",
  "/dashboard/",
  "/strategy/",
  "/troubleshooting/failure-drills/",
];

/**
 * Runs in the browser (via `locator.evaluate`): the contrast of an element's
 * text colour against its own background, using every gradient stop when the
 * background is an image.
 * @param {Element} el
 */
function contrastOf(el) {
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
  };
  // Computed values are rgb()/rgba(), except colour-mix() results, which
  // serialise as `color(srgb r g b [/ a])` with channels in 0-1.
  const rgbs = (s) =>
    [...s.matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g)].map((m) =>
      m[1]
        ? m[1].split(",").map(Number)
        : m[2].split("/").flatMap((part, i) =>
            part
              .trim()
              .split(/\s+/)
              .map((v) => (i === 0 ? Number(v) * 255 : Number(v))),
          ),
    );
  const opaque = (c) => c && (c.length === 3 || c[3] > 0.9);
  const cs = getComputedStyle(el);
  const fg = rgbs(cs.color)[0];
  let stops = rgbs(cs.backgroundImage);
  if (!stops.length) {
    let bg = rgbs(cs.backgroundColor)[0];
    for (let n = el; !opaque(bg) && n; n = n.parentElement) {
      bg = rgbs(getComputedStyle(n).backgroundColor)[0];
    }
    stops = [opaque(bg) ? bg : [255, 255, 255]];
  }
  return {
    label: `${el.textContent.trim()} [${el.className}] ${cs.color}`,
    ratio: Math.min(...stops.map((s) => ratio(fg, s))),
    focusVisible: el.matches(":focus-visible"),
  };
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} pagePath
 * @param {string} theme
 */
async function openInTheme(page, pagePath, theme) {
  await page.addInitScript((t) => {
    window.localStorage.setItem("theme", t);
  }, theme);
  await page.goto(pagePath);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  // Sample the settled colours, not a mid-transition frame.
  await page.addStyleTag({
    content:
      "*,*::before,*::after{transition:none!important;animation:none!important}",
  });
}

test.describe("buttons inside .prose meet 4.5:1", () => {
  for (const theme of ["light", "dark"]) {
    for (const pagePath of BUTTON_PAGES) {
      test(`${pagePath} (${theme} theme)`, async ({ page }) => {
        await openInTheme(page, pagePath, theme);

        const buttons = await Promise.all(
          (await page.locator(".prose a.button").all()).map((b) =>
            b.evaluate(contrastOf),
          ),
        );

        const failures = buttons
          .filter((b) => b.ratio < 4.5)
          .map((b) => `${b.label}: ${b.ratio.toFixed(2)}:1`);
        expect(
          failures,
          `.prose a.button contrast failures on ${pagePath} (${theme}):\n${failures.join("\n")}`,
        ).toEqual([]);
      });
    }
  }
});

// Same measurement in the interactive states, with real input: page.hover for
// :hover, a held mouse button for :active and a keyboard-initiated focus for
// :focus-visible. Covers every `.button` variant on the page, not just plain
// ones, because the regression was in how variants interact with `a:hover`.
test.describe("buttons keep 4.5:1 on hover, active and focus-visible", () => {
  for (const theme of ["light", "dark"]) {
    for (const pagePath of BUTTON_PAGES) {
      test(`${pagePath} (${theme} theme)`, async ({ page }) => {
        await openInTheme(page, pagePath, theme);
        // Releasing the mouse on a link is a click; stay on the page.
        await page.evaluate(() =>
          document.addEventListener("click", (e) => e.preventDefault(), true),
        );

        const buttons = page.locator(
          "main :is(a.button, button.button, .btn):visible",
        );
        const count = await buttons.count();
        const failures = [];
        const check = async (state, button) => {
          const r = await button.evaluate(contrastOf);
          if (state === "focus-visible" && !r.focusVisible) {
            failures.push(`${r.label} [${state}]: not :focus-visible`);
          } else if (r.ratio < 4.5) {
            failures.push(`${r.label} [${state}]: ${r.ratio.toFixed(2)}:1`);
          }
        };

        for (let i = 0; i < count; i++) {
          const button = buttons.nth(i);
          await button.scrollIntoViewIfNeeded();

          await button.hover();
          await check(":hover", button);

          await page.mouse.down();
          await check(":active", button);
          await page.mouse.up();

          // Move away first so the focus check isn't also a hover check.
          await page.mouse.move(0, 0);
          await page.keyboard.press("Shift");
          await button.focus();
          await check("focus-visible", button);
          await button.evaluate((el) => el.blur());
        }

        expect(
          failures,
          `a.button interactive-state contrast failures on ${pagePath} (${theme}):\n${failures.join("\n")}`,
        ).toEqual([]);
      });
    }
  }
});
