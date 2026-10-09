import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const scenarioSource = readFileSync(
  path.join(ROOT, "playground/assets/shared-scenarios.js"),
  "utf8",
);
const scenarioIds = new Set(
  [...scenarioSource.matchAll(/^\s{4}id: "([a-z0-9-]+)",$/gm)].map((m) => m[1]),
);

// {{ '/playground/' | url }}?try=<id>#simulator
const TRY_LINK =
  /\{\{ '\/playground\/' \| url \}\}\?try=([^"#\s]*)(#[A-Za-z0-9_-]+)?/g;

const templates = walk(path.join(ROOT, "src")).filter((f) =>
  f.endsWith(".njk"),
);
const links = templates.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(TRY_LINK)].map((m) => ({
    file: path.relative(ROOT, file),
    id: m[1],
    hash: m[2] ?? "",
  })),
);

describe("lesson links to playground labs (?try=<scenario-id>)", () => {
  it("finds the scenario ids in the playground", () => {
    expect(scenarioIds.has("replay-guard")).toBe(true);
    expect(scenarioIds.size).toBeGreaterThanOrEqual(14);
  });

  it("links the three labs from the lessons", () => {
    const linked = new Set(links.map((l) => l.id));
    for (const id of [
      "replay-guard",
      "ts-vs-position",
      "delete-then-late-update",
    ]) {
      expect(linked.has(id), id).toBe(true);
    }
  });

  it.each(links.map((l) => [`${l.file} -> ${l.id}`, l]))(
    "%s names a real scenario and uses the | url filter",
    (_, link) => {
      expect(scenarioIds.has(link.id), link.id).toBe(true);
      expect(link.hash).toBe("#simulator");
    },
  );
});
