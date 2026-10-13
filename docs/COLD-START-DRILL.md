# Cold-start drill

Purpose: prove that a brand-new agent can orient itself from the repository
alone. Run it after any change to CLAUDE.md, docs/CONDUCTOR.md,
docs/TEAM-CHARTER.md or the plan's structure, and always after a batch of kit
PRs merges (plan item P17-10, P17-59).

## How to run

Use a fresh `scout` (Haiku 5.5, read-only) with NO chat context. Give it only
the path of a clean checkout of the branch under test and this instruction:

> Work only from files in that directory. Start where a new agent would start
> (CLAUDE.md) and follow its pointers. Do not modify anything; do not run
> `npm install` or any build. For EACH of the 12 questions give a short answer
> and the file and section where it was found, or the exact words
> `NOT FOUND IN REPO` instead of guessing. Then list up to 5 confusing,
> contradictory or missing things (file and what is wrong).

Paste the 12 questions below verbatim.

## The 12 questions

1. What is this project, and what are the three correctness points ("thesis") every page must hold?
2. Which commands must pass before you open a pull request, and which extra check applies if you touch routing/templates and which if you touch CSS?
3. How may you merge a pull request, and which kinds of PR can you NOT merge yourself?
4. What may you push to GitHub without asking, and name four things the guard hooks will deny.
5. Where is your work queue, and what are the first two kinds of work you would pick up?
6. Who reviews content changes, and where must a review be recorded? When may a page claim it was reviewed by the maintainer?
7. Which AI models are allowed, what is the spending rule, and how would a stronger model ever be enabled?
8. Name five things only the maintainer can do (you must stop and ask).
9. What two dated decision points are coming up?
10. How do you prove a CSS change did not alter the production stylesheet?
11. What must you do at the end of every working session so the next team can continue?
12. What is the weekly digest, who writes it, where is it posted, and what must it never contain?

## Answer key (what a correct answer contains)

1. Educational static site on change data capture (Eleventy, Vite, PostCSS; GitHub Pages); thesis: delivery is at-least-once; correctness lives in an idempotent sink keyed on the primary key and ordered by source log position (LSN/SCN/GTID), never `ts_ms`; end-to-end exactly-once across independent systems is not claimed (exactly-once is per hop).
2. `npm run verify-all` (format check, lint, test, build); `npm run smoke:core` for routing/templates; the CSS byte-identity check (`npm run build:css` then `npm run check:css-baseline`, baseline in `.claude/css-baseline.sha256`).
3. Only through `node scripts/merge-pr.mjs <n> --execute` after green CI, no changes requested and a clean test-merge (a missing Review record, a missing reviewer's report comment or a maintainer-only path such as `.github/**`, `.claude/**`, CLAUDE.md/AGENTS.md, the charter docs, `supabase/**`, LICENSE, CNAME or the merge script is a WARN, and `--strict` makes it a refusal); `gh pr merge` is denied.
4. Push a single named `claude/*` branch, open PRs, issues and comments; denied examples: push to main or force-push, `gh pr merge`, `gh api` writes, `--no-verify`, `gh secret|variable set`, shell writes to `.claude/` or hooks, `rg --pre`, pushes touching `.github/`.
5. Phase 17 in docs/IMPLEMENTATION-PLAN.md (then older agent-executable boxes; Phase 14 is the maintainer's); first: the autopsy part A and the no-regret track items marked Ready.
6. The `technical-editor` role with the `reviewer`; recorded in the PR body's `## Review record` and as the full report pasted as a PR comment; a page may say reviewed by the maintainer only after the maintainer confirms.
7. Sonnet 5.5 and Haiku 5.5 only; no recurring spend (free tiers only); a stronger model only through the gated `sme-reviewer` role, which does not exist until the maintainer supplies a model ID (a Tier 3 change with a written justification per use).
8. Any five of: repository variables/secrets; GitHub settings, rulesets, Pages, Actions; accounts (GoatCounter, Buttondown, Supabase, Search Console, registrar); database migrations; the domain; force-push; Phase 14 items; changes to agent instruction files and hooks.
9. Domain decision target 2026-10-23; first 28-day data snapshot 2026-11-06.
10. Same sha256 of `src/assets/css/styles.min.css` as `.claude/css-baseline.sha256` after `NODE_ENV=production npm run build:css`, checked with `npm run check:css-baseline`; if it changes on purpose, update the file and append to docs/css-baseline-history.md.
11. Append a dated note (Open / Blocked / Next) to CHANGELOG `[Unreleased]` and the plan item; the repo, not local memory, is the record; prune worktrees.
12. A one-screen evidence-based weekly report produced by the conductor via the `weekly-digest` skill (a scribe writes the body to a temp file), posted as a GitHub issue "Weekly digest YYYY-MM-DD" with `--body-file`; never visitor-typed text, emails, names, secrets, employer/client names or invented numbers.

## Scoring

Pass = at least 11 of 12 answers contain the key's essentials with a correct
file citation, no answer contradicts another document, and the "confusing or
contradictory" list is empty or contains only items already tracked in the
plan. Record each run (date, branch/sha, score, contradictions) as a dated line
at the end of this file.

## Run log

- 2026-10-11, preview of the kit PRs merged (thesis lint left out): 12 of 12 answered correctly; 5 contradictions reported (work queue pointers, merge permission wording in MAINTAINER-TASKS.md, missing lint:thesis wording, stale STATE-OF-PROJECT facts, heavy AUTOPSY-BRIEF as a first read); part 1 fixes in PR #449, rest in P17-59.
- 2026-10-11, drill 1 (preview with the kit PRs merged): 12 of 12 answered; 5 contradictions; fixes in #449 and the sweep.
- 2026-10-11, drill 2 (sweep branch at 633f188): 12 of 12 answered; 5 contradictions; fixed in 300ade7.
- 2026-10-11, drill 3 (sweep branch at 300ade7), run by a Sonnet `reviewer` after the Haiku scout ran out of turns: 12 of 12 answered correctly with citations; 5 findings (orientation order, thesis not in CLAUDE.md, Tier 3 scope of `.claude/**`, no single "next Ready item", P17-59 status and date wording); fixed in the commit that follows 300ade7 (P17-59).
- To do (P17-10): the confirmation drill on real `main` after the sweep PR merges. Pass = 12 of 12 and zero contradictions.

Note: a Haiku scout can run out of its 30 turns on this drill. Use a Sonnet `reviewer` with Read only.
