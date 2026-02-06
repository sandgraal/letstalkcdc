import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for Let's Talk CDC.
 *
 * Serves the pre-built _site/ directory via a lightweight static server
 * rather than running the full Eleventy dev server.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command:
      "test -L _site/letstalkcdc || ln -s . _site/letstalkcdc; npx serve _site -l 4173 --no-clipboard --symlinks",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
