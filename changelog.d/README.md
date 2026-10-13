# Changelog fragments

**Never edit `CHANGELOG.md` in a feature PR.** Everyone touching one file
makes it a merge-conflict magnet. Instead, add ONE new file here, and the
conductor folds the fragments into `## [Unreleased]` later.

This rule is for agents and humans alike.

## Add a fragment

Create `changelog.d/<branch-or-topic>.md`, for example
`changelog.d/p17-67-changelog-fragments.md`. The name must be unique, which
is what keeps two PRs from conflicting. Use the plan item or branch name.

```markdown
type: Fixed

**Short bold lead (P17-99).** What a reader or contributor would notice, in
one or more lines, written exactly as it should read inside a bullet.
```

- The first line `type: Added|Changed|Fixed|Removed|Security|Docs` is
  optional. The default is `Changed`.
- The rest is the entry text without the leading `- `. Continuation lines
  are indented for you.
- Do not start the text with a list marker or a `#`.
- Files that are not `.md`, an empty entry or an unknown type are rejected.

Check it before you push:

```bash
npm run changelog:compile -- --check
```

A unit test (`tests/unit/changelog-compile.test.js`) fails the suite if any
fragment in this directory is rejected by that check.

## Folding (conductor only)

On `main`, in one commit (the `/team-end` handoff PR, or the weekly digest
run):

```bash
npm run changelog:compile -- --dry-run   # show what would change
npm run changelog:compile                # fold, then delete the fragments
npm run format                           # then commit CHANGELOG.md and the deletions
```

Each entry goes to the top of the first matching `### <Type>` heading inside
`## [Unreleased]` (newest first). A missing heading is created. The
compile is idempotent: a second run finds no fragments. Existing
`CHANGELOG.md` text is never rewritten.

This directory is outside Eleventy's input directory (`src/`), so it is
never built into the site.
