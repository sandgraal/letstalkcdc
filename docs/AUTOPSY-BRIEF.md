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

At `eb7f95e` the command prints 21 (open boxes; `grep -c '^ *- \[x\]'` prints 134 ticked).

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

Licensing: code is MIT; written lessons, diagrams and images are CC BY 4.0.
[`../LICENSE-CONTENT.md`](../LICENSE-CONTENT.md) says which files fall under which.

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

**Supabase tables and owners** (`supabase/schema.sql`; the conductor's notes say the playground work belongs to a separate owner, **to be confirmed by the maintainer**; coordinate first):

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

## 3. Evidence kit

Every number below was measured on 2026-10-09 at `eb7f95e` on one macOS
machine (Node 24.19.0, Chrome from the system, Playwright browsers cached).
Lab numbers vary by machine; treat the Lighthouse and timing rows as
indicative. Runs happen in this order: install, build (production variables),
publish the playground, then the checks.

### Setup

```bash
npm ci
```

```bash
ELEVENTY_PATH_PREFIX=/letstalkcdc SITE_HOST=https://sandgraal.github.io npm run build
```

```bash
scripts/publish-playground.sh
```

The deploy workflow runs the second and third steps, so this is what ships.
CI's build artifact skips the third step, which is why some CI numbers differ
(see the e2e row).

### Re-runnable measurements

| Measure                  | Command                                                                                | Value on 2026-10-09                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests               | `npm test`                                                                             | 1,704 passed in 54 files, about 17 s                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Lint                     | `npm run lint`                                                                         | exit 0, no output                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E2E (as CI runs it)      | `npx playwright test --project=chromium --reporter=line`                               | 358 tests listed with no playground in `_site/`: 357 passed, 1 failed (below). With the playground published: 361 listed, 2 more fail (the `/playground/` contrast tests; #419 is open to fix them)                                                                                                                                                                                                                                                                   |
| axe contrast, all pages  | included in the e2e run above                                                          | Every sitemap page plus `/dashboard/`, `/styleguide/`, `/mermaid-sandbox/`, `/newsletter/`, both themes: passes. `/playground/` fails in both themes (section 6)                                                                                                                                                                                                                                                                                                      |
| pa11y-ci                 | `npm run a11y`                                                                         | 8 of 8 URLs, 0 errors                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| pa11y wrapper            | `npm run smoke:a11y`                                                                   | 6 pages pass                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Smoke                    | `npm run smoke:core`                                                                   | Both stages pass (canvases, fonts, edit links, errata, glossary, methodology, privacy; visual fingerprints)                                                                                                                                                                                                                                                                                                                                                           |
| Size budgets             | `npm run smoke:perf`                                                                   | All pass. CSS 98.3 KB of 200; app JS 2.3 KB of 80; `/intro/` HTML 101.3 KB of 300; page scripts 1.0 to 12.6 KB of 120                                                                                                                                                                                                                                                                                                                                                 |
| Build time               | `time npm run build`                                                                   | 3.4 to 4.2 s warm (9.2 s on the first run); Eleventy reports "Copied 109 Wrote 90 files in 0.4 seconds"                                                                                                                                                                                                                                                                                                                                                               |
| Production CSS hash      | `NODE_ENV=production npm run build:css && shasum -a 256 src/assets/css/styles.min.css` | `83943ab39baf798fdd5cfd1dc726035d030b0bd3d0dc4dc6bb322934d2d060b6`, equal to `CLAUDE.md` and to `_site/assets/css/styles.css` after the final minify                                                                                                                                                                                                                                                                                                                  |
| Output size              | `du -sh _site`                                                                         | 5.4 MB, 201 files (without the playground)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `npm audit` (root)       | `npm audit` and `npm audit --omit=dev`                                                 | 9 findings (4 moderate, 5 high); 0 with `--omit=dev`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `npm audit` (playground) | `cd playground && npm audit --package-lock-only`                                       | 5 high; 0 with `--omit=dev`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Open Dependabot alerts   | `gh api "repos/sandgraal/letstalkcdc/dependabot/alerts?state=open"`                    | 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Link check (lychee)      | CI job `Link check`                                                                    | Last 100 `main` runs (`gh run list --workflow=linkcheck.yml --branch main -L 100`): 89 success, 11 failure. All 11 failures were on `main` between 02:57 and 06:32 UTC on 2026-10-09, before #388 and #391 (the 503/504 fixes); none since. **Not run locally**: lychee is not installed here. To run it, build with the setup above, then `lychee --no-progress --exclude-loopback '_site/**/*.html'` (expect external 403/429 noise; CI remaps the site's own URLs) |
| Live deploy              | `npm run verify:deployment`                                                            | Configured site: 8 pass, 2 warnings (`x-content-type-options`, `x-frame-options` missing). The "host root" half returns 404 on 7 paths by design for a project site, so the command **exits non-zero**                                                                                                                                                                                                                                                                |

The one e2e failure: `layout.spec.js` "`/intro/` accumulates no meaningful
layout shift" failed in the full parallel run and passed 3 of 3 when re-run on
its own. An earlier full run at `2eb0f29` passed it. Treat it as a load-sensitive
flake candidate; the cause is **unverified**.

### Bundles and page weight

| Item                            |                                    Raw | Gzip (`gzip -9`) | Note                                                                              |
| ------------------------------- | -------------------------------------: | ---------------: | --------------------------------------------------------------------------------- |
| `/intro/` HTML                  |                              103,717 B |         23,214 B | 1,041 DOM elements in Lighthouse                                                  |
| `assets/css/styles.css`         |                              100,648 B |         18,590 B | The only shipped site stylesheet                                                  |
| Vite `app.*.js`                 |                               58,174 B |    about 19.6 KB | Hash changes with content; `dist/js/` holds 3 files                               |
| Fonts                           | 7 woff2 files, 152 KB with the licence |              n/a | IBM Plex, self-hosted woff2                                                       |
| `/intro/` as Lighthouse sees it |                     381 KB transferred |              n/a | 33 requests; includes Chart.js (68 KB) from jsdelivr, `search-index.json` (41 KB) |

### SEO audit headline (`npm run audit:seo`)

Run after publishing the playground; add `-- --verbose` for the pages behind
each count. It reads only and exits 0 whatever it finds.

| Measure                                     |        Value | Measure                                       |                       Value |
| ------------------------------------------- | -----------: | --------------------------------------------- | --------------------------: |
| HTML files / content pages / redirect stubs | 87 / 60 / 26 | Sitemap entries / without `lastmod`           |                      56 / 2 |
| Titles over 60 characters / longest         |       2 / 65 | Feed items / without description              |                      40 / 0 |
| Descriptions over 160 / duplicate groups    |        0 / 0 | Internal links / broken / broken fragments    |               2,606 / 0 / 0 |
| Pages with no `<h1>` / with level skips     |       2 / 11 | Pages with fewer than 3 content inbound links |                           2 |
| Pages without `og:image` / Twitter card     |        2 / 2 | Pages unreachable via content links           |                           4 |
| Distinct `og:image` values                  |            1 | Content pages linking into the glossary       |                          28 |
| Article JSON-LD pages / missing `image`     |       51 / 0 | Articles more than 30 days behind git         | 17 of 46 (max lag 245 days) |
| Pages with `BreadcrumbList`                 |           40 | JSON-LD parse failures                        |                           0 |

### Lighthouse (`scripts/lighthouse-ci.mjs`)

The runner needs a root-prefixed build and Chrome; it audits five URLs three
times each with mobile emulation. Valid runs only are counted.

```bash
npm run build:lhci
```

```bash
npm run lighthouse
```

| URL              | Performance | Accessibility | Best practices |  SEO | Valid runs |
| ---------------- | ----------: | ------------: | -------------: | ---: | ---------: |
| `/`              |        0.96 |          1.00 |           1.00 | 1.00 |     2 of 3 |
| `/intro/`        |        0.91 |          1.00 |           1.00 | 1.00 |     3 of 3 |
| `/overview/`     |        0.94 |          0.96 |           1.00 | 1.00 |     1 of 3 |
| `/quickstarts/`  |        0.95 |          1.00 |           1.00 | 1.00 |     2 of 3 |
| `/snapshotting/` |        0.93 |          1.00 |           1.00 | 1.00 |     3 of 3 |

Gate result: "22 assertions over 5 URLs: 0 errors, 0 warnings". Floors are
0.9 for every category at `warn` level; `/intro/` has `error` floors of 0.82
(performance) and 0.93 (accessibility) in `lighthouse-ci.config.json`.
Other figures: `/intro/` LCP 3.16 s, FCP 2.03 s, TBT 13 to 32 ms, CLS 0.
`/overview/` transfers 1.19 MB (Mermaid 936 KB). The runner also reports an
"agentic-browsing" category (0.50 on `/snapshotting/` and `/intro/`); its
meaning was not investigated, so **unverified**. Lab only; there is no field
(real-user) data. Invalid runs come from `NO_LCP` and `NO_FCP` (section 7).

### Baseline documents: what each measures, and what it does not

| Document                                                                         | Measures                                                                                                                             | Does NOT measure                                                                                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`seo-audit-2026-10.md`](seo-audit-2026-10.md) (at `f462635`)                    | Built HTML: titles, descriptions, canonicals, JSON-LD, links, sitemap, feed; 10 key pages by reading; keyword targets are inferences | Traffic, rankings, indexing, social previews, live site vs build, Core Web Vitals, Google rules                                                             |
| [`seo-baseline-2026-10-after.md`](seo-baseline-2026-10-after.md) (at `a6bb3c6`)  | The same audit re-run before/after the Phase 16 work, with `npm run audit:seo`                                                       | Search Console, GoatCounter, Lighthouse for key pages, the live deployment, title versus H1 agreement, rich-result validity                                 |
| [`content-gap-plan-2026-10.md`](content-gap-plan-2026-10.md)                     | Coverage of the site against what the gap plan guessed readers search; assistant intents counted                                     | Search volume or ranking (none was available); the feedback table (not read). Its assistant counts (23 intents, 229 triggers) are out of date: 45 / 648 now |
| [`playground-demos-inventory-2026-10.md`](playground-demos-inventory-2026-10.md) | Which scenario could back which lesson; defects found by reading source and replaying in Node                                        | A browser run; the `ops` replay skips the React layer; several defects listed there were fixed afterwards (#384, #393)                                      |

Compare to the baselines with the same command: the seo-audit baseline recorded
74 HTML files and 47 content pages; this brief's run has 87 and 60.

## 4. Content accuracy audit guide

The content is the product. Everything else on this list exists to protect it.

### What was reviewed, and by whom

- Plan items say pages were "SME-reviewed" or that "SME re-reviews approved"
  them (for example P15-22, P16-15 to P16-24). **The repo does not record who
  or what the SME is**, and the review texts were not kept: P15-48 records that
  the review text of #376 "is not retrievable (`gh pr view 376` returns no
  review or comment bodies)". Treat review provenance as **unverified**: for some PRs the review notes were not preserved anywhere in the repo or on GitHub, so ask the maintainer where they live.
- The process the repo does document: the role that writes a change never
  approves it ([`CONDUCTOR.md`](CONDUCTOR.md)); a separate `reviewer` checks
  each diff; primary sources are cited by URL with an access date
  ([`content-gap-plan-2026-10.md`](content-gap-plan-2026-10.md) section 9);
  the maintainer signed off the rewritten merge cookbook and the modules merged
  by 2026-10-09 ("for all so far", P15-22). Modules merged after that sign-off
  (P16-20 to P16-24, #399 to #403) were SME-reviewed per the plan; whether the
  maintainer has read them is **unverified**.
- The August 2026 review quoted in the plan (Phase 12) found the existing
  content "unusually careful and accurate". That review is not in the repo.

### What was executed, and what was not

| Content                                                                                                 | Executed?                                                                               | Evidence                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/merge-cookbook/` Postgres card                                                                        | **Yes**, on PGlite (an in-process Postgres)                                             | `tests/unit/merge-cookbook-postgres.test.js` (9 tests)                                                          |
| `/merge-cookbook/` other 7 cards (Snowflake, BigQuery, Databricks, Oracle, SQL Server, MySQL, Redshift) | **No**. Checked against vendor docs; labelled untested on the page                      | P15-22; `merge-cookbook-page.test.js` pins the guard text per dialect, which proves the text, not the behaviour |
| `/backfill-resnapshot/` SQL                                                                             | Yes, on PGlite                                                                          | `backfill-resnapshot-page.test.js` (83 tests incl. executed SQL)                                                |
| `/test-your-pipeline/`                                                                                  | Contract test runs in CI; Postgres SQL run once on PGlite; `crash.sh` labelled untested | P16-19                                                                                                          |
| `/sql-server-mysql-cdc/`                                                                                | **No**. T-SQL and MySQL statements parse-checked only; labelled untested                | P16-23                                                                                                          |
| Lab stacks (`compose.yaml`, quickstarts, `/lab-kafka-debezium/`)                                        | **Not in CI** (needs Docker). Last run date unverified                                  | P15-46 says the labs "must be re-run"                                                                           |
| Cloud labs (AWS DMS, Fivetran, GoldenGate, Matillion, Snowflake)                                        | **No**. Vendor products; accuracy corrections from SME review (#308)                    | Plan Phase 4 note                                                                                               |
| Pages with SQL examples elsewhere (`/materialization/`, `/snapshotting/`, `/which-row-wins/`)           | Mostly text-pinned (`sink-examples-guard.test.js`), not run                             | P15-23                                                                                                          |

### Known corrections (what the site has already admitted)

`src/_data/errata.mjs` renders a callout on the affected pages; `/errata/` is
the hand-written hub. Entries at `eb7f95e`:

| Entry                                      | Pages                                          | Date       |
| ------------------------------------------ | ---------------------------------------------- | ---------- |
| Embedded video removed                     | `/intro/`, `/quickstarts/quickstart-postgres/` | 2026-05-15 |
| Kafka Connect offset topic                 | `/ops-offsets/`                                | 2026-08-24 |
| Forward-compatibility upgrade order        | `/schema-evolution/`                           | 2026-08-24 |
| Reconcile by log position, not a timestamp | `/snapshotting/`, `/materialization/`          | 2026-10-09 |
| Exactly-once is a per-hop question         | `/exactly-once/`                               | 2026-10-09 |

Corrections that landed in the plan but not as errata callouts: `wal_keep_size`
claims fixed on `/case-study/`, `/intro/`, `/troubleshooting/` and
`/quickstarts/quickstart-postgres/` (#379); the "Tested with" note was false
until #408 separated `tools` (latest) from `tested` (what labs pin) in
`toolVersions.mjs`; about 20 timestamp-ordered statements rewritten in #366.

### Claims most likely to be wrong, by page

Ranked by how often the claim recurs and how badly a reader is hurt if it is
wrong. This is a prioritised **sampling frame**, not a list of known defects.

| Claim family                                      | Pages to read first                                                                                                                 | Why it is risky                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Order by source log position, never `ts_ms`       | `/merge-cookbook/`, `/materialization/`, `/snapshotting/`, `/partitioning/`, `/which-row-wins/`, `/intro/`, cloud labs, quickstarts | The site once taught the opposite in about 20 places; a sweep found it in many pages, so residue is plausible            |
| Exactly-once is per hop, never end to end         | `/exactly-once/`, `/is-cdc-exactly-once/`, `/event-envelope/`, `/compare/`, `/tooling/`, `/overview/`                               | Vendor wording is loose; Debezium support is version-specific (the plan says "from 3.3")                                 |
| MERGE guards and tie-breaks                       | `/merge-cookbook/` (8 dialects), `/materialization/` (dbt), `/snapshotting/`                                                        | Seven of eight dialects are not executed; `>=` versus `>` lets same-position changes both pass                           |
| Delete markers, tombstones, compaction            | `/deletes-stay-deleted/`, `/which-row-wins/`, `/security/` (erasure)                                                                | Physical `DELETE` in a sink loses to a late update; the GDPR section says "not legal advice"                             |
| Replication slot and WAL retention                | `/postgres-replication-slots/`, `/case-study/`, `/troubleshooting/`, `/quickstarts/quickstart-postgres/`                            | `wal_keep_size` versus `max_slot_wal_keep_size` was wrong before; Debezium's own docs and PostgreSQL's disagree (P15-39) |
| Snapshot semantics and watermarks                 | `/snapshotting/` (`#watermarks`), `/backfill-resnapshot/`, `/reconciliation-surgery/`                                               | Algorithm-level claims (DBLog watermarks), `snapshot.mode` values differ across versions                                 |
| Debezium and Kafka version-specific configuration | `/connector-builder/`, `/debezium-decoder/`, `/lab-kafka-debezium/`, `/versions/`, `/tooling/`                                      | Pages teach 3.x features; labs pin Debezium 2.7.4.Final and Confluent Platform 7.7.0 (P15-46)                            |
| Per-database specifics                            | `/sql-server-mysql-cdc/`, `/oracle-notes/`, four quickstarts                                                                        | T-SQL and MySQL are untested; `binlog_row_image` and `REPLICA IDENTITY` are easy to get subtly wrong                     |
| Vendor-product claims                             | `/cloud-labs/*`, `/compare/`, `/tooling/`, `/versions/`                                                                             | Managed services change without a version number                                                                         |
| Non-relational and transport claims               | `/non-relational/` (MongoDB, DynamoDB, Cassandra), `/event-envelope/#transports` (Pulsar, Kinesis, Pub/Sub)                         | Written from documentation; retention limits (such as DynamoDB's 24 hours) change                                        |

**Candidate residue found while writing this brief (unverified as a defect):**
`grep -rniE "order by +updated_at" src --include='*.njk'` returns three lines, all in
`/cloud-labs/matillion-cdc/`. Two are labelled "does not define event order"
(polling CDC has no log position). The third, in the troubleshooting list,
advises `QUALIFY ROW_NUMBER() ... ORDER BY updated_at DESC` to deduplicate with
no such caveat. Whether that contradicts the thesis for a polling source is a
judgement for the content reviewer.

### Checklist to re-verify one page

1. Record the baseline: `git log -1 --format='%ad %h' -- src/<page>/` and the
   `dateModified` in `src/<page>/index.11tydata.cjs`.
2. List the claims: every configuration key, SQL statement, version number,
   default value, limit and "always/never" sentence.
3. Check each against the primary source for the version the page names.
   `src/_data/toolVersions.mjs` separates `tools` (latest stable) from `tested`
   (what the labs pin); say which one a claim refers to.
4. For SQL: run it in that dialect, or confirm the page says it is untested.
   Check the guard compares log position, uses a strict comparison or a
   tie-break, and keeps deletes as markers.
5. For thesis items: no timestamp as an ordering key; "exactly-once" scoped to a
   hop; no claim of end-to-end exactly-once.
6. Open every cited source. Does it say what the page says it says?
7. Run the page's test: `npx vitest run tests/unit/<page>-page.test.js` (not
   every page has one).
8. If the page is wrong: add an entry to `src/_data/errata.mjs`, fix the page,
   bump `dateModified`, and tell the maintainer. Do not fix silently.

## 5. Live site and data sources

Checked on 2026-10-09 with `gh` and `curl` (read-only). Variable **names** only;
no values appear in this document.

| Source                 | State on 2026-10-09                                                                                                                                                                                                                                                                                                     | What you need from the maintainer                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| GitHub Pages deploy    | Live at `https://sandgraal.github.io/letstalkcdc/`, `build_type: workflow`, HTTPS enforced, no custom domain. Latest deploy of `eb7f95e` succeeded 14:16 UTC                                                                                                                                                            | Repo read (public) for runs; admin for settings and variables                     |
| Repository variables   | Set: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `BUTTONDOWN_USERNAME`, `GOATCOUNTER_CODE`. **Not set:** `ELEVENTY_PATH_PREFIX`, `SITE_HOST` (production uses the code fallbacks, which equal today's host; the build warns)                                                                                            | Admin on the repo to view or change variables                                     |
| Repository secrets     | `gh secret list` returned nothing for the maintainer's own token. So the Fortify scan, which needs `FOD_*`/`SSC_*` secrets, probably does not scan (**unverified**)                                                                                                                                                     | Admin, to confirm                                                                 |
| GoatCounter            | Script `gc.zgo.at/count.js` is on the live home page. Variable updated 2026-10-09 13:24 UTC, so **data starts today** and a week's numbers will mean little for weeks. Cookie-less; honours Do Not Track                                                                                                                | A GoatCounter login (or a read-only share link) for the site code                 |
| Search Console         | Verification file `googleeb5f2ebb27afc761.html` returns HTTP 200 live. **Whether the property is verified and the sitemap submitted is unknown** (P16-12 is open)                                                                                                                                                       | Owner or full user on the property; the sitemap URL is `/letstalkcdc/sitemap.xml` |
| Buttondown newsletter  | Live: `/newsletter/` returns 200 and posts to the `letstalkcdc` username; the live sitemap lists it. Subscriber count unknown                                                                                                                                                                                           | A Buttondown login (read-only if offered)                                         |
| Supabase               | Project shared with the playground; variables above are baked into the build. The conductor's notes record the first real vote reaching `assistant_feedback` on 2026-10-09 (**to be confirmed by the maintainer**). **I could not read any table**: the browser key cannot SELECT, and no database access was available | Supabase dashboard role that can run SQL (read-only is enough)                    |
| Feedback volume        | The content-gap plan records "roughly 1 to 2 rows" on 2026-10-09 (a maintainer report relayed in that plan; **to be confirmed**). Re-run trigger: **at least 30 rows** (P16-25)                                                                                                                                         | Run the query below                                                               |
| Host-root `robots.txt` | `https://sandgraal.github.io/robots.txt` returns 404 (checked); the file the site ships is at `/letstalkcdc/robots.txt`, which crawlers do not treat as the site's robots file                                                                                                                                          | Nothing; sitemap submission replaces it. Fixed properly only by an own domain     |
| Third-party at runtime | Mermaid and Chart.js load from `cdn.jsdelivr.net` (`mermaid@11` is a floating major; no integrity hash)                                                                                                                                                                                                                 | n/a                                                                               |

### People and access

- The repository is a personal one (`sandgraal/letstalkcdc`, owner type User).
  `gh api repos/sandgraal/letstalkcdc/collaborators` lists one collaborator,
  `sandgraal`, with admin; `.github/CODEOWNERS` is `* @sandgraal`. There is no
  team, so any other person needs to be added by the maintainer (Settings >
  Collaborators; Write is enough to open PRs and read Actions logs, Admin to
  change variables, rulesets or Pages).
- The playground was built by a separate agent or owner, according to the
  conductor's notes. Who to ask about it is a **question for the maintainer**;
  no playground owner is recorded in CODEOWNERS.
- Supabase: only the project owner's login (or an invited member with SQL
  access) can run the queries below. Ask the maintainer to invite a read-only
  member, or to run them and send the output.
- Accounts for GoatCounter, Buttondown and Search Console are the
  maintainer's; ask for a read-only share or an invitation.

**What the `gh` commands in this brief need.** A 403 or 404 without the
right role does **not** mean "not configured".

| Command                                     | Role needed                                  |
| ------------------------------------------- | -------------------------------------------- |
| `gh run list`, `gh run view`, `gh pr list`  | Read (public repo)                           |
| `gh variable list`, `gh secret list`        | Write or Admin; values of secrets never show |
| `gh api repos/.../rulesets`                 | Read                                         |
| `gh api repos/.../branches/main/protection` | Admin (404 also means "no classic rule")     |
| `gh api .../dependabot/alerts`              | Admin or security manager                    |
| `gh api .../code-scanning/default-setup`    | Write or Admin                               |
| `gh api .../collaborators`                  | Write or Admin                               |

### Reading the data

**Feedback counts** (Supabase SQL editor, read-only):

```sql
select count(*) as total, count(*) filter (where helpful) as up, count(*) filter (where not helpful) as down, min(ts) as first, max(ts) as last from public.assistant_feedback;
```

**Questions to group** (same editor; fallback questions have no matching topic):

```sql
select ts, helpful, intent_id, question from public.assistant_feedback where helpful = false or intent_id is null order by ts desc;
```

**Check that the playground retention jobs exist** (needs `pg_cron` access):

```sql
select jobname, schedule, active from cron.job order by jobname;
```

`supabase/schema.sql` says three jobs should exist:
`assistant-feedback-retention`, `playground-events-retention` and
`playground-scenarios-retention`. If the list differs, the live database has
drifted from the file (CI never applies that file).

**GoatCounter:** the dashboard's "Pages" view ranks paths; compare `/intro/`,
`/overview/` and the new modules (`/which-row-wins/`, `/is-cdc-exactly-once/`,
`/postgres-replication-slots/`). With a week of data, rankings are noise.

**Search Console:** after 28 days, export Performance > Pages and Queries and
the Pages indexing report. Compare "Indexed" to the 57 sitemap URLs. The plan
(P16-12) asks for a dated first snapshot of impressions, clicks and indexed-page
count.

**Live-site check** (read-only; exits non-zero by design, see section 3):

```bash
npm run verify:deployment
```

## 6. Known issues and open work

### Open boxes in `IMPLEMENTATION-PLAN.md` at `eb7f95e`

21 open boxes (20 top-level, 1 nested). Size and role are the plan's own. All
are grouped below; none is omitted.

**Moving target:** #413 (P15-45) merged after the snapshot without ticking its
box, so the count is still 21 on `38ee475`. #417 (P16-9 headings) and #419 are open;
#415 and #416 merged just before. Re-check with `gh pr list --state all`.

**Maintainer-only steps and decisions**

| ID     | What                                                                         | Why it is open                                                                                                                          |
| ------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| P16-12 | Baseline measurement: verify Search Console, submit sitemap, 28-day snapshot | Needs the maintainer's accounts; GoatCounter is now installed, so only the waiting remains                                              |
| P16-25 | Re-run `content-gap-plan` when `assistant_feedback` has at least 30 rows     | Maintainer reads the table; roughly 1 to 2 rows on 2026-10-09                                                                           |
| P15-39 | Decide whether to file an upstream Debezium docs issue about `wal_keep_size` | Debezium and PostgreSQL docs disagree; the lesson carries a note                                                                        |
| P15-52 | Confirm in Codacy that nothing runs `.codacy/cli.sh`, then delete it         | Non-use is unproven without the dashboard                                                                                               |
| P15-13 | One place for the host (own-domain move)                                     | Code and runbook done (#354); README has `sandgraal.github.io` 55 times (`grep -c`; the plan recorded 44). The domain name is undecided |

**Needs Docker (cannot be proven in CI as it stands)**

| ID     | What                                                                                                                    | Why                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P15-46 | Move the labs from Debezium 2.7 / Confluent Platform 7.7 / PostgreSQL 15 to Debezium 3.x, then re-run each lab (Size L) | Pages teach 3.x behaviour (`no_data`, exactly-once from 3.3, outbox router); labs run 2.7.4.Final. Confluent 7.7 end of support was 2026-07-26 per the plan |
| P15-37 | Playground images are `node:20-alpine`; move to Node 24 (Size S)                                                        | Needs Docker and coordination with the playground owner                                                                                                     |

**CSS follow-ups (route to `css-refactor`; each moves the production CSS hash)**

| ID             | What                                                                                            | Why                                                                                                                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P15-45         | Layout shift of 0.25 when the async preloaded stylesheet applies (Size M)                       | Measured under Slow 4G plus 4x CPU throttle; the e2e bound (under 0.01) is unthrottled and cannot see it. **#413 (render-blocking stylesheet fix, with a CLS guard e2e) merged after this snapshot and addresses it; the plan box was still unticked at the merge, so re-measure under throttling and close it** |
| P15-15         | Assistant panel: close button is about 22x30 (needs 44x44), focus not returned, short landscape | Found in reviews of #332 and #339                                                                                                                                                                                                                                                                                |
| P15-50         | Dead copy-button CSS (`.copy-snippet`, `.copy-btn`)                                             | Markup removed in #409; hash must be re-baselined                                                                                                                                                                                                                                                                |
| P16-28a        | CSS hook for the 10 heading-level skips (this build shows 11 with the playground published)     | Half of P16-9; the audit's `headings.pagesWithLevelSkips`                                                                                                                                                                                                                                                        |
| P16-8 (nested) | Related-lessons list has no styling                                                             | `.series-nav*` classes have no rules in the shipped stylesheet                                                                                                                                                                                                                                                   |
| P15-35         | Contrast of gradient-clipped headline text is unmeasured (Size S, `scout`)                      | axe cannot score `h1.type-display` and `span.accent`                                                                                                                                                                                                                                                             |

**Content follow-ups**

| ID             | What                                                                                                                                  | Why                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P16-8          | Glossary does not link out to owning lessons; reciprocal links on `/tooling/` and `/compare/`; links to `/privacy/` and `/dashboard/` | The "Related lessons" block shipped in #416; the audit targets are met, the plan's accept list is not |
| P16-9, P16-28b | `<h1>` missing on `/merge-cookbook/` and `/mermaid-sandbox/`                                                                          | `/merge-cookbook/` is on the test's `KNOWN_NO_H1` list                                                |
| P16-26         | Playground labs linked from lessons: redeliver op, sink guard modes, `?try=<id>` deep links (Size L)                                  | Nothing built; the playground cannot demonstrate the site's thesis today                              |
| P16-27         | Playground fixes, slice B: seed rows duplicate `insert` ops; `snapshot-to-stream` describes behaviour that is not modelled            | Documented, not fixed                                                                                 |
| P16-28c        | Re-run the audit scripts after the module batch                                                                                       | Done in this brief for the headline numbers; the plan box is still open                               |

**Performance ratchet and documentation**

| ID                          | What                                                                                           | Why                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| P15-44                      | Raise the `/intro/` Lighthouse floor (0.82 now) to median minus 0.04 and bump the README badge | Needs at least three measured CI runs after #404, not local runs |
| P13-6                       | Parent of P15-44 (fonts and contrast already shipped: #340, #404)                              | Closes with P15-44                                               |
| Phase 5 `/intro/` perf debt | `dom-size` is the only sub-item below 0.9                                                      | 1,035 elements; this brief's runs measured about 1,030           |
| P13-9                       | Refresh `STATE-OF-PROJECT.md`                                                                  | Dated 2026-05-19; this brief links to it and does not edit it    |

**Found while writing this brief, not in the plan**

1. `/playground/` fails axe `color-contrast` in both themes on the live site:
   `#simTabFeed > .simulator__tab-hint`, 2.95:1 (`#adc4f7` on `#2563eb`, 11.5 px).
   CI never sees it because the CI artifact does not include the playground
   (`tests/e2e/accessibility.spec.js` skips pages missing from `_site`).
   Reproduce in section 3. #419 (open) targets this item and item 4.
2. `.lighthouserc.json`, which the plan names (the README does not), does not exist. The
   config is `lighthouse-ci.config.json` (renamed when `@lhci/cli` was
   replaced in #390).
3. `CLAUDE.md` says `main` is "branch-protected"; the API shows a ruleset with
   no required status checks (section 7).
4. README says "No analytics", but GoatCounter has been live since
   2026-10-09. `/privacy/` handles this correctly; the README line is stale.
5. `CLAUDE.md` calls the stack "Vite 7"; `package.json` pins `^8.1.3`.
6. `scripts/smoke.mjs` checks for a CSP in `.htaccess`, but no `.htaccess`
   exists, so that check never runs and no CSP is served (section 8).

### Phase 14 decision register

All nine decisions in the plan's Phase 14 were answered on 2026-10-09; nothing
in the register is unresolved at `eb7f95e`. Recommended default as written in
the plan, and the outcome:

| #   | Decision                          | Recommended default (plan)                      | Outcome                                      |
| --- | --------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| D1  | Repository license                | MIT for code, CC BY 4.0 for written content     | Adopted (P15-1)                              |
| D2  | Newsletter provider               | Buttondown                                      | Adopted; live (P15-9)                        |
| D3  | Author photo                      | Supply a square image of at least 400 px        | Supplied, 400x400 (P15-2)                    |
| D4  | Author identity links             | LinkedIn, talks, podcast when they exist        | LinkedIn only (P15-2)                        |
| D5  | CSS `@layer` migration            | Declare "won't do" until a real specificity bug | Won't do (P15-7)                             |
| D6  | Lighthouse badge in README        | Static badge, bumped when the threshold rises   | Static badge (P15-6); bump pending in P15-44 |
| D7  | Dependabot PR #319                | Re-run checks and merge                         | #319 and #331 merged, #328 closed            |
| D8  | Light-theme accent blue `#0c8dbd` | Darken to pass WCAG AA on white                 | Done, now `#0a7299` (#349)                   |
| D9  | Playground public, undeleted data | 30-day retention plus a "use made-up data" note | Done (#361); live state unverified by me     |

Maintainer choices that are not numbered decisions but shape the next phase:
analytics is GoatCounter (cookie-less); the domain will change but the name is
undecided; the next push is "content depth, SEO/growth and more interactive
demos" (Phase 16); the feedback vote fallback is kept as is.

## 7. Process and quality gates

### How work is done here

- **Conductor and roles** ([`CONDUCTOR.md`](CONDUCTOR.md)): one orchestrating AI
  session plans and integrates; single-purpose roles do the work (`scout`,
  `verifier`, `scribe` on Haiku 5.5; `implementer`, `reviewer`, `css-refactor`
  on Sonnet 5.5). The role that writes never verifies or approves. A unit test
  (`tests/unit/agent-roster.test.js`) pins the roster and model IDs.
- **Merge rules in practice** (a working agreement reported in the conductor's notes, **not in the repo; to be confirmed by the maintainer**): merge a
  PR only after an independent reviewer's points are fixed, CI is green, and a
  test-merge against current `main` passes when other PRs landed meanwhile.
  `CONDUCTOR.md` itself says "stop at the PR; merging is the maintainer's",
  so the two differ. Setting variables or secrets, creating external accounts,
  real-device checks and force-pushes stay with the maintainer.
- **Authorship caveat:** `git shortlog -sn --since=2025-08-24 origin/main` shows `sandgraal` 601, `github-actions[bot]` 224, `copilot-swe-agent[bot]` 202, `Claude` 32, `Christopher Ennis` 30, `dependabot[bot]` 14. Squash
  merges are committed under the maintainer's account, so that count does not
  measure who wrote what.
- **Branch protection:** a repository ruleset named `default` is active on the
  default branch with rules `deletion`, `non_fast_forward`, `code_scanning`,
  `code_quality` and `pull_request`. **No `required_status_checks` rule**:
  a red CI run does not block a merge. The classic branch-protection API
  returns 404 (`gh api repos/sandgraal/letstalkcdc/branches/main/protection`).
  Two merged commits on `main` had red `unit-tests` runs on 2026-10-09 (below).

### Gates before a change merges

```bash
npm run verify-all
```

That is `format:check`, `lint`, `test` (vitest) and `build`. Add
`npm run smoke:core` for routing, passthrough or template changes,
`npm run test:e2e` for browser behaviour, and the CSS hash check below for any
CSS. Definition of Done is in `CONDUCTOR.md`: every acceptance criterion with
quoted evidence, a test that fails without the change, a reviewer's verdict,
the plan checkbox flipped, `CHANGELOG.md` `[Unreleased]` updated.

**Byte-identity CSS check** (the production hash is recorded in `CLAUDE.md` and
`.claude/commands/css-byte-check.md`):

```bash
NODE_ENV=production npm run build:css && shasum -a 256 src/assets/css/styles.min.css
```

**Conventions:** Conventional Commits with a lowercase scope (`fix(ci): ...`);
branches `claude/<short-name>`; one plan item per PR; never `--no-verify`; no
hardcoded `/` in templates (use `| url`); never edit `_site/`, `dist/` or the
generated `styles.min.css`; no `console.log` in shipped code.

### CI flake history (verified in git log, `gh run`, or the workflow files)

| Flake                                                                 | Evidence                                                                                                                                                                   | Status                                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Lighthouse `NO_LCP` on `/overview/`                                   | #396: "loses its LCP (LanternError NO_LCP) in roughly 1 run in 3". My local run hit it 6 times in 15 attempts                                                              | Mitigated: 3 attempts per run, invalid runs never counted, LCP image loaded eagerly. Still happens |
| Lighthouse `NO_FCP` ("did not paint any content")                     | Local macOS run, and **CI on `main`**: run 37898380673 (2026-10-09 07:19 UTC) failed the `lighthouse` job with exit 2 after `/snapshotting/` lost all 3 attempts to NO_FCP | Retries added in #396; whether that CI run predates it is unverified. Not eliminated               |
| PGlite 5 s timeout in unit tests                                      | `backfill-resnapshot-page.test.js` "Test timed out in 5000ms" in `unit-tests` runs on 2026-10-09 (two on `main`, ids 37929470803 and 37929548105, plus a branch run)       | Fixed in #406 (one shared instance, 60 s timeouts)                                                 |
| `unit-tests` failures at 05:36 UTC on `main`                          | Runs 37889394790 and 37889407468 (merges of #373, titles and descriptions, and #381, the vitest 5 upgrade) failed the `unit-tests` job; **I did not retrieve the cause**   | Unknown                                                                                            |
| Chrome download inside `npm ci`                                       | `ci.yml` comment: puppeteer's postinstall fails the step when download providers are unreachable; #388 and `PUPPETEER_SKIP_DOWNLOAD`                                       | Mitigated; **no failing run was retrieved, so frequency is unverified**                            |
| lychee 503 / 504 from `github.com`                                    | #388 (burst of about 45 requests for one URL), #391 (profile and file-history pages answer 504 from runner IPs). lychee does not retry a 5xx                               | Mitigated by `--remap`, `--max-concurrency 8` and `.lycheeignore` entries                          |
| lychee 403 from `dev.mysql.com`, Oracle, LinkedIn, Fivetran community | `.lycheeignore` comments (bots blocked; valid in a browser). **The MySQL host answers 403, not 5xx**                                                                       | Ignored by pattern                                                                                 |
| `seo-audit.test.js` real-build case                                   | Carries an explicit 60 s timeout (added in #410). **That it timed out at 5 s under load is unverified**: no CI log shows it                                                | n/a                                                                                                |
| `layout.spec.js` `/intro/ accumulates no meaningful layout shift`     | Failed once in my full chromium run at `eb7f95e`; passed in an earlier run at `2eb0f29`                                                                                    | See section 3 for the re-run result                                                                |

CI history on `main`, recomputed with `gh run list --workflow=<file> --branch main -L 100`
(the last 100 runs, 2026-08-27 to 2026-10-09): `ci.yml` 93 success / 5 failure /
1 cancelled / 1 in progress (failures, all on 2026-10-09: 1 `lighthouse` job, 4
`unit-tests` runs, as listed above); `deploy.yml` 69 success / 31 cancelled (superseded
pushes, `cancel-in-progress`); `linkcheck.yml` 89 success / 11 failure (all 11
between 02:57 and 06:32 UTC on 2026-10-09, before #388 and #391). Fortify and
CodeQL runs were green but see section 5 on whether Fortify scans.

### Roll back a bad deploy

Every push to `main` deploys (`deploy.yml`); the workflow uses
`cancel-in-progress`, so a newer push cancels an older deploy that has not
finished (31 of the last 100 deploys were cancelled this way). Two ways back:

1. **Revert on `main`** (the normal path; the rules need a PR):

   ```bash
   git revert <bad-sha>
   ```

   Open a PR, merge it, and the deploy runs on the new head.

2. **Redeploy a known-good commit**: Actions > "Deploy site to GitHub Pages" >
   Run workflow, choosing the branch or tag at the good SHA (the workflow has
   `workflow_dispatch`). Untested here; the next push to `main` will deploy
   `main` again and override it.

Check afterwards with `npm run verify:deployment` and the commit shown on the
latest successful deploy run.

### Re-running everything

Use the setup in section 3, then `npm run smoke` (`smoke:core` + `smoke:a11y` +
`smoke:perf`). Lighthouse needs a different build (section 3).

## 8. Risk register

Ranked by my judgement of likelihood times damage for a one-person site.
**Evidence** is what was measured or read; **Opinion** is the ranking and the
mitigation.

| #   | Risk                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                               | Suggested mitigation (opinion)                                                                                                                                                            |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Content correctness drift**                             | Pages teach Debezium 3.x; labs pin 2.7.4.Final and Confluent 7.7.0 (`toolVersions.mjs` `tested`); Debezium 3.7.0.Final released 2026-09-29; seven of eight merge-cookbook dialects never executed; review provenance unrecorded                                                                                                                                        | Sample audit (section 9); P15-46; version-stamp each version-specific claim; a quarterly re-check of `tools`                                                                              |
| 2   | **Single maintainer, AI-authored volume**                 | CODEOWNERS is `* @sandgraal`; git authorship cannot separate human from agent work (section 7); the SME is not identified in the repo                                                                                                                                                                                                                                  | Name a second reviewer; keep review texts (they were lost for #376); publish who reviewed what                                                                                            |
| 3   | **No required CI checks on `main`**                       | Ruleset has no `required_status_checks`; red `unit-tests` runs sit on `main` history on 2026-10-09; `CLAUDE.md` claims protection                                                                                                                                                                                                                                      | Add required checks `build`, `unit-tests`, `lint`, `linkcheck` to the ruleset (maintainer action)                                                                                         |
| 4   | **GitHub Pages: single host, prefix, no headers**         | `curl -I` shows no CSP, no `x-content-type-options`, no `x-frame-options`, `cache-control: max-age=600`; host-root `robots.txt` 404; sitemap lives under `/letstalkcdc/`; `smoke.mjs` CSP check is a no-op without `.htaccess`                                                                                                                                         | Plan the own-domain move (P15-13, `DOMAIN-MIGRATION.md`); put a CDN in front only if headers matter                                                                                       |
| 5   | **Third-party scripts at runtime**                        | `/overview/` transfers 936 KB of Mermaid from jsdelivr (floating `mermaid@11`, no integrity); `/intro/` loads Chart.js (68 KB); `/overview/` is 1.19 MB in Lighthouse                                                                                                                                                                                                  | Vendor and pin the files, or lazy-load behind a click; add SRI                                                                                                                            |
| 6   | **Supabase publishable key in the browser, RLS reliance** | Key is public by design; `anon` holds INSERT on three tables and SELECT on `events` per `schema.sql`; `events` is public and takes visitor-typed data; the schema file is "desired state", never applied by CI, and I could not inspect the live DB                                                                                                                    | Run the section 5 queries and compare grants with `pg_policies`; add a scheduled drift check; keep the made-up-data note                                                                  |
| 7   | **Performance and layout-shift variability**              | Lighthouse floors are `warn` at 0.9 except `/intro/` (`error`, 0.82); `/intro/` scored 0.91 to 0.92; CLS 0.25 under Slow 4G plus 4x CPU (P15-45); NO_LCP flake                                                                                                                                                                                                         | P15-44; verify that #413 closed P15-45 under throttling (it added `tests/e2e/cls.spec.js`)                                                                                                |
| 8   | **Accessibility coverage gaps**                           | `/playground/` fails axe contrast on the live site and CI cannot see it; gradient headline text unmeasured (P15-35); no assistive-technology test is recorded anywhere                                                                                                                                                                                                 | Publish the playground in the CI artifact; real screen-reader pass (section 9)                                                                                                            |
| 9   | **Dependency advisories (dev-only) and Node range**       | `npm audit`: 9 findings (4 moderate, 5 high), `npm audit --omit=dev`: 0; chain is `braces` through `chokidar`/`nunjucks`/`@11ty/eleventy-dev-server`. Playground lockfile: 5 high, 0 with `--omit=dev`. GitHub reports 0 open Dependabot alerts (100 or more fixed). No `dependabot.yml`. `engines` is `^22.22.3 \|\| ^24.15.0 \|\| >=26`; CI and `.nvmrc` use 24 only | Keep `--omit=dev` at 0; add a Node 22 CI job or narrow `engines`                                                                                                                          |
| 10  | **Licensing and provenance of images**                    | Cover art (`src/static/images/cdc-cover.jpg`, the only `og:image`) is AI-generated and the maintainer's own, per the conductor's notes (**to be confirmed by the maintainer**). Its copyright status is legally unsettled. `LICENSE-CONTENT.md` (lines 8 and 31 to 32) already puts `src/static/images/**` under CC BY 4.0, which includes this file                   | Carve the AI-generated cover out of the CC BY claim in `LICENSE-CONTENT.md` (say it is released by the maintainer, with no claim beyond that); decide the same for other generated images |
| 11  | **No measured audience yet**                              | GoatCounter live today; Search Console state unknown; assistant feedback about 1 to 2 rows                                                                                                                                                                                                                                                                             | Wait for data before choosing the next phase's content; section 9                                                                                                                         |
| 12  | **Documentation drift**                                   | Items 2 to 5 under "Found while writing this brief"; `STATE-OF-PROJECT.md` is 5 months old; README "44" versus 55 host occurrences                                                                                                                                                                                                                                     | Land P13-9 and P15-13; make doc facts commands, as this brief does                                                                                                                        |

## 9. Questions for the autopsy, and a two-week schedule

### Questions the autopsy should answer

| #   | Question                                                               | Evidence to use                                                                |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Is the content correct enough to promote? Which pages are not?         | Section 4 sample; executed versus unexecuted SQL; labs run on current versions |
| 2   | Do readers exist, and which pages do they use?                         | GoatCounter, Search Console, feedback rows (all too young today)               |
| 3   | Can everyone use it? (keyboard, screen reader, mobile, reduced motion) | Real assistive-technology pass; the `/playground/` contrast failure            |
| 4   | Is it fast enough on real devices and networks?                        | Lighthouse field data is absent; lab only                                      |
| 5   | Is it findable? Is anything wrongly excluded or duplicated in search?  | Search Console coverage; the audit's headline numbers                          |
| 6   | Is the build and process safe to hand to a second person?              | Section 7 gates, required checks, secrets, who can deploy                      |
| 7   | What should the next phase be: depth, growth, demos, or hardening?     | Answers 1 to 6 plus the maintainer's stated priorities                         |

### Suggested schedule

| Days   | Work                                                                                                                                                                      | Deliverable                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1      | Clone, `npm ci`, reproduce every number in section 3, note differences                                                                                                    | One-page reproduction log with commands and deltas                            |
| 2      | Get access (section 5); read feedback, GoatCounter, Search Console; check the live Supabase grants and cron jobs                                                          | Data-source status table; any drift from `supabase/schema.sql`                |
| 3 to 5 | Content accuracy sample: 12 pages chosen from the section 4 table (suggest at least 2 per claim family), each against the checklist, with a second reviewer               | Per-page verdicts with sources; list of errata candidates                     |
| 6      | Run the unexecuted SQL: at least Snowflake or BigQuery from the merge cookbook, and the T-SQL and MySQL pages                                                             | Executed versus not executed table, updated                                   |
| 7      | Run the labs on Docker (`compose.yaml`, one quickstart) and compare with what the pages claim                                                                             | Lab run log; decision on P15-46 effort                                        |
| 8 to 9 | Accessibility with real assistive technology (VoiceOver plus one other; keyboard only; 200 percent zoom) on `/`, `/intro/`, a module, `/playground/`, the assistant panel | Issues list with severity; checks the P15-15, P15-35 and `/playground/` items |
| 10     | Performance on two real phones and one throttled network; three Lighthouse runs on a quiet machine (P13-5 recipe)                                                         | Numbers table; verdict on P15-44 and P15-45                                   |
| 11     | SEO and discoverability: Search Console indexing report, sitemap status, rich results, social previews                                                                    | Indexed versus 57 sitemap URLs; list of exclusions                            |
| 12     | Audience and feedback: group questions per `content-gap-plan` section 8 if there are 30 or more rows (P16-25)                                                             | Updated section 4 of the gap plan, or a note that the data is too thin        |
| 13     | Roadmap options with effort sizes (S, M, L as the plan uses them) and risks from section 8                                                                                | Three options, each with scope, size, owner, dependencies                     |
| 14     | Readout to the maintainer; collect decisions below                                                                                                                        | Decision log; an updated `IMPLEMENTATION-PLAN.md` Phase 17 draft              |

### Decisions needed from the maintainer before the next phase

1. **Domain:** the name, and when (P15-13). It changes canonicals, the sitemap,
   Search Console and every `sandgraal.github.io` link; do it before building
   search history on the current host.
2. **Search Console:** verify the property and submit the sitemap (P16-12), or
   say it is already done and when.
3. **Merge policy:** whether to keep conductor-merges under the standing grant,
   and whether to add required status checks to the ruleset.
4. **Who reviews content:** name the SME or a second human, and where review
   texts are kept.
5. **Labs on Debezium 3.x (P15-46, Size L):** fund it, or add "check your
   version" notes and leave the labs at 2.7.
6. **Upstream docs issue** on `wal_keep_size` (P15-39): file it or not.
7. **Codacy:** is it in use (P15-52)?
8. **Playground:** is the playground owner available for P16-26 and P16-27, and
   may the contrast failure be fixed under `playground/`?
9. **Third-party scripts:** pin and vendor Mermaid and Chart.js, or accept the
   CDN dependency.
10. **Next phase's theme:** depth, growth, demos or hardening, once the data
    from days 2 and 12 is in.

## 10. Appendix

### Repository map

| Path                                                  | What                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/`                                                | Site source: pages (one directory each), `_data/`, `_includes/`, `assets/`, `static/`, `data/assistant.yml` |
| `src/assets/css/`                                     | CSS; `main.css` is the only shipped entry. Do not edit `styles.min.css`                                     |
| `src/assets/js/`                                      | ES modules bundled by Vite into `dist/`                                                                     |
| `lib/`                                                | Small shared Node modules (path prefix, site host, newsletter and GoatCounter validation, head renderer)    |
| `scripts/`                                            | Smoke tests, SEO audit, Lighthouse runner, deployment verify, playground publisher                          |
| `tests/unit/`, `tests/e2e/`                           | Vitest (jsdom) and Playwright specs                                                                         |
| `playground/`                                         | Separate app: React sources, committed bundles, scenarios, harness, its own CI                              |
| `supabase/`                                           | `schema.sql`: desired state and recorded migrations; not applied by CI                                      |
| `sandbox/`, `compose.yaml`                            | Docker lab for readers (Postgres, MySQL, Kafka, Debezium)                                                   |
| `docs/`                                               | Guides, the plan, audits; `docs/archive/` is historical                                                     |
| `.github/`                                            | Workflows, CODEOWNERS, agent instruction files                                                              |
| `.claude/`                                            | Conductor settings, role definitions, slash commands, hooks                                                 |
| `_site/`, `dist/`, `.lighthouseci/`, `seo-audit.json` | Generated; ignored by git                                                                                   |

### Glossary of repo terms

| Term               | Meaning                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| conductor          | The main AI session: plans, briefs roles, integrates, verifies; has no edit tools                                 |
| roles              | `scout`, `verifier`, `scribe`, `implementer`, `reviewer`, `css-refactor` (`.claude/agents/`)                      |
| byte-identity      | Proof that a CSS change did not alter the production bundle: same sha256 of `styles.min.css`                      |
| `viteAsset`        | Eleventy filter mapping a source path to the hashed Vite output through `dist/.vite/manifest.json`                |
| `\| url`           | Nunjucks filter that adds the path prefix; hardcoding `/` breaks GitHub Pages                                     |
| path prefix        | `/letstalkcdc/` in production; `/` for the Lighthouse build (`build:lhci`)                                        |
| redirect stub      | Legacy `*.html` page that meta-refreshes to the directory URL; 26 of them                                         |
| errata callout     | Per-page correction notice driven by `src/_data/errata.mjs`                                                       |
| `tools` / `tested` | Latest stable versus what the labs pin, in `toolVersions.mjs`                                                     |
| Phase 13 to 16     | Plan phases: 13 maintenance queue, 14 decision register, 15 maintainer-directed work, 16 growth and content depth |
| log position       | LSN, SCN or GTID: the ordering key the site teaches                                                               |

### Agent worktrees and logs

Isolated agents work in git worktrees under `.claude/worktrees/` (ignored by
git, see `.gitignore`). On 2026-10-09 the maintainer's checkout had 77
directories there using about 25 GB, and `git worktree list` showed 93
registered worktrees, none marked prunable. They are disposable once their
branch is merged or pushed; remove with `git worktree remove <path>`, then
`git worktree prune`. Scratch output lives in the session's temporary
directory, not in the repo. There is no handoff log: cross-session context is
`IMPLEMENTATION-PLAN.md`, `CHANGELOG.md` `[Unreleased]` and `git log`.
