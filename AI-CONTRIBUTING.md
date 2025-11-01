# AI-CONTRIBUTING.md

## Purpose
This document describes the AI agents that automatically maintain and improve this repository. It defines their responsibilities, limitations, and behavioral rules to ensure they enhance rather than disrupt the development workflow.

## Agent Overview

### 1. Image Optimization Agent (`site-image`)

**Responsibility:** Optimizes images for web delivery by compressing and converting them to modern formats.

**What it does:**
- Scans the `src/` directory for image files (`.jpg`, `.jpeg`, `.png`, `.gif`)
- Identifies images larger than 10 KB that could benefit from optimization
- Converts images to WebP format with 85% quality setting (when enabled)
- Reports potential optimizations without modifying files by default

**What it won't do:**
- Modify content semantics or alt text
- Delete original images
- Change image dimensions or crop images
- Optimize images smaller than 10 KB (minimal benefit)
- Process images in `node_modules`, `_site`, `dist`, or `.git` directories

**Configuration:**
- Located in: `ai/scripts/image-optimize.mjs`
- Requires: `sharp` package (install with `npm install --save-dev sharp`)
- Quality setting: 85% (configurable in script)
- Minimum file size: 10 KB

**Activation:**
To enable actual optimization (currently in report-only mode):
1. Install sharp: `npm install --save-dev sharp`
2. Uncomment the optimization code in `ai/scripts/image-optimize.mjs`
3. Commit changes via pull request for review

### 2. Link Checker Agent (`site-link-check`)

**Responsibility:** Validates internal links in the built site to detect broken references and 404 errors.

**What it does:**
- Builds the site using `npm run build`
- Scans all HTML files in the `_site/` directory
- Extracts and validates links from `<a>`, `<img>`, `<script>`, and `<link>` tags
- Checks internal links point to existing files
- Respects the `ELEVENTY_PATH_PREFIX` for sites hosted under subdirectories
- Reports broken links with file locations and link types
- Fails the workflow if broken links are found

**What it won't do:**
- Check external links (HTTP/HTTPS) by default
- Follow redirects or check HTTP status codes
- Validate anchor targets within pages
- Modify HTML or fix broken links automatically
- Check links in JavaScript-generated content

**Configuration:**
- Located in: `ai/scripts/link-check.mjs`
- Respects: `ELEVENTY_PATH_PREFIX` environment variable
- Skips: `mailto:`, `tel:`, `javascript:`, and anchor-only links
- External link checking: Disabled by default (set `checkExternal: true` to enable)

**Expected behavior:**
- ✅ Passes when all internal links are valid
- ❌ Fails when broken links are detected (returns exit code 1)
- Broken links should be fixed in source files, not by the agent

### 3. Other Agents

See `ai/AGENTS.md` for complete documentation of all agents including:
- `site-content`: Site building and content updates
- `site-packaging`: Label exports and print-ready assets
- `site-data`: Data synchronization
- `site-analytics`: Build statistics and metrics

## General Agent Rules

### Autonomy & Constraints

**Agents MUST:**
- Produce deterministic, idempotent outputs
- Tag AI-generated outputs with `ai-generated: true` in frontmatter/JSON
- Exit with appropriate status codes (0 for success, non-zero for failure)
- Log their activities via `ai/scripts/log-agent-run.mjs`
- Respect `.gitignore` and avoid committing build artifacts

**Agents MUST NOT:**
- Overwrite user-authored Markdown, templates, or source code
- Change content semantics, meaning, or tone
- Delete working files or code without explicit configuration
- Make breaking changes to the site structure
- Bypass code review by pushing directly to protected branches

### Workflow Integration

- **Schedule:** Runs daily at 03:00 UTC via `.github/workflows/ai-agents.yml`
- **Manual Trigger:** Can be run individually or all at once via workflow dispatch
- **Failure Handling:** Agents that fail report their status but don't block other agents
- **Review Process:** Changes that modify source files require pull request review

### Conflict Resolution

Priority order when conflicts arise:
1. Data files (`src/_data/`)
2. Layouts and templates (`src/_includes/`)
3. Assets (CSS, JS, images)

Human review always takes precedence over agent decisions.

## Running Agents Locally

### Image Optimization
```bash
node ai/scripts/image-optimize.mjs
```

### Link Checking
```bash
# Build the site first
npm run build

# Run link checker
ELEVENTY_PATH_PREFIX=/letstalkcdc node ai/scripts/link-check.mjs
```

### All Agents via GitHub Actions
```bash
# Trigger manually via GitHub Actions UI
# Or use GitHub CLI:
gh workflow run ai-agents.yml -f agent=all
gh workflow run ai-agents.yml -f agent=link-check
```

## Extending the Agent System

To add a new agent:

1. **Create the script** in `ai/scripts/` following the naming pattern `<function>-<action>.mjs`
2. **Add a job** to `.github/workflows/ai-agents.yml` with proper conditional logic
3. **Document it** in both `ai/AGENTS.md` and this file
4. **Test locally** with `node ai/scripts/<your-script>.mjs`
5. **Use logging** via `ai/scripts/log-agent-run.mjs` for status tracking
6. **Ensure reversibility** - all changes should be revertable via Git history

## Security & Privacy

- Agents run in GitHub Actions environment with controlled permissions
- No data leaves GitHub runners without explicit configuration
- Secrets are stored in GitHub Actions secrets, never in source code
- Only publishing workflows have write permissions to production

## Questions & Issues

For agent-related issues or suggestions:
- Check existing issues labeled `ai-agent`
- Review logs in `ai/logs/` directory
- Consult `ai/AGENTS.md` for technical details
- Open a new issue describing the problem or enhancement

## Version

This document is part of the AI Integration Template v1.0. Changes are tracked in `CHANGELOG.md`.
