# Development

How to run, change and check _CDC: The Missing Manual_ locally. If you are here
to read the site, the [README](../README.md) is the better start. Contribution
rules (pull requests, voice, conventions) are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Prerequisites

- **Node.js 22.19 or newer** (`engines.node` in `package.json`). `.nvmrc` pins
  `24` (the LTS CI runs on), so `nvm use` picks a matching version.
- npm, which ships with Node.
- Optional: Chromium for the accessibility smoke test (`npm run smoke:a11y`),
  Playwright browsers for `npm run test:e2e` (`npx playwright install chromium`),
  and Docker for the [CDC sandbox](SANDBOX.md).

## Run it

```bash
git clone https://github.com/sandgraal/letstalkcdc.git
cd letstalkcdc
npm ci               # use ci, not install, to honour the lockfile
npm run dev          # builds the CSS (npm's `preserve` hook), then serves on http://localhost:8080
```

`npm run dev` runs `npm run serve`, and npm runs the `preserve` script first, which
runs `npm run build:css`. That is what creates `src/assets/css/styles.min.css`,
which is gitignored. If you start Eleventy any other way (for example
`npx eleventy --serve`), run `npm run build:css` once first or the pages will
be unstyled.

In dev there is no Vite manifest, so the `viteAsset` filter falls back to the
unhashed source paths. Run `npm run build` once for a production-shaped
`_site/`. The Docker sandbox's Kafka UI also listens on port 8080, so stop one
before starting the other.

## The bar before you push

```bash
npm run verify-all   # format:check + lint + test + build
```

Add `npm run smoke:core` if you touched routing, passthroughs or page templates.
CI runs the same checks and more (see [Checks in CI](#checks-in-ci)).

## Commands

| Command                     | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `npm run dev`               | Eleventy dev server on :8080 (alias of `npm run serve`)             |
| `npm run build`             | Full production build: CSS, Vite JS, Eleventy, then CSS minify      |
| `npm run build:css`         | PostCSS bundle of `main.css` into `styles.min.css`                  |
| `npm run build:js`          | Vite bundle into `dist/`                                            |
| `npm run build:11ty`        | Eleventy build into `_site/` (production mode)                      |
| `npm run build:lhci`        | Production build with root path prefix, as the Lighthouse run needs |
| `npm test`                  | Vitest unit suite                                                   |
| `npm run test:coverage`     | Unit suite with coverage                                            |
| `npm run test:e2e`          | Playwright end-to-end tests (also `test:e2e:ui`, `test:e2e:debug`)  |
| `npm run lint`              | ESLint (`lint:fix` to apply fixes)                                  |
| `npm run lint:content`      | Content lint script (`scripts/lint-content.js`)                     |
| `npm run format`            | Prettier, write                                                     |
| `npm run format:check`      | Prettier, check only (what CI runs)                                 |
| `npm run smoke`             | `smoke:core` + `smoke:a11y` + `smoke:perf`                          |
| `npm run smoke:core`        | HTML and link smoke plus visual smoke; the fastest of the three     |
| `npm run smoke:a11y`        | pa11y accessibility run (needs Chromium)                            |
| `npm run smoke:perf`        | Performance budget checks                                           |
| `npm run a11y`              | `pa11y-ci` directly                                                 |
| `npm run lighthouse`        | Lighthouse score gate (`scripts/lighthouse-ci.mjs`)                 |
| `npm run verify:deployment` | Probe a live deployment (see [Deployment](#deployment))             |
| `npm run seed:discussions`  | Create starter GitHub Discussions (see [Community](#community))     |
| `npm run clean`             | Remove `dist`, `_site` and the generated `styles.min.css`           |
| `npm run verify-all`        | `format:check` + `lint` + `test` + `build`                          |

## Project structure

```text
letstalkcdc/
├── src/                      # Eleventy input
│   ├── _data/                # Global data: site.mjs, series.mjs, author.mjs, glossary, errata, ...
│   ├── _includes/            # layouts/base.njk and components/ (macros, partials)
│   ├── <topic>/              # One folder per content page, each with an index.njk
│   ├── assets/css/           # main.css entry plus numbered layers, components/ and pages/
│   ├── assets/js/            # ESM modules bundled by Vite (modules/, pages/, lib/)
│   ├── css/, js/             # Assistant styles and scripts (served as-is)
│   ├── data/assistant.yml    # Assistant knowledge base
│   ├── resources/            # Lab and drill files, copied to /downloads/
│   └── static/               # Copied verbatim to the site root (fonts, images, favicon)
├── lib/                      # path-prefix.mjs, render-head-extra.mjs (shared by config and data)
├── scripts/                  # Smoke, perf, a11y, deployment and playground-publish scripts
├── tests/                    # unit/ (Vitest) and e2e/ (Playwright)
├── playground/               # Change Feed Playground: its own app, tests and README
├── sandbox/                  # Debezium connector configs, init SQL and register scripts
├── compose.yaml              # Docker Compose CDC stack (Postgres, MySQL, Kafka, Debezium, Kafka UI)
├── supabase/schema.sql       # Table for optional assistant feedback
├── docs/                     # Guides, the implementation plan, archive/
├── .github/workflows/        # CI, deploy, link check, security scan and playground workflows
├── .claude/                  # Agent roles, commands and hooks (see below)
├── eleventy.config.mjs       # Eleventy config (filters, passthroughs, collections)
├── vite.config.mjs           # Vite config
├── postcss.config.mjs        # PostCSS config
├── lighthouse-ci.config.json # Lighthouse URLs, run count and score floors
├── CLAUDE.md                 # Agent quick reference (AGENTS.md is a symlink to it)
└── _site/, dist/             # Build output. Generated; never edit.
```

`playground/` is a separate app inside this repo, with its own `package.json`,
README and tests. The deploy workflow copies its files into the site at
`/playground/` using `scripts/publish-playground.sh`, which is why
`npm run build` alone does not produce that page.

## How the pipeline fits together

CSS has a single production entry: `src/assets/css/main.css` is bundled by
PostCSS (and minified by cssnano in production) into `styles.min.css`, which
Eleventy passes through to `/assets/css/styles.css`. Page-specific styles live in
`src/assets/css/pages/` and are linked from their own page. Read the CSS pipeline
section of [CLAUDE.md](../CLAUDE.md) before touching any CSS, including the
byte-identity check for refactors.

Vite bundles `src/assets/js/` into `dist/`, and Eleventy resolves the hashed
file names from `dist/.vite/manifest.json` through the `viteAsset` filter. In
templates, never hardcode a leading `/`; pipe URLs through `| url` so the
GitHub Pages path prefix is applied. See
[javascript-architecture.md](javascript-architecture.md) for the module layout.

## Search

Search is client-side. The build writes `/search-index.json` from
`src/search-index.11ty.cjs`, and `src/assets/js/modules/search.js` loads it with
Fuse.js. Press `/` (outside a text field) to open it, `Up` and `Down` to move,
`Enter` to open a result and `Escape` to close.

## Optional features

The site is progressive enhancement: everything below the first two rows is
optional, and nothing in the repo loads a `.env` file.

| Feature                            | Status   | Notes                                                                                       |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Static site (all content)          | Always   | Nothing to configure                                                                        |
| Local progress and theme           | Always   | Stored in the browser's `localStorage`; no account, no server                               |
| Assistant (pattern-matched help)   | Built in | Answers come from `src/data/assistant.yml` via `/data/assistant.json`; no model is called   |
| Assistant feedback (Supabase)      | Optional | Needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` at build time; see [SETUP.md](SETUP.md) |
| Lighthouse score gate              | Optional | `npm run lighthouse` locally (needs Chrome); CI runs it against `lighthouse-ci.config.json` |
| Playground saved scenarios/sharing | Optional | The playground loads the Supabase SDK for these; see `playground/README.md`                 |

Unset, the Supabase variables leave the assistant working; votes just queue in
`localStorage`. The earlier client-side tracing, user authentication and cloud
progress sync were removed; [TRACING.md](TRACING.md) explains the tracing removal.
What the assistant stores when someone votes is described under "Privacy" in
[SETUP.md](SETUP.md) and in [SECURITY.md](../SECURITY.md).

## Deployment

Pushes to `main` build and deploy to GitHub Pages through
`.github/workflows/deploy.yml`. Setup and the CI runbook are in
[HOSTING.md](HOSTING.md); environment variables and the Supabase table are in
[SETUP.md](SETUP.md). Those two files are the source of truth, so this page does
not repeat them.

Two facts worth knowing:

- `SITE_HOST` and `ELEVENTY_PATH_PREFIX` are optional. Without them the code
  falls back to `https://sandgraal.github.io` (`src/_data/site.mjs`) and derives
  the path prefix from `GITHUB_REPOSITORY`, or `/letstalkcdc/` if that is unset
  (`lib/path-prefix.mjs`). Set both when testing canonical URLs, Open Graph tags
  or the link check locally:
  `ELEVENTY_PATH_PREFIX=/letstalkcdc SITE_HOST=https://sandgraal.github.io npm run build`.
- `npm run verify:deployment` reads `SITE_HOST` and `ELEVENTY_PATH_PREFIX` too,
  but its own default host is `https://letstalkcdc.github.io`, which is not where
  the site lives. Pass `SITE_HOST=https://sandgraal.github.io` when you run it.

## Checks in CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`: build,
ESLint and Prettier, unit tests, `npm audit --production`, the smoke suite,
pa11y accessibility tests, Playwright end-to-end tests (including axe checks)
and the Lighthouse score gate. The Lighthouse `error` floors apply to `/intro/`
only, and this badge states them (a unit test fails if it drifts from
`lighthouse-ci.config.json`):

[![Lighthouse /intro/ floor](https://img.shields.io/badge/lighthouse%20%2Fintro%2F-perf%20%E2%89%A5%2082%20%C2%B7%20a11y%20%E2%89%A5%2093-orange)](../lighthouse-ci.config.json)

A floor passes if the best of the three runs reaches it (`aggregation` in
`lighthouse-ci.config.json`, as Lighthouse CI did), because a run can be hurt by
the machine instead of the page. The results table prints the median and every
run. A run that errors or loses its LCP (Lighthouse logs `NO_LCP` when Chrome
paints late) is invalid: it is retried up to 3 times with a short backoff and
never counted. Floors are then asserted on the valid runs, with a warning naming
the URL and how many runs were invalid. A URL with no valid run, or `/intro/`
(which has `error` floors) with fewer than 2, ends the job with exit 2 rather
than a pass or a score failure (`minValidRuns` and `minValidRunsForError` in the
config).

`linkcheck.yml` builds the site and crawls it with lychee.
`deploy.yml` publishes to GitHub Pages. The playground has its own workflows
(`playground-preflight.yml`, `playground-generated-bundles.yml`,
`playground-harness-nightly.yml`).

## Docker sandbox

`compose.yaml` and `sandbox/` start Postgres, MySQL, Kafka, Zookeeper, Debezium
Connect and Kafka UI for hands-on practice:

```bash
docker compose up -d
./sandbox/register-postgres-connector.sh
```

The full walkthrough is [SANDBOX.md](SANDBOX.md); the short reference is
[sandbox/README.md](../sandbox/README.md).

## Community

`npm run seed:discussions` creates the starter threads in GitHub Discussions
(see [DISCUSSIONS_SEED.md](DISCUSSIONS_SEED.md) and [COMMUNITY.md](COMMUNITY.md)).
Give it a token through your shell and do not paste a real personal access token
into a command line:

```bash
GITHUB_TOKEN="$(gh auth token)" npm run seed:discussions
```

## Working with AI agents here

This repository is set up for AI coding agents, and the rules are written down.
[CLAUDE.md](../CLAUDE.md) is the quick reference: commands, architecture, the
anti-patterns learned the hard way, and the byte-identity check for CSS.
`AGENTS.md` is a symlink to it, so every agent reads the same file.
[CONDUCTOR.md](CONDUCTOR.md) describes the protocol: one orchestrating session
plans and verifies, small single-purpose roles (defined in `.claude/agents/`)
do the work, and humans own merging, repository settings and secrets. Work is
tracked in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). A human contributor
can ignore all of this; the commands above are all you need.

## Related guides

- [CONTRIBUTING.md](CONTRIBUTING.md): pull requests and site conventions
- [adding-modules.md](adding-modules.md): adding a new content section
- [adding-quizzes.md](adding-quizzes.md): adding a quiz to a module
- [javascript-architecture.md](javascript-architecture.md): JS modules and the Vite split
- [SETUP.md](SETUP.md), [HOSTING.md](HOSTING.md), [SANDBOX.md](SANDBOX.md)
