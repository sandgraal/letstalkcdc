type: Fixed

**Commit-making tests no longer depend on the machine's git identity (P17-58).**
Tests that run `git commit` or `git merge` now share
`tests/unit/helpers/git-env.js`, which gives them no global or system git
config, `user.useConfigOnly`, and their own identity, so they behave the same
on a CI runner as on a developer machine that guesses a name. The
`merge-pr.test.js` signature block had no such environment and now has.
