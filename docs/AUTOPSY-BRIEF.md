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

## 4. Content accuracy audit guide

The content is the product. Everything else on this list exists to protect it.

### What was reviewed, and by whom

- Plan items say pages were "SME-reviewed" or that "SME re-reviews approved"
  them (for example P15-22, P16-15 to P16-24). **The repo does not record who
  or what the SME is**, and the review texts were not kept: P15-48 records that
  the review text of #376 "is not retrievable (`gh pr view 376` returns no
  review or comment bodies)". Treat review provenance as **unverified**.
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

| Source                 | State on 2026-10-09                                                                                                                                                                                                                                                          | What you need from the maintainer                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| GitHub Pages deploy    | Live at `https://sandgraal.github.io/letstalkcdc/`, `build_type: workflow`, HTTPS enforced, no custom domain. Latest deploy of `eb7f95e` succeeded 14:16 UTC                                                                                                                 | Repo read (public) for runs; admin for settings and variables                     |
| Repository variables   | Set: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `BUTTONDOWN_USERNAME`, `GOATCOUNTER_CODE`. **Not set:** `ELEVENTY_PATH_PREFIX`, `SITE_HOST` (production uses the code fallbacks, which equal today's host; the build warns)                                                 | Admin on the repo to view or change variables                                     |
| Repository secrets     | `gh secret list` returned nothing for the maintainer's own token. So the Fortify scan, which needs `FOD_*`/`SSC_*` secrets, probably does not scan (**unverified**)                                                                                                          | Admin, to confirm                                                                 |
| GoatCounter            | Script `gc.zgo.at/count.js` is on the live home page. Variable updated 2026-10-09 13:24 UTC, so **data starts today** and a week's numbers will mean little for weeks. Cookie-less; honours Do Not Track                                                                     | A GoatCounter login (or a read-only share link) for the site code                 |
| Search Console         | Verification file `googleeb5f2ebb27afc761.html` returns HTTP 200 live. **Whether the property is verified and the sitemap submitted is unknown** (P16-12 is open)                                                                                                            | Owner or full user on the property; the sitemap URL is `/letstalkcdc/sitemap.xml` |
| Buttondown newsletter  | Live: `/newsletter/` returns 200 and posts to the `letstalkcdc` username; the live sitemap lists it. Subscriber count unknown                                                                                                                                                | A Buttondown login (read-only if offered)                                         |
| Supabase               | Project shared with the playground; variables above are baked into the build. Maintainer's notes record the first real vote reaching `assistant_feedback` on 2026-10-09. **I could not read any table**: the browser key cannot SELECT, and no database access was available | Supabase dashboard role that can run SQL (read-only is enough)                    |
| Feedback volume        | The content-gap plan records "roughly 1 to 2 rows" on 2026-10-09 (maintainer's report). Re-run trigger: **at least 30 rows** (P16-25)                                                                                                                                        | Run the query below                                                               |
| Host-root `robots.txt` | `https://sandgraal.github.io/robots.txt` returns 404 (checked); the file the site ships is at `/letstalkcdc/robots.txt`, which crawlers do not treat as the site's robots file                                                                                               | Nothing; sitemap submission replaces it. Fixed properly only by an own domain     |
| Third-party at runtime | Mermaid and Chart.js load from `cdn.jsdelivr.net` (`mermaid@11` is a floating major; no integrity hash)                                                                                                                                                                      | n/a                                                                               |

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

| ID             | What                                                                                            | Why                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P15-45         | Layout shift of 0.25 when the async preloaded stylesheet applies (Size M)                       | Measured under Slow 4G plus 4x CPU throttle; the e2e bound (under 0.01) is unthrottled and cannot see it |
| P15-15         | Assistant panel: close button is about 22x30 (needs 44x44), focus not returned, short landscape | Found in reviews of #332 and #339                                                                        |
| P15-50         | Dead copy-button CSS (`.copy-snippet`, `.copy-btn`)                                             | Markup removed in #409; hash must be re-baselined                                                        |
| P16-28a        | CSS hook for the 10 heading-level skips (this build shows 11 with the playground published)     | Half of P16-9; the audit's `headings.pagesWithLevelSkips`                                                |
| P16-8 (nested) | Related-lessons list has no styling                                                             | `.series-nav*` classes have no rules in the shipped stylesheet                                           |
| P15-35         | Contrast of gradient-clipped headline text is unmeasured (Size S, `scout`)                      | axe cannot score `h1.type-display` and `span.accent`                                                     |

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
   Reproduce in section 3.
2. `.lighthouserc.json`, which the plan and README name, does not exist. The
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
