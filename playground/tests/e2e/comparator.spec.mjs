import { test, expect } from "@playwright/test";
import { loadComparator } from "./support/comparator.mjs";

const suite = process.env.PLAYWRIGHT_DISABLE === "1" ? test.describe.skip : test.describe;

suite("Comparator basics", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("cdc_playground_onboarding_v1", "seen");
    });
  });

  test("renders default scenario", async ({ page }) => {
    await loadComparator(page);
    await expect(page.getByRole("heading", { name: /CDC Method Comparator/i })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Scenario/i })).toBeVisible();
  });

  test("filters events via search", async ({ page }) => {
    await loadComparator(page);
    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(500);
    const filterInput = page.getByPlaceholder("Filter by pk, seq, or payload");
    await filterInput.fill("R-1");
    const laneCard = page.locator(".sim-shell__lane-card").first();
    await expect(laneCard.getByText("No events match the current filters.").first()).toBeVisible();
  });

  test("toggles event operations", async ({ page }) => {
    await loadComparator(page);
    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(300);
    const deleteToggle = page.locator(".sim-shell__event-ops").getByRole("button", { name: "D" });
    await deleteToggle.click();
    await expect(deleteToggle).toHaveAttribute("data-active", "false");
  });

  test("schema walkthrough emits events and updates destinations", async ({ page }) => {
    await loadComparator(page);

    const scenarioSelect = page.locator('select[aria-label="Scenario"]');
    await scenarioSelect.waitFor({ timeout: 10000 });
    await scenarioSelect.selectOption({ label: "Schema Evolution" });

    const simulator = page.getByRole("region", { name: "Simulator preview" });
    const addButton = simulator.locator('[data-tour-target="schema-add"]').first();
    const dropButton = simulator.locator('[data-tour-target="schema-drop"]').first();
    const destination = simulator.locator(".sim-shell__destination").first();
    const eventLog = page.locator(".sim-shell__event-log");

    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(200);

    await page.waitForSelector('[data-tour-target="schema-add"]', { timeout: 5000 });
    await expect(addButton).toBeEnabled();

    await addButton.click();

    await expect(eventLog.getByText(/Added column priority_flag/i).first()).toBeVisible();
    await expect(addButton).toBeDisabled();
    await expect(destination.locator('th[data-highlight="true"]')).toContainText("priority_flag");

    await dropButton.click();

    await expect(eventLog.getByText(/Dropped column priority_flag/i).first()).toBeVisible();
    await expect(destination.locator('th[data-highlight="true"]')).toHaveCount(0);
  });

  test("ordering reads OK on every lane when events arrive in log order, even across tables", async ({ page }) => {
    await loadComparator(page);

    const scenarioSelect = page.locator('select[aria-label="Scenario"]');
    await scenarioSelect.waitFor({ timeout: 10000 });
    // Multi-table scenario: its interleaved ts_ms used to flip Ordering to KO on the trigger lane.
    await scenarioSelect.selectOption({ label: "Omnichannel Orders" });
    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(4500);

    const orderingBadges = page.locator('[role="status"]', { hasText: "Ordering:" });
    await expect(orderingBadges).toHaveCount(3);
    await expect(orderingBadges.filter({ hasText: "Ordering: KO" })).toHaveCount(0);
    await expect(orderingBadges.filter({ hasText: "Ordering: OK" })).toHaveCount(3);
  });

  test("each lane counts a source change once (CRUD Basic is 1 insert, 1 update, 1 delete)", async ({ page }) => {
    await loadComparator(page);

    const scenarioSelect = page.locator('select[aria-label="Scenario"]');
    await scenarioSelect.waitFor({ timeout: 10000 });
    await scenarioSelect.selectOption({ label: "CRUD Basic" });
    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(4500);

    const badges = page.locator('[role="status"]', { hasText: "Ops C/U/D:" });
    await expect(badges).toHaveCount(3);
    // Log and trigger capture all three ops; polling misses the delete and the intermediate update.
    await expect(badges.filter({ hasText: "Ops C/U/D: 1/1/1" })).toHaveCount(2);
    await expect(badges.filter({ hasText: "Ops C/U/D: 1/0/0" })).toHaveCount(1);
    await expect(badges.filter({ hasText: "Deletes: 200%" })).toHaveCount(0);
  });

  test("transactions scenario exposes apply-on-commit toggle", async ({ page }) => {
    await loadComparator(page);

    const scenarioSelect = page.locator('select[aria-label="Scenario"]');
    await scenarioSelect.waitFor({ timeout: 10000 });
    await expect(scenarioSelect).toBeVisible();
    const optionTexts = await scenarioSelect.locator('option').allTextContents();
    expect(optionTexts.length).toBeGreaterThan(0);
    expect(optionTexts).toContain("Orders + Items Transactions");
    await scenarioSelect.selectOption({ label: "Orders + Items Transactions" });

    await page.evaluate(() => window.cdcComparatorClock?.play?.());
    await page.waitForTimeout(300);

    const firstLane = page.locator(".sim-shell__lane-card").first();
    await expect(firstLane.locator("thead th", { hasText: "Table" })).toBeVisible();

    const toggle = page.getByRole("checkbox", { name: "Apply on commit" });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
  });
});
