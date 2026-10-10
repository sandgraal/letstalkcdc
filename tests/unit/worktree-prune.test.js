import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * scripts/worktree-prune.sh must be safe by default: the dry run lists only
 * worktrees that are finished (merged into origin/main, or remote branch
 * gone) and clean, and it never removes anything without --execute.
 */

const script = path.resolve(__dirname, "../../scripts/worktree-prune.sh");

const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
};

const runScript = (cwd, ...args) =>
  spawnSync("bash", [script, ...args], { cwd, env, encoding: "utf8" });

let tmp;
let repo;

const commitFile = (cwd, name) => {
  fs.writeFileSync(path.join(cwd, name), `${name}\n`);
  git(cwd, "add", name);
  git(cwd, "commit", "-q", "-m", `add ${name}`);
};

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wt-prune-")));
  const origin = path.join(tmp, "origin.git");
  repo = path.join(tmp, "repo");

  git(tmp, "init", "-q", "--bare", "-b", "main", origin);
  git(tmp, "clone", "-q", origin, repo);
  git(repo, "checkout", "-q", "-b", "main");
  commitFile(repo, "base.txt");
  git(repo, "push", "-q", "-u", "origin", "main");

  const wt = path.join(repo, ".claude", "worktrees");
  fs.mkdirSync(wt, { recursive: true });

  // merged: has its own commit, and that commit is now in origin/main
  git(
    repo,
    "worktree",
    "add",
    "-q",
    "-b",
    "merged-branch",
    path.join(wt, "merged"),
  );
  commitFile(path.join(wt, "merged"), "merged.txt");
  git(repo, "merge", "-q", "--ff-only", "merged-branch");
  git(repo, "push", "-q", "origin", "main");

  // unmerged: a commit that exists nowhere else
  git(
    repo,
    "worktree",
    "add",
    "-q",
    "-b",
    "unmerged-branch",
    path.join(wt, "unmerged"),
  );
  commitFile(path.join(wt, "unmerged"), "unmerged.txt");

  // merged but dirty: must be kept
  git(
    repo,
    "worktree",
    "add",
    "-q",
    "-b",
    "dirty-branch",
    path.join(wt, "dirty"),
  );
  commitFile(path.join(wt, "dirty"), "dirty.txt");
  git(repo, "merge", "-q", "--ff-only", "dirty-branch");
  git(repo, "push", "-q", "origin", "main");
  fs.writeFileSync(path.join(wt, "dirty", "scratch.txt"), "wip\n");

  // merged but locked: must be kept
  git(
    repo,
    "worktree",
    "add",
    "-q",
    "-b",
    "locked-branch",
    path.join(wt, "locked"),
  );
  commitFile(path.join(wt, "locked"), "locked.txt");
  git(repo, "merge", "-q", "--ff-only", "locked-branch");
  git(repo, "push", "-q", "origin", "main");
  git(repo, "worktree", "lock", path.join(wt, "locked"));
});

afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe("scripts/worktree-prune.sh", () => {
  it("dry run lists only the merged, clean, unlocked worktree", () => {
    const r = runScript(repo);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("DRY RUN");
    expect(r.stdout).toMatch(
      /^ {2}remove {2}merged \(merged-branch: merged into origin\/main/m,
    );
    expect(r.stdout).not.toMatch(/remove {2}unmerged/);
    expect(r.stdout).not.toMatch(/remove {2}dirty/);
    expect(r.stdout).not.toMatch(/remove {2}locked/);
    expect(r.stdout).toMatch(/keep {4}unmerged .*not merged/);
    expect(r.stdout).toMatch(/keep {4}dirty .*uncommitted/);
    expect(r.stdout).toMatch(/keep {4}locked .*locked/);
    expect(r.stdout).toContain("1 worktree(s) would be removed");
  });

  it("changes nothing in a dry run", () => {
    runScript(repo);
    const wt = path.join(repo, ".claude", "worktrees");
    expect(fs.readdirSync(wt).sort()).toEqual([
      "dirty",
      "locked",
      "merged",
      "unmerged",
    ]);
  });

  it("warns and removes nothing when there is no origin/main", () => {
    const lone = path.join(tmp, "lone");
    git(tmp, "init", "-q", "-b", "main", lone);
    commitFile(lone, "a.txt");
    git(
      lone,
      "worktree",
      "add",
      "-q",
      "-b",
      "x",
      path.join(lone, ".claude", "worktrees", "x"),
    );
    const r = runScript(lone);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("warning");
    expect(r.stdout).toContain("0 worktree(s) would be removed");
  });

  it("lists a squash-merged worktree once its remote branch is gone", () => {
    const clone = path.join(tmp, "clone");
    git(tmp, "clone", "-q", path.join(tmp, "origin.git"), clone);
    const dir = path.join(clone, ".claude", "worktrees", "squashed");
    git(clone, "worktree", "add", "-q", "-b", "squashed-branch", dir);
    commitFile(dir, "squashed.txt");
    git(dir, "push", "-q", "-u", "origin", "squashed-branch");
    expect(runScript(clone).stdout).not.toMatch(/remove {2}squashed/);
    git(clone, "push", "-q", "origin", "--delete", "squashed-branch");
    const r = runScript(clone);
    expect(r.stdout).toMatch(
      /remove {2}squashed \(squashed-branch: remote branch gone/,
    );
  });

  it("--execute removes only the merged worktree", () => {
    const r = runScript(repo, "--execute");
    expect(r.status).toBe(0);
    const wt = path.join(repo, ".claude", "worktrees");
    expect(fs.readdirSync(wt).sort()).toEqual(["dirty", "locked", "unmerged"]);
  });

  it("rejects unknown arguments", () => {
    const r = runScript(repo, "--nope");
    expect(r.status).toBe(2);
  });
});
