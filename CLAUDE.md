# CLAUDE.md

Project context for AI agents (`AGENTS.md` is a symlink to this file). Read it
before touching anything. Path-scoped rules live in `.claude/rules/`, task
checklists in `.claude/skills/`.

## What this repo is

**Let's Talk CDC** — an educational static site about Change Data Capture.
Built with **Eleventy 3.1.x** + **Vite 8** + **PostCSS**, deployed to GitHub
Pages at `https://sandgraal.github.io/letstalkcdc/`. Every page is
pre-rendered HTML; JavaScript is progressive enhancement. There is **no
backend**: the only server-side service is an optional Supabase table that
receives assistant thumbs-up/down feedback (browser to PostgREST with `fetch`,
publishable key only). The Change Feed Playground under `playground/` is a
separate app with its own `package.json`, copied into the site at deploy.

## Orientation: read in this order

1. [`docs/AUTOPSY-BRIEF.md`](docs/AUTOPSY-BRIEF.md) — large; read sections 4, 6,
   9 and 10 first (measurements, risks, open work).
2. [`docs/STATE-OF-PROJECT.md`](docs/STATE-OF-PROJECT.md) — dated snapshot; its
   counts are historical, recompute any number with the commands it lists.
3. [`docs/CONDUCTOR.md`](docs/CONDUCTOR.md) — roles, routing, model, merge and push policy.
4. Day-1 checklist: [`docs/TEAM-CHARTER.md`](docs/TEAM-CHARTER.md).

Then `docs/IMPLEMENTATION-PLAN.md`, the authoritative checklist: find your
item, do the work, flip `- [ ]` to `- [x]` in the same commit. The team's queue
is Phase 17, then older agent-executable boxes; Phase 14 is the maintainer's: do not start those. New
work that fits no phase: add it to the lowest phase it belongs to or append a
new Phase heading.

## Commands

```bash
npm ci                    # install (not `npm install`); the SessionStart hook runs it only if node_modules is missing, the one sanctioned install
npm run dev               # eleventy --serve on http://localhost:8080
npm run build             # production build to _site/
npm test                  # vitest unit suite
npm run lint              # eslint
npm run format            # prettier --write
npm run format:check      # prettier --check (what CI runs)
npm run clean             # rimraf dist _site styles.min.css
npm run smoke:core        # HTML/links smoke; run after routing/template changes
npm run smoke             # smoke:core + smoke:a11y + smoke:perf (slow)
npm run check:css-baseline  # compare built CSS with the recorded hash
npm run verify-all        # format:check + lint + test + build: minimum bar
```

`npm run build` = `build:css` (postcss, `main.css` to `styles.min.css`), then
`build:js` (`vite build` to `dist/`), then `build:11ty` (to `_site/`), then a
final cssnano pass over `_site/assets/css/styles.css`. The script sets
`NODE_ENV=production`; set it yourself when running `build:css` alone.

## Architecture essentials

```
src/
├── <topic>/          # one directory per page: index.njk + index.11tydata.cjs
├── _data/            # global data (series.mjs, errata.mjs, toolVersions.mjs, ...)
├── _includes/        # layouts/base.njk (root layout) and components/
├── assets/css, js    # CSS (see below) and ESM modules bundled by Vite
├── js/, css/, data/  # CDC assistant: matcher, feedback client, assistant.yml
└── static/           # passthrough-copied verbatim to /
```

- New pages are registered in `src/_data/series.mjs`; see `docs/adding-modules.md`.
- `lib/path-prefix.mjs` derives the Pages prefix from `ELEVENTY_PATH_PREFIX`
  or `GITHUB_REPOSITORY`. For canonical/OG/link-check work locally set
  `ELEVENTY_PATH_PREFIX=/letstalkcdc` and `SITE_HOST=https://sandgraal.github.io`.
- **Never hardcode `/` in templates**; use the `| url` filter:
  `href="{{ '/assets/css/styles.css' | url }}"`.
- Vite writes hashed bundles to `dist/` and `dist/.vite/manifest.json`; the
  `viteAsset` filter resolves them: `{{ 'src/assets/js/app.js' | viteAsset | url }}`.
  In dev there is no manifest and the filter falls back to the source path
  (404s for hashed JS in dev are not a bug; run `npm run build:js` once).

### CSS pipeline (read before touching CSS)

The shipped stylesheet is built from `src/assets/css/main.css` only:
`main.css` to `styles.min.css` to passthrough to `_site/assets/css/styles.css`.
`main.css` imports the numbered layers `00`..`09`, `dashboard-page.css`, and
`04-components.css`, which imports `components/*.css`. Page-specific CSS lives
in `src/assets/css/pages/` and is linked from its own page template.

**Byte-identity.** Prove a refactor changed nothing shipped: run
`/css-byte-check` (`NODE_ENV=production npm run build:css`, then
`npm run check:css-baseline`). The baseline is one line in
`.claude/css-baseline.sha256`; its history is `docs/css-baseline-history.md`.
Delegate CSS changes to the `css-refactor` role; details in `.claude/rules/css.md`.

## Conventions

- **Commits:** Conventional Commits, lowercase scope, imperative, body wrapped
  near 72 columns, e.g. `fix(ci): pin SITE_HOST in linkcheck.yml`. Prefer new
  commits over `--amend`; never `--no-verify` or `--no-gpg-sign`. End
  Claude-authored commits with the harness's `Co-Authored-By` trailer; add a
  `https://claude.ai/code/session_<id>` footer only with a real session id.
- **Branches:** `claude/<short-name>-<id>`; PRs go into `main`. Who may push,
  merge and open PRs is in `docs/CONDUCTOR.md`, not here.
- **Files:** kebab-case directories and `.njk` files; ESM `.mjs` for new Node
  scripts; `.cjs` only for Eleventy data files (`index.11tydata.cjs`).
- **Front matter** on content pages: `title`, `description` (160 characters
  max), and `datePublished` / `dateModified` as `YYYY-MM-DD`. In this repo the
  dates sit in `index.11tydata.cjs`; see `.claude/rules/content.md`.
- **Style:** run `npm run format` before committing; no `console.log` in
  shipped code (eslint `no-console`).

## Anti-patterns (learned the hard way)

- Hardcoding `/...` in templates instead of `| url` (breaks the Pages prefix).
- Editing `_site/`, `dist/`, `src/assets/css/styles.min.css` or
  `_site/assets/css/styles.css`: all generated. Edit `main.css` or an import.
- Adding a new top-level `XX-*.css`. Fold into a layer, add
  `components/<name>.css` imported from `04-components.css`, or use `src/assets/css/pages/`.
- Linking a CSS file from a template that Eleventy does not pass through
  (404 in production). Add a passthrough in `eleventy.config.mjs`.
- Bumping a version claim in docs without the version-specific examples.
- Force-pushing `main`. `main` is **not** protected by required checks: the
  `default` ruleset has `pull_request`, `deletion`, `non_fast_forward`,
  `code_scanning` and `code_quality` but no `required_status_checks`, so a red
  CI run does not block a merge. Merge policy: see docs/CONDUCTOR.md.
- `npm install` in CI (use `npm ci`); pushing without `npm run format` and lint.

## Where to read more

- `docs/CONTRIBUTING.md`, `docs/SETUP.md` (env vars, Supabase), `docs/HOSTING.md`
  (deploy and CI runbook), `docs/DEVELOPMENT.md`, `docs/adding-modules.md`,
  `docs/javascript-architecture.md`.
- `docs/TRACING.md` is retired; `docs/archive/` is history, not spec.
  `CHANGELOG.md` `[Unreleased]` is the dev-cycle scratchpad.
- Roles: `.claude/agents/`; slash commands: `.claude/commands/`.
- Auto-rewake: Stop hook `.claude/scripts/check-merged-prs.sh` may rewake a
  session when a `claude/*` PR merges (state: `.claude/.merge-watcher-state.json`;
  disable by deleting it or the Stop entry in maintainer-owned `.claude/settings.json`).

## First-run mines

1. If `npm test` explodes at `tests/setup.js`, the environment changed again
   (`localStorage` once vanished): fix the setup, do not ship around it.
2. There is no agent handoff system. Context lives in the plan, `CHANGELOG.md`
   and `git log`.
3. Only the lighthouse job rebuilds CSS in CI. Prove CSS changes with
   `npm run check:css-baseline`; the Lighthouse floors are in
   `lighthouse-ci.config.json` (honest since May 2026, `/intro/` about 0.86 to 0.9).
4. Run `npm run smoke:core` for routing, passthrough or page-template changes;
   for visual changes, screenshot the affected pages.
5. Search the codebase before asking. Ask the maintainer, do not guess, about
   anything shared: dependencies, CI behaviour, repository settings, secrets.
