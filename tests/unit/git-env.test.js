import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hermeticGitEnv, TEST_IDENTITY } from "./helpers/git-env.js";

/**
 * Tests that run `git commit` use hermeticGitEnv() so they behave the same on
 * a developer machine and on a CI runner with no git identity (L-002).
 */

let dir;
const git = (env, ...args) =>
  spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });

beforeAll(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-env-")));
  git(hermeticGitEnv(), "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  git(hermeticGitEnv(), "add", "-A");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("hermeticGitEnv", () => {
  it("lets a commit succeed using its own identity, whatever the machine has", () => {
    const r = git(hermeticGitEnv(), "commit", "-q", "-m", "init");
    expect(r.status).toBe(0);
    const author = git(hermeticGitEnv(), "log", "-1", "--format=%an <%ae>");
    expect(author.stdout.trim()).toBe(
      `${TEST_IDENTITY.GIT_AUTHOR_NAME} <${TEST_IDENTITY.GIT_AUTHOR_EMAIL}>`,
    );
  });

  it("ignores identity and config leaking in from the caller", () => {
    const env = hermeticGitEnv(
      {},
      {
        ...process.env,
        GIT_AUTHOR_NAME: "leaked",
        GIT_CONFIG_COUNT: "5",
        GIT_CONFIG_KEY_3: "user.name",
      },
    );
    expect(env.GIT_AUTHOR_NAME).toBe("t");
    expect(env.GIT_CONFIG_COUNT).toBe("1");
    expect(env.GIT_CONFIG_KEY_3).toBeUndefined();
    expect(env.GIT_CONFIG_GLOBAL).toBe("/dev/null");
  });

  it("is a runner: without an identity the same commit is refused", () => {
    const env = hermeticGitEnv();
    for (const key of Object.keys(TEST_IDENTITY)) delete env[key];
    fs.writeFileSync(path.join(dir, "b.txt"), "b\n");
    git(env, "add", "-A");
    const r = git(env, "commit", "-q", "-m", "no identity");
    expect(r.status).not.toBe(0);
  });
});
