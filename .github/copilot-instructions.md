# Copilot Instructions for Let's Talk CDC

## Project Overview

This is **Let's Talk CDC** — an educational static site about Change Data Capture (CDC), built with **Eleventy 3.1.x** + **Vite 7** and deployed to **GitHub Pages**. The codebase uses a hybrid architecture: a static site generator for content with browser-based progress tracking. Appwrite is optionally used for assistant feedback and cross-device progress sync (anonymous visitors stay on localStorage-based progress).

### Key Architecture Decisions

- **Static-first**: All content is pre-rendered HTML at build time (`_site/` output)
- **Path prefix handling**: Site must work at root (`/`) or subdirectory (`/letstalkcdc/`) for GitHub Pages project hosting
- **Progressive enhancement**: Core content works without JavaScript; interactivity enhances UX

## Developer Workflow

### Build & Development

```bash
npm run build          # Build CSS + generate static site → _site/
npm run dev            # Live server with hot reload at http://localhost:8080
npm run clean          # Remove all build artifacts
npm run smoke          # Run all quality checks (smoke + a11y + perf)
```

**Critical**: `npm run build` runs four stages in order:

1. `build:css` — `postcss src/assets/css/main.css -o src/assets/css/styles.min.css`
2. `build:js` — `vite build` → `dist/`
3. `build:11ty` — `eleventy --config=eleventy.config.mjs` → `_site/`
4. Final `postcss _site/assets/css/styles.css -o _site/assets/css/styles.css`
   (cssnano minify; only runs when `NODE_ENV=production`)

The legacy `styles.css` source / CSSO pipeline was removed in Month 0. See
[`CLAUDE.md`](../CLAUDE.md) for the full CSS pipeline diagram.

### Testing & Quality Gates

```bash
npm run smoke:core     # Validates HTML structure, checks for broken internal links
npm run smoke:a11y     # Runs pa11y accessibility tests (requires Chromium)
npm run smoke:perf     # Performance budget checks
```

All CI checks run on push/PR via `.github/workflows/ci.yml`. **Smoke tests auto-build if `_site/` is missing.**

## Path Prefix System (Critical)

The `lib/path-prefix.mjs` module handles URL prefixing for GitHub Pages:

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
- **Data files**: Global data in `src/_data/*.mjs` (exported modules, not JSON)
- **Layouts**: Base template is `src/_includes/layouts/base.njk`

### Dynamic Pages (.11ty.cjs)

Files like `search-index.11ty.cjs` and `sitemap.11ty.cjs` export classes with:

- `data()` method: Returns permalink, eleventyExcludeFromCollections, etc.
- `render()` method: Generates output from collections

**Example**: `search-index.11ty.cjs` creates `/search-index.json` by filtering all pages and extracting text.

## Data Model

### Series Data (`src/_data/series.mjs`)

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

### Site Data (`src/_data/site.mjs`)

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

### Appwrite Data (`src/_data/appwrite.mjs`)

Optional configuration for assistant feedback collection:

```javascript
{
  endpoint: process.env.APPWRITE_ENDPOINT,
  project: process.env.APPWRITE_PROJECT,
  databaseId: process.env.APPWRITE_DB_ID,
  assistantCollectionId: process.env.COL_ASSISTANT_ID
}
```

## Reusable Components (`src/_includes/components/`)

### `series-nav.njk`

Provides prev/next navigation and progress tracking UI.

**Required variables**:

- `seriesKey`: Current module identifier (e.g., `'intro'`, `'snapshotting'`)
- `series`: Array from `src/_data/series.mjs`

**Generated elements**:

- Previous/next module links (← / →)
- "Back to Overview" link
- Progress bar with percentage (stored in browser localStorage)

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

Appwrite is the optional headless backend for two features:

- **Config**: `src/_data/appwrite.mjs` reads env vars
  (`APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, `APPWRITE_DB_ID`,
  `COL_ASSISTANT_ID`).
- **Collections** defined in `appwrite.collections.json`:
  - `assistant_feedback` — 👍/👎 ratings on AI-assistant responses.
  - `progress` — per-user module-completion snapshots, synced by
    `src/assets/js/cloud-progress.js` when the user is signed in.
  - `events` — auth-gated activity events written alongside progress
    syncs.

### When Appwrite is Needed

**Use Appwrite when**:

- Collecting assistant feedback (👍/👎 ratings on AI assistant responses)
- Syncing per-user progress across devices for signed-in users
- Storing user questions and intents for analytics

**Site works WITHOUT Appwrite**:

- All educational content renders correctly
- Navigation functions normally
- Static search works via `search-index.json`
- Progress tracking falls back to browser localStorage
  (`src/assets/js/local-progress.js`); cloud sync is a strict
  progressive enhancement layered on top.
- Assistant works with local-only feedback storage
- Only loses: centralized analytics and cross-device progress sync

### Collection Schema

**`assistant_feedback` collection** (stores assistant interaction feedback):

```json
{
  "question": "string(512)", // User's question text
  "intentId": "string(128)", // Matched intent identifier
  "helpful": "boolean", // User feedback (👍 = true, 👎 = false)
  "ts": "datetime" // Timestamp of feedback
}
```

- Indexed by: `ts` (descending) for recent feedback queries
- Permissions: Anonymous users can create documents; admins can read/update/delete

The `progress` and `events` collections are likewise defined in
`appwrite.collections.json`. They're written by `cloud-progress.js`
only when the visitor is signed in; anonymous visitors stay on
localStorage-based progress.

## Common Patterns

### Adding a New Content Page

1. Create `src/new-section/page-name.njk`
2. Add frontmatter (title, description, tags)
3. Use layout: `layout: layouts/base.njk`
4. Test locally: `npm run dev`
5. Run smoke tests: `npm run smoke`

### Adding a Passthrough Copy

In `eleventy.config.mjs`:

```javascript
eleventyConfig.addPassthroughCopy({
  "src/new-asset": "path/in/output",
});
```

### Adding a Nunjucks Filter

In `eleventy.config.mjs`:

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
- Keep dependencies minimal (currently: Eleventy 3, Vite, PostCSS + cssnano + autoprefixer, pa11y-ci, vitest, playwright, rimraf)

## Deployment

- **Production**: GitHub Pages via `.github/workflows/deploy.yml` (auto-deploy on push to `main`)
- **Environment variables** (set in repo settings):
  - `SITE_HOST`: Full domain (e.g., `https://letstalkcdc.github.io`)
  - `ELEVENTY_PATH_PREFIX`: Leave blank for root, or `/<repo-name>` for project pages

## When in Doubt

1. Check **[docs/README.md](../docs/README.md)** for complete documentation index
2. Check **[docs/SETUP.md](../docs/SETUP.md)** for complete setup guide (Appwrite, tracing, deployment)
3. Inspect existing pages in `src/` for patterns
4. Run `npm run smoke` to validate changes

### Documentation Index

> **Full Index**: See **[docs/README.md](../docs/README.md)** for the complete documentation index.

**Setup & Deployment:**

- **[docs/SETUP.md](../docs/SETUP.md)** — Complete setup guide (Appwrite, tracing, all features)
- **[docs/HOSTING.md](../docs/HOSTING.md)** — Hosting platforms and deployment
- **[README.md](../README.md)** — Project overview and quick start

**Features:**

- **[docs/TRACING.md](../docs/TRACING.md)** — OpenTelemetry tracing
- **[docs/video-embeds.md](../docs/video-embeds.md)** — Video embed component
- **[docs/adding-quizzes.md](../docs/adding-quizzes.md)** — Adding quizzes to modules

**Development:**

- **[CLAUDE.md](../CLAUDE.md)** — Quick reference for AI agents (commands, architecture, byte-identity check)
- **[docs/CONTRIBUTING.md](../docs/CONTRIBUTING.md)** — Human-contributor workflow
- **[docs/adding-modules.md](../docs/adding-modules.md)** — Guide for adding new content modules
- **[docs/javascript-architecture.md](../docs/javascript-architecture.md)** — JS module layout and Vite split

**Archived (Historical Reference):**

- **[docs/archive/](../docs/archive/)** — Archived status docs and decision records (read for context, do not act on as current spec)

## Anti-Patterns to Avoid

- ❌ Hardcoding URLs: Use `{{ '/' | url }}` filter
- ❌ Skipping smoke tests: Always run before pushing
- ❌ Ignoring path prefix: Site must work at root and subdirectory
- ❌ Modifying `_site/` directly: It's a build artifact
- ❌ Committing `node_modules/` or `.DS_Store`
- ❌ Creating agents that modify user-authored content
