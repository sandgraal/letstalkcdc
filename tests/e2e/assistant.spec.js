// @ts-check
import { test, expect } from "@playwright/test";

/**
 * E2E coverage for the assistant FAB panel.
 *
 * Why this exists: Lighthouse's `target-size` audit on `/intro/` was
 * stuck reporting `.assistant-send` at "44px by 7px" because axe
 * inspects the panel computationally while `hidden` (display: none),
 * not in the actual visible state. The fix was already shipped in
 * `src/css/assistant.css` (the button is 44×44 in CSS), but
 * Lighthouse can't see it without the panel being open. This spec
 * opens the panel via the FAB click and asserts the rendered
 * dimensions — proving the real-user experience meets WCAG 2.2 even
 * if Lighthouse keeps complaining.
 *
 * Phase 11 "assistant-send visible-state e2e" item closed by this.
 */

// History: P13-7 (2026-10-08) found that at <=640px the FAB covered the
// Send button (a real layout bug, not flake). Fixed in `src/css/assistant.css`
// by lifting the panel clear of the FAB; the hit-test below guards it.
test.describe("assistant panel", () => {
  test("FAB opens the panel and assistant-send is 44×44", async ({ page }) => {
    // Home page (not /intro/) — /intro/'s .sticky-subnav overlaps the
    // FAB on mobile viewports, intercepting clicks. The FAB renders
    // on every page via base.njk; home is simpler.
    await page.goto("/");

    // FAB is rendered by base.njk at the bottom of every page.
    const fab = page.locator("#askBtn");
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute("aria-expanded", "false");

    // Panel structure is injected by src/js/assistant.js after
    // DOMContentLoaded, then kept `hidden` until the FAB is clicked.
    const panel = page.locator("#askPanel");
    await expect(panel).toHaveCount(1);
    await expect(panel.locator(".assistant-input")).toHaveCount(1);

    // Open the panel.
    await fab.click();
    await expect(fab).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();

    // The send button must measure at least 44×44 CSS pixels — the
    // touch-friendly tier used on .nav-chip and .mobile-menu-toggle.
    // PR #274 bumped it from 36×36 specifically for this audit.
    const sendBtn = panel.locator(".assistant-send");
    await expect(sendBtn).toBeVisible();
    const box = await sendBtn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the close button inside the panel closes it", async ({ page }) => {
    await page.goto("/");

    const fab = page.locator("#askBtn");
    const panel = page.locator("#askPanel");
    await expect(panel.locator(".assistant-input")).toHaveCount(1);

    await fab.click();
    await expect(panel).toBeVisible();

    // The panel's own close button (×). Re-clicking the FAB
    // technically also closes the panel, but the panel and FAB are
    // both fixed-position elements that can overlap on narrow
    // viewports, making the re-click flaky in headless browsers.
    // The close button is what a real user reaches for anyway.
    await panel.locator(".assistant-close").click();
    await expect(panel).toBeHidden();
    await expect(fab).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape inside the panel closes it", async ({ page }) => {
    await page.goto("/");

    const fab = page.locator("#askBtn");
    const panel = page.locator("#askPanel");

    // assistant.js injects the panel internals only after its async
    // KB bootstrap completes. Wait for a known injected control so the
    // panel markup and Escape listener are initialized before opening.
    await expect(panel.locator(".assistant-input")).toHaveCount(1);

    await fab.click();
    await expect(panel).toBeVisible();

    // Focus an element inside the panel so the keydown listener fires.
    await panel.locator(".assistant-input").focus();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("with the panel open, a tap on Send and on close reaches those buttons", async ({
    page,
  }) => {
    await page.goto("/");

    const fab = page.locator("#askBtn");
    const panel = page.locator("#askPanel");
    await expect(panel.locator(".assistant-input")).toHaveCount(1);
    await fab.click();
    await expect(panel).toBeVisible();

    // Hit-test the centre of each control. `toBeVisible()` cannot see a
    // fixed element painted over the top (the FAB, z-index 1001, covered
    // Send at <=640px), but `elementFromPoint` can.
    const hits = await panel.evaluate((el) => {
      const result = {};
      for (const sel of [".assistant-send", ".assistant-close"]) {
        const target = el.querySelector(sel);
        const r = target.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        result[sel] = {
          ok: !!hit && (hit === target || target.contains(hit)),
          hit: hit ? hit.id || hit.className || hit.tagName : null,
        };
      }
      return result;
    });
    expect(hits[".assistant-send"], "Send is covered").toMatchObject({
      ok: true,
    });
    expect(hits[".assistant-close"], "close is covered").toMatchObject({
      ok: true,
    });
  });

  test("a thumbs-up sends one request to the Supabase endpoint", async ({
    page,
  }) => {
    // Configure the client BEFORE any page script runs (base.njk only emits
    // these when the build has SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).
    await page.addInitScript(() => {
      window.SUPABASE_URL = "https://feedback-test.supabase.co";
      window.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_e2e";
      localStorage.removeItem("assistantFeedback");
    });

    const posts = [];
    await page.route(
      "https://feedback-test.supabase.co/rest/v1/assistant_feedback",
      async (route) => {
        const request = route.request();
        posts.push({
          method: request.method(),
          headers: request.headers(),
          body: request.postDataJSON(),
        });
        await route.fulfill({ status: 201, body: "" });
      },
    );

    await page.goto("/");

    const fab = page.locator("#askBtn");
    const panel = page.locator("#askPanel");
    await expect(panel.locator(".assistant-input")).toHaveCount(1);
    await fab.click();
    await expect(panel).toBeVisible();

    await panel
      .locator(".assistant-input")
      .fill("What is change data capture?");
    await panel.locator(".assistant-send").click();

    const thumbsUp = panel.locator('.assistant-fb-btn[data-helpful="true"]');
    await expect(thumbsUp).toBeVisible();

    // Disclosure: visible next to the buttons and tied to them for AT users.
    const note = panel.locator(".assistant-fb-note");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(
      "Your question is sent with your vote to help improve answers. Privacy details",
    );
    // The notice links to the privacy page, reachable by keyboard.
    const privacyLink = note.getByRole("link", { name: "Privacy details" });
    await expect(privacyLink).toHaveAttribute("href", /\/privacy\/$/);
    await privacyLink.focus();
    await expect(privacyLink).toBeFocused();
    await expect(thumbsUp).toHaveAttribute(
      "aria-describedby",
      (await note.getAttribute("id")) ?? "",
    );
    await thumbsUp.click();

    await expect(panel.locator(".assistant-fb-thanks")).toHaveText(
      "Thanks for the feedback!",
    );
    await expect.poll(() => posts.length).toBe(1);

    const [post] = posts;
    expect(post.method).toBe("POST");
    expect(post.headers.apikey).toBe("sb_publishable_e2e");
    expect(post.headers.authorization).toBe("Bearer sb_publishable_e2e");
    expect(post.headers.prefer).toBe("return=minimal");
    expect(post.body.question).toBe("What is change data capture?");
    expect(post.body.helpful).toBe(true);
    // "change data capture" is a trigger of the cdc_basics intent.
    expect(post.body.intent_id).toBe("cdc_basics");
    expect(post.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(post.body.ts).toISOString()).toBe(post.body.ts);

    // Delivered, so nothing is left in the local queue (the key may be absent
    // or an empty list, depending on whether anything needed persisting).
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("assistantFeedback") || "[]"),
        ),
      )
      .toEqual([]);
  });
});

/**
 * P15-15: panel polish. One matrix, three claims per viewport:
 *   - header, close button, input and Send sit fully inside the viewport and
 *     are hit-testable (nothing painted over them) with the module page's own
 *     toolbars showing (/intro/ has the site header and the sticky subnav);
 *   - on desktop the close button is a 44x44 target;
 *   - every way of closing the panel puts focus back on the floating button.
 */
const VIEWPORTS = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
  { name: "667x375 landscape", width: 667, height: 375 },
  { name: "568x320 landscape", width: 568, height: 320 },
  { name: "640x300 landscape", width: 640, height: 300 },
];

/** @param {import('@playwright/test').Page} page */
async function openPanelOnModulePage(page) {
  await page.goto("/intro/");
  const fab = page.locator("#askBtn");
  const panel = page.locator("#askPanel");
  await expect(panel.locator(".assistant-input")).toHaveCount(1);
  await fab.click();
  await expect(panel).toBeVisible();
  return { fab, panel };
}

test.describe("assistant panel polish (P15-15)", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}: header, close, input and Send are on screen and hit-testable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const { panel } = await openPanelOnModulePage(page);
      // Let the focus-on-open rAF settle so a mobile keyboard-less run is stable.
      await page.waitForTimeout(100);

      const report = await panel.evaluate((el) => {
        const out = {};
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const targets = {
          panel: el,
          header: el.querySelector(".assistant-header"),
          title: el.querySelector(".assistant-title"),
          close: el.querySelector(".assistant-close"),
          input: el.querySelector(".assistant-input"),
          send: el.querySelector(".assistant-send"),
        };
        for (const [key, node] of Object.entries(targets)) {
          const r = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          out[key] = {
            inside:
              r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw,
            hittable: !!hit && (hit === node || node.contains(hit)),
            rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
            hit: hit ? hit.id || hit.className || hit.tagName : null,
          };
        }
        const c = targets.close.getBoundingClientRect();
        out.closeSize = [c.width, c.height];
        out.viewport = [vw, vh];
        return out;
      });

      for (const key of [
        "panel",
        "header",
        "title",
        "close",
        "input",
        "send",
      ]) {
        expect(
          report[key].inside,
          `${key} fully inside ${vp.name} ${JSON.stringify(report[key].rect)} in ${JSON.stringify(report.viewport)}`,
        ).toBe(true);
        expect(
          report[key].hittable,
          `${key} covered by ${report[key].hit}`,
        ).toBe(true);
      }

      // The 44x44 close target is a desktop requirement (P15-15 a); on phones
      // the same CSS applies, so assert it everywhere the panel is wider than
      // a phone.
      if (vp.width >= 768) {
        expect(report.closeSize[0]).toBeGreaterThanOrEqual(44);
        expect(report.closeSize[1]).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test("the header keeps its layout: title left, close right, one row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const { panel } = await openPanelOnModulePage(page);
    const header = await panel.locator(".assistant-header").boundingBox();
    const title = await panel.locator(".assistant-title").boundingBox();
    const close = await panel.locator(".assistant-close").boundingBox();
    expect(header && title && close).toBeTruthy();
    if (header && title && close) {
      expect(title.x).toBeLessThan(close.x);
      expect(close.x + close.width).toBeLessThanOrEqual(
        header.x + header.width,
      );
      // Single row, and the 44px target does not balloon the header.
      expect(header.height).toBeLessThanOrEqual(60);
    }
  });

  test("close button, Escape and the floating button each return focus to the floating button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const { fab, panel } = await openPanelOnModulePage(page);

    // 1. Close button, opened by pointer.
    await panel.locator(".assistant-close").click();
    await expect(panel).toBeHidden();
    await expect(fab).toBeFocused();

    // 2. Escape, opened by keyboard (focus the button, press Enter).
    await fab.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".assistant-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(fab).toBeFocused();

    // 3. Close button, opened by keyboard, closed by keyboard.
    await page.keyboard.press("Space");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".assistant-input")).toBeFocused();
    await panel.locator(".assistant-close").focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    await expect(fab).toBeFocused();

    // 4. The floating button toggles it closed; focus stays there.
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".assistant-input")).toBeFocused();
    await fab.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    await expect(fab).toBeFocused();
  });

  test("the panel is non-modal: Tab leaves it rather than trapping focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const { panel } = await openPanelOnModulePage(page);
    await panel.locator(".assistant-send").focus();
    await page.keyboard.press("Tab");
    const stillInside = await page.evaluate(() =>
      document.getElementById("askPanel")?.contains(document.activeElement),
    );
    expect(stillInside).toBe(false);
  });
});
