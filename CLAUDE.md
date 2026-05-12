# CLAUDE.md

Project context for AI agents working in this repo. Read this before touching
anything; it is shorter than the docs and more current than memory.

## What this repo is

**Let's Talk CDC** — an educational static site about Change Data Capture.
Built with **Eleventy 3.1.x** + **Vite 7** + **PostCSS**, deployed to GitHub
Pages at `https://sandgraal.github.io/letstalkcdc/`.

Static-first: every page is pre-rendered HTML. JavaScript is progressive
enhancement only. There is **no backend** in production — the optional
Appwrite integration only stores assistant-feedback events.

## Commands

```bash
npm ci                 # install (use this, not `npm install`, in fresh checkouts)
npm run dev            # eleventy --serve on http://localhost:8080
npm run build          # full production build → _site/
npm test               # vitest (unit, 238 tests)
npm run lint           # eslint
npm run format         # prettier --write
npm run format:check   # prettier --check (CI uses this)
npm run smoke          # smoke:core + smoke:a11y + smoke:perf (slow)
npm run smoke:core     # HTML/links smoke; fastest of the three
npm run clean          # rimraf dist _site styles.min.css
```

`npm run build` runs four stages in order:

1. `build:css` — `postcss src/assets/css/main.css -o src/assets/css/styles.min.css`
2. `build:js` — `vite build` → `dist/`
3. `build:11ty` — `eleventy --config=eleventy.config.mjs` → `_site/`
4. final `postcss _site/assets/css/styles.css -o _site/assets/css/styles.css`
   (cssnano minify; only runs when `NODE_ENV=production`)

## Architecture

### Content tree

```
src/
├── _data/            # Global data exposed to all templates (ESM .mjs and CJS .cjs)
├── _includes/
│   ├── layouts/      # base.njk is the root layout
│   └── components/   # njk macros / partials
├── assets/
│   ├── css/          # see "CSS pipeline" below
│   └── js/           # ESM modules; Vite bundles them
├── pages/<topic>/    # per-topic content (e.g. snapshotting/, partitioning/)
└── static/           # passthrough-copied verbatim to /
```

### CSS pipeline (read this before touching CSS)

The **production stylesheet** at `/assets/css/styles.css` is built from
`src/assets/css/main.css` only. The pipeline:

```
src/assets/css/main.css
  → [postcss + cssnano in prod]
  → src/assets/css/styles.min.css
  → [eleventy passthroughCopy]
  → _site/assets/css/styles.css        (this is what ships)
```

Top-level files under `src/assets/css/` after the Month-0 purge:

```
00-reset.css            05-utilities.css        08-video-embed.css
01-variables.css        06-search.css           09-mobile-responsive.css
02-base.css             07-version-status.css   auth.css       (loaded separately)
03-layout.css                                   dashboard-page.css
04-components.css ──> imports components/*.css  main.css       (entry, not a passthrough)
```

Page-specific CSS lives in `src/assets/css/pages/` and is loaded only on its
own page via a `<link>` in that page's template.

**Byte-identity check.** When refactoring CSS, prove production output didn't
change:

```bash
NODE_ENV=production npm run build:css
sha256sum src/assets/css/styles.min.css
# baseline at HEAD of main is: 4843ff26f485a7133ae27f65b6c00c93bd82a90ffc72dc56c73ddccd5df1decf
```

If the hash matches, your change is a pure source refactor and visually safe.
If it differs, run `npm run build` and diff `_site/assets/css/styles.css`
before claiming the change is byte-equivalent.

There is also a `/css-byte-check` slash command that codifies this.

### Path prefix (GitHub Pages)

The site lives at `/letstalkcdc/` in production. `lib/path-prefix.mjs` derives
the prefix from `ELEVENTY_PATH_PREFIX` (explicit) or `GITHUB_REPOSITORY`
(implicit). **Never hardcode `/` in templates** — use the `| url` Nunjucks
filter. Example:

```njk
<link rel="stylesheet" href="{{ '/assets/css/styles.css' | url }}">
```

When testing canonical URLs / OG tags / lychee link-check locally, set both
`ELEVENTY_PATH_PREFIX=/letstalkcdc` and `SITE_HOST=https://sandgraal.github.io`.

### Vite + Eleventy interop

Vite bundles `src/assets/js/` into `dist/assets/`. Eleventy reads
`dist/.vite/manifest.json` to resolve hashed filenames in templates via the
`viteAsset` filter:

```njk
<script type="module" src="{{ 'src/assets/js/app.js' | viteAsset | url }}"></script>
```

In dev (`npm run dev`) there is no Vite manifest; the filter falls back to the
unhashed source path.

## Conventions

### Commit messages

Conventional Commits, lowercase scope, imperative mood:

```
fix(ci): pin SITE_HOST in linkcheck.yml
chore(css): purge orphan stylesheets; main.css is the sole entry
docs: update changelog
feat(search): add fuzzy-match for module titles
```

Wrap the body at ~72 cols. End every Claude-authored commit with a blank line
and:

```
https://claude.ai/code/session_<id>
```

Prefer creating **new commits** over `--amend`. Never `--no-verify` or
`--no-gpg-sign` unless the user explicitly asks.

### Branch naming

Feature branches for Claude sessions land on `claude/<short-name>-<id>`. The
session ID is whatever the harness supplies; do not invent one. Open PRs into
`main`.

### File naming

- Kebab-case for content directories and `.njk` files.
- ESM (`.mjs`) for new Node scripts and Eleventy config; CommonJS (`.cjs`) is
  only kept where Eleventy data files still need it.
- `.11tydata.cjs` per-section data files live next to their content.

### Front-matter required on content pages

```yaml
---
title: "..." # used in <title> and nav
description: "..." # ≤160 chars, SEO
datePublished: 2026-02-06 # YYYY-MM-DD, set on first ship
dateModified: 2026-05-12 # YYYY-MM-DD, bump on substantive edits
---
```

### Code style

Prettier + ESLint are wired up; run `npm run format` before committing. CI
runs `npm run format:check` and will fail on diffs. No `console.log` in
production code (eslint `no-console` warns, allows `warn|error|debug|log`
under explicit opt-in).

## Anti-patterns (real, learned the hard way)

- ❌ Hardcoding `/...` in templates instead of using `| url`. Breaks the
  GitHub Pages prefix.
- ❌ Editing `_site/` — it's a build artifact, rebuilt from scratch each run.
- ❌ Editing `src/assets/css/styles.min.css` or
  `_site/assets/css/styles.css` — both are generated. Edit `main.css` or
  one of its imports.
- ❌ Adding a new top-level `XX-*.css` file. Either fold into an existing
  layer, add it as `components/<name>.css` imported from
  `04-components.css`, or put it under `pages/` and link from the page
  template.
- ❌ Adding a CSS `<link>` in a template that points at a file Eleventy
  doesn't pass through. Production will 404. Either add a passthrough in
  `eleventy.config.mjs` or use the existing pipeline.
- ❌ Bumping the Eleventy version line in copilot-instructions.md / docs
  without updating the version-specific examples (e.g. config file is
  `.mjs`, not `.cjs`; passthrough takes an object literal).
- ❌ Force-push to `main` (it's branch-protected in CI; will fail anyway).
- ❌ `npm install` in CI — use `npm ci` to honor the lockfile.
- ❌ Skipping `npm run format` / `eslint` before pushing; CI will reject.

## Where to read more

- `docs/CONTRIBUTING.md` — human-contributor workflow
- `docs/SETUP.md` — full setup incl. Appwrite, tracing, env vars
- `docs/HOSTING.md` — deploy pipeline + CI runbook
- `docs/adding-modules.md` — how to add a new content section
- `docs/javascript-architecture.md` — JS module layout + Vite split
- `docs/TRACING.md` — OpenTelemetry tracing (deep)
- `docs/PRD-SITE-REVAMP.md` — historical PRD for the 2.0 revamp
- `docs/archive/` — historical records; read for context, do not act on as
  current spec
- `CHANGELOG.md` — `[Unreleased]` block is the running scratchpad for the
  current dev cycle

## When in doubt

1. Search the codebase before asking — patterns usually exist already.
2. Run the relevant smoke test before pushing
   (`npm run smoke:core` is fast).
3. For CSS or visual changes: verify the byte-identity hash above, or build
   the site and screenshot the affected pages.
4. Ask the user, don't guess, on anything that affects shared state
   (force-push, dropping a dependency, changing CI behavior).
