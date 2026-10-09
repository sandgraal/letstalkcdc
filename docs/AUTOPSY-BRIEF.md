# Site autopsy briefing pack

A starting kit for a team that has never seen this repository and has to
decide what the next phase should be. It lists what exists, how to re-measure
it, what is known to be wrong or unfinished, and what only the maintainer can
tell you.

## 1. Purpose, scope and how to use this document

- **As of:** 2026-10-09, `origin/main` at `eb7f95e` (P16-8, #416). Live deploy
  of that commit succeeded at 2026-10-09 14:16 UTC (`gh run list --workflow=deploy.yml`).
  Later commits are not reflected; see "Re-check that this brief is current" below.
- **Everything here was derived** from the repo, the built site, git history,
  `gh`, and measurements run on that commit (section 3 says how). Where I
  could not verify something it says **unverified**. Statements labelled
  **opinion** are judgement, not evidence.
- **Scope:** the static site, its build and CI, the playground sub-app, the
  small Supabase footprint, and the content's technical accuracy. Out of
  scope: the maintainer's accounts (Search Console, GoatCounter, Buttondown,
  Supabase dashboard), which this brief could not open.
- **Not in this brief:** [`STATE-OF-PROJECT.md`](STATE-OF-PROJECT.md). It is dated
  2026-05-19 (274 tests, 21 modules) and is being refreshed under plan item
  P13-9. Do not use its numbers.

### Reading order

| #   | Read                                                                             | Why                                                      |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | [`../CLAUDE.md`](../CLAUDE.md)                                                   | Commands, pipeline, anti-patterns, conventions           |
| 2   | [`CONDUCTOR.md`](CONDUCTOR.md)                                                   | How AI roles and humans split work; Definition of Done   |
| 3   | [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md)                               | The running checklist; Phases 13 to 16 are current       |
| 4   | [`DEVELOPMENT.md`](DEVELOPMENT.md)                                               | Run, build and check locally                             |
| 5   | [`HOSTING.md`](HOSTING.md)                                                       | Deploy pipeline, variables, runbook                      |
| 6   | [`STATE-OF-PROJECT.md`](STATE-OF-PROJECT.md)                                     | Historical snapshot only (stale, see above)              |
| 7   | [`seo-audit-2026-10.md`](seo-audit-2026-10.md)                                   | First SEO audit, with findings F-01 to F-17              |
| 8   | [`seo-baseline-2026-10-after.md`](seo-baseline-2026-10-after.md)                 | Same audit re-run after the Phase 16 work                |
| 9   | [`content-gap-plan-2026-10.md`](content-gap-plan-2026-10.md)                     | What readers might search for; basis of the new modules  |
| 10  | [`playground-demos-inventory-2026-10.md`](playground-demos-inventory-2026-10.md) | Playground scenarios, defects, proposed labs             |
| 11  | [`DOMAIN-MIGRATION.md`](DOMAIN-MIGRATION.md), [`SETUP.md`](SETUP.md)             | Moving to an own domain; Supabase, newsletter, analytics |

### Re-check that this brief is current

```bash
git fetch origin && git log --oneline eb7f95e..origin/main
```

```bash
grep -c '^ *- \[ \]' docs/IMPLEMENTATION-PLAN.md
```

At `eb7f95e` the second command prints 22: 21 open boxes plus one line of
instructions near the top of the plan (135 boxes are ticked).

## 2. What the site is, and what it is made of

### Thesis

CDC: The Missing Manual (Let's Talk CDC) teaches change data capture to
engineers who run pipelines. Every page is held to one thesis (README and
`IMPLEMENTATION-PLAN.md` Phase 12):

1. Delivery is **at-least-once**; expect duplicates, replays and restarts.
2. Correctness lives in the **sink**: idempotent writes keyed on the primary
   key, **ordered by source log position** (LSN, SCN, GTID), not by `ts_ms`.
3. **End-to-end exactly-once across independent systems is not claimed.** What
   is claimed is exactly-once processing: at-least-once transport plus an
   idempotent sink. `/is-cdc-exactly-once/` takes this hop by hop.

### Page inventory (derived from the 2026-10-09 build)

Counts come from `src/_data/series.mjs`, `_site/sitemap.xml` and
`npm run audit:seo` (section 3), with the playground published as production
does.

| Group                            |    Count | Source and notes                                                                                                                                                    |
| -------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Series entries ("modules")       |       36 | `series.mjs`; 6 Beginner, 15 Intermediate, 15 Advanced                                                                                                              |
| ... of which interactive tools   |        3 | `/connector-builder/`, `/dlq-triage/`, `/debezium-decoder/`                                                                                                         |
| ... of which lab hubs            |        3 | `/lab-kafka-debezium/`, `/quickstarts/`, `/cloud-labs/`                                                                                                             |
| Quickstart pages under the hub   |        4 | Postgres, MySQL, SQL Server, Oracle                                                                                                                                 |
| Cloud lab pages under the hub    |        5 | AWS DMS, Fivetran, GoldenGate, Matillion, Snowflake                                                                                                                 |
| Other reference pages in sitemap |       11 | `/`, `/overview/`, `/compare/`, `/methodology/`, `/glossary/`, `/versions/`, `/privacy/`, `/oracle-notes/`, `/merge-cookbook/`, `/troubleshooting/`, `/playground/` |
| Sitemap entries (local build)    |       56 | 36 + 4 + 5 + 11. The live sitemap has 57: it adds `/newsletter/` because `BUTTONDOWN_USERNAME` is set                                                               |
| noindex content pages            |        4 | `/dashboard/`, `/styleguide/`, `/mermaid-sandbox/`, `/newsletter/` (when the variable is unset)                                                                     |
| Redirect stubs                   |       26 | Legacy `*.html` meta-refresh pages; none in the sitemap                                                                                                             |
| HTML files in `_site/`           |       87 | 60 content pages + 26 stubs + 404 (audit `inventory.*`)                                                                                                             |
| Glossary entries                 |       32 | `src/_data/glossary.mjs`                                                                                                                                            |
| Errata callout entries           |        5 | `src/_data/errata.mjs`; the `/errata/` hub is hand-written                                                                                                          |
| Assistant intents / triggers     | 45 / 648 | `src/data/assistant.yml`. `content-gap-plan` quotes 23 / 229: that was before P15-11, so it is stale                                                                |
| Playground scenarios             |   11 + 6 | 11 shared (Compare tab) and 6 demo scenarios, per the inventory doc dated 2026-10-09; **not recounted**                                                             |
| Feed items (`/feed.xml`)         |       40 | audit `feed.items`                                                                                                                                                  |

### Architecture map

| Layer                | What                                                                                                                                                                       | Where                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Generator            | Eleventy 3.1.x (`npm ls @11ty/eleventy`), Nunjucks templates, `.11tydata.cjs` per-section data                                                                             | `eleventy.config.mjs`, `src/`                      |
| JS bundling          | Vite 8 builds `src/assets/js/` into `dist/`; Eleventy reads `dist/.vite/manifest.json` through the `viteAsset` filter                                                      | `vite.config.mjs`, `dist/` (generated)             |
| CSS                  | Only `src/assets/css/main.css` ships (via PostCSS + cssnano). Page CSS under `pages/`. `src/css/assistant.css` ships on its own                                            | `src/assets/css/`, `postcss.config.mjs`            |
| Path prefix and host | `/letstalkcdc/` from `ELEVENTY_PATH_PREFIX` or `GITHUB_REPOSITORY`; host from `SITE_HOST`; templates use `\| url`                                                          | `lib/path-prefix.mjs`, `lib/site-host.mjs`         |
| Playground           | A separate React/Vite app with its own `package.json` and lockfile. Its **built bundles are committed** (`playground/assets/generated`) and copied in after the main build | `playground/`, `scripts/publish-playground.sh`     |
| Assistant            | Client-side keyword matcher over `src/data/assistant.yml`; 👍/👎 votes post to Supabase with `fetch` and the publishable key                                               | `src/data/assistant.yml`, `lib/assistant-yaml.mjs` |
| Data files           | `series`, `glossary`, `errata`, `cdcVendors`, `cdcCompare`, `toolVersions`, `author`, `site`, `seo`, `supabase`, `analytics`, `newsletter`                                 | `src/_data/`                                       |
| Backend              | None in production. One Supabase project, shared with the playground (below)                                                                                               | `supabase/schema.sql`                              |
| Sandbox              | Docker Compose lab (Postgres, MySQL, Kafka, Debezium, Kafka UI) for readers; not part of the site build                                                                    | `compose.yaml`, `sandbox/`, `docs/SANDBOX.md`      |
| Hosting              | GitHub Pages, deployed by workflow on every push to `main`. `netlify.toml` is legacy                                                                                       | `.github/workflows/deploy.yml`                     |

**Supabase tables and owners** (`supabase/schema.sql`; the maintainer's notes
say the playground work belongs to a separate owner, so coordinate first):

| Table                       | Owner      | Browser access (`anon`)                          | Retention                              |
| --------------------------- | ---------- | ------------------------------------------------ | -------------------------------------- |
| `public.assistant_feedback` | the site   | INSERT only; no read policy                      | 12 months (`pg_cron`, daily 03:17 UTC) |
| `public.events`             | playground | INSERT and SELECT (public, streamed)             | 30 days (daily 03:23 UTC)              |
| `public.scenarios`          | playground | INSERT only; opened through `get_scenario(uuid)` | 30 days (daily 03:29 UTC)              |

A row can live up to about 31 days because the jobs run daily. Server-side
triggers overwrite `created_at` and `saved_at`, so a visitor's clock cannot
extend retention. These grants and jobs are recorded in the schema file as
applied on 2026-10-09; **I could not check the live database**, so confirm
with the queries in section 5.

**CI workflows** (`.github/workflows/`, plus GitHub's CodeQL default setup,
which is configured in repository settings and has no file):

| Workflow                           | Runs on                                                                                    | What it gates                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                           | push to and PRs into `main`                                                                | Jobs: build; lint (ESLint + Prettier); unit tests; `npm audit --production`; smoke (`npm run smoke`); pa11y (`npm run a11y`); Playwright e2e on chromium; Lighthouse (`build:lhci` + `npm run lighthouse`) |
| `deploy.yml`                       | push to `main`, manual                                                                     | Builds with the repository variables, runs `publish-playground.sh`, deploys to Pages                                                                                                                       |
| `linkcheck.yml`                    | every push and PR                                                                          | lychee over `_site/**/*.html`, with the site's own URLs remapped to the local build                                                                                                                        |
| `fortify.yml`                      | push, PR, weekly (Fri 20:34 UTC)                                                           | Fortify AST scan                                                                                                                                                                                           |
| `playground-preflight.yml`         | pushes and PRs touching `playground/**`                                                    | Playground build, bundle check, scenario lint, simulation tests, e2e, harness                                                                                                                              |
| `playground-generated-bundles.yml` | same paths                                                                                 | Committed bundles match a fresh build                                                                                                                                                                      |
| `playground-harness-nightly.yml`   | daily 07:00 UTC, manual                                                                    | Harness smoke test                                                                                                                                                                                         |
| CodeQL (default setup)             | `gh api repos/sandgraal/letstalkcdc/code-scanning/default-setup` says `configured`, weekly | Code scanning on `actions` and JavaScript/TypeScript                                                                                                                                                       |
