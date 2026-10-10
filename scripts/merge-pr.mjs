#!/usr/bin/env node
// scripts/merge-pr.mjs
//
// The single sanctioned way for an AI agent to merge a pull request.
// "Merge after green CI and review" is enforced here rather than trusted,
// because the ruleset on main has no required status checks.
//
//   node scripts/merge-pr.mjs <pr-number>             dry run (default)
//   node scripts/merge-pr.mjs <pr-number> --execute   merge if every gate passes
//
// Gates (all are evaluated and reported, not just the first failure):
//   1 state    PR is OPEN, not a draft, and targets main
//   2 checks   every check on the head commit finished SUCCESS/NEUTRAL/SKIPPED
//   3 review   reviewDecision is not CHANGES_REQUESTED
//   4 record   body has a "## Review record" with an approving verdict and
//              "Findings resolved: yes"
//   5 files    no changed file is on the maintainer-only list
//   6 merge    head merges cleanly onto current origin/main in a temporary
//              worktree; if head is behind main, `npm test` must also pass there
//
// There is deliberately no override flag, and never --admin, --auto or --rebase.
//
// The gate functions below are pure (parsed JSON in, failure list out). All
// process, git and filesystem access goes through injected dependencies so the
// tests need no network.

import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PR_FIELDS = [
  "number",
  "state",
  "isDraft",
  "baseRefName",
  "headRefName",
  "headRefOid",
  "mergeable",
  "reviewDecision",
  "statusCheckRollup",
  "files",
  "body",
  "mergeStateStatus",
].join(",");

export const BASE_BRANCH = "main";

const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const APPROVING_VERDICTS = new Set(["APPROVE", "APPROVE WITH NITS"]);

// Maintainer-only paths. Globs: `**` matches across directories, `*` within a
// path segment. Matching is case-insensitive so a case-folding filesystem
// cannot be used to slip past a rule.
export const RESTRICTED_PATTERNS = [
  ".github/workflows/**",
  ".claude/settings.json",
  ".claude/hooks/**",
  "scripts/merge-pr.mjs",
  "tests/unit/merge-pr*.test.js",
  "supabase/**",
  "CNAME",
  "LICENSE*",
  "package.json",
  "package-lock.json",
  "playground/package.json",
  "playground/package-lock.json",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
];

function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      source += ".*";
      i += 1;
    } else if (ch === "*") {
      source += "[^/]*";
    } else {
      source += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "i");
}

const RESTRICTED_MATCHERS = RESTRICTED_PATTERNS.map((pattern) => ({
  pattern,
  regex: globToRegExp(pattern),
}));

function normalizePath(file) {
  return String(file)
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/{2,}/g, "/");
}

// ---------------------------------------------------------------------------
// Pure helpers and gates
// ---------------------------------------------------------------------------

/** Returns the PR number, or null when the argument is not a positive integer. */
export function parsePrNumber(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,8}$/.test(value)) return null;
  return Number(value);
}

/** Gate 1. */
export function checkState(pr) {
  const failures = [];
  if (pr.state !== "OPEN") {
    failures.push(`PR is ${pr.state ?? "in an unknown state"}, not OPEN`);
  }
  if (pr.isDraft) failures.push("PR is a draft");
  if (pr.baseRefName !== BASE_BRANCH) {
    failures.push(
      `base is ${pr.baseRefName ?? "unknown"}, must be ${BASE_BRANCH}`,
    );
  }
  return failures;
}

function describeCheck(check) {
  return check.name || check.context || check.workflowName || "(unnamed check)";
}

/** Gate 2. Handles both CheckRun and StatusContext rollup entries. */
export function checkChecks(pr) {
  const rollup = pr.statusCheckRollup;
  if (!Array.isArray(rollup) || rollup.length === 0) {
    return ["no checks reported on the head commit (empty rollup)"];
  }
  const failures = [];
  for (const check of rollup) {
    const name = describeCheck(check);
    if (check.__typename === "StatusContext" || "state" in check) {
      const state = String(check.state ?? "").toUpperCase();
      if (state !== "SUCCESS") {
        failures.push(`check "${name}" is ${state || "unknown"}`);
      }
      continue;
    }
    const status = String(check.status ?? "").toUpperCase();
    const conclusion = String(check.conclusion ?? "").toUpperCase();
    if (status !== "COMPLETED") {
      failures.push(
        `check "${name}" has not finished (${status || "unknown"})`,
      );
    } else if (!PASSING_CONCLUSIONS.has(conclusion)) {
      failures.push(`check "${name}" concluded ${conclusion || "unknown"}`);
    }
  }
  return failures;
}

/** Gate 3. */
export function checkReviewDecision(pr) {
  return pr.reviewDecision === "CHANGES_REQUESTED"
    ? ["a reviewer has requested changes (reviewDecision CHANGES_REQUESTED)"]
    : [];
}

function stripNonContent(body) {
  return String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");
}

/** Extracts the "## Review record" section text, or null when absent. */
export function extractReviewRecord(body) {
  const lines = stripNonContent(body).split("\n");
  const start = lines.findIndex((line) =>
    /^##[ \t]+review record[ \t]*$/i.test(line),
  );
  if (start === -1) return null;
  const section = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}[ \t]/.test(lines[i])) break;
    section.push(lines[i]);
  }
  return section;
}

/** Gate 4. */
export function checkReviewRecord(pr) {
  const section = extractReviewRecord(pr.body);
  if (section === null) return ['PR body has no "## Review record" section'];

  const failures = [];
  const keyed = (key) =>
    section
      .map((line) =>
        line.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*?)[ \\t]*$`, "i")),
      )
      .filter(Boolean)
      .map((match) => match[1]);

  const verdicts = keyed("verdict");
  if (verdicts.length === 0) {
    failures.push("Review record has no Verdict line");
  } else {
    for (const verdict of verdicts) {
      if (!APPROVING_VERDICTS.has(verdict)) {
        failures.push(
          `Review record verdict is "${verdict}", need APPROVE or APPROVE WITH NITS`,
        );
      }
    }
  }

  const resolved = keyed("findings resolved");
  if (resolved.length === 0) {
    failures.push("Review record has no Findings resolved line");
  } else if (!resolved.every((value) => value === "yes")) {
    failures.push(
      `Review record says "Findings resolved: ${resolved.find((v) => v !== "yes")}", need yes`,
    );
  }
  return failures;
}

/** Returns the maintainer-only pattern a path matches, or null. */
export function restrictedPatternFor(file) {
  const normalized = normalizePath(file);
  const hit = RESTRICTED_MATCHERS.find(({ regex }) => regex.test(normalized));
  return hit ? hit.pattern : null;
}

/** Gate 5. Accepts the PR `files` array or a plain list of paths. */
export function checkFiles(files) {
  const failures = [];
  for (const entry of files ?? []) {
    const file = typeof entry === "string" ? entry : entry?.path;
    if (!file) continue;
    if (restrictedPatternFor(file)) {
      failures.push(`touches ${file}: maintainer merges this one`);
    }
  }
  return [...new Set(failures)];
}

/** Gates 1-5, the ones that need only the parsed `gh pr view` JSON. */
export function evaluateStaticGates(pr) {
  return [
    {
      id: "state",
      label: "open, non-draft, base main",
      failures: checkState(pr),
    },
    { id: "checks", label: "all checks green", failures: checkChecks(pr) },
    {
      id: "review",
      label: "no changes requested",
      failures: checkReviewDecision(pr),
    },
    {
      id: "record",
      label: "review record approves",
      failures: checkReviewRecord(pr),
    },
    {
      id: "files",
      label: "no maintainer-only files",
      failures: checkFiles(pr.files),
    },
  ];
}

export function formatGateTable(gates) {
  const lines = [];
  gates.forEach((gate, index) => {
    const status = gate.failures.length === 0 ? "PASS" : "FAIL";
    lines.push(`  ${status}  ${index + 1}. ${gate.id.padEnd(7)} ${gate.label}`);
    for (const failure of gate.failures) lines.push(`          - ${failure}`);
    for (const note of gate.notes ?? []) lines.push(`          . ${note}`);
  });
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// I/O layer
// ---------------------------------------------------------------------------

/** Default runner: execFile with an args array, never a shell string. */
export function defaultRunner(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 120_000,
        maxBuffer: 64 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          code = typeof error.code === "number" ? error.code : 1;
          if (typeof error.code !== "number" && !stderr) {
            stderr = String(error.message ?? error);
          }
        }
        resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
  });
}

const defaultFs = {
  mkdtemp: (prefix) => mkdtemp(path.join(tmpdir(), prefix)),
  symlink: (target, link) => symlink(target, link, "dir"),
  rm: (target) => rm(target, { recursive: true, force: true }),
};

const SAFE_REF = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;
const SAFE_OID = /^[0-9a-f]{40,64}$/i;

function tail(text, lines = 12) {
  return String(text ?? "")
    .trim()
    .split("\n")
    .slice(-lines)
    .join("\n");
}

/**
 * Gate 6. Merges the PR head onto current origin/main in a temporary
 * worktree. Never touches the caller's checkout. The worktree is always
 * removed. `runTests` is false when earlier gates already failed, to avoid a
 * slow test run for a PR that will be refused anyway.
 */
export async function testMerge(pr, { run, fs, cwd, runTests = true }) {
  const result = { failures: [], notes: [], changedFiles: [] };
  const head = pr.headRefOid;

  if (
    !SAFE_REF.test(String(pr.headRefName ?? "")) ||
    !SAFE_OID.test(head ?? "")
  ) {
    result.failures.push("head ref or commit looks unsafe or is missing");
    return result;
  }

  const git = (args, options = {}) => run("git", args, { cwd, ...options });

  const fetched = await git(["fetch", "origin", BASE_BRANCH, pr.headRefName]);
  if (fetched.code !== 0) {
    result.failures.push(`git fetch failed: ${tail(fetched.stderr, 3)}`);
    return result;
  }
  const hasHead = await git(["cat-file", "-e", `${head}^{commit}`]);
  if (hasHead.code !== 0) {
    result.failures.push(
      `head commit ${head.slice(0, 7)} is not on ${pr.headRefName}; the branch moved since the PR was read`,
    );
    return result;
  }

  // Cross-check gate 5 against git itself: the `gh` file list can be truncated.
  const diff = await git([
    "diff",
    "--name-only",
    "--no-renames",
    `origin/${BASE_BRANCH}...${head}`,
  ]);
  if (diff.code !== 0) {
    result.failures.push(`git diff failed: ${tail(diff.stderr, 3)}`);
    return result;
  }
  result.changedFiles = diff.stdout.split("\n").filter(Boolean);

  const ancestor = await git([
    "merge-base",
    "--is-ancestor",
    `origin/${BASE_BRANCH}`,
    head,
  ]);
  if (ancestor.code !== 0 && ancestor.code !== 1) {
    result.failures.push(`git merge-base failed: ${tail(ancestor.stderr, 3)}`);
    return result;
  }
  const behind = ancestor.code === 1;
  result.notes.push(
    behind
      ? `head is behind origin/${BASE_BRANCH}; tests must pass on the merged result`
      : `head already contains origin/${BASE_BRANCH}`,
  );

  let worktree = null;
  try {
    const top = await git(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) {
      result.failures.push("not inside a git checkout");
      return result;
    }
    const root = top.stdout.trim();

    worktree = await fs.mkdtemp("merge-pr-");
    const added = await git([
      "worktree",
      "add",
      "--detach",
      worktree,
      `origin/${BASE_BRANCH}`,
    ]);
    if (added.code !== 0) {
      result.failures.push(
        `could not create test worktree: ${tail(added.stderr, 3)}`,
      );
      return result;
    }

    const merged = await run("git", ["merge", "--no-commit", "--no-ff", head], {
      cwd: worktree,
    });
    if (merged.code !== 0) {
      result.failures.push(
        `head does not merge cleanly onto origin/${BASE_BRANCH}: ${tail(merged.stdout || merged.stderr, 4)}`,
      );
      return result;
    }

    if (behind) {
      if (!runTests) {
        result.notes.push("npm test skipped: other gates already failed");
      } else {
        await fs.symlink(
          path.join(root, "node_modules"),
          path.join(worktree, "node_modules"),
        );
        const tests = await run("npm", ["test"], {
          cwd: worktree,
          timeout: 600_000,
        });
        if (tests.code !== 0) {
          result.failures.push(
            `npm test fails on the merged result:\n${tail(tests.stdout + tests.stderr, 15)}`,
          );
        } else {
          result.notes.push("npm test passed on the merged result");
        }
      }
    }
  } finally {
    if (worktree) {
      await git(["worktree", "remove", "--force", worktree]).catch(() => {});
      await fs.rm(worktree).catch(() => {});
      await git(["worktree", "prune"]).catch(() => {});
    }
  }
  return result;
}

async function fetchPr(number, run, cwd) {
  const res = await run(
    "gh",
    ["pr", "view", String(number), "--json", PR_FIELDS],
    { cwd },
  );
  if (res.code !== 0) {
    throw new Error(`gh pr view failed: ${tail(res.stderr || res.stdout, 3)}`);
  }
  try {
    return JSON.parse(res.stdout);
  } catch {
    throw new Error("gh pr view returned output that is not JSON");
  }
}

/**
 * Runs the whole flow. Returns the process exit code (0 merged or all gates
 * passed in dry run, 1 refused, 2 usage error).
 */
export async function main(argv, deps = {}) {
  const run = deps.run ?? defaultRunner;
  const fs = deps.fs ?? defaultFs;
  const cwd = deps.cwd ?? process.cwd();
  const out = deps.out ?? ((text) => process.stdout.write(`${text}\n`));
  const err = deps.err ?? ((text) => process.stderr.write(`${text}\n`));

  const flags = argv.filter((arg) => arg.startsWith("-"));
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const unknown = flags.filter((flag) => flag !== "--execute");
  const execute = flags.includes("--execute");

  const number = positional.length === 1 ? parsePrNumber(positional[0]) : null;
  if (number === null || unknown.length > 0) {
    err("usage: node scripts/merge-pr.mjs <pr-number> [--execute]");
    err("<pr-number> must be a positive integer; --execute is the only flag.");
    return 2;
  }

  let pr;
  try {
    pr = await fetchPr(number, run, cwd);
  } catch (error) {
    err(`merge-pr: ${error.message}`);
    return 1;
  }
  if (pr.number !== number) {
    err(`merge-pr: asked for PR ${number} but gh returned ${pr.number}`);
    return 1;
  }

  const gates = evaluateStaticGates(pr);

  // Gate 6 needs a real, open PR to fetch; otherwise it is reported as skipped.
  const mergeGate = {
    id: "merge",
    label: "clean test-merge onto main",
    failures: [],
    notes: [],
  };
  if (pr.state === "OPEN") {
    const others = gates.some((gate) => gate.failures.length > 0);
    const result = await testMerge(pr, { run, fs, cwd, runTests: !others });
    mergeGate.failures = result.failures;
    mergeGate.notes = result.notes;
    const filesGate = gates.find((gate) => gate.id === "files");
    const known = new Set(filesGate.failures);
    for (const failure of checkFiles(result.changedFiles)) {
      if (!known.has(failure)) filesGate.failures.push(failure);
    }
  } else {
    mergeGate.failures.push("not tested: PR is not open");
  }
  gates.push(mergeGate);

  const failed = gates.filter((gate) => gate.failures.length > 0);
  out(`merge-pr: PR #${number} (${execute ? "execute" : "dry run"})`);
  out(formatGateTable(gates));

  if (failed.length > 0) {
    out(
      `REFUSED: ${failed.length} of ${gates.length} gates failed (${failed
        .map((gate) => gate.id)
        .join(", ")}).`,
    );
    return 1;
  }

  if (!execute) {
    out("All gates pass. Dry run: nothing merged. Re-run with --execute.");
    return 0;
  }

  const merge = await run(
    "gh",
    [
      "pr",
      "merge",
      String(number),
      "--squash",
      "--delete-branch",
      "--match-head-commit",
      pr.headRefOid,
    ],
    { cwd },
  );
  if (merge.code !== 0) {
    err(
      `merge-pr: gh pr merge failed: ${tail(merge.stderr || merge.stdout, 5)}`,
    );
    return 1;
  }
  out(`MERGED PR #${number} (squash, branch deleted).`);

  try {
    const view = await run(
      "gh",
      ["pr", "view", String(number), "--json", "mergeCommit"],
      { cwd },
    );
    const oid = JSON.parse(view.stdout)?.mergeCommit?.oid;
    out(`Merge commit: ${oid ?? "(not reported yet)"}`);
  } catch {
    out("Merge commit: (could not be read)");
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(
        `merge-pr: unexpected error: ${error?.stack ?? error}\n`,
      );
      process.exitCode = 1;
    },
  );
}
