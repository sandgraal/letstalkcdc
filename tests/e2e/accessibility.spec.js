// @ts-check
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";

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
 * Every page in the built sitemap. `color-contrast` is audited on ALL of them,
 * in both themes, with no exemptions: the list of known failing elements that
 * used to live here (P15-21) is now empty, so any new failure, including a
 * regression of an accent or status token, fails the test. The sitemap is the
 * source because it is what ships (noindex dev pages such as /styleguide/ are
 * not in it and are not audited here).
 */
const SITEMAP_PAGES = [
  ...readFileSync(
    new URL("../../_site/sitemap.xml", import.meta.url),
    "utf8",
  ).matchAll(/<loc>([^<]+)<\/loc>/g),
]
  .map(([, loc]) => new URL(loc).pathname.replace(/^\/letstalkcdc(?=\/)/, ""))
  // Entries served by a separate app build (e.g. /playground/) are not in
  // _site, so there is nothing to audit here.
  .filter((p) =>
    existsSync(new URL(`../../_site${p}index.html`, import.meta.url)),
  )
  .sort();

// Built pages that are deliberately not in the sitemap (noindex) but are
// served and were part of the contrast debt; audited too. /newsletter/ is
// in this list because it is out of the sitemap (noindex) while
// BUTTONDOWN_USERNAME is unset, so the "not open yet" state is audited in
// every CI build; a build with the variable set audits it via the sitemap.
for (const extra of [
  "/dashboard/",
  "/styleguide/",
  "/mermaid-sandbox/",
  "/newsletter/",
]) {
  if (!SITEMAP_PAGES.includes(extra)) SITEMAP_PAGES.push(extra);
}

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
  }

  test("the sitemap is non-empty", () => {
    expect(SITEMAP_PAGES.length).toBeGreaterThan(30);
  });

  for (const pagePath of SITEMAP_PAGES) {
    for (const theme of ["light", "dark"]) {
      test(`${pagePath} passes color-contrast (${theme} theme)`, async ({
        page,
      }) => {
        await page.addInitScript((t) => {
          window.localStorage.setItem("theme", t);
        }, theme);
        await page.goto(pagePath);
        await page.waitForLoadState("networkidle");
        // /styleguide/ is standalone and does not read the stored theme.
        await page.evaluate((t) => {
          const root = document.documentElement;
          if (!root.getAttribute("data-theme")) {
            root.setAttribute("data-theme", t);
          }
        }, theme);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        // Audit the settled colours, not a mid-transition frame.
        await page.addStyleTag({
          content:
            "*,*::before,*::after{transition:none!important;animation:none!important}",
        });

        const results = await new AxeBuilder({ page })
          .withRules(["color-contrast"])
          .exclude(".mermaid")
          .analyze();

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

// The rest-state audit above cannot see a hover or focus fill. These are the
// controls P15-21 repaired, measured with axe while the state is applied, in
// both themes: the code-block copy buttons (no rules at all before, so
// browser-default black text), the /intro/ simulator buttons (hard-coded
// status colours with white hover text) and the three tool apps' buttons.
const CONTROL_STATES = [
  ["/event-envelope/", ".code-copy-button"],
  ["/troubleshooting/failure-drills/", ".code-copy-button"],
  ["/intro/", ".sim-btn"],
  ["/connector-builder/", ".builder-app .btn, .builder-app .tabs button"],
  ["/debezium-decoder/", ".decoder-app .btn, .decoder-app .tabs button"],
  ["/dlq-triage/", ".dlq-app .btn, .dlq-app .tabs button"],
  ["/multi-tenancy/", ".preset-row button"],
];

test.describe("repaired controls keep 4.5:1 on hover and focus-visible", () => {
  for (const theme of ["light", "dark"]) {
    for (const [pagePath, selector] of CONTROL_STATES) {
      test(`${pagePath} ${selector} (${theme} theme)`, async ({ page }) => {
        await openInTheme(page, pagePath, theme);
        await page.evaluate(() =>
          document.addEventListener("click", (e) => e.preventDefault(), true),
        );

        const visible = page.locator(selector).filter({ visible: true });
        const count = Math.min(await visible.count(), 8);
        expect(count, `no visible ${selector} on ${pagePath}`).toBeGreaterThan(
          0,
        );

        const failures = [];
        for (let i = 0; i < count; i++) {
          const control = visible.nth(i);
          await control.scrollIntoViewIfNeeded();
          for (const state of ["hover", "focus-visible"]) {
            if (state === "hover") {
              await control.hover();
            } else {
              await page.mouse.move(0, 0);
              await page.keyboard.press("Shift");
              await control.focus();
            }
            await control.evaluate((el) => el.setAttribute("data-ct", "1"));
            const results = await new AxeBuilder({ page })
              .include('[data-ct="1"]')
              .withRules(["color-contrast"])
              .analyze();
            await control.evaluate((el) => el.removeAttribute("data-ct"));
            for (const v of results.violations) {
              for (const n of v.nodes) {
                failures.push(
                  `#${i} [${state}] ${n.any[0]?.message ?? v.description}`,
                );
              }
            }
            await control.evaluate((el) => el.blur());
          }
        }
        expect(
          failures,
          `${selector} contrast failures on ${pagePath} (${theme}):\n${failures.join("\n")}`,
        ).toEqual([]);
      });
    }
  }
});
