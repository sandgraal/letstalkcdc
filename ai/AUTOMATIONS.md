# AUTOMATIONS.md

Purpose: define recurring jobs and their triggers. Keep human effort minimal.

## Jobs
- Content refresh: rebuild site and validate links
- Image optimization: scan, report, and optionally compress images to WebP format
- Link checking: validate internal links in built site and report broken references
- Packaging exports: render labels or product sheets
- Data sync: normalize `_data/` and cache JSON
- Analytics: dump basic metrics to `/ai/logs/`

## Schedules
- Daily 03:00 UTC for all non-destructive jobs (content, data, analytics, link-check)
- Manual dispatch for potentially destructive jobs (e.g., image optimization when enabled)

## Monthly agent health check
Run this checklist during the first full week of each month. Capture findings in the ops note or linked issue so owners can respond.

1. **Log review:** Pull the previous month of `ai/logs/*.jsonl` entries for each agent. Verify success ratios, note recurring failures, and flag anomalies to the listed human owner in `ai/AGENTS.md`.
2. **Dry-run validation:** Manually execute each script (`npm run agent:*` or `node ai/scripts/<name>.mjs`) in report-only mode where available to confirm dependencies, credentials, and build steps are still valid.
3. **Rollback drill:** Choose one agent per cycle and rehearse its rollback: identify the last known good commit, confirm `git revert` steps, and document whether additional artifacts (e.g., `_site/downloads/`) require manual cleanup.

## How to add a job
1. Create a script in `ai/scripts/`
2. Add a job block to `.github/workflows/ai-agents.yml`
3. Log results via `ai/scripts/log-agent-run.mjs`
4. Document in `ai/AGENTS.md` and `AI-CONTRIBUTING.md`
