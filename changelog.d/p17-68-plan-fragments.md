type: Changed

**Plan fragments, so a PR never edits `docs/IMPLEMENTATION-PLAN.md`
(P17-68).** Add one new file `plan.d/<item-id>-<topic>.md` per plan item
instead (`item: P17-NN`, `action: done | status | add`, then the text);
`done` flips the box and appends a note, `status` adds a sub-bullet, `add`
appends a new checkbox to a phase or section. The conductor applies the
fragments with `npm run plan:apply` (`--check` validates against the real plan,
`--dry-run` previews), next to the changelog fold in `/team-end`.
`plan.d/README.md` states the rule; `CLAUDE.md`, `docs/CONDUCTOR.md`,
`docs/TEAM-CHARTER.md`, `docs/CONTRIBUTING.md`, the skills, agents,
`/team-end` and the PR template now say "add a fragment". A unit test fails
the suite if a fragment is malformed or names an unknown item.
