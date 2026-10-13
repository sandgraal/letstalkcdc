import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hermeticGitEnv } from "./helpers/git-env.js";

/**
 * scripts/worktree-prune.sh must be safe by default: the dry run lists only
 * worktrees that are finished (merged into origin/main, or remote branch
 * gone) and clean, and it never removes anything without --execute.
 */

const script = path.resolve(__dirname, "../../scripts/worktree-prune.sh");

const env = hermeticGitEnv({
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
});

const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
};

const runScript = (cwd, ...args) =>
  spawnSync("bash", [script, ...args], { cwd, env, encoding: "utf8" });

// Worktrees made in a test are seconds old, so the default 24h minimum age
// would (correctly) skip them all. Tests about the merged / dirty / locked
// rules turn the age guard off; the age tests below do not.
const runNoAge = (cwd, ...args) =>
  runScript(cwd, "--min-age-hours", "0", ...args);

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
    const r = runNoAge(repo);
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
    runNoAge(repo);
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
    const r = runNoAge(lone);
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
    expect(runNoAge(clone).stdout).not.toMatch(/remove {2}squashed/);
    git(clone, "push", "-q", "origin", "--delete", "squashed-branch");
    const r = runNoAge(clone);
    expect(r.stdout).toMatch(
      /remove {2}squashed \(squashed-branch: remote branch gone/,
    );
  });

  it("--execute removes only the merged worktree", () => {
    const r = runNoAge(repo, "--execute");
    expect(r.status).toBe(0);
    const wt = path.join(repo, ".claude", "worktrees");
    expect(fs.readdirSync(wt).sort()).toEqual(["dirty", "locked", "unmerged"]);
  });

  it("rejects unknown arguments", () => {
    const r = runScript(repo, "--nope");
    expect(r.status).toBe(2);
  });
});

/**
 * A fresh origin + clone under its own directory (the name may contain a
 * space), with one pushed commit on main. Returns the clone path and the
 * worktrees directory.
 */
const makeRepo = (name) => {
  const root = path.join(tmp, name);
  fs.mkdirSync(root);
  const origin = path.join(root, "origin.git");
  const clone = path.join(root, "clone");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, clone);
  git(clone, "checkout", "-q", "-b", "main");
  commitFile(clone, "base.txt");
  git(clone, "push", "-q", "-u", "origin", "main");
  return { clone, wt: path.join(clone, ".claude", "worktrees") };
};

const advanceMain = (clone, name) => {
  commitFile(clone, name);
  git(clone, "push", "-q", "origin", "main");
};

describe("scripts/worktree-prune.sh minimum age and edge cases", () => {
  it("skips a fresh branch cut from an older main, and --execute keeps it", () => {
    const { clone, wt } = makeRepo("young");
    git(
      clone,
      "worktree",
      "add",
      "-q",
      "-b",
      "fresh-branch",
      path.join(wt, "fresh"),
    );
    // main moves on, so the empty fresh branch is now a strict ancestor of
    // origin/main and looks "merged" even though nobody has worked on it.
    advanceMain(clone, "later.txt");

    const dry = runScript(clone);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(
      /^ {2}skip {4}fresh \(fresh-branch: too young, 0h old, minimum 24h/m,
    );
    expect(dry.stdout).not.toMatch(/remove {2}fresh/);
    expect(dry.stdout).toContain("0 worktree(s) would be removed");

    const exec = runScript(clone, "--execute");
    expect(exec.status).toBe(0);
    expect(fs.existsSync(path.join(wt, "fresh"))).toBe(true);
  });

  it("--min-age-hours 0 restores the old behaviour for that worktree", () => {
    const { clone, wt } = makeRepo("young-zero");
    git(
      clone,
      "worktree",
      "add",
      "-q",
      "-b",
      "fresh-branch",
      path.join(wt, "fresh"),
    );
    advanceMain(clone, "later.txt");

    const dry = runNoAge(clone);
    expect(dry.stdout).toMatch(
      /^ {2}remove {2}fresh \(fresh-branch: merged into origin\/main/m,
    );
    runNoAge(clone, "--execute");
    expect(fs.existsSync(path.join(wt, "fresh"))).toBe(false);
  });

  it("removes a worktree older than the minimum by default", () => {
    const { clone, wt } = makeRepo("old");
    const dir = path.join(wt, "old");
    git(clone, "worktree", "add", "-q", "-b", "old-branch", dir);
    // Backdate both inputs to the age rule: the branch tip's committer date
    // and the mtime of the worktree's git-dir HEAD file.
    const days3 = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    fs.writeFileSync(path.join(dir, "old.txt"), "old\n");
    git(dir, "add", "old.txt");
    const commit = spawnSync("git", ["commit", "-q", "-m", "old work"], {
      cwd: dir,
      env: { ...env, GIT_COMMITTER_DATE: days3.toISOString() },
      encoding: "utf8",
    });
    expect(commit.status).toBe(0);
    git(clone, "merge", "-q", "--ff-only", "old-branch");
    git(clone, "push", "-q", "origin", "main");
    advanceMain(clone, "later.txt");
    const gitDir = git(dir, "rev-parse", "--absolute-git-dir").trim();
    fs.utimesSync(path.join(gitDir, "HEAD"), days3, days3);

    expect(runScript(clone).stdout).toMatch(
      /^ {2}remove {2}old \(old-branch: merged into origin\/main/m,
    );
  });

  it("works when the repository path contains a space", () => {
    const { clone, wt } = makeRepo("with space");
    expect(clone).toContain(" ");
    git(
      clone,
      "worktree",
      "add",
      "-q",
      "-b",
      "spaced-branch",
      path.join(wt, "spaced"),
    );
    commitFile(path.join(wt, "spaced"), "spaced.txt");
    git(clone, "merge", "-q", "--ff-only", "spaced-branch");
    git(clone, "push", "-q", "origin", "main");
    advanceMain(clone, "later.txt");

    const dry = runNoAge(clone);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(
      /^ {2}remove {2}spaced \(spaced-branch: merged into origin\/main/m,
    );
    expect(runNoAge(clone, "--execute").status).toBe(0);
    expect(fs.existsSync(path.join(wt, "spaced"))).toBe(false);
  });

  it("--help prints the whole header, through its last line", () => {
    const lines = fs.readFileSync(script, "utf8").split("\n").slice(1);
    const header = [];
    for (const line of lines) {
      if (!line.startsWith("#")) break;
      header.push(line.replace(/^# ?/, ""));
    }
    const r = runScript(repo, "--help");
    expect(r.status).toBe(0);
    expect(header.length).toBeGreaterThan(20);
    expect(r.stdout.trimEnd().split("\n")).toEqual(header);
    expect(r.stdout).toContain("--min-age-hours");
    expect(r.stdout).toContain("left in place.");
  });

  it("never touches a detached HEAD, even with --execute", () => {
    const { clone, wt } = makeRepo("detached");
    git(
      clone,
      "worktree",
      "add",
      "-q",
      "--detach",
      path.join(wt, "det"),
      "HEAD",
    );
    advanceMain(clone, "later.txt");

    const dry = runNoAge(clone);
    expect(dry.stdout).toMatch(/^ {2}keep {4}det \(detached HEAD\)/m);
    expect(dry.stdout).not.toMatch(/remove {2}det/);
    runNoAge(clone, "--execute");
    expect(fs.existsSync(path.join(wt, "det"))).toBe(true);
  });

  it("rejects a bad --min-age-hours value", () => {
    expect(runScript(repo, "--min-age-hours", "soon").status).toBe(2);
    expect(runScript(repo, "--min-age-hours").status).toBe(2);
  });
});
