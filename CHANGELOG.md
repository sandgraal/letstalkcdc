# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `CLAUDE.md` at repo root — single source of truth for AI agents (commands,
  architecture, conventions, anti-patterns, the CSS byte-identity check).
  `AGENTS.md` symlinked to it so Codex / cross-tool agentic systems pick up
  the same doc.
- `.claude/settings.json` — permission allowlist covering safe read/verify
  commands (git status/diff/log, npm test, npm run build, prettier --check,
  eslint, vitest, shell utils), plus a SessionStart hook that runs `npm ci`
  if `node_modules/` is absent so fresh checkouts work out of the box.
- `.claude/commands/css-byte-check.md` — codifies the production-CSS hash
  verification pattern used across the Month-0 CSS refactors.
- `.claude/commands/verify-all.md` — `/verify-all` runs the standard
  pre-PR chain (`format:check + lint + test + build`). Replaces the
  copy-paste sequence agents kept reinventing.
- `.claude/agents/css-refactor.md` — specialised subagent for any
  change under `src/assets/css/`. Enforces the byte-identity check
  workflow (capture hash → change → re-hash → revert or update
  baseline) and the CSS anti-pattern list. Invoke via the Agent tool.
- `docs/IMPLEMENTATION-PLAN.md` — phased checklist of the active
  revitalization work. Agents flip `- [ ]` to `- [x]` in the same
  commit that closes the task; the plan is the durable record of what
  shipped. Linked from `CLAUDE.md` and `docs/README.md`.
- `.github/CODEOWNERS` — formalizes review ownership for the agent context
  surfaces (`CLAUDE.md`, `.claude/`, `.chatgpt-context.yml`,
  `copilot-instructions.md`), CI/build configs, and `main.css`.
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
- Deleted `src/assets/js/tracing.js` (278-line full-OpenTelemetry SDK
  implementation that's been unwired since 2.0.0 — nothing imports it).
  Production tracing has always been handled by the dependency-free
  `tracing-lite.js`. Removed the nine `@opentelemetry/*` devDependencies
  it was the sole consumer of (`api`, `exporter-trace-otlp-http`,
  `instrumentation-document-load`, `instrumentation-fetch`,
  `instrumentation-user-interaction`,
  `instrumentation-xml-http-request`, `resources`, `sdk-trace-web`,
  `semantic-conventions`). Trimmed `docs/TRACING.md` to match.
- Cleared the three remaining ESLint warnings: deleted the unused
  `parseJsonArray` helper in `eleventy.config.mjs`, and switched two
  `console.info(...)` calls (`scripts/progress.js`,
  `src/js/appwrite-config.js`) to `console.log(...)`, which the
  eslint config explicitly allows.
- Deleted `scripts/test-auth-modules.mjs`. It was an unwired post-build
  smoke check from the pre-Vite era — its substring check for
  `auth-ui.js` in the rendered HTML no longer matched after Vite started
  hashing bundles (`auth-ui.DzcSTLaD.js`), and the script crashed every
  run. Auth module presence is still exercised by the regular smoke
  pipeline + the Vite manifest resolution in `eleventy.config.mjs`.

### Changed

- Rewrote `docs/CONTRIBUTING.md` to focus on human contributors (was previously
  documentation of the retired agent system).
- Trimmed the CI failure runbook in `docs/HOSTING.md` to match the workflows
  that actually exist.
- Cleaned up `.github/copilot-instructions.md` and `.chatgpt-context.yml` so
  they no longer point at removed paths.
- Corrected stale facts throughout `.github/copilot-instructions.md`:
  Eleventy 2.x → 3.1.x, `eleventy.config.cjs` → `.mjs`, `lib/path-prefix.cjs`
  → `.mjs`, removed the dead CSS pipeline description (styles.css / CSSO),
  refreshed the dependency list (csso gone, vite/vitest/playwright in), and
  pruned doc links to files that don't exist
  (`TRACING-QUICKSTART.md`, `APPWRITE_QUICKSTART.md`,
  `assistant-feedback-setup.md`).
- Expanded `.chatgpt-context.yml` with the current stack (Eleventy 3.1.x,
  Vite 7, postcss + cssnano + autoprefixer, vitest, playwright, pa11y-ci),
  CSS / JS entry paths, npm command map, and commit / branch conventions.
- Added `.github/CODEOWNERS` to `.prettierignore` (prettier can't parse it)
  and dropped the deleted `theme-playground` entry.
- Dropped unused devDependencies `postcss-prefix-selector` (only used by
  the retired `build-dark-theme.mjs`) and `serve` (the `npm run serve`
  script uses `eleventy --serve`, not the `serve` package). `npm ci`
  installs 685 fewer transitive packages.
- Cleaned up `README.md` repo-tree diagram: removed the dangling
  `src/assets/css/styles.css` line, added entries for `dist/`,
  `vite.config.mjs`, and the new `CLAUDE.md`.
- Rewrote `docs/README.md` (the docs index): removed 10+ broken links
  pointing at non-existent files
  (`APPWRITE_QUICKSTART.md`, `TRACING-QUICKSTART.md`,
  `TRACING-BUNDLING.md`, `assistant-feedback-setup.md`,
  `auth-setup.md`, etc.), dropped the retired-AI `AI-CONTRIBUTING.md`
  link, and pointed agents at `CLAUDE.md` as the entry point.
- Redirected two `AI-CONTRIBUTING.md` references in `docs/SETUP.md` to
  the current `docs/CONTRIBUTING.md`.
- Added a "Historical document" banner to `docs/PRD-SITE-REVAMP.md`
  flagging that the `ai/` subsystem it describes was retired in Month 0
  and that `CLAUDE.md` is now the authoritative project context.
- Deleted `src/static/sitemap.xml` — a 9-line stale sitemap from before
  the path-prefix system landed. It still claimed
  `https://letstalkcdc.github.io/index.html` (wrong host, wrong URL
  shape). Eleventy's dynamic `src/sitemap.11ty.cjs` was already
  overwriting it at `_site/sitemap.xml`, so production output is
  unchanged.
- Corrected stale `.cjs` references in `.github/copilot-instructions.md`:
  every `src/_data/*.cjs` mention is now `.mjs` to match the actual
  files (`appwrite`, `series`, `site`). Fixed the project-overview
  sentence that claimed Appwrite "is optionally used only for storing
  assistant feedback" — `cloud-progress.js` actually uses the
  `progress` and `events` Appwrite collections too when a user is
  signed in, and the doc now lists all three collections from
  `appwrite.collections.json`. The earlier "These have been removed"
  note about `progress`/`events` was wrong and is gone.
- Added an `npm run seed:discussions` script (wraps the existing
  `scripts/seed-discussions.mjs`) so the GitHub-Discussions seeder is
  discoverable from `npm run`. Updated `README.md` to use the npm
  alias instead of the raw `node scripts/...` invocation.
- Documented the unwired-but-working sandbox debug scripts
  (`scripts/verify.sh`, `scripts/test_stack.sh`, `scripts/test_connector.sh`,
  `scripts/test_events.sh`, `scripts/test_chaos_smoke.sh`) in a new
  "Verifying the Stack" subsection of `docs/SANDBOX.md`. They aren't
  in CI and aren't `npm`-discoverable, but they're real operator tools
  for debugging the Docker-Compose CDC stack; this section just makes
  them discoverable.
- Renumbered the trailing top-level CSS files so the source has clean
  sequential numbering after the orphan purge:
  `38-version-status.css` → `07-version-status.css`,
  `39-video-embed.css` → `08-video-embed.css`,
  `40-mobile-responsive.css` → `09-mobile-responsive.css`. `main.css`
  imports and `docs/video-embeds.md` updated; production output is still
  byte-identical (SHA256 `4843ff26…`).
- Removed retired-`ai/` paths from `.gitignore` (the subsystem is gone, so
  the ignore globs were dangling).
- Deleted the broken duplicate `test-appwrite-connection.js` (it used
  `require()` in an ESM-typed package and crashed on every invocation).
  Kept the working `test-appwrite.cjs`, and corrected three stale
  `test-appwrite.mjs` references in `docs/SETUP.md`.
- Deleted the obsolete per-page CSS build pipeline:
  `scripts/build-css.js`, `scripts/build-css.mjs`, `scripts/minify-css.js`.
  Nothing referenced them — the active build is `postcss main.css` driven
  from `package.json`. Also dropped the now-unused `csso` devDependency.
- Untracked the stray repo-root `.DS_Store` and added the standard
  `**/.DS_Store` ignore globs.
- Deleted orphan `src/css/dashboard.css` — a green-on-black retro
  terminal stylesheet not linked from any template. The active
  dashboard styles live in `src/assets/css/dashboard-page.css`
  (imported by `main.css`); the handoff/ dashboard ships inline CSS.

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
