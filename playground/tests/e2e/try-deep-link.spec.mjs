import { test, expect } from "@playwright/test";
import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const playgroundRoot = path.resolve(path.dirname(__filename), "../..");

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

// The deployed playground lives under /letstalkcdc/playground/. Serve the same
// files under that prefix so the deep link is exercised the way it is shipped.
const PREFIX = "/letstalkcdc/playground/";
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let server;
let baseUrl;

suite("?try=<scenario-id> deep links under the Pages prefix", () => {
  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith(PREFIX)) {
          res.writeHead(404).end("not found");
          return;
        }
        let rel = decodeURIComponent(url.pathname.slice(PREFIX.length)) || "index.html";
        if (rel.endsWith("/")) rel += "index.html";
        const file = path.resolve(playgroundRoot, rel);
        if (!file.startsWith(playgroundRoot + path.sep)) {
          res.writeHead(403).end("forbidden");
          return;
        }
        const body = await readFile(file);
        res.writeHead(200, { "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}${PREFIX}`;
  });

  test.afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  const open = async (page, query) => {
    await page.goto(`${baseUrl}${query}`, { waitUntil: "load" });
  };
  const logDestination = page => page.locator('section[aria-label$="destination snapshot"]').last();
  const counters = page => page.getByTestId("sink-counters").last();

  const labs = [
    {
      id: "replay-guard",
      title: "Replay against a guarded sink",
      unguarded: /Applied 5 · Skipped 0 · Stale applies 2/,
      guard: "position",
      guarded: /Applied 3 · Skipped 2 · Stale applies 0/,
    },
    {
      id: "ts-vs-position",
      title: "ts_ms against log position",
      unguarded: /Applied 4 · Skipped 2 · Stale applies 0/,
      guard: "position",
      guarded: /Applied 6 · Skipped 0 · Stale applies 0/,
    },
  ];

  for (const lab of labs) {
    test(`${lab.id} opens on the Compare tab, runs, and the guard can be changed`, async ({ page }) => {
      await open(page, `?try=${lab.id}#simulator`);
      await expect(page.locator("#simTabCompare")).toHaveAttribute("aria-selected", "true", { timeout: 15000 });
      await expect(page.locator(".sim-shell__description strong").first()).toHaveText(`${lab.title}:`, {
        timeout: 15000,
      });
      await expect(page.getByTestId("sink-guard-controls")).toBeVisible();
      // Started by the link: the run finishes without pressing Start.
      await expect(counters(page)).toHaveText(lab.unguarded, { timeout: 15000 });

      await page.getByTestId("sink-guard-controls").getByRole("combobox").selectOption(lab.guard);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect(counters(page)).toHaveText(lab.guarded, { timeout: 15000 });
    });
  }

  test("delete-then-late-update: the row returns, then a guard with markers keeps it deleted", async ({ page }) => {
    await open(page, "?try=delete-then-late-update#simulator");
    await expect(page.locator("#simTabCompare")).toHaveAttribute("aria-selected", "true", { timeout: 15000 });
    await expect(counters(page)).toHaveText(/Applied 4 · Skipped 0 · Stale applies 1/, { timeout: 15000 });
    await expect(logDestination(page).locator("tbody tr")).toHaveCount(1);
    await expect(logDestination(page)).toContainText("packed");

    const controls = page.getByTestId("sink-guard-controls");
    await controls.getByRole("combobox").selectOption("position");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    // Position guard alone still resurrects the row.
    await expect(counters(page)).toHaveText(/Applied 4 · Skipped 0/, { timeout: 15000 });
    await expect(logDestination(page).locator("tbody tr")).toHaveCount(1);

    await controls.getByRole("checkbox", { name: "Keep delete markers" }).check();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(counters(page)).toHaveText(/Applied 3 · Skipped 1/, { timeout: 15000 });
    await expect(logDestination(page).locator("tbody tr")).toHaveCount(0);
    await expect(page.getByTestId("sink-markers").last()).toContainText("ORD-9");
  });

  test("synthetic generator ops do not shift redeliver targets: ?try plus an immediate Burst keeps the lab's result", async ({ page }) => {
    await open(page, "?try=delete-then-late-update#simulator");
    await expect(page.locator("#simTabCompare")).toHaveAttribute("aria-selected", "true", { timeout: 15000 });
    await page.getByRole("button", { name: /^Burst \+/ }).click();
    // The lab's own writes still happen, and the repeat still targets ORD-9's packed update.
    await expect(logDestination(page)).toContainText("ORD-9", { timeout: 15000 });
    await expect(logDestination(page)).toContainText("packed");
    await expect(counters(page)).toHaveText(/Stale applies [1-9]/, { timeout: 15000 });
  });

  test("a linked lab shows the log lane even when saved preferences had it off, and saves nothing", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "cdc_comparator_prefs_v1",
        JSON.stringify({ scenarioId: "CRUD Basic", activeMethods: ["polling", "trigger"] }),
      );
    });
    await open(page, "?try=replay-guard#simulator");
    await expect(page.getByTestId("sink-counters")).toHaveCount(1, { timeout: 15000 });
    // The linked visit must not overwrite the saved preferences.
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cdc_comparator_prefs_v1")));
    expect(saved.scenarioId).toBe("CRUD Basic");
    expect(saved.activeMethods).toEqual(["polling", "trigger"]);
    // A later plain visit opens the saved/default scenario, not the lab.
    await open(page, "");
    await expect(page.locator("#simTabFeed")).toHaveAttribute("aria-selected", "true");
  });

  test("an unknown id is ignored: the page opens as it does without the parameter", async ({ page }) => {
    await open(page, "?try=does-not-exist");
    await expect(page.locator("#simTabFeed")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#simTabCompare")).toHaveAttribute("aria-selected", "false");
  });

  test("a hostile value is only a lookup key: nothing is injected or executed", async ({ page }) => {
    const dialogs = [];
    page.on("dialog", dialog => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const payload = encodeURIComponent('"><img src=x onerror=alert(1)>');
    await open(page, `?try=${payload}`);
    await expect(page.locator("#simTabFeed")).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(500);
    expect(dialogs).toEqual([]);
    expect(await page.locator("img[src='x']").count()).toBe(0);
  });
});
