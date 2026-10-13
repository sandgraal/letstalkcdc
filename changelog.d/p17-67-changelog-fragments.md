type: Changed

**Changelog fragments, so a PR never edits `CHANGELOG.md` (P17-67).** Add one
new file under `changelog.d/` (optional first line
`type: Added|Changed|Fixed|Removed|Security|Docs`, then the entry text)
instead of editing `CHANGELOG.md`; the conductor folds the fragments into
`## [Unreleased]` with `npm run changelog:compile` in one commit (`--check`
validates, `--dry-run` previews). `changelog.d/README.md` states the rule;
`CLAUDE.md`, `docs/CONDUCTOR.md`, `docs/TEAM-CHARTER.md`, the skills, agents
and `/team-end` now say "add a fragment". A unit test fails the suite if a
fragment is malformed. The "Latest handoff" block remains the one direct edit
to `CHANGELOG.md`, made by the conductor.
