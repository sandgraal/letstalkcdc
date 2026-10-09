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
