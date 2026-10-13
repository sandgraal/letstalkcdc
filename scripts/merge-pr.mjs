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
//               a Verdict, the LATEST (by createdAt) must itself be an approval
//               (exactly APPROVE or APPROVE WITH NITS, keyword case-insensitive,
//               value exact) AND be at least 200 characters, so a re-approval
//               after a block has to carry a report; a short "Verdict: APPROVE"
//               after a block does not pass on the strength of an older long
//               one. A later REQUEST CHANGES comment refuses. Lines are
//               normalised first (NFKC, so NBSP and the full-width colon fold
//               to ASCII; invisible format characters dropped; leading `>`, `#`,
//               `*`, `-`, `+`, backticks, `_`, `~`, `|` and "1." list markers
//               stripped) and the gate FAILS CLOSED: any line that contains the
//               word "verdict" (case-insensitive) and does not parse to an exact
//               approving value counts as a non-approving verdict for its
//               comment. That covers `**Verdict: REQUEST CHANGES**`,
//               `## Verdict: ...`, list items, backtick spans, `Verdict - ...`,
//               a value on the next line, and prose such as "my verdict is".
//               Decoration around the VALUE (`**Verdict: APPROVE**`, backticks)
//               still approves; anything before the word Verdict other than
//               decoration (an emoji, "Final", HTML tags) does not. A quoted
//               line (`> Verdict: ...`) is ignored for APPROVAL (quoting an old
//               approval into a new comment approves nothing) but a quoted
//               non-approving verdict still blocks. Corollaries: an approving
//               report must not use the word "verdict" anywhere else, and a
//               comment that quotes an old block and then approves is refused;
//               post a fresh comment. A PR with 100 or more comments is refused
//               ("too many comments to audit"): `gh pr view --json comments`
//               may return only the first 100, so the newest could be unseen.
//               The PR author's own comments are NOT excluded: every agent acts
//               as the same GitHub account, so excluding them would block honest
//               use. A long filler comment with an approving Verdict line passes;
//               that is a documented limitation of a convention check.
//   5  files    no changed file is on the maintainer-only list, and no changed
//               path contains a control character (code < 0x20 or 0x7f), which
//               is refused outright. The list is checked against the `gh` file
//               list AND against git itself (the three-dot diff and the actual
//               merge result, NUL-delimited so non-ASCII paths cannot be hidden
//               by git's quoting). Maintainer-only: .github/**, .claude/**
//               (except .claude/css-baseline.sha256, which CSS PRs legitimately
//               change, and only as a regular file: git must show mode 100644
//               on both sides of the merge-result diff, or 000000 before for a
//               new file, so a symlink or executable bit is refused),
//               CLAUDE.md / AGENTS.md / CLAUDE.local.md / .mcp.json /
//               .gitattributes / .gitmodules / .npmrc at ANY depth,
//               docs/CONDUCTOR.md, docs/TEAM-CHARTER.md, docs/DECISIONS.md,
//               .husky/**, .vscode/**, .devcontainer/**, the test/lint/
//               lighthouse configs, this script and its tests, supabase/**,
//               CNAME, LICENSE*, and the playground's npm manifest and lockfile.
//               Released to agents on 2026-10-12: the root package.json and
//               package-lock.json, and regular files under .claude/commands/
//               and .claude/scripts/ (a symlink or submodule there is refused).
//               Inside those two directories CLAUDE.md, CLAUDE.local.md,
//               AGENTS.md, .mcp.json, .gitattributes, .gitmodules, .npmrc,
//               .env*, settings.json, settings.local.json and any dotfile or
//               dot-directory (any depth, case-insensitive) stay restricted.
//               package.json defines the `merge-pr` and `test` scripts this gate
//               trusts, so a PR whose package.json `scripts` object (parsed
//               JSON, origin/main vs the merge result) differs fails gate 5
//               ("package.json scripts changed"), as does a package.json git
//               cannot show or parse; --maintainer-approved clears it.
//               Anything that steers agents or the pipeline is merged by a
//               human.
//   6  merge    head merges cleanly onto current origin/main in a temporary
//               worktree; if head is behind main, `npm test` must also pass there
//               in a scrubbed environment (see Limits). At the start, stale
//               merge-pr-* and merge-pr-home-* temp dirs older than 24 h (left
//               by a SIGKILL) are removed and `git worktree prune` is run;
//               anything younger is never touched (another run may own it)
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
// the window between the read and the merge is not seen: a blocking comment
// posted after the first read does not stop this run.
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
// Also not seen: formatted prose that never uses the word "verdict" (a later
// comment saying only "blocking issues, do not merge" is missed), and a
// homoglyph spelling of the word (Cyrillic i in "verdict"). A directory name
// holding Unicode-invisible characters is a DIFFERENT directory, not an alias,
// on Linux where GitHub merges; paths are matched after NFKC and are not
// stripped of invisible characters, so such a name does not hit a restricted
// rule (it also does not take effect as that directory). Comments are assumed
// to be capped at 100 by `gh pr view --json comments`; 100 or more is refused.
//
// The one override is `--maintainer-approved "<text>"` (2026-10-12, see
// docs/DECISIONS.md): it turns a gate 5 FAIL into a PASS with a visible note and
// bypasses nothing else. It is an HONOUR-SYSTEM record, not authentication: the
// script cannot tell whether the maintainer really said it. The conductor may
// pass it only after the maintainer's own chat message says to merge that PR.
// When (and only when) it actually overrode a gate 5 failure, the text
// (control characters removed, 200 characters) is also written into the
// squash-merge commit body after "Maintainer approval (recorded by the
// conductor, honour system): " so the record outlives the terminal output. The
// script passes no other body, so this record is the whole body (`--body`
// replaces gh's default message); with nothing overridden no body is passed.
// There is no other override, and never --admin, --auto or --rebase.
//
// Dependabot lane (same decision): a PR whose author (read from
// `gh pr view --json author`, never the title alone) is Dependabot, whose title
// is `Bump <pkg> from <a> to <b>` or `Bump the <group> group ...` with every
// per-package bump listed in the body, whose bumps are all patch or minor
// (plain major.minor.patch), and whose changed files are only the root
// package.json and package-lock.json, is exempt from gates 4 and 4b. Gates
// 1, 2, 3, 5 and 6 still apply; so does everything for GitHub Actions bumps
// (they touch .github/). Any failure below voids the lane with a
// `dependabot lane refused:` note and gates 4 and 4b then apply in full:
//   - author.is_bot must be exactly true (missing is refused);
//   - every commit on the PR (`gh pr view --json commits`) must be authored by
//     dependabot[bot] / app/dependabot; a missing, empty or 100-commit list, or
//     one that does not end at the head commit, is refused;
//   - the lockfile of the merge result (`git show :package-lock.json`), parsed
//     as JSON, must be lockfileVersion 2 or 3 and every entry in `packages`
//     and `dependencies` (recursively) must have a `resolved` that starts with
//     https://registry.npmjs.org/ (an entry with none, such as the root, is
//     fine), no `link: true`, and no version or dependency spec that is a
//     file:, git, github:, http: or npm: spec or contains `://` or a `/`; a
//     lockfile that does not parse is refused. No added line of the patch
//     (`git diff --no-renames origin/main...<head> -- package-lock.json
//     package.json`) may contain a backslash;
//   - package.json, parsed, may differ from main only in version,
//     dependencies, devDependencies, optionalDependencies and
//     peerDependencies; scripts, bin, overrides, engines, main, exports and
//     every other key must be deep-equal. In those four maps the key sets must
//     be identical (nothing added, removed or renamed), every changed value
//     must be a plain [^~]major.minor.patch, and the packages whose value
//     changed must be a non-empty subset of the packages the PR title (or a
//     group PR's body) names;
//   - the manifests must actually have been inspected (fail closed).
// What this does NOT do: it does not verify that a published package version is
// benign (a compromised release served from the real registry passes, and so
// does a malicious package that is a legitimate-looking bump of a named
// dependency), and it cannot prove a commit's author is really Dependabot (a
// commit author is a claim in the commit). Checks, the test-merge and the
// reviewer of the dependency itself remain the controls.
//
// Branch cleanup. `--delete-branch` deletes the REMOTE branch, which is the
// part that matters. gh also tries to delete the LOCAL branch and fails when a
// git worktree still holds it ("failed to delete local branch"), exiting
// non-zero although GitHub has merged. So after any non-zero `gh pr merge` this
// script re-reads the PR (`state,mergedAt,mergeCommit,headRefOid`): MERGED with
// a merge commit AND a head equal to the one the gates evaluated (the value
// given to `--match-head-commit`) is reported as success with gh's message
// (exit 0); anything else, including a failed re-read or a different head, is
// a failure (exit 1). The merge is never retried. A worktree-held local branch
// is left in place: remove the worktree (`bash scripts/worktree-prune.sh` does
// this for merged work, but it leaves branches) and then delete the leftover
// local branch by hand with `git branch -D <name>`.
//
// The gate functions below are pure (parsed JSON in, failure list out). All
// process, git and filesystem access goes through injected dependencies so the
// tests need no network.

import { spawn } from "node:child_process";
import { lstat, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const PR_FIELDS = [
  "number",
  "title",
  "author",
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
  "commits",
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
  "**/CLAUDE.md",
  "CLAUDE.local.md",
  "**/CLAUDE.local.md",
  "AGENTS.md",
  "**/AGENTS.md",
  ".mcp.json",
  "**/.mcp.json",
  ".vscode/**",
  ".devcontainer/**",
  "docs/CONDUCTOR.md",
  "docs/TEAM-CHARTER.md",
  "docs/DECISIONS.md",
  ".gitattributes",
  "**/.gitattributes",
  ".gitmodules",
  "**/.gitmodules",
  ".npmrc",
  "**/.npmrc",
  ".husky/**",
  "vitest.config.*",
  "tests/setup.js",
  "lighthouse-ci.config.json",
  "scripts/merge-pr.mjs",
  "tests/unit/merge-pr*.test.js",
  "supabase/**",
  "CNAME",
  "LICENSE*",
  "playground/package.json",
  "playground/package-lock.json",
];

// Exact, case-sensitive carve-outs from the list above. CSS PRs legitimately
// change the baseline hash. Matched against the raw path, so a case variant or
// a Unicode look-alike is not excused.
export const RESTRICTED_EXCEPTIONS = [".claude/css-baseline.sha256"];

// Directories under .claude/** that the maintainer released to agents
// (2026-10-12, docs/DECISIONS.md): slash commands and helper scripts. Same
// rules as the exact exceptions: matched against the raw, case-sensitive path
// (so `.Claude/commands/x` and `.claude/commands/../settings.json` are not
// excused), and gate 6 refuses a symlink or submodule at such a path. Unlike
// the css-baseline exception, a script may be executable (100755) and a file
// may be deleted. `.claude/hooks/`, settings, agents, rules and skills stay
// restricted.
export const RESTRICTED_EXCEPTION_PREFIXES = [
  ".claude/commands/",
  ".claude/scripts/",
];

// Inside the released directories these still steer agents, git or the
// package manager, so they stay maintainer-only (F2, 2026-10-12 review).
// Compared on the lower-cased name of every path segment below the prefix.
const RELEASED_DIR_DENY_NAMES = new Set([
  "claude.md",
  "claude.local.md",
  "agents.md",
  ".mcp.json",
  ".gitattributes",
  ".gitmodules",
  ".npmrc",
  "settings.json",
  "settings.local.json",
]);

/** True for a name that stays restricted inside a released directory. */
function isDeniedInReleasedDir(segment) {
  const name = segment.toLowerCase();
  // Any dotfile or dot-directory (this covers .env*, .mcp.json, .npmrc ...).
  return name.startsWith(".") || RELEASED_DIR_DENY_NAMES.has(name);
}

/**
 * True for a path under one of RESTRICTED_EXCEPTION_PREFIXES, spelled plainly,
 * and not an instruction or config file: CLAUDE.md, CLAUDE.local.md, AGENTS.md,
 * .mcp.json, .gitattributes, .gitmodules, .npmrc, .env*, settings.json,
 * settings.local.json or any dotfile (at any depth, case-insensitive) stay
 * restricted.
 */
export function isPrefixException(file) {
  if (typeof file !== "string") return false;
  const prefix = RESTRICTED_EXCEPTION_PREFIXES.find((p) => file.startsWith(p));
  if (!prefix || file.length === prefix.length) return false;
  if (normalizePath(file) !== file) return false;
  const segments = file.slice(prefix.length).split("/");
  return !segments.some(
    (seg) =>
      seg === "" || seg === "." || seg === ".." || isDeniedInReleasedDir(seg),
  );
}

function isException(file) {
  return RESTRICTED_EXCEPTIONS.includes(file) || isPrefixException(file);
}

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

const LINE_BREAKS = /\r\n?|[\n\v\f\u0085\u2028\u2029]/;
// Markdown decoration that may precede the word Verdict: indentation, quote
// markers, heading hashes, emphasis, list bullets, code ticks, "1." markers.
const LEADING_DECORATION = /^(?:[ \t]+|[>#*+\-_`~|]+|\d+[.)](?=[ \t]))/;
const VERDICT_VALUE = /^verdict[*_`~ \t]*:[ \t*_`~]*(.*?)[ \t*_`~]*$/i;

/**
 * Reads one comment line. Returns null when the line never mentions the word
 * "verdict". Otherwise {quoted, approving, value}: `approving` only for an exact
 * "Verdict: APPROVE" / "Verdict: APPROVE WITH NITS" (decoration around the line
 * and the value allowed); every other line that mentions the word, including
 * ones this parser cannot make sense of, is non-approving (fail closed).
 */
export function readVerdictLine(line) {
  let rest = String(line)
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{Zs}\t]/gu, " ");
  if (!/verdict/i.test(rest)) return null;
  let quoted = false;
  for (let m = rest.match(LEADING_DECORATION); m;) {
    if (m[0].includes(">")) quoted = true;
    rest = rest.slice(m[0].length);
    m = rest.match(LEADING_DECORATION);
  }
  const parsed = rest.match(VERDICT_VALUE);
  const value = parsed ? parsed[1] : null;
  return {
    quoted,
    approving: value !== null && APPROVING_VERDICTS.has(value),
    value: (value ?? rest).trim().replace(/\s+/g, " ").slice(0, 80),
  };
}

/**
 * The comments that mention a verdict, oldest first. A comment is approving only
 * when it has at least one unquoted approving line and no non-approving line
 * (quoted or not). A comment whose only verdict lines are quoted approvals
 * mentions no verdict of its own and is skipped.
 */
function verdictComments(comments) {
  const found = [];
  comments.forEach((comment, index) => {
    const body = String(comment?.body ?? "");
    const lines = body.split(LINE_BREAKS).map(readVerdictLine).filter(Boolean);
    const blocking = lines.filter((entry) => !entry.approving);
    const approvals = lines.filter((entry) => entry.approving && !entry.quoted);
    if (blocking.length === 0 && approvals.length === 0) return;
    found.push({
      index,
      time: Date.parse(comment?.createdAt ?? ""),
      length: body.replace(/\r\n?/g, "\n").length,
      bad: blocking[0]?.value,
      approving: blocking.length === 0,
    });
  });
  // gh lists comments oldest first. Sort by createdAt only when every verdict
  // comment has a usable timestamp; otherwise trust the list order.
  if (found.every((entry) => Number.isFinite(entry.time))) {
    found.sort((a, b) => a.time - b.time || a.index - b.index);
  }
  return found;
}

// `gh pr view --json comments` may return only the first 100 comments.
export const COMMENT_CAP = 100;

/**
 * Gate 4b. The reviewer's report must be pasted as a PR comment so the review
 * text outlives the PR description. Among comments that mention a verdict the
 * latest must itself approve and be long enough to be a real report, so a later
 * REQUEST CHANGES refuses and a short re-approval after a block does not ride on
 * an older long approval. Still a convention check (see header).
 */
export function checkAuditTrail(pr) {
  const comments = Array.isArray(pr.comments) ? pr.comments : [];
  if (comments.length >= COMMENT_CAP) {
    return [
      `too many comments to audit (${comments.length}; gh may return only the first ${COMMENT_CAP}): maintainer merges this one`,
    ];
  }
  const latest = verdictComments(comments).at(-1);
  if (latest && !latest.approving) {
    return [
      `the latest comment with a Verdict line says "${latest.bad}", need APPROVE or APPROVE WITH NITS`,
    ];
  }
  if (latest && latest.length >= AUDIT_MIN_LENGTH) return [];
  const why = latest
    ? `the latest Verdict comment is ${latest.length} characters; a re-approval must carry the report`
    : `${comments.length} comment(s), none with an approving "Verdict:" line`;
  return [
    `no audit-trail comment (${why}; need an approving "Verdict:" comment of ${AUDIT_MIN_LENGTH}+ characters as the latest): paste the reviewer's report as a PR comment (gh pr comment <n> --body-file ...)`,
  ];
}

/** Returns the maintainer-only pattern a path matches, or null. */
export function restrictedPatternFor(file) {
  if (isException(file)) return null;
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

// ---------------------------------------------------------------------------
// Dependabot lane
// ---------------------------------------------------------------------------

// The maintainer approved this lane in chat on 2026-10-12 (docs/DECISIONS.md).
// `gh pr view --json author` reports the bot as "app/dependabot"; the REST API
// spells it "dependabot[bot]". Neither string can be a human login (a login
// has no `/` or brackets), so an exact match is a real author check.
const DEPENDABOT_LOGINS = new Set(["dependabot[bot]", "app/dependabot"]);
export const DEPENDABOT_FILES = ["package.json", "package-lock.json"];
// `gh pr view --json commits` returns at most the first 100 commits.
export const COMMIT_CAP = 100;
// The only registry a lockfile `"resolved"` URL may point at on this lane.
export const REGISTRY_PREFIX = "https://registry.npmjs.org/";
// The only package.json keys a Dependabot PR may change. Everything else
// (scripts, bin, overrides, engines, main, exports, config ...) must be
// deep-equal to main, so a bump cannot smuggle in an install script or a
// changed entry point.
export const DEPENDABOT_MANIFEST_KEYS = new Set([
  "version",
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;
const BUMP_TITLE =
  /^(?:[a-z]+(?:\([^)]*\))?!?:[ \t]*)?bump[ \t]+(\S+)[ \t]+from[ \t]+(\S+)[ \t]+to[ \t]+(\S+)(?:[ \t]+in[ \t]+.+)?$/i;
const GROUP_TITLE =
  /^(?:[a-z]+(?:\([^)]*\))?!?:[ \t]*)?bump[ \t]+the[ \t]+\S+[ \t]+group\b/i;
// "Updates `pkg` from 1.2.3 to 1.2.4" in a Dependabot group PR body.
const BODY_UPDATE = /^Updates `([^`\n]+)` from (\S+) to (\S+?)\.?[ \t]*$/gm;

/**
 * Compares two versions. Returns null when the bump is a patch or minor
 * increase, otherwise the reason it is not acceptable.
 */
export function bumpProblem(name, from, to) {
  const a = SEMVER.exec(from);
  const b = SEMVER.exec(to);
  if (!a || !b) {
    return `${name} ${from} -> ${to}: not a plain major.minor.patch version (pre-release or unparseable)`;
  }
  const [, aMajor, aMinor, aPatch] = a.map(Number);
  const [, bMajor, bMinor, bPatch] = b.map(Number);
  if (aMajor !== bMajor) {
    return `${name} ${from} -> ${to}: a major version change`;
  }
  const up = bMinor > aMinor || (bMinor === aMinor && bPatch > aPatch);
  if (!up) return `${name} ${from} -> ${to}: not an increase`;
  return null;
}

/**
 * Every commit on the PR must be authored by Dependabot (the PR author alone
 * proves nothing about commits pushed onto the branch afterwards). Fails
 * closed: a missing, empty or possibly truncated list, or a list that does not
 * end at the head commit, is a problem.
 */
export function dependabotCommitProblems(pr) {
  const commits = pr.commits;
  if (!Array.isArray(commits) || commits.length === 0) {
    return ["commit authors are missing from the PR data"];
  }
  if (commits.length >= COMMIT_CAP) {
    return [
      `too many commits to check authors (${commits.length}; gh may return only the first ${COMMIT_CAP})`,
    ];
  }
  if (!pr.headRefOid || commits.at(-1)?.oid !== pr.headRefOid) {
    return [
      "the commit list does not end at the head commit (stale or truncated)",
    ];
  }
  const others = new Set();
  for (const commit of commits) {
    const authors = commit?.authors;
    if (!Array.isArray(authors) || authors.length === 0) {
      others.add("(no author)");
      continue;
    }
    for (const author of authors) {
      if (!DEPENDABOT_LOGINS.has(author?.login)) {
        others.add(JSON.stringify(String(author?.login ?? "(no login)")));
      }
    }
  }
  return others.size === 0
    ? []
    : [
        `a commit on the PR is not authored by dependabot (${[...others].slice(0, 5).join(", ")})`,
      ];
}

/**
 * Raw-text check of the `package-lock.json` / `package.json` patch (`git diff
 * --no-renames origin/main...<head> -- package-lock.json package.json`): no
 * added line may contain a backslash. The real check of where packages come
 * from is `lockfileProblems`, which parses the JSON; this stays because a JSON
 * escape (`"resolved"`) is invisible to a reader of the patch.
 */
export function lockfilePatchProblems(patch) {
  const problems = [];
  for (const line of String(patch ?? "").split("\n")) {
    if (!line.startsWith("+")) continue;
    if (/^\+\+\+ (?:b\/package(?:-lock)?\.json|\/dev\/null)$/.test(line)) {
      continue;
    }
    if (line.includes("\\")) {
      problems.push(
        `an added line of the lockfile patch contains a backslash: ${line.slice(0, 120)}`,
      );
    }
  }
  return [...new Set(problems)].slice(0, 5);
}

const LOCK_DEPENDENCY_MAPS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "requires",
];
// Allowlists, not denylists: a non-root entry's `version` must be a plain
// registry version, and a dependency or `requires` spec must be a semver range
// or a dist-tag word. Everything else (links, aliases, gist:/file:/workspace:/
// git specs, tarball names, owner/repo) is refused by not matching.
const LOCK_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SPEC_CHARS = /^[0-9A-Za-z.\-+^~<>=| *xX]+$/;
// One whitespace-separated piece of a range: a comparator, a (partial)
// version or wildcard, or the `-` of a hyphen range.
const SPEC_TOKEN =
  /^(?:-|[<>=^~]+|[<>=^~]*v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*]))*(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
// A dist-tag such as `latest`: npm records it in a lock entry's dependency
// maps, and it resolves through the registry. It has no `:`, `/`, `@` or `\`.
const SPEC_TAG = /^[A-Za-z][A-Za-z0-9._-]*$/;
// A bare file name is a tag by shape, so archive names are refused by suffix.
const ARCHIVE_SUFFIX = /\.(?:tgz|tar|tar\.gz)$/i;

function isSemverRange(spec) {
  if (!SPEC_CHARS.test(spec)) return false;
  return spec.split("||").every((alternative) => {
    const tokens = alternative.split(/ +/).filter(Boolean);
    return tokens.length > 0 && tokens.every((t) => SPEC_TOKEN.test(t));
  });
}

function lockSpecProblem(spec) {
  if (typeof spec !== "string") return "is not a string";
  if (isSemverRange(spec)) return null;
  if (SPEC_TAG.test(spec) && !ARCHIVE_SUFFIX.test(spec)) return null;
  return "is not a semver range or a dist-tag";
}

/**
 * Checks a parsed lockfile entry (a `packages` value, or a v1-style
 * `dependencies` value, which nests). `where` names it in a problem.
 */
function lockEntryProblems(where, entry, problems, depth = 0, root = false) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    problems.push(`${where} is not an object`);
    return;
  }
  if (depth > 64) {
    problems.push(`${where} nests too deeply`);
    return;
  }
  if (entry.link === true) problems.push(`${where} is a link (link: true)`);
  if (entry.resolved !== undefined) {
    const resolved = entry.resolved;
    if (
      typeof resolved !== "string" ||
      !resolved.startsWith(REGISTRY_PREFIX) ||
      resolved.slice(REGISTRY_PREFIX.length).includes("://") ||
      resolved.includes("\\")
    ) {
      problems.push(
        `${where} resolves outside ${REGISTRY_PREFIX}: ${JSON.stringify(resolved)?.slice(0, 100)}`,
      );
    }
  }
  if (entry.version !== undefined && !root) {
    const version = entry.version;
    if (typeof version !== "string" || !LOCK_VERSION.test(version)) {
      problems.push(
        `${where} has a version that is not a registry version: ${JSON.stringify(version)?.slice(0, 100)}`,
      );
    }
  }
  for (const key of LOCK_DEPENDENCY_MAPS) {
    const map = entry[key];
    if (map === undefined) continue;
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      problems.push(`${where} ${key} is not an object`);
      continue;
    }
    for (const [name, value] of Object.entries(map)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // The v1 `dependencies` tree: each value is itself an entry.
        lockEntryProblems(`${where} > ${name}`, value, problems, depth + 1);
      } else {
        const why = lockSpecProblem(value);
        if (why) {
          problems.push(
            `${where} ${key}.${name} ${why}: ${JSON.stringify(value)?.slice(0, 100)}`,
          );
        }
      }
    }
  }
}

/**
 * Parses the lockfile of the merge result and refuses anything that could
 * fetch code from somewhere other than the npm registry. Fails closed: text
 * that does not parse, or a lockfileVersion other than 2 or 3, is a problem.
 * An entry with no `resolved` (the workspace root `""`) is fine.
 */
export function lockfileProblems(text) {
  let lock;
  try {
    lock = JSON.parse(String(text ?? ""));
  } catch {
    return ["package-lock.json is not valid JSON after the merge"];
  }
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    return ["package-lock.json is not a JSON object"];
  }
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
    return [
      `package-lock.json lockfileVersion is ${JSON.stringify(lock.lockfileVersion)}, not 2 or 3`,
    ];
  }
  const problems = [];
  const packages = lock.packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages)) {
    problems.push("package-lock.json has no packages object");
  } else {
    for (const [key, entry] of Object.entries(packages)) {
      lockEntryProblems(
        `packages[${JSON.stringify(key)}]`,
        entry,
        problems,
        0,
        key === "",
      );
    }
  }
  if (lock.dependencies !== undefined) {
    const tree = lock.dependencies;
    if (!tree || typeof tree !== "object" || Array.isArray(tree)) {
      problems.push("package-lock.json dependencies is not an object");
    } else {
      for (const [name, entry] of Object.entries(tree)) {
        lockEntryProblems(
          `dependencies[${JSON.stringify(name)}]`,
          entry,
          problems,
        );
      }
    }
  }
  return [...new Set(problems)].slice(0, 5);
}

export const DEPENDENCY_MAPS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
// What a changed dependency value in package.json must look like: no tag, URL,
// alias, path, range with `||` or comparator.
export const PLAIN_DEPENDENCY_VERSION = /^[\^~]?\d+\.\d+\.\d+$/;

/**
 * Compares the four dependency maps of package.json on main and in the merge
 * result. Returns `{ problems, changed }`: `changed` is the list (sorted by
 * name) of `{ name, from, to }` for every package whose value differs, with
 * the raw values; `problems` lists every key added, removed or
 * renamed, and every changed value that is not a plain [^~]major.minor.patch.
 * Unreadable input is a problem (fail closed).
 */
export function dependencyMapChanges(baseText, headText) {
  const base = parseManifest(baseText);
  const head = parseManifest(headText);
  if (!base || !head) {
    return {
      problems: ["package.json could not be read to compare dependencies"],
      changed: [],
    };
  }
  const problems = [];
  const changed = [];
  const isMap = (value) =>
    value && typeof value === "object" && !Array.isArray(value);
  for (const map of DEPENDENCY_MAPS) {
    const from = base[map] ?? {};
    const to = head[map] ?? {};
    if (!isMap(from) || !isMap(to)) {
      problems.push(`package.json ${map} is not an object`);
      continue;
    }
    // Own keys only: `in` would find `constructor` or `toString` on the
    // prototype and let a package of that name be added unnoticed.
    const added = Object.keys(to).filter((name) => !Object.hasOwn(from, name));
    const removed = Object.keys(from).filter(
      (name) => !Object.hasOwn(to, name),
    );
    if (added.length > 0 || removed.length > 0) {
      problems.push(
        `package.json ${map} adds or removes packages (+${added.slice(0, 3).join(",") || "none"} -${removed.slice(0, 3).join(",") || "none"})`,
      );
    }
    for (const name of Object.keys(to)) {
      if (!Object.hasOwn(from, name) || from[name] === to[name]) continue;
      changed.push({ name, from: from[name], to: to[name] });
      if (
        typeof to[name] !== "string" ||
        !PLAIN_DEPENDENCY_VERSION.test(to[name])
      ) {
        problems.push(
          `package.json ${map}.${name} is ${JSON.stringify(to[name])?.slice(0, 60)}, not a plain [^~]major.minor.patch version`,
        );
      }
    }
  }
  changed.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { problems: [...new Set(problems)], changed };
}

function parseManifest(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

/**
 * Compares package.json on main and in the merge result (parsed JSON, so key
 * order and whitespace do not matter). Returns
 * `{ unreadable, scriptsChanged, otherKeys }`: `unreadable` is a message when
 * either side is missing or not a JSON object, `scriptsChanged` is whether
 * `scripts` differs, `otherKeys` lists every changed top-level key outside
 * DEPENDABOT_MANIFEST_KEYS (so it includes `scripts`).
 */
export function comparePackageJson(baseText, headText) {
  const base = parseManifest(baseText);
  const head = parseManifest(headText);
  if (!base || !head) {
    return {
      unreadable: `package.json is ${base ? "missing or not valid JSON after the merge" : "not valid JSON on main"}`,
      scriptsChanged: true,
      otherKeys: ["(unreadable)"],
    };
  }
  const keys = new Set([...Object.keys(base), ...Object.keys(head)]);
  const otherKeys = [...keys].filter(
    (key) =>
      !DEPENDABOT_MANIFEST_KEYS.has(key) &&
      !isDeepStrictEqual(base[key], head[key]),
  );
  return {
    unreadable: null,
    scriptsChanged: !isDeepStrictEqual(base.scripts, head.scripts),
    otherKeys,
  };
}

const MANIFEST_VERSION = /^[\^~]?(\d+)\.(\d+)\.(\d+)$/;

/**
 * One changed package.json dependency (`{ name, from, to }`, the raw values)
 * against what the PR names. The new value, without a leading ^ or ~, must be
 * strictly greater than the old one, and must equal the `to` version the title
 * (or the group body's "Updates `pkg` from X to Y" line) gives for it. Returns
 * the reason it is not, or null. A package the PR does not name is reported
 * elsewhere; only the direction is checked for it.
 */
function changeProblem({ name, from, to }, bumps) {
  const label = `package.json ${JSON.stringify(name)} ${JSON.stringify(from)?.slice(0, 40)} -> ${JSON.stringify(to)?.slice(0, 40)}`;
  const parts = (value) => {
    const m = MANIFEST_VERSION.exec(typeof value === "string" ? value : "");
    return m ? m.slice(1).map(BigInt) : null;
  };
  const before = parts(from);
  const after = parts(to);
  if (!before || !after) {
    return `${label}: not comparable as plain [^~]major.minor.patch versions`;
  }
  const order = before.findIndex((n, i) => n !== after[i]);
  if (order === -1 || after[order] < before[order]) {
    return `${label}: not an increase`;
  }
  const wanted = bumps.filter((bump) => bump.name === name);
  const target = String(to).replace(/^[\^~]/, "");
  // package.json cannot carry a `v` (PLAIN_DEPENDENCY_VERSION), a title may.
  const wrong = wanted.find(
    (bump) => bump.to.replace(/^[\^~]?v?/, "") !== target,
  );
  if (wrong) {
    return `${label}: the PR names ${wrong.to}, not ${target}`;
  }
  return null;
}

/**
 * Decides whether a PR may use the Dependabot lane, which is exempt from gates
 * 4 and 4b only. Returns `{ author, eligible, reasons, summary }`: `author` is
 * whether the PR was opened by Dependabot (so a refusal is worth explaining),
 * `reasons` why it is not eligible. `changedFiles`, when given (git's own list
 * after the test-merge), must also be only the two root manifests.
 * `extraReasons` are content problems found by the test-merge (lockfile URLs,
 * package.json keys); any of them voids the lane. Every commit must be
 * authored by Dependabot, and `author.is_bot` must be exactly true.
 * `changedPackages`, when given (`{ name, from, to }` for each package whose
 * value changed in the package.json dependency maps, from
 * `dependencyMapChanges`), must be non-empty, a subset of the packages the
 * title (or a group PR's body) names, and each must go up to exactly the
 * version the PR names.
 */
export function dependabotLane(
  pr,
  changedFiles = null,
  extraReasons = [],
  changedPackages = null,
) {
  const login = pr.author?.login;
  if (!DEPENDABOT_LOGINS.has(login) || pr.author?.is_bot === false) {
    return { author: false, eligible: false, reasons: [], summary: "" };
  }
  const reasons = [...dependabotCommitProblems(pr), ...extraReasons];
  if (pr.author?.is_bot !== true) {
    reasons.push("the PR author is not marked as a bot (is_bot is not true)");
  }
  const title = String(pr.title ?? "").trim();
  const bumps = [];

  const single = BUMP_TITLE.exec(title);
  if (single) {
    bumps.push({ name: single[1], from: single[2], to: single[3] });
  } else if (GROUP_TITLE.test(title)) {
    const body = String(pr.body ?? "");
    for (const m of body.matchAll(BODY_UPDATE)) {
      bumps.push({ name: m[1], from: m[2], to: m[3] });
    }
    const declared = /\bwith (\d+) updates?\b/i.exec(title)?.[1];
    if (bumps.length === 0) {
      reasons.push(
        'group PR: no "Updates `pkg` from X to Y" lines in the body to verify',
      );
    } else if (declared === undefined) {
      reasons.push(
        "group PR: the title does not say how many updates it has, so the body cannot be checked for completeness",
      );
    } else if (Number(declared) !== bumps.length) {
      reasons.push(
        `group PR: the title says ${declared} updates but the body lists ${bumps.length}`,
      );
    }
  } else {
    reasons.push(
      'title is not "Bump <pkg> from <a> to <b>" or "Bump the <group> group ..."',
    );
  }
  for (const { name, from, to } of bumps) {
    const problem = bumpProblem(name, from, to);
    if (problem) reasons.push(problem);
  }
  if (changedPackages) {
    const named = new Set(bumps.map((bump) => bump.name));
    const unnamed = [
      ...new Set(
        changedPackages
          .map((change) => change.name)
          .filter((n) => !named.has(n)),
      ),
    ];
    if (changedPackages.length === 0) {
      reasons.push(
        "package.json changes no dependency version, so nothing ties the PR to the package it names",
      );
    } else if (unnamed.length > 0) {
      reasons.push(
        `package.json changes packages the PR does not name: ${unnamed
          .slice(0, 5)
          .map((name) => JSON.stringify(name))
          .join(", ")}`,
      );
    }
    for (const change of changedPackages) {
      const problem = changeProblem(change, bumps);
      if (problem) reasons.push(problem);
    }
  }

  const paths = (list) =>
    (list ?? []).map((f) => (typeof f === "string" ? f : f?.path));
  const listed = paths(pr.files);
  const all = changedFiles ? [...listed, ...paths(changedFiles)] : listed;
  if (listed.length === 0) reasons.push("no changed files listed");
  const stray = [...new Set(all)].filter(
    (file) => !DEPENDABOT_FILES.includes(file),
  );
  if (stray.length > 0) {
    reasons.push(
      `touches files other than package.json / package-lock.json: ${stray
        .slice(0, 5)
        .map((f) => JSON.stringify(f))
        .join(", ")}${stray.length > 5 ? ", ..." : ""}`,
    );
  }

  const summary = bumps
    .map(({ name, from, to }) => `${name} ${from} -> ${to}`)
    .join(", ");
  return { author: true, eligible: reasons.length === 0, reasons, summary };
}

export const APPROVAL_MIN_LENGTH = 10;
export const APPROVAL_MAX_DISPLAY = 200;
export const APPROVAL_BODY_PREFIX =
  "Maintainer approval (recorded by the conductor, honour system): ";

/** Replaces control characters (C0, DEL, C1) with spaces and trims. */
export function cleanApprovalText(text) {
  return (
    String(text ?? "")
      // eslint-disable-next-line no-control-regex -- the point is to remove them
      .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
      .trim()
  );
}

/** Gates 1-5 (including 4b), the ones that need only the parsed `gh pr view` JSON. */
export function evaluateStaticGates(pr, options = {}) {
  const lane = options.lane ?? dependabotLane(pr);
  const laneNote = (what) =>
    `dependabot lane: ${what} not required (${lane.summary})`;
  const laneRefusal =
    lane.author && !lane.eligible
      ? [`dependabot lane refused: ${lane.reasons.join("; ")}`]
      : [];
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
      failures: lane.eligible ? [] : checkReviewRecord(pr),
      notes: lane.eligible ? [laneNote("review record")] : laneRefusal,
    },
    {
      id: "audit",
      num: "4b",
      label: "reviewer report pasted as a comment",
      failures: lane.eligible ? [] : checkAuditTrail(pr),
      notes: lane.eligible ? [laneNote("audit comment")] : [],
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
  // `on`, not `once`, and one shared flag: a second signal while cleanup is
  // still running must neither abort it (a `once` listener would be gone and
  // the default action would kill the process) nor start a second cleanup.
  let cleaning = false;
  for (const [signal, code] of [
    ["SIGHUP", 129],
    ["SIGINT", 130],
    ["SIGQUIT", 131],
    ["SIGTERM", 143],
  ]) {
    proc.on(signal, async () => {
      if (cleaning) return;
      cleaning = true;
      try {
        await runPendingCleanups();
      } finally {
        proc.exit(code);
      }
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
  // Directories (not symlinks) in the temp dir that this user owns and whose
  // name starts with merge-pr-; the caller applies the name and age rules.
  listTemp: async () => {
    const dir = tmpdir();
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    const entries = await readdir(dir, { withFileTypes: true });
    const found = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("merge-pr-")) continue;
      try {
        const info = await lstat(path.join(dir, entry.name));
        if (uid !== null && info.uid !== uid) continue;
        found.push({
          name: entry.name,
          path: path.join(dir, entry.name),
          mtimeMs: info.mtimeMs,
        });
      } catch {
        // vanished
      }
    }
    return found;
  },
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
// `git merge --no-commit` still insists on a committer identity, and a CI
// runner or fresh container has none ("empty ident name not allowed"). The
// test-merge is thrown away, so give it a fixed one instead of the caller's.
const GIT_IDENTITY = [
  "-c",
  "user.name=merge-pr",
  "-c",
  "user.email=merge-pr@localhost",
  "-c",
  "commit.gpgsign=false",
];
const NAME_FLAGS = ["--name-only", "--no-renames", "-z"];

function splitNul(stdout) {
  return String(stdout ?? "")
    .split("\0")
    .filter(Boolean);
}

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
// mkdtemp appends six random characters.
const TEMP_NAME = /^merge-pr-(?:home-)?[A-Za-z0-9]{6}$/;

/**
 * Removes merge-pr-* worktree and merge-pr-home-* directories that a SIGKILLed
 * run left behind, then prunes git's worktree records. Only directories older
 * than 24 h are touched: a younger one may belong to a run in progress. An
 * entry with an unreadable timestamp counts as young. Never throws.
 */
export async function cleanStaleTemp({ run, fs, cwd, now = Date.now() }) {
  const removed = [];
  try {
    const entries = fs.listTemp ? await fs.listTemp() : [];
    for (const entry of entries) {
      if (!TEMP_NAME.test(entry.name)) continue;
      if (!(now - entry.mtimeMs > STALE_AFTER_MS)) continue;
      await run("git", ["worktree", "remove", "--force", entry.path], {
        cwd,
      }).catch(() => {});
      await fs.rm(entry.path).catch(() => {});
      removed.push(entry.name);
    }
  } catch {
    // best effort
  }
  await run("git", ["worktree", "prune"], { cwd }).catch(() => {});
  return removed;
}

/**
 * Checks `git diff --raw -z` output for the exceptions. An exact exception (the
 * css-baseline) must be a regular file, mode 100644 on both sides (000000
 * before, for a new file); a symlink (120000) or an executable (100755) is
 * refused. A path under RESTRICTED_EXCEPTION_PREFIXES may also be executable or
 * deleted (000000 after), but a symlink or a submodule (160000) is refused.
 */
export function checkExceptionModes(rawStdout) {
  const failures = [];
  const tokens = String(rawStdout ?? "").split("\0");
  const regular = new Set(["100644", "100755"]);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const meta = tokens[i].match(
      /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [A-Z]\d*$/,
    );
    if (!meta) continue;
    const file = tokens[i + 1];
    i += 1;
    const exact = RESTRICTED_EXCEPTIONS.includes(file);
    if (!exact && !isPrefixException(file)) continue;
    const [, oldMode, newMode] = meta;
    const bad = exact
      ? (oldMode !== "100644" && oldMode !== "000000") || newMode !== "100644"
      : (oldMode !== "000000" && !regular.has(oldMode)) ||
        (newMode !== "000000" && !regular.has(newMode));
    if (bad) {
      failures.push(
        `touches ${file} as a non-regular file (mode ${oldMode} -> ${newMode}; need ${exact ? "100644" : "a regular file"}): maintainer merges this one`,
      );
    }
  }
  return failures;
}

/**
 * Looks at what a PR does to package.json and package-lock.json, using git
 * (never the PR's own claims). Fills `result.fileFailures` (gate 5: package.json
 * `scripts` changed, or could not be compared) and `result.laneProblems`
 * (Dependabot lane: lockfile URLs, package.json keys). Fail closed: any git or
 * parse failure is a problem, and `manifestsInspected` is set only at the end.
 */
async function inspectManifests({ git, worktree, head, changed, result, run }) {
  if (changed.has("package-lock.json") || changed.has("package.json")) {
    const patch = await git([
      "diff",
      "--no-renames",
      `origin/${BASE_BRANCH}...${head}`,
      "--",
      "package-lock.json",
      "package.json",
    ]);
    if (patch.code !== 0) {
      result.laneProblems.push(
        `could not read the lockfile patch: ${tail(patch.stderr, 2)}`,
      );
    } else {
      result.laneProblems.push(...lockfilePatchProblems(patch.stdout));
    }
    // The lockfile that would land: `:package-lock.json` is the index of the
    // test-merge. Parsed, never grepped.
    const lock = await run("git", ["show", ":package-lock.json"], {
      cwd: worktree,
    });
    if (lock.code !== 0) {
      result.laneProblems.push(
        `could not read package-lock.json after the merge: ${tail(lock.stderr, 2)}`,
      );
    } else {
      result.laneProblems.push(...lockfileProblems(lock.stdout));
    }
  }
  if (changed.has("package.json")) {
    const base = await git(["show", `origin/${BASE_BRANCH}:package.json`]);
    // `:package.json` is the index of the test-merge, i.e. what would land.
    const merged = await run("git", ["show", ":package.json"], {
      cwd: worktree,
    });
    const dependencies =
      base.code === 0 && merged.code === 0
        ? dependencyMapChanges(base.stdout, merged.stdout)
        : {
            problems: [
              "git could not show package.json to compare dependencies",
            ],
            changed: [],
          };
    result.laneProblems.push(...dependencies.problems);
    result.changedDependencies = dependencies.changed;
    const compared =
      base.code === 0 && merged.code === 0
        ? comparePackageJson(base.stdout, merged.stdout)
        : {
            unreadable:
              "git could not show package.json on main or after the merge",
            scriptsChanged: true,
            otherKeys: ["(unreadable)"],
          };
    if (compared.unreadable) {
      result.fileFailures.push(
        `package.json could not be compared (${compared.unreadable}): maintainer merges this one`,
      );
    } else if (compared.scriptsChanged) {
      result.fileFailures.push(
        "package.json scripts changed: maintainer merges this one",
      );
    }
    if (compared.otherKeys.length > 0) {
      result.laneProblems.push(
        `package.json changes keys other than dependencies and version: ${compared.otherKeys.join(", ")}`,
      );
    }
  }
  result.manifestsInspected = true;
}

/**
 * Gate 6. Merges the PR head onto current origin/main in a temporary
 * worktree. Never touches the caller's checkout. The worktree is always
 * removed, including on SIGINT/SIGTERM. `runTests` is false when earlier
 * gates already failed, to avoid a slow test run for a PR that will be
 * refused anyway.
 */
export async function testMerge(pr, { run, fs, cwd, runTests = true }) {
  const result = {
    failures: [],
    notes: [],
    changedFiles: [],
    fileFailures: [],
    // Content problems that void the Dependabot lane (never gate 5), and
    // whether the manifests were inspected at all (fail closed when not).
    laneProblems: [],
    manifestsInspected: false,
    // Package names whose value changed in the package.json dependency maps.
    changedDependencies: [],
  };
  const head = pr.headRefOid;

  if (
    !SAFE_REF.test(String(pr.headRefName ?? "")) ||
    !SAFE_OID.test(head ?? "")
  ) {
    result.failures.push("head ref or commit looks unsafe or is missing");
    return result;
  }

  const git = (args, options = {}) => run("git", args, { cwd, ...options });

  await cleanStaleTemp({ run, fs, cwd });

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

    const merged = await run(
      "git",
      [...GIT_IDENTITY, "merge", "--no-commit", "--no-ff", head],
      { cwd: worktree },
    );
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

    // The css-baseline exception covers a regular file only: a symlink to
    // .claude/settings.json has the same path.
    const excepted = [...changed].filter(isException);
    if (excepted.length > 0) {
      const raw = await run(
        "git",
        [
          ...GIT_NAMES,
          "diff",
          "--cached",
          "--raw",
          "--no-renames",
          "-z",
          `origin/${BASE_BRANCH}`,
          "--",
          ...excepted,
        ],
        { cwd: worktree },
      );
      if (raw.code !== 0) {
        result.failures.push(
          `git diff --raw of the merge result failed: ${tail(raw.stderr, 3)}`,
        );
        return result;
      }
      result.fileFailures.push(...checkExceptionModes(raw.stdout));
    }

    await inspectManifests({ git, worktree, head, changed, result, run });

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

// After a non-zero `gh pr merge`: ask GitHub what happened. Returns
// { oid } when the PR is MERGED with a merge commit at the head the gates
// evaluated, { mismatch } when it is merged at a different (or unreported)
// head, and null for anything else (still open, unreadable, malformed). All
// doubt fails closed.
async function mergedCommitOf(number, expectedHead, run, cwd) {
  try {
    const res = await run(
      "gh",
      [
        "pr",
        "view",
        String(number),
        "--json",
        "state,mergedAt,mergeCommit,headRefOid",
      ],
      { cwd },
    );
    if (res.code !== 0) return null;
    const view = JSON.parse(res.stdout);
    const oid = view?.mergeCommit?.oid;
    if (view?.state !== "MERGED" || typeof oid !== "string" || !oid) {
      return null;
    }
    if (view.headRefOid !== expectedHead) {
      return { mismatch: view.headRefOid };
    }
    return { oid };
  } catch {
    return null;
  }
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
  'usage: node scripts/merge-pr.mjs <pr-number> [--execute] [--maintainer-approved "<text>"]',
  "       node scripts/merge-pr.mjs --help",
  "",
  "Dry run by default: evaluates every gate and prints a table. --execute",
  "squash-merges (and deletes the branch) only when every gate passes.",
  "",
  '--maintainer-approved "<text>" (10+ characters) turns a gate 5 failure into a',
  "PASS with a visible note quoting <text>, and when it overrode something <text>",
  "is the whole squash-merge commit body. It bypasses no other gate. It is an",
  "honour-system record, not authentication: pass it only after the",
  "maintainer's own chat message says to merge this PR.",
  "",
  "  1  state    open, not a draft, base main",
  "  2  checks   every check on the head commit green",
  "  3  review   no CHANGES_REQUESTED review decision",
  "  4  record   exactly one '## Review record': Verdict APPROVE or APPROVE WITH",
  "              NITS (every Verdict line), 'Findings resolved: yes'",
  "  4b audit    the latest PR comment that mentions a verdict must itself be",
  "              exactly 'Verdict: APPROVE' or APPROVE WITH NITS and 200+",
  "              characters (the reviewer's report pasted verbatim). Decorated",
  "              lines are read (**bold**, #, -, `code`, NBSP, full-width colon)",
  "              and it fails closed: any other line with the word 'verdict' is",
  "              a block, a quoted block too (a quoted approval counts for",
  "              nothing). 100+ comments are refused. Author comments count",
  "  5  files    no maintainer-only file (agent instructions at any depth,",
  "              .claude/** except css-baseline.sha256 and regular files under",
  "              .claude/commands/ and .claude/scripts/ (but CLAUDE.md, AGENTS.md,",
  "              .mcp.json, .npmrc, .gitattributes, .gitmodules, .env*,",
  "              settings*.json and any dotfile stay restricted there), .vscode,",
  "              .devcontainer, CI...) and no path with a control character;",
  "              checked against gh and against git. The root package.json and",
  "              package-lock.json are no longer on the list, but a changed",
  "              package.json `scripts` object fails gate 5",
  "  4/4b Dependabot lane: a PR by dependabot[bot] (author is read, not the",
  "              title; is_bot must be true) bumping packages patch/minor,",
  "              touching only the root package.json / package-lock.json, skips",
  "              gates 4 and 4b. Majors, pre-releases, unparseable versions and",
  "              groups whose body cannot be checked are refused with the",
  "              reason. Also required: every commit authored by dependabot,",
  "              a parsed lockfile (version 2 or 3) whose every entry resolves",
  "              on https://registry.npmjs.org/ with no link, file, git or URL",
  "              spec and no backslash on an added line, and package.json",
  "              changed only in version and the four dependency maps (same",
  "              keys, plain [^~]x.y.z values, only packages the title names).",
  "              It does not verify a published package is benign",
  "  6  merge    clean test-merge onto origin/main (also removes merge-pr-* temp",
  "              dirs older than 24 h; updates origin/main and",
  "              origin/<branch> remote-tracking refs); npm test, with a",
  "              scrubbed environment, if head is behind. Limits: PR test code",
  "              still runs here; the scrub is a mitigation, not a sandbox",
  "",
  `NOTE: ${SELF_ATTESTATION_NOTE}`,
  "The only override is --maintainer-approved, for gate 5; --admin, --auto and",
  "--rebase are never used.",
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

  let execute = false;
  let approvalRaw = null;
  const unknown = [];
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--execute") {
      execute = true;
    } else if (
      arg === "--maintainer-approved" ||
      arg.startsWith("--maintainer-approved=")
    ) {
      let value = null;
      if (arg === "--maintainer-approved") {
        // The value is the next argument; one that looks like a flag is a
        // missing value, not a reason.
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          value = next;
          i += 1;
        }
      } else {
        value = arg.slice("--maintainer-approved=".length);
      }
      if (approvalRaw !== null || value === null) unknown.push(arg);
      else approvalRaw = value;
    } else if (arg.startsWith("-")) {
      unknown.push(arg);
    } else {
      positional.push(arg);
    }
  }

  const number = positional.length === 1 ? parsePrNumber(positional[0]) : null;
  if (number === null || unknown.length > 0) {
    err(
      'usage: node scripts/merge-pr.mjs <pr-number> [--execute] [--maintainer-approved "<text>"]',
    );
    err(
      "<pr-number> must be a positive integer; --execute and --maintainer-approved <text> are the only flags (each at most once).",
    );
    return 2;
  }
  let approval = null;
  if (approvalRaw !== null) {
    const cleaned = cleanApprovalText(approvalRaw);
    if (cleaned.length < APPROVAL_MIN_LENGTH) {
      err(
        `usage: --maintainer-approved needs the maintainer's words, at least ${APPROVAL_MIN_LENGTH} characters after trimming and removing control characters.`,
      );
      return 2;
    }
    approval =
      cleaned.length > APPROVAL_MAX_DISPLAY
        ? `${cleaned.slice(0, APPROVAL_MAX_DISPLAY)}...`
        : cleaned;
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

  let lane = dependabotLane(pr);
  const gates = evaluateStaticGates(pr, { lane });

  // --maintainer-approved turns a gate 5 failure into a visible note and
  // nothing else. It is applied again after gate 6, which can add file failures.
  const overridden = [];
  const applyApproval = () => {
    const filesGate = gates.find((gate) => gate.id === "files");
    if (!approval || !filesGate) return;
    overridden.push(...filesGate.failures);
    filesGate.failures = [];
    filesGate.notes =
      overridden.length > 0
        ? [
            `maintainer-approved: ${approval}`,
            ...overridden.map((failure) => `overrode: ${failure}`),
          ]
        : [];
  };
  applyApproval();

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
    const known = new Set([...filesGate.failures, ...overridden]);
    for (const failure of [
      ...checkFiles(result.changedFiles),
      ...result.fileFailures,
    ]) {
      if (!known.has(failure)) filesGate.failures.push(failure);
    }
    applyApproval();
    // The file list from the test-merge must also be only the two manifests;
    // if not, the Dependabot lane is void and gates 4 and 4b apply in full.
    if (lane.eligible) {
      lane = dependabotLane(
        pr,
        result.changedFiles,
        result.manifestsInspected
          ? result.laneProblems
          : ["the manifest changes could not be inspected"],
        result.manifestsInspected ? result.changedDependencies : null,
      );
      if (!lane.eligible) {
        const full = evaluateStaticGates(pr, { lane });
        for (const id of ["record", "audit"]) {
          const at = gates.findIndex((gate) => gate.id === id);
          gates[at] = full.find((gate) => gate.id === id);
        }
      }
    }
  } else {
    mergeGate.failures.push("not tested: PR is not open");
  }
  gates.push(mergeGate);

  const failed = gates.filter((gate) => gate.failures.length > 0);
  out(`merge-pr: PR #${number} (${execute ? "execute" : "dry run"})`);
  if (approval) out(`maintainer-approved: ${approval}`);
  if (approval && overridden.length === 0) {
    out("maintainer-approved: nothing was overridden, so it is not recorded.");
  }
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

  // A durable record of the approval in the squash-merge commit body, only
  // when it actually overrode something. This script passes no other body, so
  // the record is the whole body (`--body` replaces gh's default message).
  const mergeArgs = [
    "pr",
    "merge",
    String(number),
    "--squash",
    "--delete-branch",
    "--match-head-commit",
    pr.headRefOid,
  ];
  if (approval && overridden.length > 0) {
    mergeArgs.push("--body", `${APPROVAL_BODY_PREFIX}${approval}`);
  }
  const merge = await run("gh", mergeArgs, { cwd: root });
  if (merge.code !== 0) {
    const message = tail(merge.stderr || merge.stdout, 5);
    // gh can merge on GitHub and still exit non-zero, e.g. "failed to delete
    // local branch" when a worktree holds it. Do not trust the exit code: ask
    // GitHub. Never retry the merge itself. Fail closed on any doubt.
    const merged = await mergedCommitOf(number, pr.headRefOid, run, root);
    if (merged?.oid) {
      out(
        `MERGED PR #${number} (verified after gh exited non-zero; merge commit ${merged.oid.slice(0, 7)}). gh said: ${message}`,
      );
      if (approval) out(`maintainer-approved: ${approval}`);
      return 0;
    }
    if (merged) {
      const short = (value) =>
        typeof value === "string" && value ? value.slice(0, 7) : "(missing)";
      err(
        `merge-pr: PR is merged at a different head than the one reviewed: ${short(merged.mismatch)}, expected ${short(pr.headRefOid)}. gh said: ${message}`,
      );
      return 1;
    }
    err(`merge-pr: gh pr merge failed: ${message}`);
    return 1;
  }
  out(`MERGED PR #${number} (squash, branch deleted).`);
  if (approval) out(`maintainer-approved: ${approval}`);

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
