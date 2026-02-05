# Phase 1.1: Files to Read and Modify

## 📖 Files to Read (Required)

Read these files completely before starting the migration:

### Critical Files

1. **eleventy.config.cjs** (line count: ~200-300 lines)
   - Main Eleventy configuration
   - Defines plugins, filters, shortcodes, passthrough copies
   - Location: `/eleventy.config.cjs`

2. **lib/path-prefix.cjs** (line count: ~50-100 lines)
   - Utility for GitHub Pages path prefix handling
   - Auto-detects prefix from environment variables
   - Location: `/lib/path-prefix.cjs`

3. **src/_data/site.cjs** (line count: ~20-50 lines)
   - Global site metadata
   - Exports site title, tagline, host, pathPrefix
   - Location: `/src/_data/site.cjs`

4. **src/_data/series.cjs** (line count: ~100-200 lines)
   - Content series/modules definitions
   - Array of objects with keys, titles, descriptions
   - Location: `/src/_data/series.cjs`

5. **src/_data/appwrite.cjs** (line count: ~10-30 lines)
   - Appwrite configuration (optional)
   - Reads environment variables
   - Location: `/src/_data/appwrite.cjs`

6. **package.json**
   - Build scripts and dependencies
   - Need to check references to config files
   - Location: `/package.json`

### Reference Files (Read if Needed)

7. **postcss.config.cjs**
   - May need to convert to ESM
   - Location: `/postcss.config.cjs`

8. **docs/SETUP.md**
   - Build instructions
   - Location: `/docs/SETUP.md`

9. **.github/copilot-instructions.md**
   - Project conventions
   - Location: `/.github/copilot-instructions.md`

## ✏️ Files to Modify

### Primary Conversions

1. **eleventy.config.cjs → eleventy.config.mjs**
   - Convert `require()` to `import`
   - Convert `module.exports` to `export default`
   - Update all import paths to include `.mjs` extension

2. **lib/path-prefix.cjs → lib/path-prefix.mjs**
   - Convert to ESM
   - Update export statement

3. **src/_data/site.cjs → src/_data/site.mjs**
   - Convert to ESM
   - Update import statement for path-prefix

4. **src/_data/series.cjs → src/_data/series.mjs**
   - Convert to ESM
   - Update any imports if present

5. **src/_data/appwrite.cjs → src/_data/appwrite.mjs**
   - Convert to ESM
   - Simple export conversion

### Secondary Updates

6. **package.json**
   - Add `"type": "module"`
   - Update Eleventy version to `^3.0.0`
   - Review scripts for any references to `.cjs` files

7. **postcss.config.cjs → postcss.config.mjs** (optional)
   - Convert if needed
   - Can remain as `.cjs` if PostCSS has issues

## 🔍 Files to Check (Validation)

After conversion, check these files to ensure they still work:

1. **_site/** directory (generated)
   - Should contain all HTML files
   - At least 40+ pages should be present

2. **_site/index.html**
   - Spot-check the homepage

3. **_site/quickstarts/** (any quickstart page)
   - Verify content renders correctly

4. **_site/assets/css/styles.min.css**
   - Should still be generated

5. **_site/assets/js/app.js**
   - Should still be copied

## 📋 File Conversion Checklist

Use this checklist while converting:

### For Each .cjs File:

- [ ] Read entire file to understand dependencies
- [ ] Identify all `require()` statements
- [ ] Identify all `module.exports` statements
- [ ] Convert `require()` to `import`
- [ ] Add `.mjs` extensions to local imports
- [ ] Convert `module.exports` to `export default`
- [ ] Handle `__dirname` if used (replace with ESM equivalent)
- [ ] Rename file from `.cjs` to `.mjs`
- [ ] Update any references to old filename

### For package.json:

- [ ] Add `"type": "module"` at top level
- [ ] Update `"@11ty/eleventy"` to `"^3.0.0"`
- [ ] Check scripts for `.cjs` references
- [ ] Run `npm install` to update lock file

## 🔎 Search Commands

To find all files that might need updates:

```bash
# Find all .cjs files
find . -name "*.cjs" -not -path "*/node_modules/*"

# Find references to eleventy.config.cjs
grep -r "eleventy.config.cjs" . --exclude-dir=node_modules

# Find all require() statements
grep -r "require(" src/ lib/ --include="*.cjs"
```

## 🎯 Expected File Counts

Before migration:
```
.cjs files: 5 (eleventy.config, path-prefix, site, series, appwrite, postcss)
.mjs files: 0
```

After migration:
```
.cjs files: 0-1 (postcss might remain)
.mjs files: 5-6 (all converted)
```

## 📦 Dependencies

No new npm packages are required for this phase. Only upgrade existing:

```json
{
  "dependencies": {
    "@11ty/eleventy": "^3.0.0"  // upgraded from 2.0.1
  }
}
```

## 🚫 Files NOT to Modify

Do NOT change these files in this phase:

- `src/assets/js/app.js` (JavaScript modularization is Phase 1.2)
- Any `.njk` template files (no changes needed)
- Any `.md` content files (no changes needed)
- CSS files (no changes needed)
- GitHub Actions workflows (may update later)
- Test files (no tests exist yet)

## 🗂️ Directory Structure

Before:
```
/
├── eleventy.config.cjs
├── lib/
│   └── path-prefix.cjs
├── src/_data/
│   ├── site.cjs
│   ├── series.cjs
│   └── appwrite.cjs
└── postcss.config.cjs
```

After:
```
/
├── eleventy.config.mjs
├── lib/
│   └── path-prefix.mjs
├── src/_data/
│   ├── site.mjs
│   ├── series.mjs
│   └── appwrite.mjs
└── postcss.config.mjs (or .cjs)
```

---

_This file lists every file you need to interact with for Phase 1.1._
