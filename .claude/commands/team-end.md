---
description: End a working session of the agent team (check worktrees, list PRs and CI, dry-run the prune, write the dated handoff note, report)
---

# /team-end

The one command that ends a session, so the next one can start cold from the
repo. It is run by the conductor, which has no edit tools: the handoff note
is written by a `scribe`, not by the conductor. Models: Sonnet and Haiku only.

## Steps

### 1. Confirm nothing is uncommitted

```bash
git worktree list
git -C <each worktree path> status --short
```

Run `git status` in every worktree listed. Uncommitted work is either
committed on its `claude/*` branch by the role that owns it, or reported as
open. Do not discard it.

### 2. List open PRs and their CI

```bash
gh pr list --state open
gh pr checks <n>
```

Record, for each PR, whether it is waiting on CI, on review, or on the
maintainer. A PR that is ready is merged only by
`node scripts/merge-pr.mjs <n> --execute` after the dry run, and only when
the review record and CI are in order; otherwise it stays open and is listed.

### 3. Dry-run the worktree prune

```bash
bash scripts/worktree-prune.sh
```

Run it WITHOUT `--execute` and show the output to the maintainer. Removing
finished worktrees is a separate, deliberate step.

### 4. Delegate the handoff note

Brief a `scribe` (a small writing task; if it fails once, re-brief as an
`implementer` task) to append a dated (`YYYY-MM-DD`) note to both
`CHANGELOG.md` `[Unreleased]` and each plan item worked on, with three lines:

- **Open**: PRs awaiting CI or review, branches with unmerged work.
- **Blocked**: what is waiting on whom, with the date it was raised.
- **Next**: the one item the next session should start with, and why.

The note goes into a PR like any other change (one plan item per PR), through
a worktree. Numbers in it come from commands run this session.

### 5. Report to the maintainer

Reply in the chat with a short summary: what merged, what is open and its CI,
the prune dry-run result, and anything that needs his decision, each with the
exact decision needed and a date if there is one. Anything a stop-and-ask
trigger caught this session (see `docs/TEAM-CHARTER.md`) goes here too.

Items needing a decision are collected under a `needs-maintainer` heading
so that `/team-digest` carries them into the next weekly digest.
