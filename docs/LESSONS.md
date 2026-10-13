# Lessons ledger

The repo is the agents' memory. Models do not learn between sessions, so a
mistake made once is made again by the next session unless something in the
repo stops it. This ledger records each mistake and what now stops it.

**A lesson is only real if a check, test, lint or hook now prevents it, or a
stated reason says none can.** Prose alone is not a mechanism. Prefer an
executable check; fix the class of the mistake, not the instance.

Entries whose source is 'conductor session record' were observed by the conductor in the 2026-10-11 session and cannot be reconstructed from git history.

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

### L-009 Scout roles on a 30-turn budget ran out of turns on long tasks

- Date: 2026-10-11 (source: conductor session record)
- What happened: Haiku-pinned scout roles hit their 30-turn limit and returned
  no report on long mechanical tasks: the autopsy measurement run and one
  cold-start drill.
- Root cause: a 30-turn budget is too small for tasks of about 20 or more
  commands.
- Prevented by: for such tasks, brief a Sonnet role (`reviewer` or
  `implementer`, read-only by instruction) or split the task, under the
  escalate-after-one-failure rule in
  [`CONDUCTOR.md`](CONDUCTOR.md#when-something-fails). Nothing executable
  enforces the budget yet.
- Status: partially

### L-010 Scribe runs left work uncommitted or unverified

- Date: 2026-10-11 (source: conductor session record)
- What happened: The scribe role twice left its work uncommitted or unverified:
  the maintainer-tasks guide and the drill-questions file.
- Root cause: the haiku role ran out of turns, or treated the commit as the
  conductor's job.
- Prevented by: the conductor checks `git status` and `git log` in the worktree
  after every writer and escalates to `implementer` on failure, and briefs say
  explicitly whether to commit. This is a conductor habit, not an executable
  check; see [`CONDUCTOR.md`](CONDUCTOR.md#when-something-fails) and
  [`scribe.md`](../.claude/agents/scribe.md).
- Status: partially

### L-011 More than about four agents at once overloaded the machine

- Date: 2026-10-11 (source: conductor session record)
- What happened: Running more than about four agents at once pushed the
  machine's load average above 50 and made unrelated unit tests time out at
  5 seconds.
- Root cause: concurrent test runs compete for CPU, and vitest's default
  5-second per-test timeout is too short for tests slowed by that load.
- Prevented by: a cap of about four concurrent roles, stated in the
  `/team-start` command; `--testTimeout=120000` for local runs; CI as the final
  check. The cap is a stated convention, not an executable check.
- Status: partially

### L-012 Review records copied a first-round verdict forward

- Date: 2026-10-11 (source: conductor session record, PR bodies #445 and #446)
- What happened: Two PR review records first said APPROVE WITH NITS although
  the latest independent review of each had said REQUEST CHANGES; the conductor
  corrected both.
- Root cause: the first-round verdict was copied forward into the record.
- Prevented by: the merge gate in [`merge-pr.mjs`](../scripts/merge-pr.mjs)
  requires the LATEST audit comment to approve, and the template placeholders
  cannot pass. The rule is to always record the latest verdict and say what is
  not re-reviewed. The gate part is prevented; the author part rests on that
  rule alone.
- Status: partially

### L-013 The merge script reported failure after a successful squash merge

- Date: 2026-10-11 (source: PR #451)
- What happened: `scripts/merge-pr.mjs --execute` reported failure after the
  squash merge had succeeded, because `gh pr merge --delete-branch` exits
  non-zero when a worktree still holds the local branch.
- Root cause: the branch-deletion step fails while a worktree holds the branch,
  and that non-zero exit is read as a failed merge.
- Prevented by: `scripts/merge-pr.mjs` (P17-57a) re-reads the PR after any
  non-zero `gh pr merge` and succeeds only when it is MERGED with a merge
  commit and its head equals the head the gates evaluated; any other state, a
  failed re-read or a different head exits 1, and the merge is never retried.
  Cases, including one per guard, are in `tests/unit/merge-pr.test.js`.
- Status: prevented

### L-014 The merge watcher's rewake message still points at the Phase 13 queue

- Date: 2026-10-11 (source: merge-watcher events after #447, #448 and #451)
- What happened: After #447, #448 and #451 merged, the merge watcher's rewake
  message still told a session to work the Phase 13 queue, although the charter
  makes Phase 17 the queue.
- Root cause: the script text was not updated with the charter, and the file is
  hook-protected, so only a maintainer merge can change it.
- Prevented by: none yet. Tracked in P17-62(b) of
  [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md); the file is
  [`check-merged-prs.sh`](../.claude/scripts/check-merged-prs.sh), a maintainer
  merge.
- Status: open

### L-015 The CI artifact drops dot-directories, so the smoke job lost security.txt

- Date: 2026-10-12 (source: CI `smoke-tests` job on PR #459)
- What happened: The smoke job failed with `.well-known/security.txt: missing
from build output` although the build had produced it, because the `build`
  job passes `_site/` to later jobs with `actions/upload-artifact`, which
  excludes hidden files and directories by default (`include-hidden-files:
false` since v4.4).
- Root cause: a new dot-directory in the build output was only checked against
  the deploy path (`actions/upload-pages-artifact@v3`, which keeps it), not
  against the CI artifact hand-off, and the workflow file is the maintainer's.
- Prevented by: the smoke check now skips only that one check, with a visible
  note, when the run is CI and `_site` has no dot-directory at all
  ([`smoke-security-txt.mjs`](../lib/smoke-security-txt.mjs), pinned by
  `tests/unit/smoke-security-txt.test.js`); `tests/unit/security-contact.test.js`
  builds the site itself and still covers the file. The real fix is
  `include-hidden-files: true` on the upload-artifact step in ci.yml, a
  maintainer change tracked as P17-64 in
  [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md). Until then the smoke job
  does not check the file in CI.
- Status: partially

### L-016 The merge watcher's rewake message now points at /team-start (closes L-014)

- Date: 2026-10-12 (source: P17-62(b); closes L-014, which stays as written)
- What happened: L-014 recorded that the watcher's rewake message told a
  session to work the Phase 13 queue. The message now tells the session to run
  `/team-start`, which reads the charter, the handoff and the lessons and picks
  the next Ready Phase 17 item.
- Root cause: the directive text lived only in the script and nothing compared
  it with the charter.
- Prevented by: [`check-merged-prs.test.js`](../tests/unit/check-merged-prs.test.js)
  runs the real script and asserts the directive names `/team-start` and no
  longer mentions Phase 13; the script header states that the directive is
  data to the receiving session. The file is
  [`check-merged-prs.sh`](../.claude/scripts/check-merged-prs.sh), merged by the
  maintainer.
- Status: prevented

### L-017 The CI artifact now keeps dot-directories (closes L-015)

- Date: 2026-10-13 (source: P17-64; closes L-015, which stays as written)
- What happened: L-015 recorded that `actions/upload-artifact` dropped
  `_site/.well-known`, so the smoke job skipped its security.txt check. The
  `build` job's upload step now sets `include-hidden-files: true` and the
  skip is removed.
- Root cause: as in L-015, the artifact hand-off was never checked against a
  dot-directory in the build output.
- Prevented by: the smoke check is strict in CI again; a missing
  `.well-known/security.txt` fails the `smoke-tests` job, pinned by
  [`smoke-security-txt.test.js`](../tests/unit/smoke-security-txt.test.js)
  (runs `scripts/smoke.mjs` with `GITHUB_ACTIONS=true` and asserts the
  failure). The workflow line itself is proven only by a green CI run.
- Status: prevented

### L-018 Commit-making tests must be hermetic about git identity (closes L-002)

- Date: 2026-10-13 (source: P17-58 and P17-62; closes L-002, which stays as written)
- What happened: L-002 recorded that tests running `git commit` passed on a
  laptop that guesses a git identity and failed on a CI runner with none. The
  audit it asked for is done (#473): every such test now builds its
  environment with `hermeticGitEnv()`.
- Root cause: as in L-002, a test inherited the developer machine's git config.
- Prevented by: [`hermetic-git.test.js`](../tests/unit/hermetic-git.test.js)
  fails any `tests/unit/*.test.js` that passes `"commit"` or `"merge"` as a git
  argument without importing and calling `hermeticGitEnv` from
  [`helpers/git-env.js`](../tests/unit/helpers/git-env.js), so a new
  commit-making test cannot skip it; [`git-env.test.js`](../tests/unit/git-env.test.js)
  proves a commit with no identity is refused and the helper's is accepted. The
  detector matches argument-array calls, so a commit made through a shell string
  would escape it.
- Status: prevented

### L-019 Time-relative wording in docs is now a failing test (closes L-004)

- Date: 2026-10-13 (source: P17-62(c); closes L-004, which stays as written)
- What happened: L-004 recorded docs saying "not on main yet" or "until this PR
  merges", false within hours, with "no test for the relative wording itself".
  There is one now.
- Root cause: as in L-004, prose about the state of a branch is true only when
  written, and nothing checked it.
- Prevented by: the "time-relative wording" block in
  [`doc-facts.test.js`](../tests/unit/doc-facts.test.js) fails on those phrases
  in any tracked Markdown file except `docs/archive/`, `CHANGELOG.md`, and two
  allowlisted files that hold dated history (`docs/IMPLEMENTATION-PLAN.md`,
  `docs/LESSONS.md`). A phrase list catches the known wordings, not every
  paraphrase; the cold-start drill in
  [`COLD-START-DRILL.md`](COLD-START-DRILL.md) remains the end-to-end check.
- Status: prevented

### L-020 The merge watcher's stale directive is fixed and pinned (closes L-006)

- Date: 2026-10-13 (source: P17-62; closes L-006, which stays as written)
- What happened: L-006 recorded that the watcher's directive still named the
  Phase 13 queue after #432 fixed its window and ordering. L-016 records that
  the directive now says to run `/team-start`.
- Root cause: as in L-006 and L-014, the directive text was not updated with the
  charter.
- Prevented by: [`check-merged-prs.test.js`](../tests/unit/check-merged-prs.test.js)
  covers the window, the out-of-order merge and, per L-016, the directive text
  (it names `/team-start`, not Phase 13).
- Status: prevented

### L-021 The default ruleset now requires status checks (closes L-001)

- Date: 2026-10-13 (source: P17-3; closes L-001, which stays as written)
- What happened: L-001 recorded a PR merging with a red check because GitHub
  required none. On 2026-10-13 the maintainer saved a `required_status_checks`
  rule on the `default` ruleset (16512225); a read of it the same day lists
  `build`, `lint`, `unit-tests`, `e2e-tests`, `a11y-tests`, `smoke-tests` and
  `security-audit`.
- Root cause: as in L-001, nothing but habit refused a red merge.
- Prevented by: that ruleset rule (GitHub refuses the merge) together with
  `scripts/merge-pr.mjs`, which refuses a PR whose checks are not all green
  (`tests/unit/merge-pr.test.js`). The ruleset is a repository setting, not a
  file, so no test in this repo proves it; verify with
  `gh api repos/sandgraal/letstalkcdc/rulesets/16512225`. `lychee` and
  `lighthouse` are deliberately not required
  ([`DECISIONS.md`](DECISIONS.md)).
- Status: prevented
