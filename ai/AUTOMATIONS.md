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

## How to add a job
1. Create a script in `ai/scripts/`
2. Add a job block to `.github/workflows/ai-agents.yml`
3. Log results via `ai/scripts/log-agent-run.mjs`
4. Document in `ai/AGENTS.md` and `AI-CONTRIBUTING.md`
