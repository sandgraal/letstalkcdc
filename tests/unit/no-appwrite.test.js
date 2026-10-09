/**
 * Guard: the old feedback backend was replaced by Supabase (P13-10). Fail if
 * its name creeps back into code, tests, scripts or CI config.
 *
 * The needle is assembled at runtime so this file does not match itself
 * (`rg -il <name> src scripts tests .github lib .claude supabase` must print
 * nothing).
 *
 * Allowed to mention it: docs/, CHANGELOG.md, SECURITY.md, README.md,
 * CLAUDE.md, package-lock.json (history notes), and this file.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SELF = path.resolve(fileURLToPath(import.meta.url));

const SKIP_DIRS = new Set(["node_modules", "_site", "dist", "docs", ".git"]);
const SKIP_FILES = new Set([
  "CHANGELOG.md",
  "SECURITY.md",
  "README.md",
  "CLAUDE.md",
  "package-lock.json",
]);
const SCAN_DIRS = [
  "src",
  "scripts",
  "tests",
  ".github",
  "lib",
  ".claude",
  "supabase",
];
const NEEDLE = new RegExp(["app", "write"].join(""), "i");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) yield* walk(full);
    else if (info.isFile()) yield full;
  }
}

function rootFiles() {
  return (
    readdirSync(ROOT)
      .filter((n) => !SKIP_FILES.has(n))
      // local, git-ignored env files are not part of the repo
      .filter((n) => n === ".env.example" || !n.startsWith(".env"))
      .map((n) => path.join(ROOT, n))
      .filter((f) => statSync(f).isFile())
  );
}

/**
 * Files git knows about: tracked, plus new files that are not ignored (so a
 * stray reference is caught before it is committed). Git-ignored files are
 * local machine state, not part of the repo: e.g. .claude/.merge-watcher-state.json
 * stores recent PR titles and would otherwise trip this guard locally while CI,
 * which never has it, stays green. Returns null if git is unavailable.
 */
function gitFiles() {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return out
      .split("\0")
      .filter(Boolean)
      .map((rel) => path.join(ROOT, rel));
  } catch {
    return null;
  }
}

function candidateFiles() {
  const tracked = gitFiles();
  if (tracked) {
    const roots = SCAN_DIRS.map((d) => path.join(ROOT, d) + path.sep);
    return tracked.filter((f) => {
      const inScanDir = roots.some((r) => f.startsWith(r));
      const isRootFile = path.dirname(f) === ROOT;
      if (!inScanDir && !isRootFile) return false;
      const rel = path.relative(ROOT, f).split(path.sep);
      if (rel.some((part) => SKIP_DIRS.has(part))) return false;
      if (isRootFile && SKIP_FILES.has(path.basename(f))) return false;
      return true;
    });
  }
  // No git (e.g. an exported tarball): fall back to walking the tree.
  return [
    ...SCAN_DIRS.flatMap((d) => {
      try {
        return [...walk(path.join(ROOT, d))];
      } catch {
        return [];
      }
    }),
    ...rootFiles(),
  ];
}

function isText(buf) {
  return !buf.subarray(0, 4096).includes(0);
}

describe("no leftover references to the retired backend", () => {
  it("does not appear in src, scripts, tests, .github, lib, .claude, supabase or root config", () => {
    const files = candidateFiles().filter((f) => path.resolve(f) !== SELF);

    const hits = [];
    for (const file of files) {
      const buf = readFileSync(file);
      if (!isText(buf)) continue;
      buf
        .toString("utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (NEEDLE.test(line)) {
            hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
          }
        });
    }

    expect(
      hits,
      `The retired backend was removed in P13-10. Remove these references:\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});
