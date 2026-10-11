#!/usr/bin/env node
/**
 * Compare the production CSS bundle with the recorded baseline (P17-4).
 *
 *   NODE_ENV=production npm run build:css && npm run check:css-baseline
 *
 * Builds nothing. It hashes src/assets/css/styles.min.css with sha256 and
 * compares it with the single line in .claude/css-baseline.sha256. Both
 * hashes are printed. Exit 0 when they match, 1 on a mismatch, a missing
 * file or a malformed baseline. History of earlier baselines lives in
 * docs/css-baseline-history.md.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CSS = path.join(root, "src/assets/css/styles.min.css");
export const DEFAULT_BASELINE = path.join(root, ".claude/css-baseline.sha256");
const BUILD_HINT =
  "Run `NODE_ENV=production npm run build:css` first, then re-run this check.";

/**
 * @param {{cssPath?: string, baselinePath?: string}} [paths]
 * @returns {{ok: boolean, actual: string|null, expected: string|null, message: string}}
 */
export function checkCssBaseline({
  cssPath = DEFAULT_CSS,
  baselinePath = DEFAULT_BASELINE,
} = {}) {
  if (!existsSync(baselinePath)) {
    return {
      ok: false,
      actual: null,
      expected: null,
      message: `Baseline file is missing: ${baselinePath}`,
    };
  }
  const expected = readFileSync(baselinePath, "utf8").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    return {
      ok: false,
      actual: null,
      expected,
      message: `Baseline file must hold one 64-character sha256 hash: ${baselinePath}`,
    };
  }
  if (!existsSync(cssPath)) {
    return {
      ok: false,
      actual: null,
      expected,
      message: `Built stylesheet is missing: ${cssPath}. ${BUILD_HINT}`,
    };
  }
  const actual = createHash("sha256")
    .update(readFileSync(cssPath))
    .digest("hex");
  if (actual !== expected) {
    return {
      ok: false,
      actual,
      expected,
      message:
        "Production CSS differs from the baseline. If you did not mean to change CSS, " +
        "you introduced a regression; if you did, diff `_site/assets/css/styles.css`, " +
        "then update .claude/css-baseline.sha256 and docs/css-baseline-history.md. " +
        `If styles.min.css is stale or unminified: ${BUILD_HINT}`,
    };
  }
  return {
    ok: true,
    actual,
    expected,
    message: "Production CSS matches the baseline.",
  };
}

function main() {
  const result = checkCssBaseline();
  process.stdout.write(`baseline: ${result.expected ?? "(none)"}\n`);
  process.stdout.write(`actual:   ${result.actual ?? "(none)"}\n`);
  process.stdout.write(`${result.message}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
