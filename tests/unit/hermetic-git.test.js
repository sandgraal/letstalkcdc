import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * L-002 / L-018: a test that runs `git commit` or `git merge` must use the
 * runner-like environment from helpers/git-env.js, or it passes on a laptop
 * that guesses a git identity and fails on a CI runner that has none.
 * A commit-making call is an argument-array call such as git(dir, "commit", ...).
 */
const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.js") && f !== "hermetic-git.test.js");
const makesCommits = (src) => /["'](commit|merge)["']\s*,/.test(src);

describe("commit-making tests are hermetic about git identity", () => {
  it("scans the unit tests", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("detects an argument-array commit call and ignores prose", () => {
    expect(makesCommits('git(cwd, "commit", "-q")')).toBe(true);
    expect(makesCommits("git commit --no-verify -m x")).toBe(false);
  });

  it.each(
    files.filter((f) =>
      makesCommits(fs.readFileSync(path.join(dir, f), "utf8")),
    ),
  )("%s imports hermeticGitEnv", (f) => {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    expect(src).toMatch(/from ["']\.\/helpers\/git-env\.js["']/);
    expect(src).toMatch(/hermeticGitEnv\(/);
  });
});
