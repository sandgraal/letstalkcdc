# Hosting Platform Documentation

## Current Platform: GitHub Pages

This project is deployed using **GitHub Pages** with **GitHub Actions** for CI/CD. The static site is built with Eleventy and deployed automatically on every push to the `main` branch.

### Why GitHub Pages?

- **Zero cost** for public repositories
- **Built-in CI/CD** via GitHub Actions
- **Simple deployment**—no additional platform accounts required
- **Git-based workflow**—deploy on push to `main`
- **Custom domain support** with free SSL/TLS
- **Version control integration** keeps deployments auditable

### Deployment Architecture

```
GitHub Repository (main branch)
    ↓
GitHub Actions Workflow (.github/workflows/deploy.yml)
    ↓
Build Eleventy Site (npm run build)
    ↓
Deploy to GitHub Pages (_site/ directory)
```

## Setting Up GitHub Pages Deployment

### 1. Enable GitHub Pages

1. Go to repository **Settings → Pages**.
2. Under “Build and deployment”, select **GitHub Actions** as the source.
3. The workflow will automatically trigger on the next push to `main`.

### 2. Configure Environment Variables

Define these repository variables under **Settings → Secrets and variables → Actions → Variables**:

| Variable               | Description                                                    | Example                                                   |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `SITE_HOST`            | Full URL where the site is hosted                              | `https://sandgraal.github.io` or `https://yourdomain.com` |
| `ELEVENTY_PATH_PREFIX` | Path prefix for project pages (leave blank for user/org pages) | `/letstalkcdc` or blank                                   |

### 3. Automatic Deployment

The site automatically rebuilds and deploys when:

- Changes are pushed to the `main` branch
- The workflow is manually triggered via the Actions tab

## No Serverless Requirement

GitHub OAuth-based progress sync has been removed. All journey progress is now tracked locally in the browser, so the legacy `migrateUser` function and associated serverless hosting are no longer needed. You can delete any residual function deployments and secrets tied to that flow.

## Optional Appwrite Variables

Appwrite credentials are only required if you want to sync assistant feedback:

| Variable            | Description                      |
| ------------------- | -------------------------------- |
| `APPWRITE_ENDPOINT` | Appwrite API endpoint URL        |
| `APPWRITE_PROJECT`  | Appwrite project ID              |
| `APPWRITE_DB_ID`    | Appwrite database ID             |
| `COL_ASSISTANT_ID`  | Assistant feedback collection ID |

If any of these are omitted, the assistant silently falls back to storing feedback locally.

## Migration from Netlify (If Needed)

If you previously hosted on Netlify:

1. ✅ **Static Site** – Already handled by GitHub Actions.
2. ✅ **Functions** – Remove the unused `migrateUser` function and related secrets.
3. ✅ **Environment Variables** – Keep only the optional Appwrite values listed above if you still use them.
4. ✅ **Cleanup** – Delete `netlify.toml` or function directories when no longer required.

## Custom Domain Setup (Optional)

### For GitHub Pages

1. Add a `CNAME` file to the repository root with your domain.
2. Configure DNS:
   - Apex domain: Add A records to GitHub’s IPs.
   - Subdomain: Add a CNAME record pointing to `<username>.github.io`.
3. Enable HTTPS in repository settings.

## Testing and Validation

Before considering a deployment complete:

1. ✅ Static site builds and deploys successfully.
2. ✅ All pages load correctly at the deployed URL.
3. ✅ Local progress persists across reloads (no authentication required).
4. ⚠️ (Optional) Assistant feedback reaches Appwrite if credentials are supplied.

## CI failure runbook

Follow these steps before paging a human escalation channel when a GitHub Actions workflow fails:

1. **Identify the agent:** Inspect the failing job in the Actions log. Match the job name to the oversight matrix in `ai/AGENTS.md` to confirm the responsible agent and human owner.
2. **Review recent runs:** Pull the relevant `ai/logs/<agent>.jsonl` entries to spot recurring errors or timeouts. Share anomalies with the listed owner via the team channel noted in your ops notes.
3. **Reproduce locally:** Run the matching script (`npm run agent:<name>` or `node ai/scripts/<file>.mjs`) in report mode. Capture console output and environment differences (e.g., missing `ELEVENTY_PATH_PREFIX`).
4. **Apply the health checklist:** If the issue persists, run the monthly agent health steps in `ai/AUTOMATIONS.md` for that agent—log review, dry-run, and rollback rehearsal—to validate recovery paths.
5. **Escalate with context:** Only after the above is complete, escalate to the human owner with links to the failing workflow, log excerpts, and notes on attempted remediations.

## Costs

| Component              | Platform     | Cost                         |
| ---------------------- | ------------ | ---------------------------- |
| Static Site            | GitHub Pages | Free for public repositories |
| Optional feedback sync | Appwrite     | Free tier available          |

## Decision Log

**Date**: 2025-11-01 (updated 2025-11-25)

**Decision**: Continue using **GitHub Pages** for static site hosting. Retire the `migrateUser` serverless function and GitHub OAuth flow—progress remains local by design.

## See Also

- [docs/SETUP.md](SETUP.md) – Full environment setup checklist
- [docs/APPWRITE_QUICKSTART.md](APPWRITE_QUICKSTART.md) – Optional assistant feedback sync
