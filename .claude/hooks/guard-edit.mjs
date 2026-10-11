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
//   .git/refs/..., .git/packed-refs    (origin/main is the merge gate's base)
//
// and, for the same reason, the user-level ~/.claude/settings.json and
// settings.local.json.
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
      [`${r}/.git/config`, ".git/config"],
    ];
    for (const [file, name] of exact) if (q === file) return name;
    for (const dir of ["hooks", "scripts", "agents"]) {
      if (under(q, `${r}/.claude/${dir}`)) return `.claude/${dir}/`;
    }
    if (under(q, `${r}/.git/hooks`)) return ".git/hooks/";
    if (under(q, `${r}/.git/refs`) || q === `${r}/.git/packed-refs`) {
      return ".git/refs";
    }
  }
  if (home) {
    const h = lc(home);
    if (q === `${h}/.claude/settings.json`) return "~/.claude/settings.json";
    if (q === `${h}/.claude/settings.local.json`) {
      return "~/.claude/settings.local.json";
    }
  }
  return null;
}

function repoRoot(env, cwd) {
  const fromEnv = env.CLAUDE_PROJECT_DIR;
  if (typeof fromEnv === "string" && fromEnv !== "")
    return path.resolve(fromEnv);
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    timeout: 5000,
  });
  if (r.error || r.status !== 0 || !r.stdout.trim()) return null;
  return r.stdout.trim();
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
  const target =
    ti && typeof ti === "object"
      ? [ti.file_path, ti.notebook_path, ti.path].find(
          (v) => typeof v === "string" && v !== "",
        )
      : undefined;
  if (typeof target !== "string") {
    return deny("Blocked: no file path in the hook input.");
  }
  const cwd = path.resolve(
    typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd(),
  );
  const root = repoRoot(env, cwd);
  if (root === null) {
    return deny(
      "Blocked: could not determine the repository root (CLAUDE_PROJECT_DIR is unset and git failed).",
    );
  }
  const roots = [...new Set([path.resolve(root), resolveReal(root)])];
  const home = env.HOME || os.homedir();
  const homes = home
    ? [...new Set([path.resolve(home), resolveReal(home)])]
    : [];

  const lexical = path.resolve(cwd, target);
  const real = resolveReal(lexical);
  for (const p of [lexical, real]) {
    for (const h of homes.length ? homes : [null]) {
      const hit = protectedItem(p, roots, h);
      if (hit) {
        return deny(
          `Blocked: ${target} resolves to ${p}, which is ${hit}. The guard hooks, agents, scripts and settings are the maintainer's: make the change on a branch in a worktree (${path.join(root, ".claude/worktrees")}/<name>) and let the maintainer merge it. See docs/CONDUCTOR.md.`,
        );
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
