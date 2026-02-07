## 2026-02-07
- Initial changelog

# Changelog

## [2.0.0] — 2026-02-06

Site Revamp — all 9 PRD phases complete. Eleventy 3.x, Vite build, modular JS,
interactive components, enhanced search, improved assistant, and full test suite.

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
