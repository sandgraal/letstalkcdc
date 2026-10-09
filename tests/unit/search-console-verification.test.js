/**
 * Guard: the Google Search Console ownership file stays exactly as Google
 * issued it. Changing or removing it un-verifies the site. It is served from
 * src/static (passthrough) at /googleeb5f2ebb27afc761.html and must never be
 * rendered as a page (see the eleventy.config.mjs ignore).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FILE = path.join(ROOT, "src/static/googleeb5f2ebb27afc761.html");

describe("Search Console verification file", () => {
  it("is exactly the one-line string Google issued (no newline, no markup)", () => {
    expect(readFileSync(FILE, "utf8")).toBe(
      "google-site-verification: googleeb5f2ebb27afc761.html",
    );
  });

  it("is kept out of the Eleventy template pipeline", () => {
    const config = readFileSync(path.join(ROOT, "eleventy.config.mjs"), "utf8");
    expect(config).toContain('ignores.add("src/static/google*.html")');
  });
});
