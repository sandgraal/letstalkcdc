---
paths:
  - ".github/**"
---

<!-- Applies to: .github/** -->

# Workflow rules

- The maintainer merges changes to `.github/` (workflows, CODEOWNERS). An
  agent may propose them in a PR but never merges one; see `docs/CONDUCTOR.md`.
- **Never add secrets**, tokens or keys to a workflow or to any file. Use
  `${{ secrets.NAME }}` for something that must stay private, and repository
  variables (`vars.NAME`) for public values such as `SITE_HOST`,
  `SUPABASE_URL` and the publishable key. Creating secrets and variables is
  a maintainer action in repository settings.
- Do not widen `permissions:`; keep each job at least privilege. Pin actions
  to a major version or SHA the way existing workflows do.
- Install with `npm ci`, never `npm install`.
- Do not weaken a gate (remove a job, add `continue-on-error`, loosen a
  threshold) to turn CI green. Fix the cause or report it.
- `main` has no required status checks (see `CLAUDE.md`); CI is advisory
  until the maintainer changes the ruleset, so say plainly what CI showed.
- Workflows: `ci.yml`, `deploy.yml`, `linkcheck.yml`, `fortify.yml` and three
  `playground-*.yml`. Lighthouse floors live in `lighthouse-ci.config.json`,
  not in the workflow. CodeQL is repository settings (default setup), not a file.
- `deploy.yml` builds with the repository variables and runs
  `scripts/publish-playground.sh`; a change to either affects production.
- `.github/CODEOWNERS` lists the agent-context files; keep it matching what
  exists.
