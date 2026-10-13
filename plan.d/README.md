# Plan fragments

**Never edit `docs/IMPLEMENTATION-PLAN.md` in a feature PR.** Every PR used to
flip a checkbox or append a status line there, which made it a merge-conflict
magnet. Instead, add ONE new file here per plan item you touch, and the
conductor applies the fragments to the plan later.

This rule is for agents and humans alike. It is the sibling of
[`changelog.d/`](../changelog.d/README.md), which does the same for
`CHANGELOG.md`.

## Add a fragment

Create `plan.d/<item-id>-<topic>.md`, with the item id in lower case, for
example `plan.d/p17-99-llms-txt.md`. The name must be unique, which is what
keeps two PRs from conflicting, and it must start with the item id (the check
rejects a file whose name and `item:` line disagree).

```markdown
item: P17-99
action: done

Shipped in the PR carrying this change; `npm run verify-all` green.
```

The first two lines are required and come in this order:

- `item: P17-NN`: the id exactly as it appears in the plan (`**P17-99 ·`).
- `action: done | status | add`.

Then a blank line and the text.

### `action: done`

Flips that item's `- [ ]` to `- [x]` and appends the text, if there is any, as
a trailing line under the item (same indent as the item's other lines). The
text is optional. Use it for the one-line note of what proved it, which
`docs/CONDUCTOR.md` asks for. If the item ends with the stale line
`_Status: not started._`, the conductor edits that line by hand; the script
never rewrites existing plan text.

### `action: status`

Adds the text as an indented sub-bullet (`  - text`) under the item and
changes nothing else. The text is required. Use it for a dated status that
should not close the item.

### `action: add`

Adds a new item. Two more lines go between `action:` and the blank line:

```markdown
item: P17-99
action: add
phase: Phase 17
section: Handoff kit follow-ups

- [ ] **P17-99 · Title.** Outcome: ... Size: S. Role: `implementer`. Needs: none.
```

- `phase:` is required and matches the heading `## Phase 17` (the heading may
  continue after it, so `## Phase 17 — Handoff kit` matches).
- `section:` is optional and matches a `### ` heading inside that phase. Use
  it whenever the phase ends in prose or a list of something other than
  checkboxes (Phase 17 ends in "Parked for the maintainer"), otherwise the item
  lands at the very end of the phase.
- The text must itself begin `- [ ] ` or `- [x] ` followed by `**<item id>`, so
  the `item:` line and the new checkbox cannot disagree. Continuation lines
  are indented the way the plan indents them (six spaces).
- The new item goes after the last line of the phase or section. If the id is
  already in the plan the fragment changes nothing.

### Rules for the text

- `done` and `status` text may not start with `#`, `- `, `* `, `+ ` or a number
  and a dot (`1. `): `#464 fixed X` reads as a heading, so write
  `PR 464 fixed X`.
- Blank lines in the text are kept.
- Files that are not `.md`, an unknown action, an unknown item id, an item id
  that occurs twice in the plan, or a missing field are rejected. (The plan
  currently has two `P17-59` lines; nothing can target that id until one is
  renumbered.)

Check it before you push:

```bash
npm run plan:apply -- --check
```

`--check` runs the whole application in memory against the plan, so an
unknown item id is reported before the conductor sees it. A unit test
(`tests/unit/plan-apply.test.js`) fails the suite if any fragment in this
directory is rejected by that check.

## Applying (conductor only)

On `main`, in one commit (the `/team-end` handoff PR, next to the changelog
fold):

```bash
npm run plan:apply -- --dry-run   # show what would change
npm run plan:apply                # apply, then delete the fragments
npm run format                    # then commit the plan and the deletions
```

Fragments are applied in file-name order, each seeing the result of the one
before, so an `add` named before a `done` for the same item works. If one
fragment is rejected, nothing is written and nothing is deleted.

The plan is written atomically (temp file in the same directory, then rename)
before any fragment is deleted. If a delete fails, the script lists the
fragments that remain and exits 1. Rerun it: a fragment whose effect is
already in the plan changes nothing and is only deleted, so a status line is
never added twice.

`--dir <path>` and `--plan <path>` need a value; a missing value or one
starting with `--` prints the usage and exits 2.

This directory is outside Eleventy's input directory (`src/`), so it is
never built into the site.
