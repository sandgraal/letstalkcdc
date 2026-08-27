// @ts-check
import { test, expect } from "@playwright/test";

/**
 * Behavioural tests for the interactive tools.
 *
 * These exist because the connector builder shipped completely inert: its
 * module looked up `#host`, `#port`, `#db-specific` and `#advanced`, none of
 * which the template renders, so a defensive early-return bailed before any
 * output was produced. The page loaded, the script returned 200, and nothing
 * threw — so every existing gate passed while the tool did nothing at all.
 *
 * The only thing that catches that class of failure is asserting on generated
 * output, so that is what these tests do.
 */

test.describe("connector builder", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/connector-builder/");
    await page.waitForLoadState("networkidle");
  });

  test("generates a config on load", async ({ page }) => {
    const config = page.locator("#config");
    await expect(config).not.toBeEmpty();

    const text = await config.textContent();
    expect(
      () => JSON.parse(text ?? ""),
      "config must be valid JSON",
    ).not.toThrow();

    const parsed = JSON.parse(text ?? "");
    expect(parsed.config["connector.class"]).toContain("PostgresConnector");
  });

  test("reflects edits to the form", async ({ page }) => {
    await page.fill("#cname", "my-test-connector");
    await expect(page.locator("#config")).toContainText("my-test-connector");
    await expect(page.locator("#curlCmd")).toContainText("my-test-connector");
  });

  test("postgres config defaults to the pgoutput plugin", async ({ page }) => {
    // Debezium's own default is decoderbufs, which needs a separately
    // installed plugin and fails on a stock Postgres.
    await expect(page.locator("#config")).toContainText(
      '"plugin.name": "pgoutput"',
    );
  });

  test("mysql config includes the required schema history store", async ({
    page,
  }) => {
    await page.click('.tabs button[data-src="mysql"]');
    const config = page.locator("#config");
    await expect(config).toContainText("MySqlConnector");
    // Without a Kafka-backed schema history the MySQL connector won't start.
    await expect(config).toContainText(
      "schema.history.internal.kafka.bootstrap.servers",
    );
    // kafka:29092 is the in-network listener used by this repo's compose stack.
    await expect(config).toContainText("kafka:29092");
  });

  test("oracle config includes the PDB name and an Oracle database name", async ({
    page,
  }) => {
    await page.click('.tabs button[data-src="oracle"]');
    const config = page.locator("#config");
    await expect(config).toContainText("OracleConnector");
    await expect(config).toContainText("database.pdb.name");
    // Regression: the form's Postgres default ("inventory") used to carry over
    // to the Oracle tab, producing a config that could not run as generated.
    const parsed = JSON.parse((await config.textContent()) ?? "");
    expect(parsed.config["database.dbname"]).toBe("ORCLCDB");
  });

  test("keeps a database name the user typed when switching tabs", async ({
    page,
  }) => {
    await page.fill("#dbname", "my_custom_db");
    await page.click('.tabs button[data-src="oracle"]');
    await expect(page.locator("#dbname")).toHaveValue("my_custom_db");
    await expect(page.locator("#config")).toContainText("my_custom_db");
  });

  test("tabs expose a selected state before any interaction", async ({
    page,
  }) => {
    await expect(
      page.locator('.tabs button[data-src="postgres"]'),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.locator('.tabs button[data-src="mysql"]'),
    ).toHaveAttribute("aria-selected", "false");
  });

  test("switching to Debezium 1.x renames the topic prefix key", async ({
    page,
  }) => {
    await expect(page.locator("#config")).toContainText("topic.prefix");
    await page.selectOption("#debz", "1");
    const text = (await page.locator("#config").textContent()) ?? "";
    expect(text).toContain("database.server.name");
    expect(text).not.toContain("topic.prefix");
  });

  test("emits a runnable curl command", async ({ page }) => {
    const curl = page.locator("#curlCmd");
    await expect(curl).toContainText("curl -s -X POST");
    await expect(curl).toContainText("/connectors");
  });
});
