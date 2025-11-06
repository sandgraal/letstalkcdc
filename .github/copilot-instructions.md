# Copilot Instructions for Let's Talk CDC

## Project Overview

This is **Let's Talk CDC** — an educational static site about Change Data Capture (CDC), built with **Eleventy 2.x** and deployed to **GitHub Pages**. The codebase uses a hybrid architecture: a static site generator for content with optional serverless functions for user progress tracking via Appwrite.

### Key Architecture Decisions

- **Static-first**: All content is pre-rendered HTML at build time (`_site/` output)
- **Path prefix handling**: Site must work at root (`/`) or subdirectory (`/letstalkcdc/`) for GitHub Pages project hosting
- **Agent-augmented**: Autonomous AI agents handle routine maintenance (see `ai/` directory)
- **Progressive enhancement**: Core content works without JavaScript; interactivity enhances UX

## Developer Workflow

### Build & Development

```bash
npm run build          # Build CSS + generate static site → _site/
npm run dev            # Live server with hot reload at http://localhost:8080
npm run clean          # Remove all build artifacts
npm run smoke          # Run all quality checks (smoke + a11y + perf)
```

**Critical**: The build is a **two-stage process**:

1. PostCSS processes `src/assets/css/styles.css` → `src/assets/css/styles.pref.css` (autoprefixer)
2. CSSO minifies to `src/assets/css/styles.min.css`
3. Eleventy generates HTML from `src/` → `_site/`

### Testing & Quality Gates

```bash
npm run smoke:core     # Validates HTML structure, checks for broken internal links
npm run smoke:a11y     # Runs pa11y accessibility tests (requires Chromium)
npm run smoke:perf     # Performance budget checks
```

All CI checks run on push/PR via `.github/workflows/ci.yml`. **Smoke tests auto-build if `_site/` is missing.**

## Path Prefix System (Critical)

The `lib/path-prefix.cjs` module handles URL prefixing for GitHub Pages:

- **Auto-detection**: If `ELEVENTY_PATH_PREFIX` not set, derives from `GITHUB_REPOSITORY` env
- **Root deployment**: Returns `/` if repo is `owner.github.io`
- **Project pages**: Returns `/repo-name/` for project-specific hosting
- **Usage in templates**: Always use `{{ '/' | url }}` filter in Nunjucks, never hardcode `/`

**Example**: On `sandgraal/letstalkcdc` → pathPrefix becomes `/letstalkcdc/`

## Content Authoring Conventions

### Frontmatter Required Fields

```yaml
---
title: "Page Title" # Required, used in <title> and nav
description: "SEO description" # Required, max 160 chars
tags: ["quickstart", "kafka"] # Optional, for collections
ai-generated: true # Required for AI agent outputs
---
```

### File Naming & Organization

- **Kebab-case**: `quickstart-mysql.html.njk` → `/quickstart-mysql/`
- **Section directories**: Content lives in `src/<topic>/` (e.g., `src/quickstarts/`)
- **Data files**: Global data in `src/_data/*.cjs` (exported modules, not JSON)
- **Layouts**: Base template is `src/_includes/layouts/base.njk`

### Dynamic Pages (.11ty.cjs)

Files like `search-index.11ty.cjs` and `sitemap.11ty.cjs` export classes with:

- `data()` method: Returns permalink, eleventyExcludeFromCollections, etc.
- `render()` method: Generates output from collections

**Example**: `search-index.11ty.cjs` creates `/search-index.json` by filtering all pages and extracting text.

## AI Agent System

### Agent Philosophy

Agents are **autonomous maintenance workers**, not code generators. They:

- Run on schedule (daily 03:00 UTC) via `.github/workflows/ai-agents.yml`
- Produce **idempotent, deterministic** outputs
- Log every run to `ai/logs/<agent-name>.jsonl`
- **Never overwrite** user-authored Markdown or templates
- Tag outputs with `ai-generated: true` in frontmatter

### Active Agents (ai/scripts/)

| Agent             | Script               | Trigger                | Purpose                                           |
| ----------------- | -------------------- | ---------------------- | ------------------------------------------------- |
| `site-content`    | Build job            | Schedule/push          | Builds site, updates content                      |
| `site-image`      | `image-optimize.mjs` | Manual/schedule        | Optimizes images to WebP (report-only by default) |
| `site-link-check` | `link-check.mjs`     | Schedule/manual        | Validates internal links in `_site/`              |
| `site-data`       | `data-sync.mjs`      | On `src/_data/` change | Syncs structured data                             |
| `site-analytics`  | `analytics.mjs`      | Nightly                | Aggregates build stats                            |
| `site-packaging`  | `package-render.mjs` | On asset change        | Exports print-ready assets                        |

#### Agent Details: Image Optimization

**Script**: `ai/scripts/image-optimize.mjs`

**Configuration** (in script):

```javascript
const CONFIG = {
  targetFormats: ["webp"], // Formats to convert to
  quality: 85, // Quality for compressed images (85%)
  minFileSizeKB: 10, // Only optimize files > 10KB
  supportedExtensions: [".jpg", ".jpeg", ".png", ".gif"],
  excludeDirs: ["node_modules", "_site", "dist", ".git"],
  enabled: process.env.IMAGE_OPTIMIZE_ENABLED === "true", // Default: report-only
};
```

**Enabling optimization**:

1. Install sharp: `npm install --save-dev sharp`
2. Set environment variable: `IMAGE_OPTIMIZE_ENABLED=true`
3. Run manually: `node ai/scripts/image-optimize.mjs`
4. Agent will convert images to WebP format at 85% quality
5. Original files are preserved; `.webp` versions created alongside

**Behavior**:

- Scans `src/` directory recursively
- Checks if WebP version already exists (skips if present)
- In report-only mode: Logs what _would_ be optimized
- In enabled mode: Actually converts images using sharp
- Logs activity to `ai/logs/site-image.jsonl`

### Agent Constraints

**Agents MUST NOT**:

- Modify content semantics or tone
- Delete working code without explicit config
- Push directly to protected branches
- Process files in `node_modules/`, `_site/`, `dist/`, `.git/`

**Agents MUST**:

- Exit with status code 0 (success) or non-zero (failure)
- Respect `.gitignore`
- Log via `ai/scripts/log-agent-run.mjs` with env vars: `AGENT_NAME`, `STATUS`, `DURATION_MS`

## Data Model

### Series Data (`src/_data/series.cjs`)

The series/modules are defined as an array of objects with the following structure:

```javascript
{
  key: 'intro',                    // Unique identifier (used in URLs, nav)
  title: 'Interactive Introduction to CDC',
  description: 'An interactive dashboard covering core concepts...',
  href: '/intro/',                 // Absolute URL path
  ctaLabel: 'Dive In!',           // Optional: Call-to-action button text
  isRecommended: true,             // Optional: Mark as recommended
  badge: {                         // Optional: Visual badge
    label: 'Start Here',
    variant: 'recommended'
  },
  tags: [                          // Optional: Categorization tags
    { label: 'Core Concept', variant: 'tag-concept' }
  ],
  state: 'disabled'                // Optional: 'disabled' hides from nav
}
```

**Usage in templates**:

- Accessed via `{{ series }}` in Nunjucks templates
- Filtered by `seriesKey` to show current module context
- Used by `series-nav.njk` component for prev/next navigation

### Site Data (`src/_data/site.cjs`)

Global site configuration derived from environment variables:

```javascript
{
  title: "CDC: The Missing Manual",
  tagline: "A Deep Dive into Change Data Capture",
  description: "Learn why CDC projects fail...",
  host: hostWithPrefix,             // Combines SITE_HOST + path prefix
  pathPrefix: "/letstalkcdc/"       // Auto-detected or from ELEVENTY_PATH_PREFIX
}
```

### Appwrite Data (`src/_data/appwrite.cjs`)

Optional configuration for user progress tracking:

```javascript
{
  endpoint: process.env.APPWRITE_ENDPOINT,
  project: process.env.APPWRITE_PROJECT,
  databaseId: process.env.APPWRITE_DB_ID,
  progressCollectionId: process.env.COL_PROGRESS_ID,
  eventsCollectionId: process.env.COL_EVENTS_ID
}
```

## Reusable Components (`src/_includes/components/`)

### `series-nav.njk`

Provides prev/next navigation and progress tracking UI.

**Required variables**:

- `seriesKey`: Current module identifier (e.g., `'intro'`, `'snapshotting'`)
- `series`: Array from `src/_data/series.cjs`

**Generated elements**:

- Previous/next module links (← / →)
- "Back to Overview" link
- Progress bar with percentage
- GitHub sign-in/sign-out buttons

**Usage**:

```njk
{% set seriesKey = 'intro' %}
{% include "components/series-nav.njk" %}
```

### `quick-nav.njk`

Table of contents navigation for long-form content pages.

### `scorecard.njk`

Visual metadata display for modules (difficulty, time estimate, prerequisites).

### `ui.njk`

Shared UI components (buttons, cards, badges) used across the site.

## Appwrite Integration (Optional)

User progress tracking uses **Appwrite** (headless database) via:

- **Config**: `src/_data/appwrite.cjs` reads env vars (`APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, etc.)
- **Serverless function**: `netlify/functions/migrateUser.js` (requires external hosting, not GitHub Pages)
- **Collections**: Defined in `appwrite.collections.json`

### When Appwrite is Needed

**Use Appwrite when**:

- Tracking user progress through learning modules
- Storing completion state per user/module
- Recording learning events (page views, completions, quiz results)
- Providing personalized "resume where you left off" functionality

**Site works WITHOUT Appwrite**:

- All educational content renders correctly
- Navigation functions normally
- Static search works via `search-index.json`
- Only loses: persistent progress tracking across sessions

### Collections Schema

**`progress` collection** (tracks module completion):

```json
{
  "userId": "string(128)", // GitHub user ID
  "journeySlug": "string(64)", // Module key (e.g., 'intro', 'snapshotting')
  "step": "integer", // Current step number
  "percent": "double(0-100)", // Completion percentage
  "state": "string(16384)", // JSON-serialized state
  "updatedAt": "datetime"
}
```

- Indexed by: `userId + journeySlug`, `userId`

**`events` collection** (tracks user activity):

```json
{
  "userId": "string(128)",
  "type": "string(64)" // Event type (view, complete, quiz_submit, etc.)
  // ... additional event metadata
}
```

### Serverless Function

**Purpose**: Migrates user progress when GitHub auth completes.

**Deployment**: Must be hosted separately from GitHub Pages (e.g., Vercel, Cloudflare Workers, AWS Lambda).

**Note**: GitHub Pages only serves static files. The serverless function must be deployed separately (Vercel/Cloudflare Workers/AWS Lambda).

## Common Patterns

### Adding a New Content Page

1. Create `src/new-section/page-name.njk`
2. Add frontmatter (title, description, tags)
3. Use layout: `layout: layouts/base.njk`
4. Test locally: `npm run dev`
5. Run smoke tests: `npm run smoke`

### Adding a Passthrough Copy

In `eleventy.config.cjs`:

```javascript
eleventyConfig.addPassthroughCopy({
  "src/new-asset": "path/in/output",
});
```

### Adding a Nunjucks Filter

In `eleventy.config.cjs`:

```javascript
eleventyConfig.addNunjucksFilter("filterName", (value, arg) => {
  return transformedValue;
});
```

## Handoff System

The `handoff/` directory contains a **nightly prompt sync** for agent context:

- `nightly-sync.sh`: Shell script to run daily (via cron/launchd)
- `dashboard.html`: Visual dashboard of agent activity
- `handoff-log.json`: Structured log of handoffs

**Purpose**: Provides agents with updated context before each run.

## Accessibility Requirements

- Alt text required for all images
- Color contrast ≥ 4.5:1 for text
- Keyboard navigation must be preserved
- Run `npm run a11y` before committing UI changes

## Security & Dependencies

- Run `npm audit --production` before major releases
- Fortify workflow (`.github/workflows/fortify.yml`) scans for vulnerabilities
- Keep dependencies minimal (currently: Eleventy, PostCSS, pa11y, csso, rimraf)

## Deployment

- **Production**: GitHub Pages via `.github/workflows/deploy.yml` (auto-deploy on push to `main`)
- **Environment variables** (set in repo settings):
  - `SITE_HOST`: Full domain (e.g., `https://letstalkcdc.github.io`)
  - `ELEVENTY_PATH_PREFIX`: Leave blank for root, or `/<repo-name>` for project pages

## When in Doubt

1. Check **[docs/SETUP.md](../docs/SETUP.md)** for complete setup guide (Appwrite, tracing, deployment)
2. Review **[ai/AGENTS.md](../ai/AGENTS.md)** for agent-specific rules
3. Read **[AI-CONTRIBUTING.md](../AI-CONTRIBUTING.md)** for AI agent constraints
4. Check **[ai/CONTEXT.md](../ai/CONTEXT.md)** for brand voice and conventions
5. Inspect existing pages in `src/` for patterns
6. Run `npm run smoke` to validate changes

### Documentation Index

**Setup & Deployment:**
- **[docs/SETUP.md](../docs/SETUP.md)** — Complete setup guide (Appwrite, tracing, all features)
- **[docs/HOSTING.md](../docs/HOSTING.md)** — Hosting platforms and deployment
- **[README.md](../README.md)** — Project overview and quick start

**Features:**
- **[docs/TRACING.md](../docs/TRACING.md)** — OpenTelemetry tracing (comprehensive)
- **[docs/TRACING-QUICKSTART.md](../docs/TRACING-QUICKSTART.md)** — Tracing quick start
- **[docs/assistant-feedback-setup.md](../docs/assistant-feedback-setup.md)** — AI assistant collection setup
- **[docs/APPWRITE_QUICKSTART.md](../docs/APPWRITE_QUICKSTART.md)** — 15-minute Appwrite setup

**Development:**
- **[docs/adding-modules.md](../docs/adding-modules.md)** — Guide for adding new content modules
- **[AI-CONTRIBUTING.md](../AI-CONTRIBUTING.md)** — AI agent contribution guidelines

**Architecture:**
- **[ai/CONTEXT.md](../ai/CONTEXT.md)** — Brand voice and conventions
- **[ai/AGENTS.md](../ai/AGENTS.md)** — AI agent system documentation

**Archived (Historical Reference):**
- **[docs/archive/](../docs/archive/)** — Archived status docs and decision records

## Anti-Patterns to Avoid

- ❌ Hardcoding URLs: Use `{{ '/' | url }}` filter
- ❌ Skipping smoke tests: Always run before pushing
- ❌ Ignoring path prefix: Site must work at root and subdirectory
- ❌ Modifying `_site/` directly: It's a build artifact
- ❌ Committing `node_modules/` or `.DS_Store`
- ❌ Creating agents that modify user-authored content
