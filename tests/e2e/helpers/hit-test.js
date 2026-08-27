// @ts-check
import { expect } from "@playwright/test";

/**
 * Why this helper exists
 * ----------------------
 * Playwright's `toBeVisible()` only asks the CSS questions: is it displayed,
 * is `visibility` not hidden, is opacity non-zero, does it have a box. It does
 * NOT ask the question a user cares about: *can I actually click this?*
 *
 * That gap shipped two real bugs to production:
 *
 *   - The nav dropdown flyouts had a valid box and `visibility: visible`, but
 *     an ancestor's `overflow` clipped them and the hero painted on top, so
 *     `toBeVisible()` passed while nothing was clickable.
 *   - The mobile drawer collapsed to the header's height. The old test only
 *     asserted `links.count() > 0` — a DOM count — so 12 unreachable links
 *     still passed.
 *
 * `expectHittable` closes that gap by hit-testing the element's own centre
 * point with `document.elementFromPoint`, which accounts for stacking order,
 * overflow clipping and anything painted over the top.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string} [label] Human-readable name used in the failure message.
 */
export async function expectHittable(locator, label = "element") {
  const result = await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return {
        ok: false,
        reason: `zero-sized box (${rect.width}x${rect.height})`,
      };
    }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
      return {
        ok: false,
        reason: `centre point (${Math.round(cx)}, ${Math.round(cy)}) is outside the ${window.innerWidth}x${window.innerHeight} viewport`,
      };
    }
    const hit = document.elementFromPoint(cx, cy);
    if (!hit)
      return { ok: false, reason: "nothing painted at its centre point" };
    if (el === hit || el.contains(hit) || hit.contains(el)) return { ok: true };
    const describe = (node) => {
      const cls = (node.className || "")
        .toString()
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      return (
        node.tagName.toLowerCase() + (cls.length ? `.${cls.join(".")}` : "")
      );
    };
    return { ok: false, reason: `covered by <${describe(hit)}>` };
  });

  expect(
    result.ok,
    `Expected ${label} to be clickable, but it was ${result.reason}. ` +
      `It may still satisfy toBeVisible() — this checks real hit-testing.`,
  ).toBe(true);
}

/**
 * Assert that no ancestor clips the element via `overflow`. A scroll container
 * anywhere up the tree silently cuts off flyouts that extend past its edge —
 * this is what hid the nav dropdowns (`.nav-links` had `overflow-x: auto`,
 * which computes `overflow-y` to `auto` as well).
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string} [label]
 */
export async function expectNotClipped(locator, label = "element") {
  const result = await locator.evaluate((el) => {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const r = node.getBoundingClientRect();
        const e = el.getBoundingClientRect();
        const overflows =
          e.bottom > r.bottom + 1 ||
          e.top < r.top - 1 ||
          e.right > r.right + 1 ||
          e.left < r.left - 1;
        if (overflows) {
          return {
            ok: false,
            reason: `clipped by <${node.tagName.toLowerCase()}.${(node.className || "").toString().trim().split(/\s+/).join(".")}> (overflow ${s.overflowX}/${s.overflowY})`,
          };
        }
      }
      node = node.parentElement;
    }
    return { ok: true };
  });

  expect(
    result.ok,
    `Expected ${label} not to be clipped, but it was ${result.reason}.`,
  ).toBe(true);
}

/**
 * Assert that no ancestor has hijacked the containing block of a
 * `position: fixed` element. `transform`, `filter`, `backdrop-filter`,
 * `perspective` and paint/layout `contain` all do this, which is how the
 * mobile drawer ended up sized to the 64px header instead of the viewport.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string} [label]
 */
export async function expectFixedNotTrapped(locator, label = "element") {
  const result = await locator.evaluate((el) => {
    if (getComputedStyle(el).position !== "fixed") {
      return { ok: true, skipped: true };
    }
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node);
      const causes = [];
      if (s.transform !== "none") causes.push(`transform: ${s.transform}`);
      if (s.filter !== "none") causes.push(`filter: ${s.filter}`);
      if (s.backdropFilter && s.backdropFilter !== "none")
        causes.push(`backdrop-filter: ${s.backdropFilter}`);
      if (s.perspective !== "none")
        causes.push(`perspective: ${s.perspective}`);
      if (s.contain && /paint|layout|strict|content/.test(s.contain))
        causes.push(`contain: ${s.contain}`);
      if (causes.length) {
        return {
          ok: false,
          reason: `<${node.tagName.toLowerCase()}.${(node.className || "").toString().trim().split(/\s+/).join(".")}> sets ${causes.join(", ")}`,
        };
      }
      node = node.parentElement;
    }
    return { ok: true };
  });

  expect(
    result.ok,
    `Expected ${label} to be anchored to the viewport, but ${result.reason} — ` +
      `that makes the ancestor the containing block for position: fixed descendants.`,
  ).toBe(true);
}
