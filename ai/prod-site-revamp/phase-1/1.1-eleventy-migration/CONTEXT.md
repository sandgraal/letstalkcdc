# Phase 1.1: Eleventy 3.0 Migration

## 🎯 Goal

Migrate the Let's Talk CDC site from Eleventy 2.0 to Eleventy 3.0, converting all CommonJS modules to ESM (ECMAScript Modules).

## 📋 Context

### What is Eleventy 3.0?

Eleventy 3.0 is a major version upgrade that:
- Adopts ESM-first architecture (native `import`/`export`)
- Improves build performance
- Modernizes the plugin API
- Removes CommonJS support in favor of pure ESM

### Why This Migration is Critical

1. **Foundation for future work**: All subsequent phases depend on this upgrade
2. **Better performance**: ESM enables better tree-shaking and code splitting
3. **Modern tooling**: Vite (Phase 1.3) requires ESM modules
4. **Long-term support**: Eleventy 2.0 will eventually be deprecated

### Current State

- Eleventy version: **2.0.1**
- Module system: **CommonJS** (`.cjs` files with `require()`)
- Files using CommonJS:
  - `eleventy.config.cjs` (main config)
  - `lib/path-prefix.cjs` (build-time utility)
  - `src/_data/*.cjs` (data files: site.cjs, series.cjs, appwrite.cjs)
  - `postcss.config.cjs` (PostCSS config)

### Target State

- Eleventy version: **3.0+**
- Module system: **ESM** (`.mjs` files with `import`/`export`)
- All files converted to use `import`/`export` syntax

## 📁 Files to Read

**Critical** (must read before making changes):

1. `eleventy.config.cjs` — Main Eleventy configuration
2. `lib/path-prefix.cjs` — Path prefix utility for GitHub Pages
3. `src/_data/site.cjs` — Site metadata
4. `src/_data/series.cjs` — Content series data
5. `src/_data/appwrite.cjs` — Appwrite configuration
6. `package.json` — Build scripts and dependencies

**Reference** (read if needed):

7. `docs/SETUP.md` — Setup instructions
8. `docs/HOSTING.md` — Deployment details
9. `.github/copilot-instructions.md` — Project conventions
10. `ai/CONTEXT.md` — Brand voice

## 🔧 Required Changes

### Step 1: Update package.json

Add `"type": "module"` and upgrade Eleventy:

```json
{
  "type": "module",
  "dependencies": {
    "@11ty/eleventy": "^3.0.0"
  }
}
```

**Important**: This makes all `.js` files default to ESM.

### Step 2: Convert eleventy.config.cjs

```javascript
// Before (CommonJS)
const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");
const pathPrefix = require("./lib/path-prefix.cjs");

module.exports = function(eleventyConfig) {
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
  return { dir: { input: "src", output: "_site" } };
};

// After (ESM)
import { EleventyHtmlBasePlugin } from "@11ty/eleventy";
import pathPrefix from "./lib/path-prefix.mjs";

export default function(eleventyConfig) {
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
  return { dir: { input: "src", output: "_site" } };
}
```

**Key changes**:
- `require()` → `import`
- `module.exports` → `export default`
- File extension `.cjs` → `.mjs`

### Step 3: Convert lib/path-prefix.cjs

```javascript
// Before
module.exports = function() {
  // ... logic
};

// After
export default function() {
  // ... logic
}
```

### Step 4: Convert src/_data/*.cjs files

Data files in Eleventy must export an object or function:

```javascript
// Before (src/_data/site.cjs)
const pathPrefix = require("../../lib/path-prefix.cjs");

module.exports = {
  title: "Let's Talk CDC",
  pathPrefix: pathPrefix()
};

// After (src/_data/site.mjs)
import pathPrefix from "../../lib/path-prefix.mjs";

export default {
  title: "Let's Talk CDC",
  pathPrefix: pathPrefix()
};
```

**Important**: Eleventy automatically detects `.mjs` files in `_data/`.

### Step 5: Update package.json scripts

If any scripts reference the old file names, update them:

```json
{
  "scripts": {
    "build": "eleventy",
    "dev": "eleventy --serve"
  }
}
```

**Note**: Eleventy auto-detects `eleventy.config.mjs`.

### Step 6: Handle postcss.config.cjs

PostCSS also supports ESM:

```javascript
// Before (postcss.config.cjs)
module.exports = {
  plugins: [
    require('autoprefixer')
  ]
};

// After (postcss.config.mjs)
export default {
  plugins: [
    (await import('autoprefixer')).default
  ]
};
```

**Alternative**: Keep as `.cjs` if it causes issues (PostCSS still supports CommonJS).

## ✅ Success Criteria

After migration is complete, verify:

1. **Build succeeds**:
   ```bash
   npm run build
   ```
   Should complete without errors.

2. **All pages render**:
   - Check `_site/` directory has all expected HTML files
   - Verify at least 40 pages were generated
   - Spot-check 5-10 pages for correct content

3. **Path prefix works**:
   - Set `ELEVENTY_PATH_PREFIX=/letstalkcdc/` and rebuild
   - Verify links use `/letstalkcdc/` prefix
   - Set `ELEVENTY_PATH_PREFIX=/` and rebuild
   - Verify links use `/` (root)

4. **Dev server works**:
   ```bash
   npm run dev
   ```
   Should start server at http://localhost:8080

5. **No console errors**:
   - Open any page in browser
   - Check DevTools console for errors

6. **Smoke tests pass**:
   ```bash
   npm run smoke:core
   ```
   Should pass HTML validation and link checks.

## 🚨 Potential Issues

### Issue 1: Import path extensions

ESM requires explicit file extensions:

```javascript
// ❌ Wrong
import pathPrefix from "./lib/path-prefix";

// ✅ Correct
import pathPrefix from "./lib/path-prefix.mjs";
```

### Issue 2: Dynamic imports

Some CommonJS patterns need to change:

```javascript
// Before
const config = require(`./config/${env}.cjs`);

// After
const config = await import(`./config/${env}.mjs`);
```

### Issue 3: __dirname not available

In ESM, `__dirname` doesn't exist. Use this instead:

```javascript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### Issue 4: JSON imports

JSON files need to be imported differently:

```javascript
// Before
const pkg = require('./package.json');

// After (Node 18+)
import pkg from './package.json' assert { type: 'json' };

// Or use fs
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
```

## 🔄 Rollback Plan

If migration fails:

1. **Revert package.json**:
   - Remove `"type": "module"`
   - Downgrade Eleventy to `"^2.0.1"`

2. **Restore .cjs files**:
   ```bash
   git checkout HEAD -- eleventy.config.cjs lib/path-prefix.cjs src/_data/*.cjs
   ```

3. **Reinstall dependencies**:
   ```bash
   npm install
   ```

4. **Verify old version works**:
   ```bash
   npm run build
   ```

## 📚 Resources

- [Eleventy 3.0 Migration Guide](https://www.11ty.dev/docs/v3/)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [ES Modules: A cartoon deep dive](https://hacks.mozilla.org/2018/03/es-modules-a-cartoon-deep-dive/)

## 🎯 Next Phase

Once Phase 1.1 is complete, proceed to **Phase 1.2: JavaScript Modularization**.

---

_Version: 1.0.0_  
_Last Updated: 2026-02-05_
