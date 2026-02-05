# Prod-Site-Revamp Progress Tracker

**Status**: 🟡 Not Started  
**Last Updated**: 2026-02-05  
**Current Phase**: Setup

---

## 📊 Overall Progress

```
Phase 1: Foundation Upgrades       [░░░░░░░░░░] 0%
Phase 2: Feature Enhancements      [░░░░░░░░░░] 0%
Phase 3: Testing & Quality         [░░░░░░░░░░] 0%
```

**Overall Completion**: 0% (0/17 tasks)

---

## Phase 1: Foundation Upgrades (Critical Priority)

### 1.1 Eleventy 3.0 Migration

**Status**: 🔴 Not Started  
**Assigned**: Unassigned  
**Est. Time**: 5 days  
**Dependencies**: None

#### Checklist

- [ ] Convert `eleventy.config.cjs` to ESM (`eleventy.config.mjs`)
- [ ] Convert `lib/path-prefix.cjs` to ESM (`lib/path-prefix.mjs`)
- [ ] Convert all `src/_data/*.cjs` files to `.mjs`
- [ ] Update all `require()` calls to `import`
- [ ] Update `package.json` build scripts if needed
- [ ] Test site builds without errors
- [ ] Verify all 40+ pages render correctly
- [ ] Verify path prefix works (root and subdirectory)
- [ ] Run smoke tests (`npm run smoke`)
- [ ] Tag completion: `git tag phase-1.1-complete`

#### Success Criteria

- ✅ `npm run build` completes without errors
- ✅ All pages in `_site/` match pre-migration output (visual comparison)
- ✅ Path prefix works at both `/` and `/letstalkcdc/`
- ✅ No console errors on any page
- ✅ Build time ≤ 5 seconds

#### Files Modified

- `eleventy.config.cjs` → `eleventy.config.mjs`
- `lib/path-prefix.cjs` → `lib/path-prefix.mjs`
- `src/_data/*.cjs` → `src/_data/*.mjs`
- `package.json` (update references)

#### Notes

_No work started yet._

---

### 1.2 JavaScript Modularization

**Status**: 🔴 Not Started  
**Assigned**: Unassigned  
**Est. Time**: 7 days  
**Dependencies**: Phase 1.1 complete

#### Checklist

- [ ] Create `src/assets/js/modules/` directory
- [ ] Extract theme module (lines 27-86 of app.js)
- [ ] Extract navigation module (lines 109-385 of app.js)
- [ ] Extract search module (lines 489-612 of app.js)
- [ ] Extract scorecard module (lines 780-1715 of app.js)
- [ ] Extract code blocks module (lines 446-487, 1536-1631 of app.js)
- [ ] Extract toast module (lines 1717-1821 of app.js)
- [ ] Extract quick nav module (lines 614-778 of app.js)
- [ ] Create new orchestrator `app.js` that imports all modules
- [ ] Add JSDoc comments to each module
- [ ] Test all 40+ pages for functionality
- [ ] Verify theme toggle works
- [ ] Verify search works
- [ ] Verify navigation works
- [ ] Verify scorecard tracking persists
- [ ] Check for console errors
- [ ] Run smoke tests

#### Success Criteria

- ✅ All pages work identically to pre-modularization
- ✅ No console errors
- ✅ Theme toggle, search, navigation all functional
- ✅ Scorecard tracking persists across reloads
- ✅ Each module is <300 lines
- ✅ Each module has clear exports and JSDoc

#### Modules to Create

1. `theme.js` — Dark/light theme toggle
2. `navigation.js` — Mobile menu, smooth scroll
3. `search.js` — Full-text search with Fuse.js
4. `scorecard.js` — Progress tracking
5. `code-blocks.js` — Copy button, syntax highlighting
6. `toast.js` — Toast notifications
7. `quick-nav.js` — Quick navigation sidebar

#### Notes

_No work started yet._

---

### 1.3 Build Pipeline Modernization

**Status**: 🔴 Not Started  
**Assigned**: Unassigned  
**Est. Time**: 5 days  
**Dependencies**: Phase 1.2 complete

#### Checklist

- [ ] Install Vite (`npm install -D vite`)
- [ ] Create `vite.config.mjs` with Eleventy integration
- [ ] Configure Vite to bundle `src/assets/js/app.js`
- [ ] Set output to `_site/assets/js/[name].[hash].js`
- [ ] Update Eleventy to inject hashed asset paths
- [ ] Add HMR support for dev mode
- [ ] Configure tree-shaking
- [ ] Test bundle size (<100KB gzipped)
- [ ] Test build time (<3 seconds)
- [ ] Verify HMR works in `npm run dev`
- [ ] Run smoke tests
- [ ] Run performance checks

#### Success Criteria

- ✅ Bundle size <100KB gzipped
- ✅ Build time <3 seconds
- ✅ HMR works in dev mode
- ✅ Assets have content hashes in production
- ✅ Tree-shaking removes unused code
- ✅ Lighthouse Performance Score ≥90

#### Files to Create

- `vite.config.mjs` — Vite configuration

#### Files to Modify

- `eleventy.config.mjs` — Add asset hash injection
- `package.json` — Update build scripts
- `src/_includes/layouts/base.njk` — Use hashed assets

#### Notes

_No work started yet._

---

## Phase 2: Feature Enhancements (Medium Priority)

**Status**: 🔴 Not Started  
**Dependencies**: Phase 1 complete

### 2.1 Enhanced Search

- [ ] Implement fuzzy search with Fuse.js
- [ ] Add search filters (by section, difficulty)
- [ ] Add search result highlighting
- [ ] Test search accuracy

### 2.2 Interactive Components

- [ ] Add live code editor (CodeMirror/Monaco)
- [ ] Add interactive diagrams
- [ ] Test components on mobile

### 2.3 Improved Assistant

- [ ] Enhance intent matching
- [ ] Add context awareness
- [ ] Test assistant responses

---

## Phase 3: Testing & Quality (High Priority)

**Status**: 🔴 Not Started  
**Dependencies**: Phase 1 complete (can run in parallel with Phase 2)

### 3.1 Unit Testing

- [ ] Install Vitest
- [ ] Create `vitest.config.mjs`
- [ ] Write tests for theme module
- [ ] Write tests for navigation module
- [ ] Write tests for search module
- [ ] Write tests for scorecard module
- [ ] Write tests for code blocks module
- [ ] Write tests for toast module
- [ ] Write tests for quick nav module
- [ ] Achieve ≥80% coverage

### 3.2 E2E Testing

- [ ] Install Playwright
- [ ] Create `playwright.config.mjs`
- [ ] Write tests for critical user flows
- [ ] Write accessibility tests
- [ ] Write visual regression tests
- [ ] Test on Chrome, Firefox, Safari

### 3.3 CI/CD Pipeline

- [ ] Add Lighthouse CI
- [ ] Add test coverage reporting
- [ ] Configure performance budgets
- [ ] Set up automated PR checks

---

## 📝 Change Log

| Date | Phase | Change | By |
|------|-------|--------|-----|
| 2026-02-05 | Setup | Created progress tracker | AI Agent |

---

## 🚨 Blockers

None currently.

---

## 💡 Notes

- Each phase should be completed sequentially within Phase 1
- Phases 2 and 3 can run in parallel after Phase 1
- Always run smoke tests before marking a phase complete
- Update this file after each significant change

---

_This file is automatically updated by AI agents and human developers._
