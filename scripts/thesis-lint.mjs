#!/usr/bin/env node
/**
 * CLI for the thesis lint (P17-7). `npm run lint:thesis`.
 * Exits 1 when any page asserts a timestamp-ordering or end-to-end
 * exactly-once claim that is not on lib/thesis-lint.allow.json, or when an
 * allowlist entry no longer matches anything.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintTree, loadAllowlist, formatReport } from "../lib/thesis-lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = lintTree(ROOT, loadAllowlist(ROOT));
const report = formatReport(result);
const scope = Object.entries(result.scope)
  .map(([k, n]) => `${k} ${n}`)
  .join(", ");

if (report) {
  process.stderr.write(`${report}\n\n`);
  process.stderr.write(
    `thesis-lint: ${result.findings.length} finding(s), ${result.stale.length} stale and ${result.invalid.length} invalid allowlist entr${result.stale.length + result.invalid.length === 1 ? "y" : "ies"} (read ${result.fileCount} files: ${scope}).\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `thesis-lint: ok - read ${result.fileCount} files (${scope}), ${result.allowed.length} allowlisted finding(s).\n`,
);
