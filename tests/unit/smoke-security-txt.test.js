/**
 * The smoke check for /.well-known/security.txt tolerates the CI artifact
 * dropping dot-directories (P17-29, P17-64) and nothing else.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SKIP_NOTE,
  isCiRun,
  securityTxtCheckMode,
} from "../../lib/smoke-security-txt.mjs";

const CI = { GITHUB_ACTIONS: "true" };

describe("securityTxtCheckMode", () => {
  it("is strict when the run is not CI, even if .well-known is missing", () => {
    expect(
      securityTxtCheckMode({ env: {}, wellKnownExists: false, dotDirs: [] }),
    ).toBe("strict");
    expect(
      securityTxtCheckMode({
        env: { CI: "false", GITHUB_ACTIONS: "false" },
        wellKnownExists: false,
        dotDirs: [],
      }),
    ).toBe("strict");
  });

  it("skips only when CI and .well-known is absent and no dot-dir remains", () => {
    expect(
      securityTxtCheckMode({ env: CI, wellKnownExists: false, dotDirs: [] }),
    ).toBe("skip");
    expect(
      securityTxtCheckMode({
        env: { CI: "true" },
        wellKnownExists: false,
        dotDirs: [],
      }),
    ).toBe("skip");
  });

  it("stays strict in CI when another dot-directory survived the upload", () => {
    expect(
      securityTxtCheckMode({
        env: CI,
        wellKnownExists: false,
        dotDirs: [".other"],
      }),
    ).toBe("strict");
  });

  it("stays strict (content checks run) when .well-known is present", () => {
    expect(
      securityTxtCheckMode({
        env: CI,
        wellKnownExists: true,
        dotDirs: [".well-known"],
      }),
    ).toBe("strict");
  });

  it("recognises CI only from the exact string true", () => {
    expect(isCiRun({ CI: "true" })).toBe(true);
    expect(isCiRun({ GITHUB_ACTIONS: "true" })).toBe(true);
    expect(isCiRun({ CI: "1" })).toBe(false);
    expect(isCiRun({})).toBe(false);
  });

  it("the skip note names the cause, the covering test and the fix", () => {
    expect(SKIP_NOTE).toContain("skipped");
    expect(SKIP_NOTE).toContain("tests/unit/security-contact.test.js");
    expect(SKIP_NOTE).toContain("include-hidden-files: true");
    expect(SKIP_NOTE).toContain("P17-64");
  });
});

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

  it("prints the skip note and does not fail on security.txt in a stripped CI output", () => {
    const r = run(() => {}, CI);
    expect(r.stdout).toContain(SKIP_NOTE);
    expect(failureLines(r)).toEqual([]);
  });

  it("fails on a missing security.txt when not CI", () => {
    const r = run(() => {}, {});
    expect(r.stdout).not.toContain(SKIP_NOTE);
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
    expect(r.stdout).not.toContain(SKIP_NOTE);
    const lines = failureLines(r).join("\n");
    expect(lines).toContain("required field Expires missing");
    expect(lines).toContain("required field Canonical missing");
    expect(lines).not.toContain("required field Contact missing");
  });
});
