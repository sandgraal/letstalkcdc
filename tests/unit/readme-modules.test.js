/**
 * Guard: the README's module count and module table must match
 * src/_data/series.mjs, so adding or removing a module cannot leave the
 * README stale (P15-38).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import series from "../../src/_data/series.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");

describe("README module list", () => {
  it("states the number of modules in series.mjs", () => {
    const match = readme.match(/All (\d+) modules/);
    expect(match, "README has an 'All N modules' summary").not.toBeNull();
    expect(Number(match[1])).toBe(series.length);
  });

  it("links every series entry exactly once in the module table", () => {
    const table = readme.slice(
      readme.indexOf("All "),
      readme.indexOf("</details>"),
    );
    for (const entry of series) {
      const link = `/letstalkcdc/${entry.href})`;
      const count = table.split(link).length - 1;
      expect(count, `${entry.key} appears once in the table`).toBe(1);
    }
  });
});
