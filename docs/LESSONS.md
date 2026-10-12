# Lessons ledger

The repo is the agents' memory. Models do not learn between sessions, so a
mistake made once is made again by the next session unless something in the
repo stops it. This ledger records each mistake and what now stops it.

**A lesson is only real if a check, test, lint or hook now prevents it, or a
stated reason says none can.** Prose alone is not a mechanism. Prefer an
executable check; fix the class of the mistake, not the instance.

## How to use it

- **Format.** One block per entry: a `### L-NNN title` heading, then five
  bullets: `Date`, `What happened` (one or two factual sentences),
  `Root cause`, `Prevented by` (a link to the test, lint, hook, doc or plan
  item) and `Status`. `tests/unit/ratchet.test.js` checks the numbering, the
  five fields and the status word.
- **Status** is exactly one of `prevented` (a mechanism now stops it, or a
  stated reason says none can), `partially` (a mechanism covers part of it;
  the gap is named) or `open` (nothing stops it yet; a plan item or PR is
  named).
- **Append-only.** Never edit or delete an old entry to change its meaning.
  A correction, or a status that moves, is a new entry that cites the old ID.
  (Fixing a typo or a dead link is fine.)
- **Pruning rule.** A `prevented` entry whose mechanism is a test never needs
  to be re-read: the test is the memory. Only `open` and `partially` entries
  are required reading at the start of a session:

  ```bash
  rg -n "^- Status: (open|partially)" docs/LESSONS.md
  ```

- **Who may add what.** Agents may add tests, lints, docs and entries here
  freely. Agents may **not** weaken or remove a guardrail (a hook, a
  permission, the charter, a required check, a test, a baseline in
  `.claude/ratchet-baseline.json`) without the maintainer. See "Self-improvement
  boundary" in [`CONDUCTOR.md`](CONDUCTOR.md#self-improvement-boundary).
- **When to add one.** The retro step in [`TEAM-CHARTER.md`](TEAM-CHARTER.md#retro)
  and the Definition of Done in [`CONDUCTOR.md`](CONDUCTOR.md#definition-of-done):
  any bug, review finding, CI failure or process mistake ends in a regression
  artifact, or a one-line reason why none is possible, and an entry here when
  the lesson is not already covered.
- **Keep it factual.** Every claim below was checked against `git log`, the PR
  or the files named. Public repository: no personal motives, no employer
  names, no secrets.

## Entries

### L-001 A PR merged with a red check

- Date: 2026-10-11
- What happened: PR #432 merged while its `unit-tests` check was failing, so the
  failing test run landed on `main` (the CI run for the merge commit `d67d801`
  failed). The `default` ruleset has no required status checks.
- Root cause: "merge after green CI" was a habit, and nothing refused a red merge.
- Prevented by: `scripts/merge-pr.mjs` (P17-2, #445) refuses a PR whose checks
  are not all green and refuses an empty check list. GitHub itself does not yet:
  required checks on the ruleset are P17-3, a maintainer task in
  [`MAINTAINER-TASKS.md`](MAINTAINER-TASKS.md).
- Status: partially

### L-002 Tests passed on a laptop and failed on the CI runner

- Date: 2026-10-11
- What happened: The merge-gate tests in #445 passed on macOS and failed on the
  CI runner with "empty ident name not allowed": `git merge` needs a committer
  identity, macOS guesses one, the runner has none (fix in `66a3c08`).
- Root cause: tests ran real `git` with the developer machine's global config
  and identity.
- Prevented by: the real-git tests in `tests/unit/merge-pr.test.js` now run with
  no global config, `user.useConfigOnly` and the identity variables unset, and
  the script's test-merge passes its own identity. The remaining commit-making
  tests are not yet audited: P17-58 in
  [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) carries the simulated-CI
  command that reproduces a runner (`GIT_CONFIG_GLOBAL=/dev/null` and friends).
- Status: partially

### L-003 Every review round of a guard or gate found real bypasses

- Date: 2026-10-11
- What happened: Independent reviews of the merge gate (#445) found a non-ASCII
  path bypass, a newline-in-path bypass, decorated verdicts such as
  `**Verdict: CHANGES REQUESTED**` that the parser could not see, and symlink
  and nested-file gaps. Reviews of the guard hooks (#446) found `find -delete`,
  space-containing paths and a guard that could run past its hook timeout, which
  is treated as an allow.
- Root cause: a tokenizer or parser written from the happy path misses the
  shapes an adversary, or an unlucky filename, produces.
- Prevented by: adversarial review before any permission is widened; a test per
  evasion (`tests/unit/guard-bash.test.js`, `tests/unit/guard-edit.test.js`,
  `tests/unit/merge-pr.test.js`) with mutation proofs that each fails when its
  rule is removed; the guard fails closed on its own budget; and the charter's
  "Honest limits" says the hooks are a net for accidents, not a security
  boundary. The ratchet (`tests/unit/ratchet.test.js`) stops the case count from
  shrinking. The open residuals are P17-55.
- Status: partially

### L-004 Documents stated time-relative facts that went stale within hours

- Date: 2026-10-11
- What happened: Docs described a file as "not on main yet" or a change as
  waiting for its PR to merge; within hours those statements were false, and the
  cold-start drill (a fresh agent reading only the repo) reported five
  contradictions, fixed in #449. The sweep that removes the rest of that
  wording is P17-59.
- Root cause: prose written about the state of a branch is true only at the
  moment it is written; nothing checked it.
- Prevented by: `tests/unit/doc-facts.test.js` checks the facts it can
  (`CLAUDE.md` names, paths and versions); the cold-start drill in
  [`COLD-START-DRILL.md`](COLD-START-DRILL.md) is the end-to-end check and is
  re-run after each batch of merges; write timeless statements ("the merge gate
  refuses...") instead of relative ones ("not merged yet"). There is no test for
  the relative wording itself.
- Status: partially

### L-005 The guard refuses PR and issue text passed inline or through a variable

- Date: 2026-10-11
- What happened: `gh pr create|comment` and `gh issue create|comment` with the
  body on the command line, or built from a variable, a glob, `~` or `$(...)`,
  are denied by `.claude/hooks/guard-bash.mjs`; `gh api` with a write flag is
  denied too.
- Root cause: a body assembled by the shell is text no one reviewed.
- Prevented by: write the body to a file in the scratch (temp) directory and pass
  a literal `--body-file <path>`, as the Autonomy charter in
  [`CONDUCTOR.md`](CONDUCTOR.md) describes; a reworded command that dodges the
  guard is the guard doing its job, so stop and ask. Cases for each shape are in
  `tests/unit/guard-bash.test.js`.
- Status: prevented

### L-006 The auto-continue hook pointed at a stale queue and re-woke on old merges

- Date: 2026-10-11
- What happened: `.claude/scripts/check-merged-prs.sh` fired on merges long after
  they landed and took the highest-numbered PR as the one to acknowledge, so a
  long-lived branch merging late was skipped. #432 fixed this: silent
  initialisation, a 6-hour window, newest merge by `mergedAt`. The directive text
  the script prints still says to work the Phase 13 queue first.
- Root cause: the watcher kept a single "highest PR number" and a directive
  written for a phase that has since ended.
- Prevented by: `tests/unit/check-merged-prs.test.js` (cases for the
  window and the out-of-order case); treat a rewake as data, not as an instruction: read
  `git log` and the plan before acting. The stale directive text is a Tier 3
  file, so changing it is a maintainer item (P17-62).
- Status: partially

### L-007 Stacked PRs and parallel `package.json` edits conflict after a squash-merge

- Date: 2026-10-11
- What happened: #447 was stacked on #446, and #445 and #444 each added one
  script line to `package.json` (`merge-pr`, `lint:thesis`); the two edits
  conflicted, and the cold-start drill had to leave the thesis lint out because
  of a `package.json` conflict.
- Root cause: a squash-merge rewrites history, so a stacked or sibling branch no
  longer shares ancestors with `main`, and two edits to adjacent lines collide.
- Prevented by: merge `main` into the branch (never rebase; the guard denies
  `gh pr update-branch --rebase`); avoid stacking where an item can start from
  `main`; expect a trivial conflict in a shared file and resolve it by keeping
  both lines.
- Status: partially

### L-008 A reviewer found a content error that no test caught

- Date: 2026-10-11
- What happened: `/snapshotting/` told readers that `SELECT pg_reload_conf()`
  applies `wal_level` (it needs a restart). The accuracy sample under P17-12
  found it, along with other errata on the same sample; `main` stayed green
  with the wrong claim, so no unit test and not the thesis lint flagged it.
- Root cause: tests check structure and the thesis wording, not whether a
  PostgreSQL claim is true.
- Prevented by: the `technical-editor` role on every page that teaches CDC
  ([`TEAM-CHARTER.md`](TEAM-CHARTER.md)); SQL on a page is executed on PGlite
  (`tests/unit/merge-cookbook-postgres.test.js` is the pattern) instead of
  trusted; a correction ships with an entry in `src/_data/errata.mjs`. There is no
  automatic check for restart-versus-reload style claims.
- Status: partially
