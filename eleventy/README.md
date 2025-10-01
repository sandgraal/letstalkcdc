# Eleventy Migration Workspace

This folder hosts the in-progress Eleventy rebuild of **Let’s Talk CDC**. Work here until the static output is ready to replace the legacy flat HTML at the repository root.

## Getting started

```bash
cd eleventy
npm install
npm run serve   # http://localhost:8080 by default
```

Assets under `src/assets` are passed straight through to `dist/`. The Eleventy config in `eleventy.config.js` targets `src/` as input and writes compiled pages to `dist/`.

## Current state

- `src/_includes/layouts/base.njk` normalizes the global head, navigation, footer, and shared scripts.
- `src/index.njk` is the first page migrated from `index.html`.
- Existing CSS/JS (`styles.css`, `app.js`) are copied into the Eleventy asset pipeline for parity.

## Immediate next steps

1. **Bring the overview page across** (`overview.html` → `src/overview/index.njk`) to validate collections/navigation structure.
2. **Extract global metadata** (site name, canonical host, OG defaults) into a data file (`src/_data/site.js`) so every page inherits consistent values.
3. **Script search-index generation** by porting the current JSON build logic into Eleventy (collection transform or `eleventyComputed`).
4. **Refactor interactive widgets** from `app.js` into smaller modules before reusing them across pages.
5. **Add build tooling** (PostCSS + CSSO pipeline, pa11y, link checker) to this package and wire a combined `npm run build` that emits minified CSS into `dist/assets/css`.

Track migration parity page-by-page; once all primary routes are using layouts/partials, we can remove the legacy HTML and promote `dist/` to production.
