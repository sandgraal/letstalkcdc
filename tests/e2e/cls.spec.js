// @ts-check
import { test, expect } from "@playwright/test";

/**
 * Layout-shift regression guard.
 *
 * When the main stylesheet applied asynchronously (preload + onload swap),
 * /intro/ at a desktop viewport shifted `.page-wrap` by ~0.28 once the sheet
 * landed, for a total CLS of ~0.33 under Slow 4G + 4x CPU. With the
 * render-blocking stylesheet the same run measures 0. The 0.1 threshold is
 * Google's "good" boundary and leaves a wide margin on both sides, so it is
 * not sensitive to run-to-run timing noise.
 *
 * Throttling goes through the Chrome DevTools Protocol, so this is
 * chromium-only; the other projects skip.
 */

test.describe("cumulative layout shift", () => {
  test.use({ viewport: { width: 1350, height: 940 } });

  test("/intro/ stays under 0.1 CLS on Slow 4G + 4x CPU", async ({
    page,
  }, testInfo) => {
    // mobile-chrome is also chromium, but it overrides the desktop viewport
    // this guard is tuned for; run on the desktop chromium project only.
    test.skip(
      testInfo.project.name !== "chromium",
      "CDP throttling guard is tuned for the desktop chromium project",
    );

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: ((1.6 * 1024 * 1024) / 8) * 0.9,
      uploadThroughput: ((750 * 1024) / 8) * 0.9,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await page.addInitScript(() => {
      // @ts-ignore test-only globals
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = /** @type {any} */ (entry);
          // @ts-ignore
          if (!shift.hadRecentInput) window.__cls += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/letstalkcdc/intro/", { waitUntil: "load" });
    // Let late shifts (font swap, JS-injected nav) register.
    await page.waitForTimeout(2500);

    // @ts-ignore
    const cls = await page.evaluate(() => window.__cls);
    expect(cls).toBeLessThan(0.1);
  });
});
