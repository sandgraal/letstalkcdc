# Team charter

How the agent team for Let's Talk CDC starts cold and runs for weeks while
the maintainer reads one weekly digest. This is the operating manual. The
protocol it sits on is [`CONDUCTOR.md`](CONDUCTOR.md) (roster, tiers, merge
gate); the repo's mechanics are in [`../CLAUDE.md`](../CLAUDE.md); what the
maintainer decided is in [`DECISIONS.md`](DECISIONS.md).

The charter, the roles and the skills are Tier 3 paths (`.claude/agents/**`,
`.claude/skills/**`, `docs/TEAM-CHARTER.md`, `docs/CONDUCTOR.md`,
`docs/DECISIONS.md`). A change to any of them is prepared by the team and merged
by the maintainer by hand, not through the merge script. Two controls, kept
apart: the Edit/Write guard protects only settings, hooks, scripts and agents
(rules, skills and commands are instructions and can be edited in a worktree),
but `scripts/merge-pr.mjs` flags **all** of `.claude/**` (except
`.claude/css-baseline.sha256`): a WARN by default since 2026-10-13, a refusal
under `--strict` (see `docs/CONDUCTOR.md`, "Merge policy"). Read that WARN, and
the diff, before merging a rule, skill, command or agent change.

## Mission

Make Let's Talk CDC the best free learning resource on change data capture,
for newcomers, people who operate pipelines, and architects. A free,
accurate resource earns trust, and trust is the point. Every page is held to
one thesis: delivery is at-least-once; correctness lives in an idempotent
sink keyed on the primary key and ordered by source log position (LSN, SCN,
GTID), not `ts_ms`; end-to-end exactly-once across independent systems is
not claimed. The project spends nothing recurring (free tiers only, no paid
APIs), and the maintainer gives it about an hour a week outward-facing, so
the pace is set by what that hour can read, not by what the team can write.
Accuracy beats volume.

## Where each piece lives

All of the handoff kit is on `main` (merged 2026-10-11; some GitHub timestamps
read 2026-10-12 because they are UTC). Check
with `ls` anyway if a path looks wrong, and believe the repo over this table.

| Piece                                                                                         | Merged in |
| --------------------------------------------------------------------------------------------- | --------- |
| `docs/DECISIONS.md`, templates, Dependabot, `scripts/worktree-prune.sh`                       | #430      |
| `docs/MAINTAINER-TASKS.md`                                                                    | #431      |
| Lean `CLAUDE.md`, `.claude/rules/`, `.claude/skills/` (new-module, content-update, seo-check) | #432      |
| `scripts/merge-pr.mjs` (the merge gate)                                                       | #445      |
| Autonomy charter in `CONDUCTOR.md` and the guard hooks in `.claude/hooks/`                    | #446      |
| `scripts/thesis-lint.mjs` and `npm run lint:thesis`                                           | #444      |
| This charter, `technical-editor`, `growth-writer`, the `weekly-digest` skill                  | #447      |
| Phase 17 in `docs/IMPLEMENTATION-PLAN.md`                                                     | #448      |
| Cold-start fixes and `docs/COLD-START-DRILL.md`                                               | #449      |

## Day-1 checklist (cold start)

Run from a fresh clone, or a worktree off fresh `main`.

The conductor runs the whole routine below as `/team-start` (see
[Running a session](#running-a-session)).

```bash
git fetch origin && git switch main && git pull --ff-only
PUPPETEER_SKIP_DOWNLOAD=1 npm ci --no-audit --no-fund
npm run verify-all          # format:check + lint + test + build; must be green
gh pr list --state open     # what is in flight
gh run list --limit 10      # is CI healthy
```

Read, in this order (stop only when you can state the mission, the thesis,
the three tiers and the merge command from memory):

1. [`../CLAUDE.md`](../CLAUDE.md): commands, pipeline, anti-patterns.
2. [`CONDUCTOR.md`](CONDUCTOR.md): roster, loop, Definition of Done,
   Autonomy charter (tiers 0 to 3, the merge script).
3. This file.
4. [`STATE-OF-PROJECT.md`](STATE-OF-PROJECT.md): a dated snapshot. The
   `main` commit it was measured at is named near the top.
5. [`AUTOPSY-BRIEF.md`](AUTOPSY-BRIEF.md): sections 4 (content accuracy and
   the one-page checklist), 6 (open work), 9 and 10 (questions, repo map).
6. [`DECISIONS.md`](DECISIONS.md): what is decided, what is default, what is
   pending.
7. [`MAINTAINER-TASKS.md`](MAINTAINER-TASKS.md): what only the maintainer can
   do, and what is waiting on them.
8. [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md): the checklist. Phase 17
   is the team's queue.

If a file above is missing from your checkout, your checkout is stale: run
`git fetch origin && git pull --ff-only` before you go on.

The state doc is a snapshot, so find out what moved since it was written:

```bash
git fetch origin && git log --oneline <state-doc-sha>..origin/main
```

`<state-doc-sha>` is the short SHA the state doc names (the newest snapshot
at the top of `STATE-OF-PROJECT.md`). Read every subject line; open any PR that changes
`docs/`, `.claude/` or a content page. Believe the repo over the snapshot
when they disagree.

Then pick work: the next Phase 17 item, then older agent-executable boxes
(see [Backlog map](#backlog-map)), check it against the Definition of Ready in
`CONDUCTOR.md`, and brief a role.

## Running a session

Three slash commands in `.claude/commands/` make every session start and end
the same way. The conductor reads the command file and follows it.

- `/team-start`: sync (the primary checkout only fast-forwards `main`; all
  work is in worktrees cut from `origin/main`), read the latest handoff block
  (and any open `docs(handoff)` PR and the newest digest), merge ready PRs
  through `node scripts/merge-pr.mjs` (dry run first; only `claude/*` PRs by
  the team's account), check that a Phase 17 item is not already merged or in
  flight before picking it, brief roles. It stops and asks on the triggers
  below.
- `/team-end`: check every worktree is clean, list open PRs and CI, show the
  `scripts/worktree-prune.sh` dry run, have a `scribe` write the dated
  handoff block (shipped as a `docs(handoff): YYYY-MM-DD` PR through the same
  gate), and report what needs the maintainer's decision under "Needs you"
  (these feed the digest).
- `/team-digest`: runs the weekly-digest skill (below).

## Roles and when to use each

The conductor decides, delegates, integrates and verifies. **It delegates
writing and never writes**: it has no edit tools and does not simulate them
through Bash. Every file change comes from a role, and the role that wrote a
change never reviews it.

| Need                                                        | Role               | Model  |
| ----------------------------------------------------------- | ------------------ | ------ |
| Find, inventory, measure, "where is X"                      | `scout`            | haiku  |
| Run `verify-all`, smoke, e2e, report pass or fail           | `verifier`         | haiku  |
| Checkbox, CHANGELOG line, doc wording, one-line config      | `scribe`           | haiku  |
| Code, templates, tests, workflows, dependencies, new pages  | `implementer`      | sonnet |
| Independent review of any diff (correctness, anti-patterns) | `reviewer`         | sonnet |
| Anything under `src/assets/css/`                            | `css-refactor`     | sonnet |
| CDC accuracy and thesis review of a content PR              | `technical-editor` | sonnet |
| Weekly LinkedIn post and newsletter blurb drafts            | `growth-writer`    | sonnet |

Use-when notes:

- `technical-editor` runs on every PR that adds or rewrites a page that
  teaches CDC, in addition to `reviewer`. It runs the page re-verification
  checklist (AUTOPSY-BRIEF section 4), the page's test and the thesis lint
  (`npm run lint:thesis`), and checks version claims against `src/_data/toolVersions.mjs`. It cannot
  browse the web: whatever it lists under "needs maintainer or sme" goes in
  the PR body and the digest, not into the page as verified.
- `growth-writer` drafts from merged changes and real numbers only. The
  conductor returns the draft to the maintainer through the digest. Nothing
  is published by an agent.
- A `scribe` that fails once is re-briefed as an `implementer` task. A task
  that fails twice on Sonnet is split or blocked, then taken to the
  maintainer ("When something fails" in `CONDUCTOR.md`).

## Operating rhythm

- **Instructions, not a sandbox.** The WIP limit below, "read-only" roles,
  "no web access" and "never publishes" are conventions held by instruction
  plus a missing edit tool. `growth-writer`, `technical-editor`, `scout`,
  `verifier` and `reviewer` all hold Bash, so they behave that way because
  they were told to. See "an instruction plus a missing tool, not a sandbox"
  in [`CONDUCTOR.md`](CONDUCTOR.md). Reviews and the Definition of Done are
  what catch a violation.
- **Small PRs, one plan item each.** Short-lived `claude/<short-name>`
  branches. The checkbox flips in the PR that closes the item.
- **WIP limit: the conductor keeps at most 3 of its own PRs open.** At 3,
  stop opening new ones: wait for CI, run the review, merge through
  `node scripts/merge-pr.mjs <n> --execute` (a PR on a maintainer-only path
  gets a WARN from the script; `--strict` refuses it), then continue. A fourth open PR
  means review queue is the bottleneck, so the next action is to review,
  not to write.
- **Never idle-wait.** While CI runs or a reviewer works, run roles in the
  background (`run_in_background`) on the next item's `scout` pass or on
  verification of another branch. Parallel work must touch disjoint files,
  or use its own worktree; one conductor per checkout.
- **Per item:** Ready check, brief, build, `verifier`, `reviewer` (plus
  `technical-editor` for content), fix findings, PR, merge via the script.
  Run `bash scripts/worktree-prune.sh` when worktrees pile up.
- **Weekly:** one digest (below). It is the maintainer's only required
  reading.

## Definition of Done: additions

On top of the Definition of Done in `CONDUCTOR.md`:

- [ ] **Thesis lint** passes: `npm run lint:thesis`
      (`scripts/thesis-lint.mjs`, P17-7). It also runs inside `npm test`.
- [ ] **Review record in the PR body and the full report as a PR comment**:
      `## Review record` with `Verdict:` and `Findings resolved: yes`, and
      the reviewer's whole report pasted via `gh pr comment`. For content,
      the `technical-editor` report is pasted the same way.
- [ ] **Honest AI-provenance wording on content pages.** A page says it was
      drafted with AI assistance. It says "reviewed by <person>" only after
      the maintainer has confirmed the review, and never otherwise.
- [ ] **Labels stay true.** Unexecuted SQL is labelled untested, illustrative
      scenarios are labelled illustrative, and a version-specific claim
      names its version.
- [ ] **CHANGELOG `[Unreleased]` entry** for anything a reader or
      contributor would notice.

## Weekly digest

Once a week the conductor reads
[`../.claude/skills/weekly-digest/SKILL.md`](../.claude/skills/weekly-digest/SKILL.md)
and follows it step by step (do not assume the Skill tool is available to a
restricted-tools agent). It builds a one-screen digest and posts it as a GitHub issue titled
`Weekly digest YYYY-MM-DD`: merged PRs and their plan items, open PRs, CI
health, open plan boxes, content that needs the maintainer's human read
(with page links and what to check), assistant feedback and analytics if
readable, decisions needed with dates, and one `growth-writer` LinkedIn
draft. Unknowns are written as unknown. The digest links evidence for every
number and never invents one. Because it is a public issue, assistant
feedback appears as aggregates only and visitor-typed text is never quoted.
The body is written to a file in the OS temp directory by a `scribe` and
posted with `--body-file`, never inside quotes on a command line.

## Stop-and-ask triggers

Stop, state what you saw, and wait for the maintainer when any trigger in
"Stop and ask the maintainer" in [`CONDUCTOR.md`](CONDUCTOR.md#stop-and-ask-the-maintainer)
holds, or when the Tier 3 list there applies. In addition, stop and ask for:

- **A claim you cannot verify on a page that teaches CDC.** Do not publish it
  as fact, do not soften it into vagueness; list it and ask.
- **Any change to the thesis** (the sentence in the Mission above), including
  a "small clarification".
- **Anything that spends money**: paid APIs, paid tiers, a purchase, a plan
  upgrade. The rule is no recurring cost.
- **Anything touching privacy wording**: the privacy page, analytics and
  cookie statements, the newsletter and assistant-feedback notices, and
  security-contact text.
- **A request for a stronger model.** See below.

## Retro

The learning loop. Models do not learn between sessions, so the repo has to.
Run this at the end of every session (it is a step of `/team-end` once that
command exists in your checkout; otherwise run it by hand). The ledger is
[`LESSONS.md`](LESSONS.md); the boundary on what an agent may change is
"Self-improvement boundary" in [`CONDUCTOR.md`](CONDUCTOR.md#self-improvement-boundary).

1. List what went wrong or was slow this session: a failed check, a review
   finding, a retried or abandoned task, a guard denial, a stale document.
2. For each, ask: **what check would have caught it?** A test, a lint rule, a
   hook, a doc check. Prefer one that runs in `npm test`. Fix the class of the
   mistake, not the instance. If no check is possible, write the one-line
   reason.
3. Append a `LESSONS.md` entry for each lesson not already covered (append
   only; a correction is a new entry).
4. Where a check is missing, open the item: a PR that adds the test, or a plan
   item under "Handoff kit follow-ups" in the plan.
5. Anything that needs the maintainer (a guardrail that would have to change,
   a baseline, a ruleset) goes under "Needs you". Never weaken or remove a
   guardrail to make a problem go away.

At the start of a session, read the `open` and `partially` entries first:
`rg -n "^- Status: (open|partially)" docs/LESSONS.md`.

## Escalation role (NOT enabled)

**Policy.** Sonnet 5.5 and Haiku 5.5 are the only models. A stronger model is
used only when absolutely needed, through exactly one gated role named
`sme-reviewer`. Its only job is fact-checking **new or rewritten
thesis-bearing pages**. Every use needs a written justification in the PR:
which page, which claims, and why `technical-editor` was not enough. It is
spawnable only by the conductor. It is not enabled: the maintainer decided on
2026-10-11 that there is no stronger model for now, and no model ID will be
supplied for now (see `docs/DECISIONS.md`, "AI development" and the entry
"No stronger model for now").

**Steps to enable it if the maintainer ever supplies a model ID** (this is a
Tier 3 change; the maintainer merges it by hand):

1. Add `.claude/agents/sme-reviewer.md`: same frontmatter shape as
   `technical-editor`, tools `Read, Grep, Glob, Bash` only, `model:` set to
   the full pinned ID the maintainer gave (the role's frontmatter pins the
   model), a short body saying it fact-checks thesis-bearing pages and never
   edits.
2. Extend `.claude/hooks/guard-agent-model.mjs` so the new ID is allowed
   **only when the spawned `subagent_type` is `sme-reviewer`**. Do not add the
   ID to the global `ALLOWED_MODELS` list: that would let any role be spawned
   on it. Add tests beside the existing deny cases: `sme-reviewer` plus that
   ID is allowed; `implementer` plus that ID is still denied; other stronger
   models are still denied for every role.
3. Extend `tests/unit/agent-roster.test.js`. Its `PINNED` list is global, so
   add a per-role exception: `sme-reviewer` may be pinned to the new ID, every
   other role may not. Add `sme-reviewer` to the expected role list and the
   read-only list, and assert `agents["sme-reviewer"].model` equals the ID.
   The test must still fail if any other role is pinned to the new ID.
4. Add `sme-reviewer` to the conductor's `Agent(...)` list in
   `.claude/agents/conductor.md`, and to the roster table in `CONDUCTOR.md`.
5. Check `.claude/settings.json` `availableModels` and the model aliases:
   widen them only as far as that single ID, and keep the roster test's
   `availableModels` assertion in step with the change.
6. Record the ID, the date and the justification rule in `docs/DECISIONS.md`.

**Interim substitute.** `technical-editor` (Sonnet) reviews the page, lists
what it cannot check as "needs maintainer or sme", and the maintainer reads
the page before it is called reviewed. Until the maintainer has read it, the
page keeps AI-assisted-only wording.

## Handoff protocol

The repo is the memory. Local memory files, chat history and worktree state
are not the record: the next session starts from `git log`, the plan and the
changelog.

End every session by writing a dated note (`YYYY-MM-DD`) into
`CHANGELOG.md` `[Unreleased]`, as one rolling "Latest handoff" block that
replaces the previous one. It ships as a small PR titled
`docs(handoff): YYYY-MM-DD` through the same gate as any change (reviewer
pass required; `CHANGELOG.md` is not a restricted path). The note lists:

- **Open**: PRs awaiting CI or review, branches with unmerged work.
- **Blocked**: what is waiting on whom, with the date it was raised.
- **Next**: the one item the next session should start with, and why.

Plan items are not edited by the note. Only when something is blocked, add a
pointer in the plan item to the handoff block, not a copy of it.

Clean up your worktrees before you stop.

## Backlog map

- **Candidate work**: Phase 17 in `docs/IMPLEMENTATION-PLAN.md` is the team's
  queue. Older agent-executable boxes in the plan come next,
  lowest-numbered first. Phase 14 is the maintainer's register; do not start it.
- **Content candidates** (`docs/DECISIONS.md`, "Content direction"):
  lakehouse table formats, CDC for AI (keeping vector stores and RAG
  indexes fresh), schema contracts, cost modelling, Flink CDC. Vendor
  comparisons wait for a disclosure policy. Evidence for ordering is in
  [`content-gap-plan-2026-10.md`](content-gap-plan-2026-10.md) and
  [`AUTOPSY-BRIEF.md`](AUTOPSY-BRIEF.md) section 6.
- **Waiting on the maintainer**: `docs/MAINTAINER-TASKS.md` (P17-8) and the
  "Pending" list in `docs/DECISIONS.md`.
- **Dated gates**:

  | Date       | Gate                                                                                                                 |
  | ---------- | -------------------------------------------------------------------------------------------------------------------- |
  | 2026-10-23 | Domain decision target. Until it is made, no work that bakes in a host or a new name.                                |
  | 2026-11-06 | First 28-day data snapshot (Search Console, GoatCounter): do not pick the next content phase from guesses before it. |

  Dates are the maintainer's local dates; GitHub timestamps are UTC, so
  evening merges show the next day.

  Put both dates in the digest's "decisions needed" section as they near.
