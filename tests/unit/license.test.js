/**
 * Guard: licensing files exist, say what LICENSE-CONTENT.md promises, and the
 * README Lighthouse badge states the floor that .lighthouserc.json enforces
 * for /intro/ (P15-1, P15-6).
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

describe("licensing files", () => {
  it("declares MIT for code in package.json and LICENSE", () => {
    expect(JSON.parse(read("package.json")).license).toBe("MIT");
    const mit = read("LICENSE");
    expect(mit).toMatch(/^MIT License/);
    expect(mit).toMatch(/Copyright \(c\) 2025-\d{4} Christopher Ennis/);
  });

  it("ships the official CC BY 4.0 legalcode unmodified", () => {
    const digest = createHash("sha256")
      .update(readFileSync(path.join(ROOT, "LICENSE-CC-BY-4.0.txt")))
      .digest("hex");
    expect(digest).toBe(
      "9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411",
    );
  });

  it("explains the split and gives the attribution wording", () => {
    const doc = read("LICENSE-CONTENT.md");
    expect(doc).toContain("https://creativecommons.org/licenses/by/4.0/");
    expect(doc).toContain(
      "Let's Talk CDC by Christopher Ennis, https://sandgraal.github.io/letstalkcdc/, licensed CC BY 4.0",
    );
    expect(doc).toContain("LICENSE-CC-BY-4.0.txt");
  });

  it("names only content paths that exist", () => {
    const named = [
      "src/_data/glossary.mjs",
      "src/_data/cdcCompare.mjs",
      "src/_data/cdcVendors.mjs",
      "src/from-change-capture-to-ci/data.json",
      "src/data/assistant.yml",
      "src/static/favicon.svg",
      "src/intro/index.njk",
      "src/snapshotting/index.njk",
    ];
    const doc = read("LICENSE-CONTENT.md");
    for (const rel of named) {
      expect(doc, rel).toContain(rel);
      expect(existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }
  });
});

describe("README Lighthouse badge", () => {
  it("states the /intro/ floors enforced in .lighthouserc.json", () => {
    const rc = JSON.parse(read(".lighthouserc.json"));
    const entry = rc.ci.assert.assertMatrix.find((m) =>
      m.matchingUrlPattern.includes("intro"),
    );
    const floor = (key) =>
      Math.round(entry.assertions[`categories:${key}`][1].minScore * 100);
    const perf = floor("performance");
    const a11y = floor("accessibility");

    const badge = decodeURIComponent(
      read("README.md").match(/img\.shields\.io\/badge\/lighthouse[^)\s]*/)[0],
    );
    expect(badge).toContain(`perf ≥ ${perf}`);
    expect(badge).toContain(`a11y ≥ ${a11y}`);
  });
});
