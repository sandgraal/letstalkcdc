item: P17-25
action: done

`.github/workflows/labs-verify.yml` and `scripts/labs-verify.mjs` run the Postgres path of `compose.yaml`. First run 38451400038 failed at the kcat read-back (the check expected flat events; the image emits `{schema, payload}`); after the fix, `workflow_dispatch` run https://github.com/sandgraal/letstalkcdc/actions/runs/38452455447 passed all 7 steps on branch `claude/p17-25-labs-fix`. Runner and tool versions are in that run's log.
