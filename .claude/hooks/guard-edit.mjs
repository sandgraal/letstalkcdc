#!/usr/bin/env node
// PreToolUse hook for the Edit, Write, MultiEdit and NotebookEdit tools:
// the file-tool half of the self-protection in docs/CONDUCTOR.md.
//
// guard-bash.mjs stops shell commands from rewriting the guards; this stops
// the edit tools from doing the same thing with no shell at all. A write is
// denied when its resolved absolute path is one of, under the repo root
// (CLAUDE_PROJECT_DIR, else `git rev-parse --show-toplevel`):
//
//   .claude/settings.json, .claude/settings.local.json
//   anything under .claude/hooks/, .claude/scripts/ or .claude/agents/
//   scripts/merge-pr.mjs
//   .git/hooks/..., .git/config        (what runs on every commit and push)
//   .git/HEAD, .git/info/, .git/config.worktree, .git/worktrees/
//   .git/refs/..., .git/packed-refs    (origin/main is the merge gate's base)
//   .husky/, .github/                  (hooks and workflows run with secrets)
//   package.json, package-lock.json    (the merge gate runs a package.json script)
//
// and, for the same reason, the user level: ~/.claude/settings*.json,
// ~/.claude/hooks/, ~/.claude/agents/ and ~/.claude/CLAUDE.md.
//
// Every path-like field of the tool call is checked (file_path,
// notebook_path, path): any one of them being protected is a deny.
//
// The repository root is CLAUDE_PROJECT_DIR when set; otherwise the PRIMARY
// checkout, found through `git rev-parse --git-common-dir`, so a cwd inside a
// worktree still protects the primary .claude. A root that is itself a
// worktree is normalised to the primary checkout.
//
// .claude/rules, .claude/skills, .claude/commands and CLAUDE.md stay
// editable: they are instructions, reviewed in the PR like any other change.
//
// The same relative paths are ALLOWED inside <root>/.claude/worktrees/: an
// agent editing a branch in its own worktree is how a change to these files
// reaches the maintainer, who merges it by hand.
//
// `..`, symlinks (including dangling ones) and case-insensitive file systems
// are resolved before the comparison.
//
// Exit 0 = allow. Exit 2 = deny (stderr is shown to the model).
//
// FAIL CLOSED: unparseable input, a missing path, an unknown repo root or any
// exception is a deny. settings.json also registers this as
// `node ... || exit 2`, so even a failure to load the file denies.
//
// Limits: it judges the tool call's path, nothing else. It cannot stop a
// write the maintainer approves at a permission prompt, and it does not
// cover Bash (guard-bash.mjs does, imperfectly). See docs/CONDUCTOR.md,
// "Honest limits".

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const GUARDED_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

/** Resolve symlinks (also dangling ones) without requiring the path to exist. */
export function resolveReal(input) {
  let pending = path.resolve(input).split("/").filter(Boolean);
  let acc = "/";
  let hops = 0;
  while (pending.length > 0) {
    const part = pending.shift();
    const next = path.join(acc, part);
    let st;
    try {
      st = fs.lstatSync(next);
    } catch {
      acc = next; // does not exist (yet): keep the rest as written
      continue;
    }
    if (st.isSymbolicLink()) {
      hops += 1;
      if (hops > 40) throw new Error("too many levels of symbolic links");
      const abs = path.resolve(acc, fs.readlinkSync(next));
      pending = abs.split("/").filter(Boolean).concat(pending);
      acc = "/";
    } else {
      acc = next;
    }
  }
  return acc;
}

const lc = (s) => s.toLowerCase();
const under = (p, dir) => p === dir || p.startsWith(`${dir}/`);

/**
 * Which protected item (if any) does the absolute path `p` fall under?
 * `roots` are the repo root as given and as resolved.
 */
function protectedItem(p, roots, home) {
  const q = lc(p);
  for (const root of roots) {
    const r = lc(root);
    if (q.startsWith(`${r}/.claude/worktrees/`)) continue; // a branch being written
    const exact = [
      [`${r}/.claude/settings.json`, ".claude/settings.json"],
      [`${r}/.claude/settings.local.json`, ".claude/settings.local.json"],
      [`${r}/scripts/merge-pr.mjs`, "scripts/merge-pr.mjs"],
      [`${r}/package.json`, "package.json"],
      [`${r}/package-lock.json`, "package-lock.json"],
      [`${r}/.git/config`, ".git/config"],
      [`${r}/.git/head`, ".git/HEAD"],
      [`${r}/.git/config.worktree`, ".git/config.worktree"],
    ];
    for (const [file, name] of exact) if (q === file) return name;
    for (const dir of ["hooks", "scripts", "agents"]) {
      if (under(q, `${r}/.claude/${dir}`)) return `.claude/${dir}/`;
    }
    for (const [dir, name] of [
      [".git/hooks", ".git/hooks/"],
      [".git/info", ".git/info/"],
      [".git/worktrees", ".git/worktrees/"],
      [".husky", ".husky/"],
      [".github", ".github/"],
    ]) {
      if (under(q, `${r}/${dir}`)) return name;
    }
    if (under(q, `${r}/.git/refs`) || q === `${r}/.git/packed-refs`) {
      return ".git/refs";
    }
  }
  if (home) {
    const base = `${lc(home)}/.claude/`;
    if (q.startsWith(base)) {
      const rest = q.slice(base.length);
      const first = rest.split("/")[0];
      if (/^settings[^/]*\.json$/.test(rest)) return "~/.claude/settings*.json";
      if (first === "hooks") return "~/.claude/hooks/";
      if (first === "agents") return "~/.claude/agents/";
      if (rest === "claude.md") return "~/.claude/CLAUDE.md";
    }
  }
  return null;
}

const WORKTREE_ROOT_RE = /^(.*?)\/\.claude\/worktrees\/[^/]+(\/.*)?$/;

/** The primary checkout for a directory that may be inside a worktree. */
function toPrimary(dir) {
  const m = WORKTREE_ROOT_RE.exec(dir);
  return m ? m[1] || "/" : dir;
}

function repoRoots(env, cwd) {
  const fromEnv = env.CLAUDE_PROJECT_DIR;
  if (typeof fromEnv === "string" && fromEnv !== "") {
    return [toPrimary(path.resolve(fromEnv))];
  }
  const run = (args) =>
    spawnSync("git", args, { cwd, encoding: "utf8", timeout: 2500 });
  const common = run([
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  if (!common.error && common.status === 0 && common.stdout.trim()) {
    const dir = path.resolve(cwd, common.stdout.trim());
    if (path.basename(dir) === ".git") return [toPrimary(path.dirname(dir))];
  }
  const top = run(["rev-parse", "--show-toplevel"]);
  if (top.error || top.status !== 0 || !top.stdout.trim()) return null;
  return [toPrimary(top.stdout.trim())];
}

/**
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} input
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkEditCall(input, env = process.env) {
  const deny = (reason) => ({ ok: false, reason });
  if (input === null || typeof input !== "object") {
    return deny("Blocked: hook input was not an object.");
  }
  if (
    typeof input.tool_name === "string" &&
    !GUARDED_TOOLS.includes(input.tool_name)
  ) {
    return { ok: true };
  }
  const ti = input.tool_input;
  const targets =
    ti && typeof ti === "object"
      ? [ti.file_path, ti.notebook_path, ti.path].filter(
          (v) => typeof v === "string" && v !== "",
        )
      : [];
  if (targets.length === 0) {
    return deny("Blocked: no file path in the hook input.");
  }
  const cwd = path.resolve(
    typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd(),
  );
  const found = repoRoots(env, cwd);
  if (found === null) {
    return deny(
      "Blocked: could not determine the repository root (CLAUDE_PROJECT_DIR is unset and git failed).",
    );
  }
  const roots = [
    ...new Set(found.flatMap((r) => [path.resolve(r), resolveReal(r)])),
  ];
  const home = env.HOME || os.homedir();
  const homes = home
    ? [...new Set([path.resolve(home), resolveReal(home)])]
    : [];

  for (const target of targets) {
    const lexical = path.resolve(cwd, target);
    const real = resolveReal(lexical);
    for (const p of [lexical, real]) {
      for (const h of homes.length ? homes : [null]) {
        const hit = protectedItem(p, roots, h);
        if (hit) {
          return deny(
            `Blocked: ${target} resolves to ${p}, which is ${hit}. The guard hooks, agents, scripts, settings, workflows and package.json are the maintainer's: make the change on a branch in a worktree (${path.join(roots[0], ".claude/worktrees")}/<name>) and let the maintainer merge it. See docs/CONDUCTOR.md.`,
          );
        }
      }
    }
  }
  return { ok: true };
}

/** Exit 2 with a message. Never throws, never returns. */
function failClosed(message) {
  try {
    process.stderr.write(`${message}\n`);
  } finally {
    process.exit(2);
  }
}

async function main() {
  const crash = (e) =>
    failClosed(`guard-edit: internal error: ${e?.message ?? e}`);
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return failClosed("guard-edit: could not parse hook input");
    }
    const result = checkEditCall(input);
    if (!result.ok) failClosed(result.reason);
  } catch (e) {
    crash(e);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
