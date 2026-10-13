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
git -C <worktree path> status --short
```

Run the `git -C <worktree path> status --short` line for every worktree
listed. Uncommitted work is either
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
the review record and CI are in order, the PR's head is a `claude/*` branch
of this repository by the team's account, and you are confident (else stop
and ask, as in `/team-start` step 3). A PR that touches a restricted (Tier 3)
path is handed to the maintainer, as in `/team-start` step 3. Everything else
stays open and is listed.

### 3. Dry-run the worktree prune

```bash
bash scripts/worktree-prune.sh
```

Run it WITHOUT `--execute` and show the output to the maintainer. Removing
finished worktrees is a separate, deliberate step.

### 4. Delegate the handoff note

There is ONE handoff route. Brief a `scribe` (a small writing task; if it
fails once, re-brief as an `implementer` task) to write a dated
(`YYYY-MM-DD`) note into `CHANGELOG.md` `[Unreleased]` and nowhere else, as a
single rolling "Latest handoff" block that replaces the previous one. Plan
items are not edited by the note. The block has three lines:

- **Open**: PRs awaiting CI or review, branches with unmerged work.
- **Blocked**: what is waiting on whom, with the date it was raised. Durable
  items for the maintainer live here, and `/team-digest` reads them from here.
- **Next**: the one item the next session should start with, and why.

It ships as a small PR titled `docs(handoff): YYYY-MM-DD`, from a worktree
cut from `origin/main`. It goes through the same gate as any other change: a
`reviewer` pass is required, and `CHANGELOG.md` is not a restricted path, so
it is merged with `node scripts/merge-pr.mjs`. A handoff PR carries no plan
item, so the one-plan-item-per-PR rule has nothing to count. Numbers in it
come from commands run this session.

The same commit also folds the changelog fragments: feature PRs never edit
`CHANGELOG.md`, they add `changelog.d/<topic>.md` (see
`changelog.d/README.md`). From the handoff worktree, cut from `origin/main`:

```bash
npm run changelog:compile -- --dry-run
npm run changelog:compile
npm run format
```

This inserts each fragment into `## [Unreleased]`, deletes the fragment
files, and leaves the rest of `CHANGELOG.md` as it was. Commit the handoff
block, the folded entries and the deletions together, in one commit by the
conductor. If `--check` rejects a fragment, fix or delete that file on its
own; do not hand-edit around it.

### 5. Report to the maintainer

Reply in the chat with a short summary: what merged, what is open and its CI,
the prune dry-run result, and anything that needs the maintainer's decision,
each with the exact decision needed and a date if there is one. Anything a
stop-and-ask trigger caught this session (see `docs/TEAM-CHARTER.md`) goes
here too.

Items needing a decision go under "Needs you", the weekly-digest skill's
section name. Anything that outlives the session is also written on the
handoff block's Blocked line, which is what `/team-digest` reads.
