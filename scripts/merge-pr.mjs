#!/usr/bin/env node
// scripts/merge-pr.mjs
//
// The single sanctioned way for an AI agent to merge a pull request.
// "Merge after green CI and review" is enforced here rather than trusted,
// because the ruleset on main has no required status checks.
//
//   node scripts/merge-pr.mjs <pr-number>             dry run (default)
//   node scripts/merge-pr.mjs <pr-number> --execute   merge if every gate passes
//   node scripts/merge-pr.mjs --help
//
// Gates (all are evaluated and reported, not just the first failure):
//   1  state    PR is OPEN, not a draft, and targets main
//   2  checks   every check on the head commit finished SUCCESS/NEUTRAL/SKIPPED
//   3  review   reviewDecision is not CHANGES_REQUESTED
//   4  record   body has exactly one "## Review record" with an approving
//               verdict and "Findings resolved: yes". Every Verdict line counts;
//               a Verdict line inside an indented code block, <details> or an
//               unclosed code fence fails the gate rather than being skipped.
//   4b audit    the reviewer's report pasted verbatim as a PR comment so the
//               review text survives on GitHub. Among the comments that contain
//               a "Verdict:" line, the LATEST (by createdAt) must have the value
//               exactly APPROVE or APPROVE WITH NITS (keyword case-insensitive,
//               value exact), and at least one such approving comment must be
//               200+ characters. A later REQUEST CHANGES comment refuses. The
//               PR author's own comments are NOT excluded: every agent acts as
//               the same GitHub account, so excluding them would block honest
//               use. A long filler comment with an approving Verdict line passes;
//               that is a documented limitation of a convention check.
//   5  files    no changed file is on the maintainer-only list, and no changed
//               path contains a control character (code < 0x20 or 0x7f), which
//               is refused outright. The list is checked against the `gh` file
//               list AND against git itself (the three-dot diff and the actual
//               merge result, NUL-delimited so non-ASCII paths cannot be hidden
//               by git's quoting). Maintainer-only: .github/**, .claude/**
//               (except .claude/css-baseline.sha256, which CSS PRs legitimately
//               change), CLAUDE.md, AGENTS.md, docs/CONDUCTOR.md,
//               docs/TEAM-CHARTER.md, docs/DECISIONS.md, .gitattributes,
//               .gitmodules, .npmrc files, .husky/**, the test/lint/lighthouse
//               configs, this script and its tests, supabase/**, CNAME,
//               LICENSE*, and the npm manifests and lockfiles. Anything that
//               steers agents or the pipeline is merged by a human.
//   6  merge    head merges cleanly onto current origin/main in a temporary
//               worktree; if head is behind main, `npm test` must also pass there
//               in a scrubbed environment (see Limits)
//
// WHAT THIS DOES NOT PROVE. Gates 4 and 4b are a CONVENTION check, not
// authentication. Anyone who can edit the PR body or post a comment can write a
// passing review record; the script cannot tell a real reviewer's report from an
// invented one. The audit-trail comment exists so a human can read the review
// text afterwards, not to prove who wrote it. The maintainer remains the
// control for anything that matters.
//
// TOCTOU. The PR body, comments, reviews, checks, file list and the base tip are
// read ONCE, at the start. `--match-head-commit` binds only the head commit.
// Just before merging, the head oid, state, draft flag, base, reviewDecision and
// checks are re-read and gates 1-3 re-run; any change refuses the merge. The
// body, comments, file list and base tip are NOT re-read, so an edit to them in
// the window between the read and the merge is not seen.
//
// Side effect on the caller's checkout. Gate 6 runs `git fetch origin main
// <branch>`, which updates the caller's `origin/main` and `origin/<branch>`
// remote-tracking refs. Nothing else in the caller's checkout is touched.
//
// Limits. `npm test` on the merged tree executes the PR's own test code on this
// machine. The worktree's node_modules is a symlink to the caller's, so that
// code can write to it. The environment handed to `npm test` is scrubbed to
// PATH, LANG, TERM, CI=1, NODE_ENV=test and a fresh, empty HOME and
// XDG_CONFIG_HOME (so GH_TOKEN, GITHUB_TOKEN, SSH_AUTH_SOCK, npm tokens and
// ~/.config/gh are not visible), but that is a mitigation, not a sandbox: it is
// still ordinary code running as this user.
//
// There is deliberately no override flag, and never --admin, --auto or --rebase.
//
// The gate functions below are pure (parsed JSON in, failure list out). All
// process, git and filesystem access goes through injected dependencies so the
// tests need no network.

import { spawn } from "node:child_process";
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
  "comments",
  "mergeStateStatus",
].join(",");

// Re-read immediately before merging; enough to re-run gates 1-3.
export const RECHECK_FIELDS = [
  "number",
  "state",
  "isDraft",
  "baseRefName",
  "headRefOid",
  "reviewDecision",
  "statusCheckRollup",
].join(",");

export const BASE_BRANCH = "main";

const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const APPROVING_VERDICTS = new Set(["APPROVE", "APPROVE WITH NITS"]);

export const AUDIT_MIN_LENGTH = 200;

export const SELF_ATTESTATION_NOTE =
  "Gates 4 and 4b are a convention check, not authentication: anyone who can edit the PR body or comment can write a passing review record. The audit-trail comment exists so a human can read the review afterwards.";

// Maintainer-only paths. Globs: `**` matches anything including `/`, `*` any
// run of characters within a path segment, and both match every character
// (newlines included). Matching is case-insensitive so a case-folding
// filesystem cannot be used to slip past a rule.
export const RESTRICTED_PATTERNS = [
  ".github/**",
  ".claude/**",
  "CLAUDE.md",
  "AGENTS.md",
  "docs/CONDUCTOR.md",
  "docs/TEAM-CHARTER.md",
  "docs/DECISIONS.md",
  ".gitattributes",
  ".gitmodules",
  ".npmrc",
  "playground/.npmrc",
  ".husky/**",
  "vitest.config.*",
  "tests/setup.js",
  "lighthouse-ci.config.json",
  "scripts/merge-pr.mjs",
  "tests/unit/merge-pr*.test.js",
  "supabase/**",
  "CNAME",
  "LICENSE*",
  "package.json",
  "package-lock.json",
  "playground/package.json",
  "playground/package-lock.json",
];

// Exact, case-sensitive carve-outs from the list above. CSS PRs legitimately
// change the baseline hash. Matched against the raw path, so a case variant or
// a Unicode look-alike is not excused.
export const RESTRICTED_EXCEPTIONS = [".claude/css-baseline.sha256"];

function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      source += "[\\s\\S]*";
      i += 1;
    } else if (ch === "*") {
      source += "[^/]*";
    } else {
      source += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "is");
}

const RESTRICTED_MATCHERS = RESTRICTED_PATTERNS.map((pattern) => ({
  pattern,
  regex: globToRegExp(pattern),
}));

function normalizePath(file) {
  return String(file)
    .normalize("NFKC")
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

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Splits a PR body into lines classified the way GitHub renders them.
 * Text inside HTML comments and inside closed code fences is blanked. Text
 * after a fence that is never closed is kept but flagged `unclosedFence`
 * (everything after an unclosed fence is inside the fence). Lines inside a
 * <details> element are flagged `inDetails`.
 */
function scanBody(body) {
  const raw = String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const lines = [];
  let fence = null;
  let inComment = false;
  let detailsDepth = 0;

  for (const original of raw) {
    if (fence) {
      const close = original.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (
        close &&
        close[1][0] === fence.char &&
        close[1].length >= fence.length
      ) {
        fence = null;
        lines.push({ text: "", unclosedFence: false, inDetails: false });
      } else {
        // Provisional: becomes "unclosed" if no closing fence ever arrives.
        lines.push({
          text: original,
          unclosedFence: true,
          inDetails: false,
          fenceBody: true,
        });
      }
      continue;
    }

    let rest = original;
    let visible = "";
    const startedInComment = inComment;
    for (;;) {
      if (inComment) {
        const end = rest.indexOf("-->");
        if (end === -1) break;
        rest = rest.slice(end + 3);
        inComment = false;
      }
      const open = rest.indexOf("<!--");
      if (open === -1) {
        visible += rest;
        break;
      }
      visible += rest.slice(0, open);
      rest = rest.slice(open + 4);
      inComment = true;
    }

    const opens = (visible.match(/<details[\s>]/gi) ?? []).length;
    const closes = (visible.match(/<\/details\s*>/gi) ?? []).length;
    const inDetails = detailsDepth > 0 || opens > 0;
    detailsDepth = Math.max(0, detailsDepth + opens - closes);

    const open = startedInComment ? null : visible.match(FENCE_OPEN);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { char: open[1][0], length: open[1].length };
      lines.push({ text: "", unclosedFence: false, inDetails });
      continue;
    }
    lines.push({ text: visible, unclosedFence: false, inDetails });
  }

  // Lines recorded inside a fence that did get closed are plain code: blank
  // them. Only the trailing run belonging to a still-open fence stays flagged.
  let lastFenceBody = lines.length;
  if (fence) {
    while (lastFenceBody > 0 && lines[lastFenceBody - 1].fenceBody) {
      lastFenceBody -= 1;
    }
  }
  lines.forEach((line, index) => {
    if (line.fenceBody && (!fence || index < lastFenceBody)) {
      line.text = "";
      line.unclosedFence = false;
    }
  });
  return lines;
}

const REVIEW_HEADING = /^ {0,3}##[ \t]+review record[ \t]*#*[ \t]*$/i;
const ANY_HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;

/**
 * Extracts the "## Review record" section as scanned lines, or null when
 * absent. Only the first heading counts; a second one is reported through
 * `ambiguous` so the gate can fail closed.
 */
export function extractReviewRecord(body) {
  const lines = scanBody(body);
  const isHeading = (line) =>
    !line.unclosedFence && REVIEW_HEADING.test(line.text);
  const start = lines.findIndex(isHeading);
  if (start === -1) return null;
  const ambiguous = lines.slice(start + 1).some(isHeading);
  const section = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!lines[i].unclosedFence && ANY_HEADING.test(lines[i].text)) break;
    section.push(lines[i]);
  }
  return { lines: section, ambiguous };
}

function describeHiding(line) {
  if (line.unclosedFence) return "an unclosed code fence";
  if (line.inDetails) return "a <details> block";
  if (/^(?: {4,}|\t)/.test(line.text)) return "an indented code block";
  return null;
}

/** Gate 4. */
export function checkReviewRecord(pr) {
  const record = extractReviewRecord(pr.body);
  if (record === null) return ['PR body has no "## Review record" section'];
  if (record.ambiguous) {
    return [
      'PR body has more than one "## Review record" heading (ambiguous); keep exactly one',
    ];
  }

  const failures = [];
  const keyed = (key, label) => {
    const values = [];
    for (const line of record.lines) {
      const match = line.text.match(
        new RegExp(`^[ \\t]*${key}:[ \\t]*(.*?)[ \\t]*$`, "i"),
      );
      if (!match) continue;
      const hiding = describeHiding(line);
      if (hiding) {
        failures.push(
          `${label} line is inside ${hiding}; write it as plain text in the Review record`,
        );
      } else {
        values.push(match[1]);
      }
    }
    return values;
  };

  const verdicts = keyed("verdict", "Verdict");
  const resolved = keyed("findings resolved", "Findings resolved");

  if (verdicts.length === 0) {
    if (failures.length === 0)
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

  if (resolved.length === 0) {
    if (!failures.some((f) => f.startsWith("Findings resolved line"))) {
      failures.push("Review record has no Findings resolved line");
    }
  } else if (!resolved.every((value) => value === "yes")) {
    failures.push(
      `Review record says "Findings resolved: ${resolved.find((v) => v !== "yes")}", need yes`,
    );
  }
  return failures;
}

const VERDICT_LINE = /^[ \t]*verdict:[ \t]*(\S.*?)[ \t]*$/gim;

/**
 * The comments that contain a Verdict line, oldest first. Each carries whether
 * every one of its Verdict lines is an approving value (a comment that lists a
 * second, non-approving verdict is not approving).
 */
function verdictComments(comments) {
  const found = [];
  comments.forEach((comment, index) => {
    const body = String(comment?.body ?? "").replace(/\r\n?/g, "\n");
    const values = [...body.matchAll(VERDICT_LINE)].map((m) => m[1]);
    if (values.length === 0) return;
    found.push({
      index,
      time: Date.parse(comment?.createdAt ?? ""),
      length: body.length,
      values,
      approving: values.every((value) => APPROVING_VERDICTS.has(value)),
    });
  });
  // gh lists comments oldest first. Sort by createdAt only when every verdict
  // comment has a usable timestamp; otherwise trust the list order.
  if (found.every((entry) => Number.isFinite(entry.time))) {
    found.sort((a, b) => a.time - b.time || a.index - b.index);
  }
  return found;
}

/**
 * Gate 4b. The reviewer's report must be pasted as a PR comment so the review
 * text outlives the PR description. Among comments with a Verdict line the
 * latest must approve, so a later REQUEST CHANGES comment refuses; and one
 * approving comment must be long enough to be a real report. Still a
 * convention check (see header).
 */
export function checkAuditTrail(pr) {
  const comments = Array.isArray(pr.comments) ? pr.comments : [];
  const verdicts = verdictComments(comments);

  const latest = verdicts.at(-1);
  if (latest && !latest.approving) {
    const bad = latest.values.find((value) => !APPROVING_VERDICTS.has(value));
    return [
      `the latest comment with a Verdict line says "${bad}", need APPROVE or APPROVE WITH NITS`,
    ];
  }
  const qualifies = verdicts.some(
    (entry) => entry.approving && entry.length >= AUDIT_MIN_LENGTH,
  );
  return qualifies
    ? []
    : [
        `no audit-trail comment (${comments.length} comment(s), none of ${AUDIT_MIN_LENGTH}+ characters with an approving "Verdict:" line): paste the reviewer's report as a PR comment (gh pr comment <n> --body-file ...)`,
      ];
}

/** Returns the maintainer-only pattern a path matches, or null. */
export function restrictedPatternFor(file) {
  if (RESTRICTED_EXCEPTIONS.includes(file)) return null;
  const normalized = normalizePath(file);
  const hit = RESTRICTED_MATCHERS.find(({ regex }) => regex.test(normalized));
  return hit ? hit.pattern : null;
}

// eslint-disable-next-line no-control-regex -- the point is to find them
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** Gate 5. Accepts the PR `files` array or a plain list of paths. */
export function checkFiles(files) {
  const failures = [];
  for (const entry of files ?? []) {
    const file = typeof entry === "string" ? entry : entry?.path;
    if (!file) continue;
    if (CONTROL_CHARACTER.test(file)) {
      failures.push(
        `path contains a control character: maintainer merges this one (${JSON.stringify(file)})`,
      );
    } else if (restrictedPatternFor(file)) {
      failures.push(`touches ${file}: maintainer merges this one`);
    }
  }
  return [...new Set(failures)];
}

/** Gates 1-5 (including 4b), the ones that need only the parsed `gh pr view` JSON. */
export function evaluateStaticGates(pr) {
  return [
    {
      id: "state",
      num: "1",
      label: "open, non-draft, base main",
      failures: checkState(pr),
    },
    {
      id: "checks",
      num: "2",
      label: "all checks green",
      failures: checkChecks(pr),
    },
    {
      id: "review",
      num: "3",
      label: "no changes requested",
      failures: checkReviewDecision(pr),
    },
    {
      id: "record",
      num: "4",
      label: "review record approves",
      failures: checkReviewRecord(pr),
    },
    {
      id: "audit",
      num: "4b",
      label: "reviewer report pasted as a comment",
      failures: checkAuditTrail(pr),
    },
    {
      id: "files",
      num: "5",
      label: "no maintainer-only files",
      failures: checkFiles(pr.files),
    },
  ];
}

export function formatGateTable(gates) {
  const lines = [];
  gates.forEach((gate, index) => {
    const status = gate.failures.length === 0 ? "PASS" : "FAIL";
    const num = `${gate.num ?? index + 1}.`;
    lines.push(
      `  ${status}  ${num.padEnd(3)} ${gate.id.padEnd(7)} ${gate.label}`,
    );
    for (const failure of gate.failures) lines.push(`          - ${failure}`);
    for (const note of gate.notes ?? []) lines.push(`          . ${note}`);
  });
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// I/O layer
// ---------------------------------------------------------------------------

const activeChildren = new Set();
const pendingCleanups = new Set();

function killTree(entry, signal) {
  try {
    if (entry.group && entry.child.pid) process.kill(-entry.child.pid, signal);
    else entry.child.kill(signal);
  } catch {
    // already gone
  }
}

/** Kills every child this process started (process groups where requested). */
export function killActiveChildren() {
  for (const entry of activeChildren) killTree(entry, "SIGKILL");
}

/** Registers an async cleanup for signal handlers; returns an unregister fn. */
export function registerCleanup(fn) {
  pendingCleanups.add(fn);
  return () => pendingCleanups.delete(fn);
}

export async function runPendingCleanups() {
  killActiveChildren();
  for (const fn of [...pendingCleanups]) {
    pendingCleanups.delete(fn);
    await Promise.resolve(fn()).catch(() => {});
  }
}

/**
 * On SIGHUP/SIGINT/SIGQUIT/SIGTERM kill the npm-test process group, remove the
 * temp worktree and dirs, then exit 128+n.
 */
export function installSignalHandlers(proc = process) {
  for (const [signal, code] of [
    ["SIGHUP", 129],
    ["SIGINT", 130],
    ["SIGQUIT", 131],
    ["SIGTERM", 143],
  ]) {
    proc.once(signal, async () => {
      await runPendingCleanups();
      proc.exit(code);
    });
  }
}

/**
 * Default runner: spawn with an args array, never a shell string. With
 * `killGroup` the child leads its own process group and a timeout (or a
 * signal to this process) kills the whole group, so `npm test` cannot leave
 * vitest workers running.
 */
export function defaultRunner(file, args, options = {}) {
  return new Promise((resolve) => {
    const limit = 64 * 1024 * 1024;
    const timeout = options.timeout ?? 120_000;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let entry = null;
    let timer = null;
    let grace = null;

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      if (entry) activeChildren.delete(entry);
      if (timedOut) {
        stderr += `\ntimed out after ${Math.round(timeout / 1000)}s and was killed`;
      }
      resolve({ code, stdout, stderr });
    };

    let child;
    try {
      child = spawn(file, args, {
        cwd: options.cwd,
        detached: Boolean(options.killGroup),
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      stderr = String(error?.message ?? error);
      finish(1);
      return;
    }
    entry = { child, group: Boolean(options.killGroup) };
    activeChildren.add(entry);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length < limit) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < limit) stderr += chunk;
    });
    child.on("error", (error) => {
      if (!stderr) stderr = String(error?.message ?? error);
      finish(1);
    });
    child.on("close", (code) => finish(timedOut ? 124 : (code ?? 1)));

    timer = setTimeout(() => {
      timedOut = true;
      killTree(entry, "SIGKILL");
      // If a grandchild outside the group still holds the pipes, do not hang.
      grace = setTimeout(() => finish(124), 2000);
    }, timeout);
  });
}

export const defaultFs = {
  mkdtemp: (prefix) => mkdtemp(path.join(tmpdir(), prefix)),
  symlink: (target, link) => symlink(target, link, "dir"),
  rm: (target) => rm(target, { recursive: true, force: true }),
};

/**
 * The only environment `npm test` on the merged tree gets: no tokens, no ssh
 * agent, no npm credentials, and a HOME with nothing in it. A mitigation, not
 * a sandbox (see Limits in the header).
 */
export function scrubbedEnv(home, base = process.env) {
  const env = { CI: "1", NODE_ENV: "test", HOME: home, XDG_CONFIG_HOME: home };
  for (const key of ["PATH", "LANG", "TERM"]) {
    if (base[key] !== undefined) env[key] = base[key];
  }
  return env;
}

const SAFE_REF = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;
const SAFE_OID = /^[0-9a-f]{40,64}$/i;

function tail(text, lines = 12) {
  return String(text ?? "")
    .trim()
    .split("\n")
    .slice(-lines)
    .join("\n");
}

// `-z` makes git emit raw NUL-terminated paths. Without it a non-ASCII name
// comes back quoted and octal-escaped (".github/workflows/d\303\251ploy.yml"),
// which no `^`-anchored matcher would recognise. `--no-renames` reports both
// sides of a rename, so moving a restricted file out of place is still seen.
const GIT_NAMES = ["-c", "core.quotepath=false"];
const NAME_FLAGS = ["--name-only", "--no-renames", "-z"];

function splitNul(stdout) {
  return String(stdout ?? "")
    .split("\0")
    .filter(Boolean);
}

/**
 * Gate 6. Merges the PR head onto current origin/main in a temporary
 * worktree. Never touches the caller's checkout. The worktree is always
 * removed, including on SIGINT/SIGTERM. `runTests` is false when earlier
 * gates already failed, to avoid a slow test run for a PR that will be
 * refused anyway.
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
    ...GIT_NAMES,
    "diff",
    ...NAME_FLAGS,
    `origin/${BASE_BRANCH}...${head}`,
  ]);
  if (diff.code !== 0) {
    result.failures.push(`git diff failed: ${tail(diff.stderr, 3)}`);
    return result;
  }
  const changed = new Set(splitNul(diff.stdout));

  const ancestor = await git([
    "merge-base",
    "--is-ancestor",
    `origin/${BASE_BRANCH}`,
    head,
  ]);
  if (ancestor.code !== 0 && ancestor.code !== 1) {
    result.changedFiles = [...changed];
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
  let cleaned = false;
  let unregister = () => {};
  const cleanup = async () => {
    if (cleaned || !worktree) return;
    cleaned = true;
    await git(["worktree", "remove", "--force", worktree]).catch(() => {});
    await fs.rm(worktree).catch(() => {});
    await git(["worktree", "prune"]).catch(() => {});
  };
  try {
    const top = await git(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) {
      result.failures.push("not inside a git checkout");
      return result;
    }
    const root = top.stdout.trim();

    worktree = await fs.mkdtemp("merge-pr-");
    unregister = registerCleanup(cleanup);
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

    // The files the merge result actually changes relative to main, unioned
    // with the three-dot diff above.
    const mergeDiff = await run(
      "git",
      [
        ...GIT_NAMES,
        "diff",
        "--cached",
        ...NAME_FLAGS,
        `origin/${BASE_BRANCH}`,
      ],
      { cwd: worktree },
    );
    if (mergeDiff.code !== 0) {
      result.failures.push(
        `git diff of the merge result failed: ${tail(mergeDiff.stderr, 3)}`,
      );
      return result;
    }
    for (const file of splitNul(mergeDiff.stdout)) changed.add(file);

    if (behind) {
      if (!runTests) {
        result.notes.push("npm test skipped: other gates already failed");
      } else {
        await fs.symlink(
          path.join(root, "node_modules"),
          path.join(worktree, "node_modules"),
        );
        const home = await fs.mkdtemp("merge-pr-home-");
        const dropHome = registerCleanup(() => fs.rm(home));
        let tests;
        try {
          tests = await run("npm", ["test"], {
            cwd: worktree,
            timeout: 600_000,
            killGroup: true,
            env: scrubbedEnv(home),
          });
        } finally {
          await fs.rm(home).catch(() => {});
          dropHome();
        }
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
    result.changedFiles = [...changed];
    await cleanup();
    unregister();
  }
  return result;
}

async function fetchPr(number, run, cwd, fields = PR_FIELDS) {
  const res = await run(
    "gh",
    ["pr", "view", String(number), "--json", fields],
    {
      cwd,
    },
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

export const USAGE = [
  "usage: node scripts/merge-pr.mjs <pr-number> [--execute]",
  "       node scripts/merge-pr.mjs --help",
  "",
  "Dry run by default: evaluates every gate and prints a table. --execute",
  "squash-merges (and deletes the branch) only when every gate passes.",
  "",
  "  1  state    open, not a draft, base main",
  "  2  checks   every check on the head commit green",
  "  3  review   no CHANGES_REQUESTED review decision",
  "  4  record   exactly one '## Review record': Verdict APPROVE or APPROVE WITH",
  "              NITS (every Verdict line), 'Findings resolved: yes'",
  "  4b audit    the latest PR comment with a 'Verdict:' line must be exactly",
  "              APPROVE or APPROVE WITH NITS (a later REQUEST CHANGES refuses),",
  "              and one approving comment must be 200+ characters (the",
  "              reviewer's report pasted verbatim); author comments count",
  "  5  files    no maintainer-only file (agent instructions, .claude/** except",
  "              css-baseline.sha256, CI, manifests...) and no path with a",
  "              control character; checked against gh and against git",
  "  6  merge    clean test-merge onto origin/main (updates origin/main and",
  "              origin/<branch> remote-tracking refs); npm test, with a",
  "              scrubbed environment, if head is behind. Limits: PR test code",
  "              still runs here; the scrub is a mitigation, not a sandbox",
  "",
  `NOTE: ${SELF_ATTESTATION_NOTE}`,
  "There is no override flag; --admin, --auto and --rebase are never used.",
].join("\n");

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

  if (argv.includes("--help") || argv.includes("-h")) {
    out(USAGE);
    return 0;
  }

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
    num: "6",
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
    out(`Note: ${SELF_ATTESTATION_NOTE}`);
    return 1;
  }

  if (!execute) {
    out("All gates pass. Dry run: nothing merged. Re-run with --execute.");
    return 0;
  }

  // The body, comments, file list and base tip are read once (see header).
  // Re-read what can still change cheaply and re-run gates 1-3 before merging.
  let fresh;
  try {
    fresh = await fetchPr(number, run, cwd, RECHECK_FIELDS);
  } catch (error) {
    err(`merge-pr: could not re-read the PR before merging: ${error.message}`);
    return 1;
  }
  const changes = [
    ...(fresh.headRefOid === pr.headRefOid
      ? []
      : [
          `head moved from ${String(pr.headRefOid).slice(0, 7)} to ${String(fresh.headRefOid).slice(0, 7)}`,
        ]),
    ...checkState(fresh),
    ...checkChecks(fresh),
    ...checkReviewDecision(fresh),
  ];
  if (changes.length > 0) {
    out("REFUSED: the PR changed between the first read and the merge:");
    for (const change of changes) out(`          - ${change}`);
    return 1;
  }

  // Run gh from the repository root (not a subdirectory, never the temporary
  // worktree, which is already gone) and warn when gh would move the checkout.
  const top = await run("git", ["rev-parse", "--show-toplevel"], { cwd });
  const root = top.code === 0 && top.stdout.trim() ? top.stdout.trim() : cwd;
  const current = await run("git", ["branch", "--show-current"], { cwd: root });
  if (current.code === 0 && current.stdout.trim() === pr.headRefName) {
    err(
      `merge-pr: warning: this checkout is on ${pr.headRefName}. gh pr merge --delete-branch will switch it to ${BASE_BRANCH} and delete the local branch.`,
    );
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
    { cwd: root },
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
      { cwd: root },
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
  installSignalHandlers();
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
