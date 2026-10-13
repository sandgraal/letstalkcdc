/**
 * The smoke check for /.well-known/security.txt is strict everywhere,
 * including CI (P17-29, P17-64): a missing file is a failure.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const CI = { GITHUB_ACTIONS: "true" };

// End to end against a minimal fake build output, so the wiring in
// scripts/smoke.mjs (not only the helper) is exercised.
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("scripts/smoke.mjs security.txt wiring", () => {
  const run = (setup, env) => {
    const base = mkdtempSync(path.join(tmpdir(), "smoke-sec-"));
    try {
      const out = path.join(base, "site");
      mkdirSync(out);
      setup(out);
      return spawnSync("node", [path.join(ROOT, "scripts/smoke.mjs")], {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          BUILD_OUTPUT_DIR: path.relative(ROOT, out),
          ...env,
        },
      });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  };
  const failureLines = (r) =>
    r.stderr.split("\n").filter((l) => l.includes("security.txt"));

  it("fails on a missing security.txt in CI (no skip for a stripped artifact)", () => {
    const r = run(() => {}, CI);
    expect(r.stdout).not.toContain("skipped");
    expect(failureLines(r)).toContain(
      "- .well-known/security.txt: missing from build output",
    );
  });

  it("fails in CI when .well-known exists but is empty of security.txt", () => {
    const r = run((out) => mkdirSync(path.join(out, ".well-known")), CI);
    expect(failureLines(r)).toContain(
      "- .well-known/security.txt: missing from build output",
    );
  });

  it("fails on a missing security.txt when not CI", () => {
    const r = run(() => {}, {});
    expect(failureLines(r)).toContain(
      "- .well-known/security.txt: missing from build output",
    );
  });

  it("runs the content checks in CI when .well-known exists", () => {
    const r = run((out) => {
      mkdirSync(path.join(out, ".well-known"));
      writeFileSync(
        path.join(out, ".well-known", "security.txt"),
        "Contact: mailto:a@example.com\n",
      );
    }, CI);
    const lines = failureLines(r).join("\n");
    expect(lines).toContain("required field Expires missing");
    expect(lines).toContain("required field Canonical missing");
    expect(lines).not.toContain("required field Contact missing");
  });
});
