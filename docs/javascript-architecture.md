# JavaScript Architecture

> Module system documentation for the Let's Talk CDC client-side codebase.

---

## Overview

The client-side JavaScript follows a **modular architecture** with a single orchestrator entry point (`app.js`) that imports focused, independently testable modules. Previously a monolithic 1821-line file, the code was split during the Phase 1.2 modularization effort.

All modules use **ES Modules** (ESM) syntax and are bundled by **Vite** for production (content-hashed outputs in `dist/`).

---

## Directory Structure

```
src/assets/js/
├── app.js                    # Entry point / orchestrator (85 lines)
├── search.js                 # Standalone search entry (Vite input)
├── tracing-lite.js           # Lightweight OpenTelemetry wrapper
├── tracing.js                # Full OpenTelemetry setup (optional)
├── auth.js                   # Appwrite authentication
├── auth-ui.js                # Auth modal & profile UI
├── cloud-progress.js         # Cloud progress sync (Appwrite)
├── local-progress.js         # localStorage-based progress
├── progress-ui.js            # Progress bar UI components
├── video-embed.js            # Lazy video embed loader
├── web-vitals-dashboard.js   # Web Vitals reporting dashboard
├── modules/                  # Core UI modules
│   ├── theme.js              # Theme (dark/light) management
│   ├── navigation.js         # Mobile nav & dropdown menus
│   ├── search.js             # Search overlay with Fuse.js
│   ├── scorecard.js          # Progress tracking & scorecards
│   ├── code-blocks.js        # Code copy buttons & highlighting
│   ├── toast.js              # Toast notification system
│   ├── quick-nav.js          # Quick navigation sidebar
│   ├── depth-toggle.js       # Content depth (beginner/advanced)
│   ├── interactive-diagrams.js # Mermaid diagram interactions
│   └── timeline.js           # CDC event timeline component
├── lib/                      # Shared utilities
│   └── quiz.js               # Quiz component logic
├── pages/                    # Page-specific scripts
│   ├── intro.js
│   ├── cdc-simulation.js
│   ├── connector-builder.js
│   ├── dlq-triage.js
│   ├── exactly-once.js
│   ├── mermaid-sandbox.js
│   ├── multi-tenancy.js
│   ├── not-found.js
│   └── partitioning.js
└── utils/                    # Build/runtime utilities
    └── path-prefix.js
```

---

## Module Reference

### Core Modules (`modules/`)

Each module exports an `init*()` function called by the orchestrator.

| Module                    | Lines | Exports                           | Dependencies     |
| ------------------------- | ----- | --------------------------------- | ---------------- |
| `theme.js`                | 99    | `initTheme()`, `applyTheme()`     | None             |
| `navigation.js`           | 317   | `initNavigation()`                | None             |
| `search.js`               | 312   | `initSearch(tracer)`              | `path-prefix.js` |
| `scorecard.js`            | 884   | `initScorecards(tracer)`          | None             |
| `code-blocks.js`          | 200   | `initCodeBlocks(tracer)`          | None             |
| `toast.js`                | 131   | `showToast()`, `removeToast()`    | None             |
| `quick-nav.js`            | 187   | `initQuickNav()`                  | None             |
| `depth-toggle.js`         | 54    | `initDepthToggle()`               | None             |
| `interactive-diagrams.js` | 269   | `initInteractiveDiagrams(tracer)` | None             |
| `timeline.js`             | 114   | `initTimelines(tracer)`           | None             |

### Initialization Order

Defined in `app.js`:

```javascript
// 1. Theme runs immediately (before DOMContentLoaded) to prevent FOUC
initTheme();

// 2. Everything else runs on DOMContentLoaded
onReady(() => {
  initNavigation();
  initDepthToggle();
  initCodeBlocks(tracer);
  initSearch(tracer);
  initQuickNav();
  initScorecards(tracer);
  initTimelines(tracer);
  initInteractiveDiagrams(tracer);
});
```

**Why this order matters:**

- `initTheme()` runs first to apply saved theme before paint (prevents flash)
- `initNavigation()` sets up keyboard handlers that other modules may interact with
- `initSearch()` needs the DOM to be ready for overlay injection
- `initScorecards()` runs last among the heavy modules since it synchronizes with remote data

---

## Build Pipeline

### Vite Configuration

Entry points defined in `vite.config.mjs`:

| Entry                  | Source                                  | Output                                   |
| ---------------------- | --------------------------------------- | ---------------------------------------- |
| `app`                  | `src/assets/js/app.js`                  | `dist/js/app.[hash].js`                  |
| `search`               | `src/assets/js/search.js`               | `dist/js/search.[hash].js`               |
| `progress-ui`          | `src/assets/js/progress-ui.js`          | `dist/js/progress-ui.[hash].js`          |
| `auth-ui`              | `src/assets/js/auth-ui.js`              | `dist/js/auth-ui.[hash].js`              |
| `cloud-progress`       | `src/assets/js/cloud-progress.js`       | `dist/js/cloud-progress.[hash].js`       |
| `video-embed`          | `src/assets/js/video-embed.js`          | `dist/js/video-embed.[hash].js`          |
| `web-vitals-dashboard` | `src/assets/js/web-vitals-dashboard.js` | `dist/js/web-vitals-dashboard.[hash].js` |

### Asset Resolution

Eleventy reads `dist/.vite/manifest.json` at build time to resolve hashed paths. The `resolveViteAsset()` and `collectViteChunks()` helpers in `eleventy.config.mjs` provide:

- **`viteAsset` filter**: Resolves `src/assets/js/app.js` → `/assets/js/app.cGYExZ3c.js`
- **`viteChunks` filter**: Collects transitive chunk imports for `<link rel="modulepreload">`

**Fallback**: When no manifest exists (dev mode), paths fall back to the unbundled source paths.

---

## Testing

### Unit Tests (Vitest)

All modules have corresponding tests in `tests/unit/modules/`:

```
tests/unit/modules/
├── theme.test.js              (10 tests)
├── navigation.test.js         (38 tests)
├── search.test.js             (23 tests)
├── scorecard.test.js          (30 tests)
├── code-blocks.test.js        (24 tests)
├── toast.test.js              (16 tests)
├── quick-nav.test.js          (11 tests)
├── depth-toggle.test.js       (6 tests)
├── interactive-diagrams.test.js (18 tests)
├── timeline.test.js           (varies)
├── quiz.test.js               (41 tests)
└── assistant.test.js          (21 tests)
```

**Total: 238 tests, 90.5% statement coverage**

Run tests:

```bash
npm test              # Run all unit tests
npm run test:coverage # Run with coverage report
```

### E2E Tests (Playwright)

Integration tests in `tests/e2e/` covering:

- Navigation (desktop + mobile)
- Search overlay
- Theme persistence
- Content page loading
- Accessibility (axe-core)
- Scorecard interactions

**Total: 45 tests across Chromium, WebKit, and Mobile Chrome**

```bash
npm run test:e2e      # Run all E2E tests
npm run test:e2e:ui   # Interactive UI mode
```

---

## Tracing Integration

Modules that accept a `tracer` parameter use the `EducationTracer` class from `tracing-lite.js`. The tracer provides:

| Method               | Used By        | Tracks                          |
| -------------------- | -------------- | ------------------------------- |
| `trackModuleView()`  | `app.js`       | Page visits                     |
| `trackProgress()`    | `scorecard.js` | Learning progress               |
| `trackInteraction()` | Multiple       | Clicks, completions, quizzes    |
| `trackSearch()`      | `search.js`    | Search queries and result count |
| `trackWebVital()`    | `tracing-lite` | Core Web Vitals (LCP, FID, CLS) |

If tracing initialization fails, a no-op stub is used — modules never throw on missing tracer.

---

## Contributing

### Adding a New Module

1. Create `src/assets/js/modules/my-module.js`:

   ```javascript
   /**
    * My Module — brief description.
    * @module my-module
    */

   /**
    * Initialize the module.
    * @param {object} [tracer] - EducationTracer instance (optional)
    */
   export function initMyModule(tracer) {
     // Implementation
   }
   ```

2. Import and call in `app.js`:

   ```javascript
   import { initMyModule } from "./modules/my-module.js";
   // Inside onReady():
   initMyModule(educationTracer);
   ```

3. If it's a Vite entry point (standalone script), add to `vite.config.mjs` `rollupOptions.input`.

4. Write tests in `tests/unit/modules/my-module.test.js`.

5. Run `npm test` and `npx eslint src/assets/js/modules/my-module.js`.

### Code Style

- **ESLint**: Flat config in `eslint.config.mjs` (ESLint 9+)
- **Prettier**: Config in `.prettierrc`
- **Conventions**: `prefer-const`, `eqeqeq`, no `var`, unused vars prefixed with `_`

```bash
npm run lint          # Check for lint errors
npm run lint:fix      # Auto-fix what's possible
npm run format        # Format with Prettier
npm run format:check  # Check formatting
```
