# Phase 1.1: Requirements

## 🎯 Primary Objective

Migrate Let's Talk CDC from Eleventy 2.0 (CommonJS) to Eleventy 3.0 (ESM) without changing any functionality.

## 📋 Functional Requirements

### FR-1.1.1: ESM Module Conversion

**Description**: All CommonJS modules must be converted to ECMAScript Modules.

**Acceptance Criteria**:

- ✅ All `.cjs` files are renamed to `.mjs`
- ✅ All `require()` calls are converted to `import` statements
- ✅ All `module.exports` are converted to `export default` or `export`
- ✅ Import paths include explicit `.mjs` extensions

### FR-1.1.2: Eleventy 3.0 Compatibility

**Description**: The site must build successfully with Eleventy 3.0.

**Acceptance Criteria**:

- ✅ `npm install` completes without peer dependency errors
- ✅ `npm run build` completes without errors
- ✅ `npm run dev` starts development server successfully
- ✅ No deprecation warnings in build output

### FR-1.1.3: Path Prefix Preservation

**Description**: GitHub Pages path prefix functionality must continue to work.

**Acceptance Criteria**:

- ✅ Path prefix auto-detects from `GITHUB_REPOSITORY` environment variable
- ✅ Manual override via `ELEVENTY_PATH_PREFIX` works
- ✅ Root deployment (`/`) works correctly
- ✅ Subdirectory deployment (`/letstalkcdc/`) works correctly
- ✅ All internal links use the `{{ '/' | url }}` filter

### FR-1.1.4: Data Files Integrity

**Description**: All data files must export data correctly in ESM format.

**Acceptance Criteria**:

- ✅ `site.mjs` exports site metadata
- ✅ `series.mjs` exports content series array
- ✅ `appwrite.mjs` exports Appwrite configuration
- ✅ All data is accessible in Nunjucks templates as before

### FR-1.1.5: Build Output Consistency

**Description**: The generated site must be identical to the pre-migration version.

**Acceptance Criteria**:

- ✅ All 40+ HTML pages are generated
- ✅ All assets are copied correctly (CSS, JS, images)
- ✅ HTML structure is unchanged
- ✅ Meta tags, titles, descriptions are preserved
- ✅ Search index JSON is generated correctly

## 🔒 Non-Functional Requirements

### NFR-1.1.1: Performance

**Description**: Build performance should not regress.

**Acceptance Criteria**:

- ✅ Build time ≤ 5 seconds (currently ~3-5 seconds)
- ✅ Dev server startup ≤ 3 seconds

### NFR-1.1.2: Backward Compatibility

**Description**: Deployment process should remain unchanged.

**Acceptance Criteria**:

- ✅ GitHub Actions workflows still work
- ✅ `npm run build` still produces `_site/` directory
- ✅ No changes required to hosting configuration

### NFR-1.1.3: Developer Experience

**Description**: Development workflow should be unchanged or improved.

**Acceptance Criteria**:

- ✅ Hot reload still works in dev mode
- ✅ Error messages are clear and helpful
- ✅ No new manual steps added to build process

### NFR-1.1.4: Code Quality

**Description**: Converted code should follow ESM best practices.

**Acceptance Criteria**:

- ✅ Consistent use of `import`/`export` syntax
- ✅ No mixing of CommonJS and ESM patterns
- ✅ Explicit file extensions on all local imports
- ✅ No unnecessary dynamic imports

## 🚫 Out of Scope

The following are explicitly **NOT** part of this phase:

- ❌ JavaScript modularization (Phase 1.2)
- ❌ Build pipeline changes (Phase 1.3)
- ❌ New features (Phase 2)
- ❌ Testing infrastructure (Phase 3)
- ❌ CSS changes
- ❌ Template changes
- ❌ Content changes
- ❌ Design changes

## 📊 Success Metrics

### Metric 1: Zero Build Errors

```bash
npm run build
# Exit code: 0
# No errors in output
```

### Metric 2: Identical Output

```bash
# Before migration
npm run build
find _site -name "*.html" | wc -l
# Expected: 40-50 pages

# After migration
npm run build
find _site -name "*.html" | wc -l
# Expected: Same count as before
```

### Metric 3: Path Prefix Functionality

```bash
# Test root deployment
ELEVENTY_PATH_PREFIX=/ npm run build
grep -o 'href="/' _site/index.html | wc -l
# Should find root links

# Test subdirectory deployment
ELEVENTY_PATH_PREFIX=/letstalkcdc/ npm run build
grep -o 'href="/letstalkcdc/' _site/index.html | wc -l
# Should find prefixed links
```

### Metric 4: Smoke Tests Pass

```bash
npm run smoke:core
# All checks pass
```

### Metric 5: No Console Errors

```bash
npm run dev
# Open http://localhost:8080
# Open browser DevTools
# Navigate to 5 different pages
# Console shows 0 errors
```

## 🧪 Testing Requirements

### Manual Testing Checklist

- [ ] Homepage loads without errors
- [ ] Navigation menu works
- [ ] Search functionality works
- [ ] Theme toggle (dark/light) works
- [ ] At least 5 content pages render correctly
- [ ] All CSS is applied correctly
- [ ] All JavaScript features work
- [ ] Mobile view works (responsive design)

### Automated Testing

- [ ] Run `npm run build` → Exit code 0
- [ ] Run `npm run smoke:core` → All pass
- [ ] Run `npm run dev` → Server starts

### Cross-Environment Testing

- [ ] Local development (macOS/Linux/Windows)
- [ ] GitHub Actions CI pipeline
- [ ] GitHub Pages deployment

## 📝 Documentation Requirements

### Code Documentation

- [ ] Add comments to any complex ESM conversions
- [ ] Update inline comments if module system is mentioned

### Project Documentation

- [ ] Update this phase's progress tracker
- [ ] Document any gotchas encountered
- [ ] Note any deviations from plan

## 🔄 Rollback Criteria

Rollback if any of these occur:

1. **Build fails** and cannot be fixed within 2 hours
2. **Pages missing** from `_site/` directory
3. **Path prefix broken** and cannot be fixed quickly
4. **Data not accessible** in templates
5. **Critical functionality broken** (search, navigation, theme)

## 🎯 Definition of Done

Phase 1.1 is complete when ALL of these are true:

- ✅ All `.cjs` files converted to `.mjs`
- ✅ `package.json` has `"type": "module"`
- ✅ Eleventy upgraded to version `^3.0.0`
- ✅ `npm install` succeeds
- ✅ `npm run build` succeeds with 0 errors
- ✅ All 40+ pages generated in `_site/`
- ✅ `npm run dev` works
- ✅ Path prefix works for both `/` and `/letstalkcdc/`
- ✅ `npm run smoke:core` passes
- ✅ Manual testing checklist complete
- ✅ No console errors on any page
- ✅ GitHub Actions CI passes
- ✅ Progress tracker updated
- ✅ Git tag `phase-1.1-complete` created

## 📅 Timeline

**Estimated Duration**: 5 days

**Breakdown**:

- Day 1: Read documentation, understand current setup
- Day 2: Convert config files and test build
- Day 3: Convert data files and verify output
- Day 4: Test path prefix, run smoke tests
- Day 5: Manual testing, documentation, rollback prep

**Daily Checkpoints**:

- End of each day: Commit work in progress
- If stuck for >2 hours: Ask for help
- If blocked: Update progress tracker with BLOCKED status

---

_These requirements define the scope and success criteria for Phase 1.1._
