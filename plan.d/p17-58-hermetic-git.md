item: P17-58
action: done

Done 2026-10-13. Audit of `tests/unit` for `git commit` / `git merge` calls: `guard-bash.test.js` (2 helpers), `guard-edit.test.js` (1), `worktree-prune.test.js` (1 helper plus one direct spawn), `merge-pr.test.js` (3 real-git blocks). Every one now runs with the environment from `tests/unit/helpers/git-env.js`: `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `user.useConfigOnly=true`, inherited `GIT_CONFIG_*` removed, and its own identity. The `merge-pr.test.js` signature block (line ~4410) had no hermetic environment before. `check-merged-prs`, `doc-facts` and `no-appwrite` run git without committing. `tests/unit/git-env.test.js` proves a commit succeeds with the helper and is refused without an identity.
