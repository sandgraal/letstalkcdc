# Product Requirements Document: Let's Talk CDC Site Revamp

| Field                | Value                   |
| -------------------- | ----------------------- |
| **Repository**       | `sandgraal/letstalkcdc` |
| **Document Version** | 1.0.0                   |
| **Created**          | 2026-02-05              |
| **Owner**            | @sandgraal              |
| **Status**           | Draft                   |

---

## Executive Summary

### Vision Statement

Transform Let's Talk CDC into a **modern, performant, and maintainable** educational platform that leverages cutting-edge web technologies while maintaining its core mission: making Change Data Capture (CDC) approachable without sacrificing depth. This revamp focuses on **developer experience, maintainability, and user engagement** through modular architecture, comprehensive testing, and enhanced interactive features.

### Success Metrics

| Metric                               | Current              | Target           | Priority    |
| ------------------------------------ | -------------------- | ---------------- | ----------- |
| **Lighthouse Performance Score**     | ~75-85               | ≥90              | 🔴 Critical |
| **Lighthouse Accessibility Score**   | ~90                  | ≥95              | 🔴 Critical |
| **Time to Interactive (3G)**         | ~3-4s                | <2s              | 🔴 Critical |
| **JavaScript Bundle Size (gzipped)** | ~52.7KB (monolithic) | <100KB (modular) | 🟡 High     |
| **First Contentful Paint**           | ~1.5s                | <1s              | 🟡 High     |
| **Cumulative Layout Shift**          | <0.1                 | <0.05            | 🟢 Medium   |
| **Critical A11y Violations**         | 0                    | 0                | 🔴 Critical |
| **Unit Test Coverage**               | 0%                   | ≥80%             | 🔴 Critical |
| **E2E Test Pass Rate**               | N/A                  | 100%             | 🔴 Critical |
| **Build Time**                       | ~3-5s                | <3s              | 🟢 Medium   |

---

## Current State Analysis

### Repository Structure

```
letstalkcdc/
├── src/                          # Eleventy source (Nunjucks templates, content)
│   ├── _data/                    # Global data (series.mjs, site.mjs, appwrite.mjs)
│   ├── _includes/                # Layouts, components, snippets
│   ├── assets/
│   │   ├── css/                  # PostCSS source (main.css → styles.min.css)
│   │   └── js/                   # Client-side JavaScript
│   │       ├── app.js            # 🔴 1821-line monolithic file (needs modularization)
│   │       ├── tracing-lite.js   # OpenTelemetry tracing wrapper
│   │       └── utils/            # Utility modules (path-prefix.js)
│   ├── static/                   # Static assets (images, favicons)
│   ├── resources/                # Downloadable resources (configs, scripts)
│   └── [content-directories]/    # 40+ content sections (quickstarts, labs, guides)
├── _site/                        # Build output (generated, not committed)
├── lib/                          # Build-time utilities (path-prefix.mjs)
├── scripts/                      # Build scripts (smoke tests, visual tests, perf checks)
├── ai/                           # AI agent system
│   ├── scripts/                  # Agent implementations
│   └── logs/                     # Agent execution logs
├── docs/                         # Documentation
├── .github/workflows/            # CI/CD workflows
├── eleventy.config.mjs           # 🟡 Eleventy 2.0 config (needs ESM migration)
├── postcss.config.mjs            # PostCSS configuration
└── package.json                  # NPM scripts and dependencies
```

### Technology Stack

#### Current Stack

| Component                 | Technology             | Version | Status                                        |
| ------------------------- | ---------------------- | ------- | --------------------------------------------- |
| **Static Site Generator** | Eleventy               | 2.0.1   | 🟡 Needs upgrade to 3.0                       |
| **JavaScript**            | ES6 Modules            | Native  | 🔴 Single 1821-line file needs modularization |
| **CSS**                   | PostCSS + Autoprefixer | 8.4.41  | ✅ Modern                                     |
| **Build Tool**            | NPM scripts            | -       | 🟡 No bundler (needs esbuild/Vite)            |
| **Testing**               | Manual smoke tests     | -       | 🔴 No unit/E2E tests                          |
| **CI/CD**                 | GitHub Actions         | -       | ✅ Functional but can be enhanced             |
| **Tracing**               | OpenTelemetry          | 1.9.0   | ✅ Modern                                     |
| **Auth/Storage**          | Appwrite               | Cloud   | ✅ Optional, working                          |

#### Target Stack

| Component                 | Technology                     | Version | Rationale                                |
| ------------------------- | ------------------------------ | ------- | ---------------------------------------- |
| **Static Site Generator** | Eleventy                       | 3.0+    | ESM-first, better performance, modern DX |
| **JavaScript**            | ESM Modules                    | Native  | Tree-shaking, better code splitting      |
| **Module Bundler**        | esbuild or Vite                | Latest  | Fast builds, HMR, asset optimization     |
| **Unit Testing**          | Vitest                         | Latest  | Fast, ESM-native, Vite integration       |
| **E2E Testing**           | Playwright                     | Latest  | Cross-browser, visual regression, a11y   |
| **CSS**                   | PostCSS + Autoprefixer         | Current | Keep (working well)                      |
| **Linting**               | ESLint + Prettier              | Latest  | Code quality and consistency             |
| **CI/CD**                 | GitHub Actions + Lighthouse CI | -       | Automated performance monitoring         |

### Key Files for Modification

#### 🔴 Critical Priority

| File Path              | Lines | Action                                           | Complexity |
| ---------------------- | ----- | ------------------------------------------------ | ---------- |
| `eleventy.config.mjs`  | 286   | Convert to ESM (`eleventy.config.mjs`)           | Medium     |
| `src/assets/js/app.js` | 1821  | Split into 7 modules                             | High       |
| `package.json`         | 45    | Update scripts, add bundler, add test frameworks | Medium     |
| `postcss.config.mjs`   | ~20   | Convert to ESM (`postcss.config.mjs`)            | Low        |
| `lib/path-prefix.mjs`  | ~50   | Convert to ESM (`lib/path-prefix.mjs`)           | Low        |

#### 🟡 High Priority

| File Path                  | Lines | Action                                | Complexity |
| -------------------------- | ----- | ------------------------------------- | ---------- |
| `scripts/smoke.mjs`        | ~100  | Enhance with Playwright               | Medium     |
| `.github/workflows/ci.yml` | ~50   | Add Lighthouse CI, expand test matrix | Medium     |
| `src/_data/series.mjs`     | ~200  | Convert to ESM                        | Low        |
| `src/_data/site.mjs`       | ~50   | Convert to ESM                        | Low        |
| `src/_data/appwrite.mjs`   | ~30   | Convert to ESM                        | Low        |

#### 🟢 Medium Priority

| File Path                        | Action                       | Complexity |
| -------------------------------- | ---------------------------- | ---------- |
| `src/assets/css/main.css`        | Audit for unused styles      | Medium     |
| `src/_includes/components/*.njk` | Add accessibility attributes | Low-Medium |
| `.github/workflows/deploy.yml`   | Add preview deployments      | Medium     |

### Files to Create

| File Path                                 | Purpose                           | Priority    |
| ----------------------------------------- | --------------------------------- | ----------- |
| `src/assets/js/modules/theme.js`          | Theme management module           | 🔴 Critical |
| `src/assets/js/modules/navigation.js`     | Navigation and mobile menu        | 🔴 Critical |
| `src/assets/js/modules/search.js`         | Search overlay and functionality  | 🔴 Critical |
| `src/assets/js/modules/scorecard.js`      | Progress tracking and scorecards  | 🔴 Critical |
| `src/assets/js/modules/code-blocks.js`    | Code syntax highlighting and copy | 🔴 Critical |
| `src/assets/js/modules/toast.js`          | Toast notification system         | 🔴 Critical |
| `src/assets/js/modules/quick-nav.js`      | Quick navigation component        | 🔴 Critical |
| `vitest.config.mjs`                       | Vitest test configuration         | 🔴 Critical |
| `playwright.config.mjs`                   | Playwright E2E test configuration | 🔴 Critical |
| `tests/unit/`                             | Unit test directory structure     | 🔴 Critical |
| `tests/e2e/`                              | E2E test directory structure      | 🔴 Critical |
| `.eslintrc.mjs`                           | ESLint configuration              | 🟡 High     |
| `.prettierrc.mjs`                         | Prettier configuration            | 🟡 High     |
| `vite.config.mjs` or `esbuild.config.mjs` | Bundler configuration             | 🟡 High     |

---

## Requirements by Phase

### Phase 1: Foundation Upgrades (Critical Priority)

**Timeline**: Weeks 1-3  
**Blocking**: All subsequent phases depend on this  
**Risk Level**: 🔴 High (breaking changes to build system)

#### 1.1 Eleventy 3.0 Migration

**Objective**: Upgrade from Eleventy 2.0 to 3.0 for ESM support, improved performance, and modern DX.

**Acceptance Criteria**:

- [ ] Site builds successfully with Eleventy 3.0
- [ ] All pages render correctly (no broken layouts)
- [ ] Path prefix system works in both root and subdirectory deployments
- [ ] All passthrough copies work correctly
- [ ] Build time improves by ≥10% or stays the same
- [ ] No console errors on any page

**Detailed Checklist**:

- [ ] **Install Eleventy 3.0**

  ```bash
  npm install --save-dev @11ty/eleventy@^3.0.0
  ```

- [x] **Convert `eleventy.config.mjs` → `eleventy.config.mjs`**
  - [ ] Change `module.exports = function` → `export default function`
  - [ ] Convert `require()` statements to `import` statements
  - [ ] Update file path: `eleventy.config.mjs` → `eleventy.config.mjs`
  - [ ] Test: `npx @11ty/eleventy --config=eleventy.config.mjs`

- [x] **Convert build-time utilities to ESM**
  - [ ] `lib/path-prefix.mjs` → `lib/path-prefix.mjs`
    - Change `module.exports` → `export`
    - Change `require()` → `import`
  - [ ] Update references in `eleventy.config.mjs`

- [x] **Convert data files to ESM**
  - [ ] `src/_data/series.mjs` → `src/_data/series.mjs`
  - [ ] `src/_data/site.mjs` → `src/_data/site.mjs`
  - [ ] `src/_data/appwrite.mjs` → `src/_data/appwrite.mjs`
  - [ ] Test: Verify data is accessible in templates

- [x] **Update PostCSS configuration**
  - [ ] `postcss.config.mjs` → `postcss.config.mjs`
  - [ ] Convert to ESM syntax
  - [ ] Test: `npm run build:css`

- [x] **Update package.json**
  - [ ] Add `"type": "module"` (already present ✅)
  - [ ] Update all script references to use `.mjs` extensions
  - [ ] Update Eleventy config path in scripts

- [x] **Test all build commands**
  - [ ] `npm run clean`
  - [ ] `npm run build:css`
  - [ ] `npm run build`
  - [ ] `npm run dev`
  - [ ] Verify `_site/` output is identical to pre-migration

- [x] **Test all content pages**
  - [ ] Home page (`/`)
  - [ ] All quickstarts (`/quickstart/*`)
  - [ ] All labs (`/cloud-labs/*`)
  - [ ] Interactive modules (`/intro/`, `/snapshotting/`, etc.)
  - [ ] Search functionality
  - [ ] Navigation and mobile menu

- [x] **Verify CI/CD compatibility**
  - [ ] Update `.github/workflows/ci.yml` if needed
  - [ ] Update `.github/workflows/deploy.yml` if needed
  - [ ] Run full CI pipeline on test branch

**References**:

- [Eleventy 3.0 Upgrade Guide](https://www.11ty.dev/docs/v3-upgrade/)
- [Eleventy ESM Support](https://www.11ty.dev/docs/languages/javascript/#using-esm-in-your-data-files)

---

#### 1.2 JavaScript Modularization

**Objective**: Split the monolithic `src/assets/js/app.js` (1821 lines) into maintainable, testable modules.

**Acceptance Criteria**:

- [ ] All functionality works identically to before
- [ ] Each module is <300 lines
- [ ] Modules are independently testable
- [ ] Bundle size decreases or stays the same (with tree-shaking)
- [ ] Code is easier to navigate and maintain
- [ ] Zero runtime errors on all pages

**Module Breakdown** (from `src/assets/js/app.js`):

| Module             | Lines (source)                 | Lines (target) | Exports                               | Imports              |
| ------------------ | ------------------------------ | -------------- | ------------------------------------- | -------------------- |
| **theme.js**       | 27-86 (60 lines)               | ~80            | `initTheme()`                         | None                 |
| **navigation.js**  | 109-385 (277 lines)            | ~300           | `initNavigation()`, `initDropdowns()` | None                 |
| **search.js**      | 489-612 (124 lines)            | ~150           | `initSearch()`                        | `withBasePath`       |
| **scorecard.js**   | 780-1715 (936 lines)           | ~400           | `initScorecards()`                    | `getEducationTracer` |
| **code-blocks.js** | 446-487, 1536-1631 (138 lines) | ~150           | `initCodeBlocks()`                    | `getEducationTracer` |
| **toast.js**       | 1717-1821 (105 lines)          | ~120           | `showToast()`                         | None                 |
| **quick-nav.js**   | 614-778 (165 lines)            | ~200           | `initQuickNav()`                      | None                 |
| **app.js** (main)  | New orchestrator               | ~100           | None (entry point)                    | All modules          |

**Detailed Checklist**:

- [ ] **Create module directory structure**

  ```bash
  mkdir -p src/assets/js/modules
  mkdir -p tests/unit/modules
  ```

- [x] **Extract Theme Module** (`src/assets/js/modules/theme.js`)
  - [ ] Copy lines 27-86 from `app.js`
  - [ ] Wrap in `export function initTheme()`
  - [ ] Extract constants: `syncThemeToggle`, `applyTheme`, `getStoredTheme`, `setStoredTheme`
  - [ ] Export: `export { initTheme, applyTheme };`
  - [ ] Add JSDoc comments
  - [ ] Test: Theme toggle works, persists in localStorage

- [x] **Extract Navigation Module** (`src/assets/js/modules/navigation.js`)
  - [ ] Copy lines 109-385 from `app.js`
  - [ ] Split into two functions:
    - `initMobileNav()` (lines 109-173)
    - `initDropdowns()` (lines 175-385)
  - [ ] Export: `export { initMobileNav, initDropdowns };`
  - [ ] Wrap in `export function initNavigation()` that calls both
  - [ ] Test: Mobile menu, dropdowns, keyboard navigation

- [x] **Extract Search Module** (`src/assets/js/modules/search.js`)
  - [ ] Copy lines 489-612 from `app.js`
  - [ ] Import: `import { withBasePath } from "../utils/path-prefix.js";`
  - [ ] Wrap in `export function initSearch(tracer)`
  - [ ] Export search state for testing: `export { getSearchState };`
  - [ ] Test: Search overlay, fuzzy matching, keyboard shortcuts

- [x] **Extract Scorecard Module** (`src/assets/js/modules/scorecard.js`)
  - [ ] Copy lines 780-1715 from `app.js` (largest module)
  - [ ] Split into sub-functions:
    - `initScorecardTracking()` - Progress tracking
    - `initRemoteSync()` - Appwrite sync (if enabled)
    - `updateSummaries()` - Summary calculations
  - [ ] Wrap in `export function initScorecards(tracer)`
  - [ ] Export: `export { initScorecards, getProgressState };`
  - [ ] Test: Scorecard clicks, progress persistence, remote sync

- [x] **Extract Code Blocks Module** (`src/assets/js/modules/code-blocks.js`)
  - [ ] Copy lines 446-487 (legacy copy buttons) from `app.js`
  - [ ] Copy lines 1536-1631 (enhanced code blocks) from `app.js`
  - [ ] Merge into single `initCodeBlocks(tracer)` function
  - [ ] Export: `export { initCodeBlocks };`
  - [ ] Test: Copy button, syntax highlighting, language labels

- [x] **Extract Toast Module** (`src/assets/js/modules/toast.js`)
  - [ ] Copy lines 1717-1821 from `app.js`
  - [ ] Extract functions: `createToastContainer`, `showToast`, `removeToast`
  - [ ] Export: `export { showToast };`
  - [ ] Ensure `window.showToast` still works for backward compatibility
  - [ ] Test: Toast display, auto-dismiss, manual close

- [x] **Extract Quick Nav Module** (`src/assets/js/modules/quick-nav.js`)
  - [ ] Copy lines 614-778 from `app.js`
  - [ ] Wrap in `export function initQuickNav()`
  - [ ] Export: `export { initQuickNav };`
  - [ ] Test: Intersection observer, active states, scroll behavior

- [ ] **Create new `app.js` orchestrator**

  ```javascript
  // src/assets/js/app.js
  import { initTheme } from "./modules/theme.js";
  import { initNavigation } from "./modules/navigation.js";
  import { initSearch } from "./modules/search.js";
  import { initScorecards } from "./modules/scorecard.js";
  import { initCodeBlocks } from "./modules/code-blocks.js";
  import { showToast } from "./modules/toast.js";
  import { initQuickNav } from "./modules/quick-nav.js";
  import { getEducationTracer } from "./tracing-lite.js";

  const tracer = getEducationTracer();

  // Initialize in order
  initTheme();
  initNavigation();
  initSearch(tracer);
  initCodeBlocks(tracer);
  initQuickNav();
  initScorecards(tracer);

  // Export toast globally for compatibility
  window.showToast = showToast;
  ```

- [x] **Verify all pages work**
  - [ ] Test each module independently
  - [ ] Test interactions between modules
  - [ ] Check console for errors
  - [ ] Test on mobile viewport

- [x] **Update documentation**
  - [ ] Add `docs/javascript-architecture.md` describing module system
  - [ ] Document each module's API
  - [ ] Add migration guide for contributors

**Line Number Reference** (from `src/assets/js/app.js`):

```
Lines 1-26:    Imports and initialization
Lines 27-86:   🟢 Theme Module (60 lines)
Lines 88-94:   onReady helper (keep in main app.js)
Lines 96-108:  Module view tracking (keep in main app.js)
Lines 109-173: 🟢 Mobile Navigation (65 lines) → navigation.js
Lines 175-385: 🟢 Dropdown Navigation (211 lines) → navigation.js
Lines 387-425: Depth toggle (keep in app.js or separate)
Lines 427-445: Heading anchors (keep in app.js)
Lines 446-487: 🟢 Legacy code copy buttons (42 lines) → code-blocks.js
Lines 489-612: 🟢 Search overlay (124 lines) → search.js
Lines 614-778: 🟢 Quick Nav (165 lines) → quick-nav.js
Lines 780-1715: 🟢 Scorecard system (936 lines) → scorecard.js
Lines 1717-1821: 🟢 Toast system (105 lines) → toast.js
Lines 1536-1631: 🟢 Enhanced code blocks (96 lines) → code-blocks.js
```

---

#### 1.3 Build Pipeline Modernization

**Objective**: Add bundling, minification, asset hashing, and HMR for improved DX and performance.

**Acceptance Criteria**:

- [ ] JavaScript modules are bundled and minified
- [ ] CSS is minified and autoprefixed
- [ ] Assets have content hashes for cache busting
- [ ] HMR works in development mode
- [ ] Build time is <3 seconds
- [ ] Bundle size is <100KB gzipped

**Detailed Checklist**:

- [x] **Choose bundler: esbuild (recommended) or Vite**
  - **Option A: esbuild** (faster, simpler)
    - Pros: 10-100x faster than webpack, simple config
    - Cons: Less features than Vite
  - **Option B: Vite** (recommended for this project)
    - Pros: HMR, dev server, plugin ecosystem, great DX
    - Cons: Slightly slower than raw esbuild

- [ ] **Install Vite and dependencies**

  ```bash
  npm install --save-dev vite vite-plugin-static-copy
  ```

- [ ] **Create `vite.config.mjs`**

  ```javascript
  import { defineConfig } from "vite";
  import { viteStaticCopy } from "vite-plugin-static-copy";

  export default defineConfig({
    root: "src/assets",
    base: process.env.ELEVENTY_PATH_PREFIX || "/",
    build: {
      outDir: "../../_site/assets",
      emptyOutDir: false,
      rollupOptions: {
        input: {
          main: "./src/assets/js/app.js",
        },
        output: {
          entryFileNames: "js/[name].[hash].js",
          chunkFileNames: "js/[name].[hash].js",
          assetFileNames: "assets/[name].[hash][extname]",
        },
      },
    },
    plugins: [
      viteStaticCopy({
        targets: [{ src: "css/**/*", dest: "css" }],
      }),
    ],
  });
  ```

- [ ] **Update `package.json` scripts**

  ```json
  {
    "scripts": {
      "clean": "rimraf dist _site src/assets/css/styles.min.css",
      "build:css": "postcss src/assets/css/main.css -o src/assets/css/styles.min.css",
      "build:js": "vite build",
      "build:11ty": "eleventy --config=eleventy.config.mjs",
      "build": "npm run clean && npm run build:css && npm run build:js && npm run build:11ty",
      "dev:vite": "vite --host",
      "dev:11ty": "eleventy --config=eleventy.config.mjs --serve",
      "dev": "concurrently \"npm:dev:vite\" \"npm:dev:11ty\"",
      "smoke:core": "node scripts/smoke.mjs && node scripts/visual-smoke.mjs",
      "smoke:a11y": "node scripts/run-pa11y.mjs",
      "smoke:perf": "node scripts/perf-budget.mjs",
      "smoke": "npm run smoke:core && npm run smoke:a11y && npm run smoke:perf"
    }
  }
  ```

- [ ] **Install concurrently for parallel dev servers**

  ```bash
  npm install --save-dev concurrently
  ```

- [x] **Update Eleventy config to inject hashed asset paths**
  - [ ] Add global data function to read Vite manifest
  - [ ] Create filter to resolve hashed asset paths
  - [ ] Update `base.njk` to use hashed paths

- [x] **Add asset hashing**
  - [ ] CSS: Use PostCSS + cssnano with sourceMap
  - [ ] JS: Vite handles this automatically
  - [ ] Images: Consider using Eleventy Image plugin

- [x] **Configure HMR for development**
  - [ ] Vite dev server runs on port 5173
  - [ ] Eleventy serve runs on port 8080
  - [ ] Add Vite client script to `base.njk` in dev mode

- [x] **Test build pipeline**
  - [ ] `npm run clean`
  - [ ] `npm run build`
  - [ ] Verify all assets in `_site/assets/js/` have hashes
  - [ ] Verify CSS is minified
  - [ ] Check bundle size: `du -sh _site/assets/js/*.js`

- [x] **Test development mode**
  - [ ] `npm run dev`
  - [ ] Make a change to `theme.js`
  - [ ] Verify HMR updates without full reload
  - [ ] Check console for errors

- [x] **Optimize bundle**
  - [ ] Enable tree-shaking (Vite default)
  - [ ] Code-split large modules (Scorecard is 936 lines)
  - [ ] Consider lazy-loading non-critical modules
  - [ ] Target: <100KB gzipped

**References**:

- [Vite Documentation](https://vitejs.dev/)
- [esbuild Documentation](https://esbuild.github.io/)
- [Eleventy + Vite Guide](https://www.11ty.dev/docs/languages/javascript/#using-vite-with-eleventy)

---

### Phase 2: Feature Enhancements (Medium Priority)

**Timeline**: Weeks 4-6  
**Blocking**: Requires Phase 1 completion  
**Risk Level**: 🟡 Medium (additive changes, minimal breaking potential)

#### 2.1 Enhanced Search

**Objective**: Upgrade search from simple string matching to fuzzy matching with Fuse.js, keyboard navigation, and better UX.

**Acceptance Criteria**:

- [ ] Fuzzy matching works (typos, partial matches)
- [ ] Keyboard navigation (↑/↓, Enter, Esc)
- [ ] Search results ranked by relevance
- [ ] Highlights matched text in results
- [ ] Performance: Search <100ms for 200+ pages
- [ ] Works offline (no API calls)

**Detailed Checklist**:

- [ ] **Install Fuse.js**

  ```bash
  npm install --save fuse.js
  ```

- [x] **Update search index generation** (`src/search-index.11ty.cjs`)
  - [ ] Add more metadata: tags, description, headings
  - [ ] Extract code blocks as searchable content
  - [ ] Add section-level granularity (not just page-level)

- [x] **Update search module** (`src/assets/js/modules/search.js`)
  - [ ] Import Fuse.js
  - [ ] Configure Fuse options:
    ```javascript
    const options = {
      keys: ["title", "description", "content", "tags"],
      threshold: 0.3, // 0 = exact, 1 = match anything
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2,
    };
    ```
  - [ ] Implement keyboard navigation:
    - `ArrowDown`: Next result
    - `ArrowUp`: Previous result
    - `Enter`: Navigate to selected result
    - `Escape`: Close search
  - [ ] Highlight matched text in results
  - [ ] Add "No results found" state with suggestions

- [x] **Add search analytics**
  - [ ] Track search queries via OpenTelemetry
  - [ ] Track result clicks
  - [ ] Track "no results" queries (for content gap analysis)

- [x] **Test search**
  - [ ] Test fuzzy matching: "debezum" → "Debezium"
  - [ ] Test partial matches: "kafka" → all Kafka pages
  - [ ] Test keyboard navigation
  - [ ] Test on mobile (touch-friendly)
  - [ ] Test performance with 200+ pages

- [x] **Add visual indicators**
  - [ ] Show match count
  - [ ] Show search in progress indicator
  - [ ] Highlight active result
  - [ ] Show keyboard shortcuts hint

**References**:

- [Fuse.js Documentation](https://fusejs.io/)

---

#### 2.2 Interactive Learning Components

**Objective**: Add interactive elements (quizzes, playgrounds, diagrams, timeline) to boost engagement.

**Acceptance Criteria**:

- [ ] Quiz component with multiple choice, instant feedback
- [ ] Code playground with live execution (sandboxed)
- [ ] Interactive diagrams (SVG with tooltips, animations)
- [ ] Timeline component for CDC event flow visualization
- [ ] All components are accessible (keyboard nav, screen readers)
- [ ] Components work without JavaScript (progressive enhancement)

**Detailed Checklist**:

- [x] **Quiz Component**
  - [ ] Design: Create quiz component specification
  - [ ] Refer to interactive learning best practices
  - [ ] Create `src/assets/js/modules/quiz.js`
  - [ ] Features:
    - Multiple choice questions
    - Instant feedback (correct/incorrect)
    - Explanation for each answer
    - Progress tracking
    - Retry logic
  - [ ] Add to 3+ modules as pilot
  - [ ] Track completion via OpenTelemetry

- [x] **Code Playground** (stretch goal)
  - [ ] Options:
    - **Option A**: Embed CodeSandbox/StackBlitz (easiest)
    - **Option B**: Build custom REPL with Web Workers (most control)
  - [ ] Start with SQL playground for CDC queries
  - [ ] Sandbox security: Use iframe with sandbox attribute
  - [ ] Add "Run" and "Reset" buttons
  - [ ] Show console output

- [x] **Interactive Diagrams**
  - [ ] Use Mermaid.js (already in repo)
  - [ ] Add tooltips on hover
  - [ ] Add click-to-highlight feature
  - [ ] Add animation for CDC event flow
  - [ ] Convert 5+ static diagrams to interactive

- [x] **Timeline Component**
  - [ ] Visualize CDC event flow (snapshot → streaming → lag)
  - [ ] Add zoom/pan for long timelines
  - [ ] Add event details on click
  - [ ] Use for "Snapshotting" and "Observability" modules

- [x] **Progressive Enhancement**
  - [ ] All components degrade gracefully without JS
  - [ ] Use `<noscript>` fallbacks where needed
  - [ ] Ensure keyboard navigation works

**References**:

- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Mermaid.js](https://mermaid.js.org/)

---

#### 2.3 Improved Assistant

**Objective**: Enhance the AI assistant with context awareness, chat history, and better citations.

**Acceptance Criteria**:

- [ ] Context-aware responses (knows which module user is on)
- [ ] Chat history persists across sessions (localStorage)
- [ ] Citations link directly to relevant sections
- [ ] Assistant can suggest next topics based on progress
- [ ] Feedback system (👍/👎) works and syncs to Appwrite
- [ ] Response time <2s

**Detailed Checklist**:

- [x] **Context Awareness**
  - [ ] Pass current module slug to assistant
  - [ ] Filter intent matching by current module tags
  - [ ] Prioritize results from current module

- [x] **Chat History**
  - [ ] Store last 10 messages in localStorage
  - [ ] Display previous messages in UI
  - [ ] Add "Clear history" button
  - [ ] Sync to Appwrite if user is logged in (optional)

- [x] **Better Citations**
  - [ ] Link to specific headings (not just pages)
  - [ ] Show preview on hover
  - [ ] Track citation clicks

- [x] **Next Topic Suggestions**
  - [ ] Analyze user progress from scorecard data
  - [ ] Suggest modules with 0% completion
  - [ ] Suggest modules tagged as prerequisites

- [x] **Feedback Improvements**
  - [ ] Add optional comment field for negative feedback
  - [ ] Show aggregate feedback stats in admin dashboard
  - [ ] Use feedback to improve intent matching

**References**:

- `src/data/assistant.yml` - Intent definitions
- `docs/SETUP.md` (Assistant section) - Appwrite feedback setup

---

### Phase 3: Testing & Quality (High Priority)

**Timeline**: Weeks 7-9  
**Blocking**: Should run in parallel with Phase 2  
**Risk Level**: 🟢 Low (additive, non-breaking)

#### 3.1 Unit Testing

**Objective**: Achieve ≥80% code coverage with Vitest for all JavaScript modules.

**Acceptance Criteria**:

- [ ] Vitest configured and running
- [ ] All 7 modules have unit tests
- [ ] Code coverage ≥80% for each module
- [ ] Tests run in <5 seconds
- [ ] Tests pass in CI/CD
- [ ] Mock DOM APIs correctly

**Detailed Checklist**:

- [ ] **Install Vitest**

  ```bash
  npm install --save-dev vitest @vitest/ui jsdom
  ```

- [ ] **Create `vitest.config.mjs`**

  ```javascript
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.js",
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        exclude: ["node_modules/", "tests/", "_site/"],
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  });
  ```

- [x] **Create test setup** (`tests/setup.js`)
  - [ ] Mock localStorage
  - [ ] Mock IntersectionObserver
  - [ ] Mock matchMedia
  - [ ] Provide global test utilities

- [ ] **Write unit tests for each module**:
  - [ ] **`tests/unit/modules/theme.test.js`**
    - Test: Theme toggle works
    - Test: Theme persists in localStorage
    - Test: Respects prefers-color-scheme
    - Test: Syncs across multiple toggles

  - [ ] **`tests/unit/modules/navigation.test.js`**
    - Test: Mobile menu opens/closes
    - Test: Escape key closes menu
    - Test: Dropdown positioning
    - Test: Focus management

  - [ ] **`tests/unit/modules/search.test.js`**
    - Test: Fuzzy search works
    - Test: Keyboard navigation
    - Test: Search overlay open/close
    - Test: Result ranking

  - [ ] **`tests/unit/modules/scorecard.test.js`**
    - Test: Progress tracking
    - Test: localStorage persistence
    - Test: Summary calculations
    - Test: Remote sync (mocked)

  - [ ] **`tests/unit/modules/code-blocks.test.js`**
    - Test: Copy button works
    - Test: Clipboard API mocked
    - Test: Language detection
    - Test: Syntax highlighting

  - [ ] **`tests/unit/modules/toast.test.js`**
    - Test: Toast displays
    - Test: Auto-dismiss after timeout
    - Test: Manual close button
    - Test: Multiple toasts stack correctly

  - [ ] **`tests/unit/modules/quick-nav.test.js`**
    - Test: Intersection observer detects scroll
    - Test: Active state updates
    - Test: Progress badges display

- [ ] **Add npm scripts**

  ```json
  {
    "scripts": {
      "test": "vitest",
      "test:ui": "vitest --ui",
      "test:coverage": "vitest --coverage"
    }
  }
  ```

- [x] **Run tests locally**
  - [ ] `npm test`
  - [ ] `npm run test:coverage`
  - [ ] Fix failing tests
  - [ ] Ensure coverage ≥80%

- [x] **Integrate with CI**
  - [ ] Add test job to `.github/workflows/ci.yml`
  - [ ] Fail build if tests fail
  - [ ] Upload coverage reports to Codecov (optional)

**References**:

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)

---

#### 3.2 End-to-End Testing

**Objective**: Set up Playwright for E2E testing, visual regression, and accessibility checks.

**Acceptance Criteria**:

- [ ] Playwright configured for Chrome, Firefox, Safari
- [ ] E2E tests cover critical user journeys
- [ ] Visual regression tests detect UI changes
- [ ] Accessibility tests catch violations
- [ ] Tests run in CI/CD
- [ ] Test results published as artifacts

**Detailed Checklist**:

- [ ] **Install Playwright**

  ```bash
  npm install --save-dev @playwright/test
  npx playwright install
  ```

- [ ] **Create `playwright.config.mjs`**

  ```javascript
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",
    use: {
      baseURL: "http://localhost:8080",
      trace: "on-first-retry",
      screenshot: "only-on-failure",
    },
    projects: [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
      { name: "firefox", use: { ...devices["Desktop Firefox"] } },
      { name: "webkit", use: { ...devices["Desktop Safari"] } },
      { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    ],
    webServer: {
      command: "npm run dev",
      port: 8080,
      reuseExistingServer: !process.env.CI,
    },
  });
  ```

- [ ] **Create E2E tests** (`tests/e2e/`)
  - [ ] **`tests/e2e/navigation.spec.js`**
    - Test: Navigate to all main sections
    - Test: Mobile menu works
    - Test: Dropdowns work
    - Test: Breadcrumbs work

  - [ ] **`tests/e2e/search.spec.js`**
    - Test: Search overlay opens with `/` key
    - Test: Search returns results
    - Test: Click result navigates correctly
    - Test: Keyboard navigation works

  - [ ] **`tests/e2e/modules.spec.js`**
    - Test: Load each of 40+ content modules
    - Test: Scorecard tracking works
    - Test: Progress persists across reloads

  - [ ] **`tests/e2e/theme.spec.js`**
    - Test: Theme toggle works
    - Test: Theme persists across reloads
    - Test: Dark mode renders correctly

  - [ ] **`tests/e2e/accessibility.spec.js`**
    - Test: Run axe-core on all pages
    - Test: Keyboard navigation works
    - Test: ARIA attributes are correct
    - Test: Color contrast passes

- [x] **Add visual regression tests**
  - [ ] Install `@playwright/test` visual comparison
  - [ ] Take baseline screenshots
  - [ ] Compare on each run
  - [ ] Store diffs as artifacts

- [ ] **Add npm scripts**

  ```json
  {
    "scripts": {
      "test:e2e": "playwright test",
      "test:e2e:ui": "playwright test --ui",
      "test:e2e:debug": "playwright test --debug"
    }
  }
  ```

- [x] **Integrate with CI**
  - [ ] Add E2E test job to `.github/workflows/ci.yml`
  - [ ] Run on Chrome, Firefox, Safari
  - [ ] Publish test reports as artifacts
  - [ ] Fail build if tests fail

**References**:

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)

---

#### 3.3 CI/CD Pipeline

**Objective**: Enhance GitHub Actions workflows with Lighthouse CI, PR previews, and comprehensive checks.

**Acceptance Criteria**:

- [ ] Lighthouse CI runs on every PR
- [ ] PR previews deploy to GitHub Pages (separate URL)
- [ ] Unit tests, E2E tests, linting all run in CI
- [ ] Build artifacts cached for faster builds
- [ ] Status checks block merging if tests fail
- [ ] Slack/email notifications for failures (optional)

**Detailed Checklist**:

- [x] **Add Lighthouse CI**
  - [ ] Install: `npm install --save-dev @lhci/cli`
  - [ ] Create `.lighthouserc.json`:
    ```json
    {
      "ci": {
        "collect": {
          "numberOfRuns": 3,
          "url": [
            "http://localhost:8080/",
            "http://localhost:8080/intro/",
            "http://localhost:8080/snapshotting/"
          ]
        },
        "assert": {
          "assertions": {
            "categories:performance": ["error", { "minScore": 0.9 }],
            "categories:accessibility": ["error", { "minScore": 0.95 }],
            "categories:best-practices": ["error", { "minScore": 0.9 }],
            "categories:seo": ["error", { "minScore": 0.9 }]
          }
        },
        "upload": {
          "target": "temporary-public-storage"
        }
      }
    }
    ```
  - [ ] Add job to `.github/workflows/ci.yml`:
    ```yaml
    lighthouse:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
        - run: npm ci
        - run: npm run build
        - run: npx @lhci/cli autorun
    ```

- [x] **Add PR Preview Deployments**
  - [ ] Use Netlify Deploy Previews or Vercel
  - [ ] Alternative: GitHub Pages with PR-specific subdirectories
  - [ ] Add comment to PR with preview URL
  - [ ] Auto-delete preview when PR closes

- [x] **Expand CI checks** (`.github/workflows/ci.yml`)
  - [ ] Job 1: Lint (ESLint, Prettier)
  - [ ] Job 2: Unit tests (Vitest)
  - [ ] Job 3: Build (Eleventy + Vite)
  - [ ] Job 4: E2E tests (Playwright)
  - [ ] Job 5: Lighthouse CI
  - [ ] Job 6: Accessibility (pa11y)
  - [ ] Job 7: Security audit (`npm audit`)

- [x] **Add caching**
  - [ ] Cache `node_modules` with `actions/cache`
  - [ ] Cache Playwright browsers
  - [ ] Cache Eleventy build cache

- [x] **Add status checks**
  - [ ] Require all jobs to pass before merge
  - [ ] Add branch protection rules
  - [ ] Require 1+ approving review

- [x] **Add notifications** (optional)
  - [ ] Slack webhook for failures
  - [ ] Email on deploy success/failure
  - [ ] GitHub Discussions post on release

**References**:

- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
- [GitHub Actions Caching](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)

---

## Agent Configuration

### Required Agent Skills Matrix

| Skill                          | Description                                       | Used In Phases | Tools/APIs                     | Priority    |
| ------------------------------ | ------------------------------------------------- | -------------- | ------------------------------ | ----------- |
| **`code-refactoring`**         | Safely restructure code without changing behavior | Phase 1.2      | AST analysis, test-driven      | 🔴 Critical |
| **`module-bundling`**          | Configure and optimize esbuild/Vite               | Phase 1.2, 1.3 | Vite, esbuild                  | 🔴 Critical |
| **`esm-migration`**            | Convert CommonJS to ESM                           | Phase 1.1      | Node.js, import/export         | 🔴 Critical |
| **`testing`**                  | Write and maintain unit/E2E tests                 | Phase 3.1, 3.2 | Vitest, Playwright             | 🔴 Critical |
| **`accessibility`**            | Ensure WCAG 2.1 AA compliance                     | Phase 2, 3.2   | axe-core, pa11y                | 🔴 Critical |
| **`eleventy`**                 | Eleventy 3.0 configuration and templating         | Phase 1.1      | Eleventy, Nunjucks             | 🔴 Critical |
| **`github-actions`**           | Configure CI/CD workflows                         | Phase 3.3      | GitHub Actions                 | 🟡 High     |
| **`performance-optimization`** | Lighthouse optimization, bundle splitting         | Phase 1.3, 3.3 | Lighthouse, WebPageTest        | 🟡 High     |
| **`css-architecture`**         | PostCSS, responsive design, dark mode             | Phase 2        | PostCSS, CSS custom properties | 🟢 Medium   |
| **`content-migration`**        | Update Nunjucks templates for new features        | Phase 2        | Nunjucks, YAML                 | 🟢 Medium   |
| **`security-audit`**           | Identify and fix vulnerabilities                  | Phase 3        | npm audit, Snyk                | 🟢 Medium   |

### Context Files by Phase

#### Phase 1.1: Eleventy 3.0 Migration

**Required Reading**:

- `eleventy.config.mjs` - Current configuration
- `lib/path-prefix.mjs` - Build-time utilities
- `src/_data/*.cjs` - Data files to convert
- `package.json` - Scripts and dependencies
- `docs/SETUP.md` - Build instructions

**Agent Prompt Template**:

```
You are a senior JavaScript developer specializing in static site generators.
Your task is to migrate this Eleventy 2.0 project to Eleventy 3.0.

Context:
- The project uses CommonJS modules (.cjs) and needs to convert to ESM (.mjs)
- Path prefix system must continue to work for GitHub Pages deployment
- All passthrough copies and data files must remain functional

Requirements:
1. Convert eleventy.config.mjs to ESM
2. Convert all .cjs files in lib/ and src/_data/ to .mjs
3. Update all import statements
4. Test that the site builds without errors
5. Verify all pages render correctly

Success criteria:
- `npm run build` completes without errors
- All pages in _site/ match pre-migration output
- Path prefix works for both root and subdirectory deployment
```

#### Phase 1.2: JavaScript Modularization

**Required Reading**:

- `src/assets/js/app.js` (lines 1-1821) - Monolithic file to split
- `src/assets/js/tracing-lite.js` - OpenTelemetry integration
- `src/assets/js/utils/path-prefix.js` - Existing utility module
- This PRD (module breakdown section)

**Agent Prompt Template**:

```
You are a senior frontend architect specializing in JavaScript modularization.
Your task is to split a 1821-line monolithic app.js file into 7 maintainable modules.

Context:
- The file contains 7 distinct features (theme, navigation, search, scorecard, code blocks, toast, quick nav)
- All functionality must work identically after splitting
- Each module should be independently testable
- OpenTelemetry tracing must continue to work

Module boundaries are defined in this PRD at lines:
- Theme: 27-86
- Navigation: 109-385
- Search: 489-612
- Scorecard: 780-1715
- Code blocks: 446-487, 1536-1631
- Toast: 1717-1821
- Quick Nav: 614-778

Requirements:
1. Create src/assets/js/modules/ directory
2. Extract each module with clear exports
3. Create new app.js orchestrator that imports all modules
4. Ensure all pages work identically
5. Add JSDoc comments to each module

Success criteria:
- All 40+ content pages work without errors
- Console shows no errors
- Theme toggle, search, navigation all work
- Scorecard tracking persists across reloads
```

#### Phase 1.3: Build Pipeline Modernization

**Required Reading**:

- `package.json` - Current build scripts
- `vite.config.mjs` (to be created) - Vite configuration
- `.github/workflows/ci.yml` - CI integration
- `docs/TRACING.md` - Tracing implementation guide (includes bundling notes)

**Agent Prompt Template**:

```
You are a senior build engineer specializing in modern JavaScript tooling.
Your task is to add Vite bundling to this Eleventy static site.

Context:
- The project currently has no bundler (files copied as-is)
- JavaScript modules need bundling and minification
- Asset hashing is required for cache busting
- HMR would improve developer experience

Requirements:
1. Install and configure Vite
2. Set up Vite to bundle src/assets/js/app.js and modules
3. Configure output to _site/assets/js/[name].[hash].js
4. Update Eleventy config to inject hashed asset paths
5. Add HMR support for development

Success criteria:
- Bundle size <100KB gzipped
- Build time <3 seconds
- HMR works in dev mode
- Assets have content hashes in production
```

#### Phase 2: Feature Enhancements

**Required Reading**:

- `src/assets/js/modules/search.js` - Search module to enhance
- `src/search-index.11ty.cjs` - Search index generation
- `src/data/assistant.yml` - Assistant intent definitions
- `docs/SETUP.md` (Interactive Components section) - Feature setup guide

#### Phase 3: Testing & Quality

**Required Reading**:

- `vitest.config.mjs` (to be created) - Unit test config
- `playwright.config.mjs` (to be created) - E2E test config
- `scripts/smoke.mjs` - Existing smoke tests
- `.github/workflows/ci.yml` - CI pipeline

---

## Implementation Order

### Gantt-Style Timeline (Mermaid Diagram)

```mermaid
gantt
    title Let's Talk CDC Site Revamp Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1: Foundation
    Eleventy 3.0 Migration           :crit, p1-1, 2026-02-10, 5d
    JavaScript Modularization        :crit, p1-2, after p1-1, 7d
    Build Pipeline Modernization     :crit, p1-3, after p1-2, 5d

    section Phase 2: Features
    Enhanced Search                  :p2-1, after p1-3, 5d
    Interactive Components           :p2-2, after p2-1, 7d
    Improved Assistant               :p2-3, after p2-2, 5d

    section Phase 3: Testing
    Unit Testing Setup               :p3-1, after p1-3, 3d
    Unit Test Implementation         :p3-1b, after p3-1, 7d
    E2E Testing Setup                :p3-2, after p3-1b, 3d
    E2E Test Implementation          :p3-2b, after p3-2, 7d
    CI/CD Pipeline Enhancement       :p3-3, after p3-2b, 5d

    section Milestones
    Phase 1 Complete                 :milestone, m1, after p1-3, 0d
    Phase 2 Complete                 :milestone, m2, after p2-3, 0d
    Phase 3 Complete                 :milestone, m3, after p3-3, 0d
    Production Release               :milestone, m4, after m3, 0d
```

### Phase Dependencies

```mermaid
graph TD
    Start[Start Project] --> P1-1[Eleventy 3.0 Migration]
    P1-1 --> P1-2[JavaScript Modularization]
    P1-2 --> P1-3[Build Pipeline Modernization]

    P1-3 --> P2-1[Enhanced Search]
    P1-3 --> P3-1[Unit Testing]

    P2-1 --> P2-2[Interactive Components]
    P2-2 --> P2-3[Improved Assistant]

    P3-1 --> P3-2[E2E Testing]
    P3-2 --> P3-3[CI/CD Pipeline]

    P2-3 --> Release[Production Release]
    P3-3 --> Release

    style P1-1 fill:#ff6b6b
    style P1-2 fill:#ff6b6b
    style P1-3 fill:#ff6b6b
    style P2-1 fill:#ffd93d
    style P2-2 fill:#ffd93d
    style P2-3 fill:#ffd93d
    style P3-1 fill:#6bcf7f
    style P3-2 fill:#6bcf7f
    style P3-3 fill:#6bcf7f
    style Release fill:#4d96ff
```

### Critical Path

**Sequential (Blocking)**:

1. Eleventy 3.0 Migration → JavaScript Modularization → Build Pipeline
2. Phase 1 completion blocks Phase 2 and Phase 3

**Parallel (Non-Blocking)**:

- Unit Testing can start after Build Pipeline (while Phase 2 is ongoing)
- E2E Testing can start after Unit Testing (independent of Phase 2)
- Enhanced Search, Interactive Components, Improved Assistant can be done in any order

---

## Risk Mitigation

### Risk Matrix

| Risk                                           | Likelihood | Impact    | Mitigation Strategy                                               | Owner      |
| ---------------------------------------------- | ---------- | --------- | ----------------------------------------------------------------- | ---------- |
| **Breaking changes in Eleventy 3.0**           | 🟡 Medium  | 🔴 High   | Thoroughly test in staging; maintain 2.0 fallback branch          | @sandgraal |
| **Module splitting introduces bugs**           | 🟡 Medium  | 🔴 High   | Comprehensive E2E tests before splitting; parallel testing        | @sandgraal |
| **Bundle size increases instead of decreases** | 🟢 Low     | 🟡 Medium | Monitor with Lighthouse CI; tree-shaking enabled by default       | @sandgraal |
| **Vite/esbuild conflicts with Eleventy**       | 🟢 Low     | 🟡 Medium | Follow Eleventy + Vite integration guide; use viteStaticCopy      | @sandgraal |
| **Tests are flaky in CI**                      | 🟡 Medium  | 🟡 Medium | Use retry logic; run tests in Docker for consistency              | @sandgraal |
| **Performance regression after bundling**      | 🟢 Low     | 🔴 High   | Lighthouse CI enforces score thresholds; fail build if regression | @sandgraal |
| **Accessibility violations introduced**        | 🟢 Low     | 🔴 High   | Automated axe-core tests in E2E suite; pa11y in CI                | @sandgraal |
| **Dependencies have security vulnerabilities** | 🟡 Medium  | 🟡 Medium | npm audit in CI; Dependabot alerts; Fortify workflow already runs | @sandgraal |
| **Breaking changes during migration**          | 🟡 Medium  | 🔴 High   | Feature flag new implementations; A/B test before full rollout    | @sandgraal |
| **Timeline slips due to complexity**           | 🟡 Medium  | 🟢 Low    | Phase 1 is MVP; Phase 2/3 can be delayed without blocking launch  | @sandgraal |

### Rollback Plan

**If Phase 1 migration fails**:

1. Revert to Git tag `pre-phase1-migration`
2. Continue using Eleventy 2.0 until issues resolved
3. Block Phase 2 and Phase 3 work

**If modularization introduces critical bugs**:

1. Keep monolithic `app.js` in a `legacy/` folder
2. Feature flag: Load modular version or legacy based on `?legacy=1` param
3. Gradually roll out modular version to 10% → 50% → 100% of users

**If bundle size explodes**:

1. Revert to unbundled modules (Eleventy passthrough copy)
2. Investigate tree-shaking failures
3. Consider manual code splitting

### Browser Support Matrix

| Browser                     | Version         | Support Level    | Test Coverage     |
| --------------------------- | --------------- | ---------------- | ----------------- |
| **Chrome**                  | Last 2 versions | ✅ Full support  | E2E tests         |
| **Firefox**                 | Last 2 versions | ✅ Full support  | E2E tests         |
| **Safari**                  | Last 2 versions | ✅ Full support  | E2E tests         |
| **Edge**                    | Last 2 versions | ✅ Full support  | Smoke tests       |
| **Mobile Safari** (iOS)     | Last 2 versions | ✅ Full support  | Playwright mobile |
| **Mobile Chrome** (Android) | Last 2 versions | ✅ Full support  | Playwright mobile |
| **IE 11**                   | -               | ❌ Not supported | N/A               |

**Polyfills Required**:

- None (ES6+ native support in all target browsers)
- Optional: IntersectionObserver for older Safari (<12.1)

---

## Appendices

### Appendix A: Glossary

| Term              | Definition                                                   |
| ----------------- | ------------------------------------------------------------ |
| **CDC**           | Change Data Capture — capturing database changes as events   |
| **Eleventy**      | Static site generator built on Node.js                       |
| **ESM**           | ECMAScript Modules — modern JavaScript module system         |
| **HMR**           | Hot Module Replacement — instant updates without full reload |
| **Tree-shaking**  | Removing unused code from bundles                            |
| **Lighthouse**    | Google's automated tool for web page quality audits          |
| **WCAG**          | Web Content Accessibility Guidelines                         |
| **pa11y**         | Automated accessibility testing tool                         |
| **Vitest**        | Fast unit testing framework (Vite-native)                    |
| **Playwright**    | Cross-browser E2E testing framework                          |
| **Fuse.js**       | Lightweight fuzzy-search library                             |
| **OpenTelemetry** | Observability framework for distributed tracing              |
| **Appwrite**      | Backend-as-a-Service for auth and data storage               |

### Appendix B: Related Documents

> **Note**: This documentation has been consolidated. Several guides that were previously separate have been merged:
>
> - Tracing docs consolidated into `TRACING.md`
> - Setup docs consolidated into `SETUP.md`
> - AI guidelines moved to `docs/CONTRIBUTING.md`
> - Technical integration guide at `docs/INTEGRATION.md`

**Setup & Configuration**:

- [Setup Guide](SETUP.md) — Complete setup including Appwrite, auth, and assistant
- [Hosting Guide](HOSTING.md) — GitHub Pages deployment
- [Tracing Guide](TRACING.md) — OpenTelemetry tracing (includes quickstart)
- [Sandbox Guide](SANDBOX.md) — Docker CDC lab environment

**Content & Features**:

- [Adding Modules](adding-modules.md) — Content contribution guide
- [Video Embeds](video-embeds.md) — Video component usage
- [Community Guide](COMMUNITY.md) — GitHub Discussions setup

**Development & Architecture**:

- [Contributing Guide](CONTRIBUTING.md) — AI agent guidelines (moved from root)
- [Integration Guide](INTEGRATION.md) — Progress tracking implementation
- [JavaScript Architecture](javascript-architecture.md) — Module system (to be created in Phase 1.2)
- [AI Agent System](../ai/AGENTS.md) — Agent documentation
- [AI Context](../ai/CONTEXT.md) — Brand voice and conventions
- [Security Policy](../SECURITY.md) — Security guidelines

**Reference**:

- [README](../README.md) — Project overview and quick start
- [Changelog](../CHANGELOG.md) — Version history

### Appendix C: Change Log

| Version | Date       | Author     | Changes                                            |
| ------- | ---------- | ---------- | -------------------------------------------------- |
| 1.0.0   | 2026-02-05 | @sandgraal | Initial PRD creation with complete phase breakdown |

---

## Approval & Sign-Off

| Role              | Name       | Status     | Date | Signature |
| ----------------- | ---------- | ---------- | ---- | --------- |
| **Product Owner** | @sandgraal | ⏳ Pending | -    | -         |
| **Tech Lead**     | @sandgraal | ⏳ Pending | -    | -         |
| **QA Lead**       | TBD        | ⏳ Pending | -    | -         |

---

## Next Steps

1. **Review this PRD** with stakeholders and gather feedback
2. **Create GitHub Issues** for each phase (one issue per phase, or per sub-task)
3. **Set up project board** with columns: Backlog, In Progress, Review, Done
4. **Assign Phase 1.1** to first AI agent or developer
5. **Schedule weekly check-ins** to track progress and adjust timeline
6. **Update this PRD** as requirements evolve (maintain in version control)

---

_This document is a living artifact and will be updated as the project progresses. All changes should be tracked in the Change Log (Appendix C)._
