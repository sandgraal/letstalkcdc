# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `src/_data/author.mjs` — single source of truth for author identity
  (used by the base layout, JSON-LD, and future RSS / advisory surfaces).
- `datePublished` and `dateModified` front-matter on every module's
  `*.11tydata.cjs` data file (defaulted to the v2.0.0 ship date; bump per
  module as content is revised).
- Article JSON-LD and `article:published_time` / `article:modified_time`
  meta tags emitted in `<head>` for module pages.
- Visible page-meta block on module pages — author, last-reviewed date,
  optional advisory CTA — rendered at the bottom of `<main>`.

### Removed

- Retired the `ai/` agent subsystem and its auto-commit workflows
  (`ai-readme-sync`, `ai-changelog`, `ai-agents`, `analytics-discussions`,
  `quarterly-content-review`). The auto-synced `<!-- AI-STATUS -->` block in
  `README.md` is gone. Manual maintenance from here on.
- Removed the obsolete `prod-site-revamp` issue template; that project shipped
  as `2.0.0` in February 2026.
- Dropped `agent:analytics`, `agent:package`, and `agent:content-review` npm
  scripts.

### Changed

- Rewrote `docs/CONTRIBUTING.md` to focus on human contributors (was previously
  documentation of the retired agent system).
- Trimmed the CI failure runbook in `docs/HOSTING.md` to match the workflows
  that actually exist.
- Cleaned up `.github/copilot-instructions.md` and `.chatgpt-context.yml` so
  they no longer point at removed paths.

### Removed (CSS dead-code purge)

- Retired the legacy `src/assets/css/styles.css` (2.3k-line monolith). The
  production bundle is built from `src/assets/css/main.css`; the source
  `styles.css` was never passthrough-copied, never reached the browser, and
  was actively misleading.
- Deleted 31 orphan numbered files that only `styles.css` referenced
  (`07-code-blocks` through `37-chips-badges`, plus the duplicate-numbered
  `30-progress-indicators`, `30-timeline`, `38-skill-level-badges`). Their
  selectors were either unused or already covered by `02-base.css`,
  `03-layout.css`, `04-components.css` (which imports `components/*.css`),
  or page-specific CSS under `pages/`.
- Deleted `src/assets/css/search.css` (loose copy of `06-search.css`,
  unreferenced).
- Deleted `src/assets/css/web-vitals-dashboard.css` (no template links it;
  the JS just constructs the dashboard with `.web-vitals-dashboard` as an
  unstyled className).
- Retired the `theme-dark-prefixed.css` build pipeline:
  `scripts/build-dark-theme.mjs`, the `theme-playground/styles.css` source,
  the `build:dark-theme` npm script and its slot in the `build` chain. The
  generated `theme-dark-prefixed.css` was never linked from any template.

Net effect: `src/assets/css/` drops from 47 to 13 files. Verified the
production output `_site/assets/css/styles.css` is byte-identical
(SHA256 `4843ff26…`) before and after the purge — no shipped CSS rule
changed.

## [2.0.0] — 2026-02-06

Site Revamp — all 9 PRD phases complete. Eleventy 3.x, Vite build, modular JS,
interactive components, enhanced search, improved assistant, and full test
suite.

### Phase 1 — Foundation

#### 1.1 Eleventy 3.0 Migration (PR #244)

- Upgraded Eleventy from 2.0.1 to 3.1.2
- Migrated all configuration and data files from CommonJS to ESM
- Converted `eleventy.config.cjs` → `eleventy.config.mjs`
- Converted `postcss.config.cjs` → `postcss.config.mjs`
- Converted `lib/path-prefix.cjs` → `lib/path-prefix.mjs`
- Converted all `src/_data/*.cjs` → `src/_data/*.mjs`

#### 1.2 JS Modularization (PR #245)

- Split monolithic app.js into focused ES modules
- Created `src/js/modules/` with theme, navigation, search, code-blocks,
  toast, depth-toggle, scorecard, timeline, interactive-diagrams
- Each module self-registers via `initX()` pattern
- Central `src/js/app.js` orchestrates module loading

#### 1.3 Vite Build Pipeline (PR #246)

- Added Vite 7.x as frontend build tool
- Configured `vite.config.js` with Eleventy integration
- Asset fingerprinting and optimized production bundles

### Phase 2 — Features

#### 2.1 Enhanced Search (PR #250)

- Fuzzy search with scoring and highlighting
- Real-time results panel with keyboard navigation
- Search index generated at build time from all content pages

#### 2.2 Interactive Components (PR #251)

- Interactive Mermaid diagrams with zoom/pan
- Animated CDC pipeline timeline
- Depth-toggle for progressive disclosure of technical content
- Enhanced code blocks with copy-to-clipboard and syntax hints

#### 2.3 Improved Assistant (PR #252)

- Inline chat assistant with 13 CDC domain intents
- Fuzzy intent matching with confidence scoring
- Contextual follow-up suggestions
- Module-aware deep links with anchor support
- Feedback collection (thumbs up/down)
- Robust YAML parser for multi-line trigger arrays

### Phase 3 — Quality

#### 3.1 Vitest Unit Tests (PR #247)

- 184 unit tests across 11 test files
- JSDOM environment for browser API testing
- Coverage for all JS modules

#### 3.2 Playwright E2E Tests (PR #248)

- End-to-end browser tests for critical user flows
- Multi-browser testing (Chromium, Firefox, WebKit)

#### 3.3 CI/CD Pipeline (PR #249)

- GitHub Actions workflow for build, test, and deploy
- Automated smoke tests, accessibility checks, performance budgets
- Dependency security scanning

### Fixed

- YAML parser now handles multi-line JSON arrays with trailing commas
