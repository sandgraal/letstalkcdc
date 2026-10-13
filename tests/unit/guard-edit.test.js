import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hermeticGitEnv } from "./helpers/git-env.js";

/**
 * Holds the Edit/Write guard (.claude/hooks/guard-edit.mjs) to the
 * self-protection rule in docs/CONDUCTOR.md: the live hooks, agents, scripts
 * and settings (and git's own hooks and config) cannot be rewritten with the
 * file tools, but the same files can be edited in a worktree branch.
 *
 * Every case runs the hook as a subprocess with the hook payload on stdin,
 * as Claude Code does: exit 2 is a deny, exit 0 is an allow.
 */

const root = path.resolve(__dirname, "../..");
const hook = path.join(root, ".claude/hooks/guard-edit.mjs");

let repo; // a throwaway "repo root" (stands in for CLAUDE_PROJECT_DIR)
let outside; // a directory outside the repo, for symlinks
let home; // a throwaway HOME

const runHook = (stdin, env = {}) =>
  spawnSync(process.execPath, [hook], {
    input: stdin,
    encoding: "utf8",
    timeout: 8000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, HOME: home, ...env },
  });

const call = (tool, file, extra = {}) => {
  const input = {
    tool_name: tool,
    tool_input:
      tool === "NotebookEdit" ? { notebook_path: file } : { file_path: file },
    ...extra,
  };
  return runHook(JSON.stringify(input));
};

const denied = (tool, file, extra) => {
  const r = call(tool, file, extra);
  expect({ tool, file, status: r.status }).toEqual({ tool, file, status: 2 });
  expect(r.stderr).toMatch(/^Blocked/);
  return r;
};
const allowed = (tool, file, extra) => {
  const r = call(tool, file, extra);
  expect({ tool, file, status: r.status, stderr: r.stderr }).toEqual({
    tool,
    file,
    status: 0,
    stderr: "",
  });
};

beforeAll(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guard-edit-")));
  outside = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "guard-edit-out-")),
  );
  home = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "guard-edit-home-")),
  );
  for (const d of [
    ".claude/hooks",
    ".claude/scripts",
    ".claude/agents",
    ".claude/rules",
    ".claude/worktrees/wt1/.claude/hooks",
    ".claude/worktrees/wt1/scripts",
    ".git/hooks",
    "scripts",
    "src",
  ]) {
    fs.mkdirSync(path.join(repo, d), { recursive: true });
  }
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  for (const f of [
    ".claude/settings.json",
    ".claude/hooks/guard-bash.mjs",
    ".claude/agents/conductor.md",
    ".claude/scripts/check-merged-prs.sh",
    "scripts/merge-pr.mjs",
    ".git/config",
    ".git/hooks/pre-push",
    ".claude/worktrees/wt1/.claude/settings.json",
    ".claude/worktrees/wt1/.claude/hooks/guard-bash.mjs",
    ".claude/worktrees/wt1/scripts/merge-pr.mjs",
    "src/app.js",
  ]) {
    fs.writeFileSync(path.join(repo, f), "x\n");
  }
  fs.writeFileSync(path.join(home, ".claude/settings.json"), "{}\n");
  // Symlinks an agent might create elsewhere (the tmp dir) to reach the config.
  fs.symlinkSync(
    path.join(repo, ".claude/settings.json"),
    path.join(outside, "to-settings"),
  );
  fs.symlinkSync(
    path.join(repo, ".claude/hooks"),
    path.join(outside, "to-hooks"),
  );
  fs.symlinkSync(
    path.join(repo, ".claude/hooks/not-yet.mjs"),
    path.join(outside, "dangling"),
  );
  fs.symlinkSync(path.join(repo, ".claude"), path.join(outside, "to-claude"));
  fs.symlinkSync(
    path.join(repo, ".claude/hooks/guard-bash.mjs"),
    path.join(repo, ".claude/worktrees/wt1/sneaky"),
  );
  fs.symlinkSync(
    path.join(repo, ".claude/worktrees/wt1/scripts/merge-pr.mjs"),
    path.join(repo, ".claude/worktrees/wt1/fine"),
  );
});

afterAll(() => {
  for (const d of [repo, outside, home]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("denies writes to the live config", () => {
  it.each([
    [".claude/settings.json"],
    [".claude/settings.local.json"],
    [".claude/hooks/guard-bash.mjs"],
    [".claude/hooks/guard-edit.mjs"],
    [".claude/hooks/a-new-file.mjs"],
    [".claude/hooks/sub/dir/deeper.mjs"],
    [".claude/scripts/check-merged-prs.sh"],
    [".claude/scripts/new.sh"],
    [".claude/agents/conductor.md"],
    [".claude/agents/new-role.md"],
    ["scripts/merge-pr.mjs"],
    [".git/hooks/pre-push"],
    [".git/hooks/pre-commit"],
    [".git/config"],
    [".git/refs/remotes/origin/main"],
    [".git/packed-refs"],
    [".git/HEAD"],
    [".git/info/exclude"],
    [".git/info/attributes"],
    [".git/config.worktree"],
    [".git/worktrees/wt1/config.worktree"],
    [".husky/pre-commit"],
    [".husky/_/husky.sh"],
    [".github/workflows/ci.yml"],
    [".github/dependabot.yml"],
    ["package.json"],
    ["package-lock.json"],
  ])("denies Write to %s", (file) => {
    const r = denied("Write", path.join(repo, file));
    expect(r.stderr).toMatch(/maintainer/);
    expect(r.stderr).toMatch(/worktree/);
  });

  it.each(["Edit", "Write", "MultiEdit", "NotebookEdit"])(
    "denies %s on the settings file",
    (tool) => {
      denied(tool, path.join(repo, ".claude/settings.json"));
    },
  );

  it.each([
    ["a .. out of a subdirectory", ".claude/hooks/../settings.json"],
    ["a .. out of the hooks dir", ".claude/rules/../hooks/guard-bash.mjs"],
    ["a .. out of the worktrees dir", ".claude/worktrees/../settings.json"],
    [
      "a .. out of a worktree",
      ".claude/worktrees/wt1/../../hooks/guard-bash.mjs",
    ],
    [
      "a .. far out of a worktree",
      ".claude/worktrees/wt1/../../../.claude/settings.json",
    ],
    ["a doubled slash", ".claude//settings.json"],
    ["a trailing dot segment", ".claude/./hooks/./guard-bash.mjs"],
    ["upper case", ".CLAUDE/SETTINGS.JSON"],
    ["mixed case", ".Claude/Hooks/Guard-Bash.mjs"],
    ["the merge script, upper case", "SCRIPTS/MERGE-PR.MJS"],
    ["a .git config, upper case", ".GIT/CONFIG"],
  ])("denies %s", (_label, file) => {
    denied("Write", path.join(repo, file));
    denied("Edit", `${repo}/src/../${file}`);
  });

  it("resolves a relative path against the hook's cwd", () => {
    denied("Write", ".claude/settings.json", { cwd: repo });
    denied("Write", "../.claude/hooks/x.mjs", { cwd: path.join(repo, "src") });
    denied("Write", "settings.json", { cwd: path.join(repo, ".claude") });
    allowed("Write", "app.js", { cwd: path.join(repo, "src") });
    allowed("Write", ".claude/settings.json", {
      cwd: path.join(repo, ".claude/worktrees/wt1"),
    });
  });

  it.each([
    ["a symlink to the settings file", "to-settings"],
    ["a symlink to the hooks dir (existing file)", "to-hooks/guard-bash.mjs"],
    ["a symlink to the hooks dir (new file)", "to-hooks/new.mjs"],
    ["a dangling symlink to a hook", "dangling"],
    ["a symlink to .claude (settings)", "to-claude/settings.json"],
    ["a symlink to .claude (new agent)", "to-claude/agents/x.md"],
  ])("denies %s", (_label, file) => {
    denied("Write", path.join(outside, file));
    denied("Edit", path.join(outside, file));
  });

  it("denies a symlink inside a worktree that points at a hook", () => {
    denied("Write", path.join(repo, ".claude/worktrees/wt1/sneaky"));
  });

  it("denies the user-level settings files", () => {
    denied("Write", path.join(home, ".claude/settings.json"));
    denied("Edit", path.join(home, ".claude/settings.local.json"));
  });

  it("checks every path field of the call, not just the first", () => {
    const bad = path.join(repo, ".claude/settings.json");
    const good = path.join(repo, "src/app.js");
    for (const tool_input of [
      { file_path: good, path: bad },
      { file_path: good, notebook_path: bad },
      { notebook_path: good, path: bad },
      { path: bad },
      { file_path: bad, path: good },
    ]) {
      const r = runHook(JSON.stringify({ tool_name: "Edit", tool_input }));
      expect({ tool_input, status: r.status }).toEqual({
        tool_input,
        status: 2,
      });
    }
    const ok = runHook(
      JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: good, path: good },
      }),
    );
    expect(ok.status).toBe(0);
  });

  it("denies the user-level hooks, agents, CLAUDE.md and every settings*.json", () => {
    for (const f of [
      "settings.json",
      "settings.local.json",
      "settings.managed.json",
      "hooks/x.sh",
      "hooks/sub/y.sh",
      "agents/mine.md",
      "CLAUDE.md",
    ]) {
      denied("Write", path.join(home, ".claude", f));
    }
    for (const f of ["projects/x/memory.md", "rules/x.md", "settings.txt"]) {
      allowed("Write", path.join(home, ".claude", f));
    }
  });

  it("protects the primary .claude from a cwd inside a worktree when CLAUDE_PROJECT_DIR is unset", () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "guard-edit-wt-")),
    );
    try {
      const git = (...args) =>
        execFileSync(
          "git",
          [
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=/dev/null",
            ...args,
          ],
          {
            cwd: dir,
            stdio: "pipe",
            env: hermeticGitEnv(),
          },
        );
      git("init", "-q", "-b", "main");
      fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
      git("add", "-A");
      git("commit", "-q", "-m", "init");
      git("worktree", "add", "-q", ".claude/worktrees/w", "-b", "claude/w");
      const wt = path.join(dir, ".claude/worktrees/w");
      const go = (file, cwd) =>
        spawnSync(process.execPath, [hook], {
          input: JSON.stringify({
            tool_name: "Write",
            tool_input: { file_path: file },
            cwd,
          }),
          encoding: "utf8",
          timeout: 8000,
          env: { ...process.env, CLAUDE_PROJECT_DIR: "", HOME: home },
        });
      // the primary's config is protected, whichever checkout the cwd is in
      expect(go(path.join(dir, ".claude/settings.json"), wt).status).toBe(2);
      expect(go(path.join(dir, ".claude/hooks/x.mjs"), dir).status).toBe(2);
      expect(go(path.join(dir, "package.json"), wt).status).toBe(2);
      // the worktree's own copy is the branch being written
      expect(go(path.join(wt, ".claude/settings.json"), wt).status).toBe(0);
      expect(go(path.join(wt, "package.json"), wt).status).toBe(0);
      // and CLAUDE_PROJECT_DIR pointing at the worktree does not unprotect it
      const viaEnv = spawnSync(process.execPath, [hook], {
        input: JSON.stringify({
          tool_name: "Write",
          tool_input: { file_path: path.join(dir, ".claude/settings.json") },
          cwd: wt,
        }),
        encoding: "utf8",
        timeout: 8000,
        env: { ...process.env, CLAUDE_PROJECT_DIR: wt, HOME: home },
      });
      expect(viaEnv.status).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("also protects the root when it is reached through a symlink", () => {
    const via = path.join(outside, "repo-link");
    fs.symlinkSync(repo, via);
    denied("Write", path.join(via, ".claude/settings.json"));
    allowed("Write", path.join(via, "src/app.js"));
  });

  it("names the protected item and the way out", () => {
    const r = denied("Write", path.join(repo, ".claude/hooks/x.mjs"));
    expect(r.stderr).toContain(".claude/hooks/");
    expect(r.stderr).toContain(".claude/worktrees");
  });
});

describe("allows everything else, and the same files in a worktree", () => {
  it.each([
    ["source", "src/app.js"],
    ["a new source file", "src/new.js"],
    ["docs", "docs/CONDUCTOR.md"],
    ["a test", "tests/unit/guard-edit.test.js"],
    ["a rule file", ".claude/rules/css.md"],
    ["a skill", ".claude/skills/x/SKILL.md"],
    ["a slash command", ".claude/commands/x.md"],
    ["another script", "scripts/smoke.mjs"],
    ["a package.json in a subdirectory", "src/package.json"],
    ["CLAUDE.md (instructions, reviewed in the PR)", "CLAUDE.md"],
    ["a lookalike .github file", ".githubx/workflows/ci.yml"],
    ["a lookalike name", ".claude/settings.json.bak"],
    ["a lookalike dir", ".claude/hooks-notes/x.md"],
    ["a lookalike script", "scripts/merge-pr.mjs.bak"],
    ["a lookalike root dir", "claude/settings.json"],
    ["gitignore", ".gitignore"],
    ["a .git file that is not hooks or config", ".git/COMMIT_EDITMSG"],
  ])("allows %s", (_label, file) => {
    for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      allowed(tool, path.join(repo, file));
    }
  });

  it.each([
    [".claude/worktrees/wt1/.claude/settings.json"],
    [".claude/worktrees/wt1/.claude/settings.local.json"],
    [".claude/worktrees/wt1/.claude/hooks/guard-bash.mjs"],
    [".claude/worktrees/wt1/.claude/hooks/guard-edit.mjs"],
    [".claude/worktrees/wt1/.claude/agents/conductor.md"],
    [".claude/worktrees/wt1/.claude/scripts/x.sh"],
    [".claude/worktrees/wt1/scripts/merge-pr.mjs"],
    [".claude/worktrees/new-worktree/.claude/hooks/x.mjs"],
    [".claude/worktrees/wt1/src/app.js"],
    [".claude/worktrees/wt1/package.json"],
    [".claude/worktrees/wt1/package-lock.json"],
    [".claude/worktrees/wt1/.github/workflows/ci.yml"],
    [".claude/worktrees/wt1/.husky/pre-commit"],
    [".claude/worktrees/wt1/fine"],
    [".claude/worktrees/wt1/.claude/../.claude/settings.json"],
  ])("allows %s (a branch being written)", (file) => {
    for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      allowed(tool, path.join(repo, file));
    }
  });

  it("ignores tools it does not guard, even on a protected path", () => {
    const file = path.join(repo, ".claude/settings.json");
    for (const tool of ["Read", "Bash", "Grep", "Glob", "Agent", "WebFetch"]) {
      const r = runHook(
        JSON.stringify({ tool_name: tool, tool_input: { file_path: file } }),
      );
      expect({ tool, status: r.status }).toEqual({ tool, status: 0 });
    }
  });
});

describe("fails closed", () => {
  it.each([
    ["garbage", "this is not json"],
    ["empty", ""],
    ["truncated", '{"tool_name":"Write","tool_input":'],
    ["null", "null"],
    ["a string", '"x"'],
    ["a number", "7"],
    ["an array", "[]"],
  ])("exit 2 on %s stdin", (_label, stdin) => {
    const r = runHook(stdin);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/guard-edit|Blocked/);
  });

  it.each([
    ["no tool_input", '{"tool_name":"Write"}'],
    ["no path", '{"tool_name":"Write","tool_input":{}}'],
    [
      "a path that is not a string",
      '{"tool_name":"Edit","tool_input":{"file_path":5}}',
    ],
    ["an empty path", '{"tool_name":"Edit","tool_input":{"file_path":""}}'],
    ["a null tool_input", '{"tool_name":"MultiEdit","tool_input":null}'],
  ])("exit 2 for a guarded tool with %s", (_label, stdin) => {
    expect(runHook(stdin).status).toBe(2);
  });

  it("exit 2 when the repo root cannot be determined", () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "guard-edit-nogit-")),
    );
    try {
      const r = spawnSync(process.execPath, [hook], {
        input: JSON.stringify({
          tool_name: "Write",
          tool_input: { file_path: path.join(dir, "x.txt") },
          cwd: dir,
        }),
        encoding: "utf8",
        timeout: 8000,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: "",
          GIT_CEILING_DIRECTORIES: path.dirname(dir),
        },
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/repository root/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to git rev-parse --show-toplevel when CLAUDE_PROJECT_DIR is unset", () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "guard-edit-git-")),
    );
    try {
      execFileSync("git", ["init", "-q"], { cwd: dir });
      fs.mkdirSync(path.join(dir, ".claude/hooks"), { recursive: true });
      const go = (file) =>
        spawnSync(process.execPath, [hook], {
          input: JSON.stringify({
            tool_name: "Write",
            tool_input: { file_path: file },
            cwd: path.join(dir, ".claude"),
          }),
          encoding: "utf8",
          timeout: 8000,
          env: { ...process.env, CLAUDE_PROJECT_DIR: "" },
        });
      expect(go(path.join(dir, ".claude/hooks/x.mjs")).status).toBe(2);
      expect(go(path.join(dir, "src/x.js")).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
