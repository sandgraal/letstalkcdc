# Agent Prompt: Phase 1.1 - Eleventy 3.0 Migration

## Role

You are a senior JavaScript developer specializing in static site generators and module system migrations. You have deep expertise in Eleventy and Node.js ESM (ECMAScript Modules).

## Task

Migrate the Let's Talk CDC website from Eleventy 2.0 (CommonJS) to Eleventy 3.0 (ESM) without changing any functionality.

## Context

### Project Background

- **Site**: Let's Talk CDC — educational platform for Change Data Capture (CDC)
- **Tech Stack**: Eleventy 2.0.1, Node.js ≥20, Nunjucks templates
- **Current Module System**: CommonJS (`.cjs` files, `require()`, `module.exports`)
- **Target Module System**: ESM (`.mjs` files, `import`, `export default`)
- **Deployment**: GitHub Pages (root or subdirectory)

### Why This Migration Matters

1. **Blocking**: All future phases depend on this upgrade
2. **Performance**: ESM enables better tree-shaking and code splitting (Phase 1.3)
3. **Tooling**: Vite bundling (Phase 1.3) requires ESM
4. **Support**: Eleventy 2.0 will be deprecated

### Critical Requirements

1. **Zero Functionality Changes**: Site must work identically after migration
2. **Path Prefix Preservation**: GitHub Pages path system must continue working
3. **All Pages Render**: 40+ pages must generate correctly
4. **No Console Errors**: All client-side JavaScript must work
5. **CI Compatibility**: GitHub Actions must continue working

## Files to Convert

You must convert these files from CommonJS to ESM:

### 1. eleventy.config.cjs → eleventy.config.mjs

**Current**: Uses `require()` for plugins and `module.exports` for config  
**Target**: Use `import` for plugins and `export default` for config

**Key considerations**:
- Convert all plugin imports
- Convert path-prefix import (add `.mjs` extension)
- Ensure passthrough copies still work
- Preserve all filters, shortcodes, and plugins

### 2. lib/path-prefix.cjs → lib/path-prefix.mjs

**Current**: Exports a function via `module.exports`  
**Target**: Use `export default`

**Key considerations**:
- This is a critical utility for GitHub Pages
- Must handle both root (`/`) and subdirectory (`/letstalkcdc/`) deployment
- Auto-detection from environment variables must work

### 3. src/_data/site.cjs → src/_data/site.mjs

**Current**: Imports path-prefix and exports site metadata  
**Target**: Use `import` for path-prefix (with `.mjs` extension) and `export default`

**Key considerations**:
- Data must remain accessible as `{{ site.title }}` in templates

### 4. src/_data/series.cjs → src/_data/series.mjs

**Current**: Exports an array of content series  
**Target**: Use `export default`

**Key considerations**:
- Array structure must remain identical
- Data must remain accessible as `{{ series }}` in templates

### 5. src/_data/appwrite.cjs → src/_data/appwrite.mjs

**Current**: Exports Appwrite configuration  
**Target**: Use `export default`

**Key considerations**:
- Optional feature — may not be configured
- Environment variables must still be read correctly

### 6. package.json

**Required changes**:
```json
{
  "type": "module",
  "dependencies": {
    "@11ty/eleventy": "^3.0.0"
  }
}
```

### 7. postcss.config.cjs → postcss.config.mjs (Optional)

**Note**: Can remain as `.cjs` if conversion causes issues. PostCSS still supports CommonJS.

## ESM Conversion Patterns

### Pattern 1: Basic Require → Import

```javascript
// Before (CommonJS)
const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");

// After (ESM)
import { EleventyHtmlBasePlugin } from "@11ty/eleventy";
```

### Pattern 2: Local Module Import (Add .mjs Extension!)

```javascript
// Before
const pathPrefix = require("./lib/path-prefix.cjs");

// After (MUST include extension)
import pathPrefix from "./lib/path-prefix.mjs";
```

### Pattern 3: Module Export

```javascript
// Before
module.exports = function() { ... };

// After
export default function() { ... }
```

### Pattern 4: Object Export

```javascript
// Before
module.exports = { title: "My Site" };

// After
export default { title: "My Site" };
```

### Pattern 5: __dirname Replacement (If Needed)

```javascript
// Before
const path = require('path');
const __dirname = __dirname;

// After
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## Step-by-Step Execution Plan

### Phase 1: Preparation (30 minutes)

1. **Read all files** listed in `FILES.md`
2. **Map dependencies**: Note which file imports which
3. **Check for gotchas**: Look for `__dirname`, dynamic requires, JSON imports
4. **Create git tag**: `git tag pre-phase1.1-migration && git push --tags`

### Phase 2: package.json Update (15 minutes)

1. Add `"type": "module"` to package.json
2. Update `"@11ty/eleventy"` to `"^3.0.0"`
3. Run `npm install`
4. **Verify**: `npm list @11ty/eleventy` shows version 3.x

### Phase 3: Convert Core Files (2 hours)

1. **Start with lib/path-prefix.cjs** (no dependencies)
   - Convert to ESM
   - Rename to `.mjs`
   
2. **Then eleventy.config.cjs** (depends on path-prefix)
   - Convert all imports
   - Update path-prefix import path
   - Rename to `.mjs`
   
3. **Test immediately**:
   ```bash
   npm run build
   ```
   If errors, fix before continuing.

### Phase 4: Convert Data Files (1 hour)

1. **site.mjs** (depends on path-prefix)
2. **series.mjs** (no dependencies)
3. **appwrite.mjs** (no dependencies)

4. **Test after each**:
   ```bash
   npm run build
   ```

### Phase 5: PostCSS (30 minutes)

1. Attempt to convert `postcss.config.cjs` to `.mjs`
2. If issues arise, revert to `.cjs` (it's fine to keep it)
3. Test build

### Phase 6: Validation (2 hours)

1. **Full build test**:
   ```bash
   npm run build
   ```
   
2. **Count pages**:
   ```bash
   find _site -name "*.html" | wc -l
   ```
   Should be 40+
   
3. **Test path prefix**:
   ```bash
   ELEVENTY_PATH_PREFIX=/ npm run build
   grep 'href="/' _site/index.html
   
   ELEVENTY_PATH_PREFIX=/letstalkcdc/ npm run build
   grep 'href="/letstalkcdc/' _site/index.html
   ```
   
4. **Run smoke tests**:
   ```bash
   npm run smoke:core
   ```
   
5. **Test dev server**:
   ```bash
   npm run dev
   ```
   Open http://localhost:8080 and verify homepage loads
   
6. **Manual browser test**:
   - Check 5 different pages
   - Verify theme toggle works
   - Verify search works
   - Check DevTools console for errors

### Phase 7: Documentation (30 minutes)

1. Update `progress/PROGRESS.md`:
   - Mark Phase 1.1 as complete
   - Note any issues encountered
   
2. Create completion tag:
   ```bash
   git tag phase-1.1-complete
   git push --tags
   ```

## Success Criteria Checklist

Before marking this phase complete, verify ALL of these:

- [ ] All `.cjs` files converted to `.mjs` (except optionally postcss)
- [ ] `package.json` has `"type": "module"`
- [ ] Eleventy version is `^3.0.0`
- [ ] `npm install` succeeds with no errors
- [ ] `npm run build` succeeds with 0 errors
- [ ] 40+ HTML pages generated in `_site/`
- [ ] `npm run dev` starts successfully
- [ ] Path prefix works for both `/` and `/letstalkcdc/`
- [ ] `npm run smoke:core` passes
- [ ] Homepage loads in browser without console errors
- [ ] Theme toggle works
- [ ] Search works
- [ ] Navigation works
- [ ] At least 5 content pages checked manually
- [ ] GitHub Actions CI passes (if applicable)
- [ ] Progress tracker updated
- [ ] Git tag `phase-1.1-complete` created

## Common Pitfalls

### ⚠️ Pitfall 1: Missing File Extensions

```javascript
// ❌ WRONG — will fail in ESM
import pathPrefix from "./lib/path-prefix";

// ✅ CORRECT — must include extension
import pathPrefix from "./lib/path-prefix.mjs";
```

### ⚠️ Pitfall 2: Forgetting to Update package.json

ESM won't work without `"type": "module"` in package.json.

### ⚠️ Pitfall 3: Mixing CommonJS and ESM

Don't mix `require()` and `import` in the same file.

### ⚠️ Pitfall 4: Breaking Path Prefix

The path-prefix system is critical for GitHub Pages. Test thoroughly!

### ⚠️ Pitfall 5: JSON Imports

If you see `require('./file.json')`, convert to:
```javascript
import data from './file.json' assert { type: 'json' };
```

## Rollback Plan

If migration fails and cannot be fixed within 2 hours:

1. **Revert package.json**:
   ```bash
   git checkout HEAD -- package.json
   ```
   
2. **Restore all .cjs files**:
   ```bash
   git checkout HEAD -- eleventy.config.cjs lib/path-prefix.cjs src/_data/*.cjs
   ```
   
3. **Reinstall**:
   ```bash
   npm install
   ```
   
4. **Verify**:
   ```bash
   npm run build
   ```
   
5. **Document**: Update progress tracker with BLOCKED status and issues encountered

## Communication

If you encounter issues:

1. **Update progress tracker** immediately with BLOCKED status
2. **Document the issue** clearly: what failed, error messages, what you tried
3. **Tag for human review** in the progress file
4. **Do not proceed** to Phase 1.2 if this phase is not complete

## Resources

- [Eleventy 3.0 Docs](https://www.11ty.dev/docs/v3/)
- [Node.js ESM Guide](https://nodejs.org/api/esm.html)
- [Path Prefix Documentation](../../docs/HOSTING.md)
- [Copilot Instructions](../../.github/copilot-instructions.md)

---

**Ready to start? Begin with Phase 1: Preparation. Read all files first, then proceed systematically through each phase.**
