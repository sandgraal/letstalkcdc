# State of the project — 2026-10-11

> Update 2026-10-13: the TL;DR bullets and the rows marked (2026-10-13) in
> Measured were re-run on `origin/main` after the fold; the per-file guard
> test counts and the rest are not re-measured and keep their 2026-10-11 values.

A dated snapshot, written after the handoff kit (Phase 17) merged. Every number
below came from a command run on 2026-10-11 in a worktree of `main` at
**`05f7e7d`** (`05f7e7de0bf99f333c46fef1a38d0bae0ab78454`, "docs(agents): team
charter, technical-editor and growth-writer roles, weekly digest skill (P17-6)",
#447); the command is next to each number. GitHub timestamps and merge dates
are UTC, so a merge the maintainer saw on 2026-10-11 local time can read
2026-10-12 here. Anything not re-measured is marked
**unknown** or points at the previous snapshot below, which stays as it was. The
running checklist is [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md).

## TL;DR

- The handoff kit is on `main`: 12 commits since the previous snapshot's
  `bd5a2a4` (`git log --oneline bd5a2a4..origin/main | wc -l`). Phase 17 items
  P17-1, P17-2, P17-4, P17-5, P17-6, P17-7, P17-8 and P17-9 are shipped.
- 37 modules (`series.mjs`), 4,323 unit tests in 90 files, all passing (2026-10-13).
- 2 PRs are open, both Dependabot (#438, #442; 2026-10-13). The team has none open;
  the post-merge sweep (P17-59) shipped in the sweep PR.
- The `default` ruleset has required status checks since 2026-10-13 (seven
  checks, "up to date" off; see the ruleset rows below).
- The maintainer answered the three charter questions on 2026-10-11; see
  [`DECISIONS.md`](DECISIONS.md).

## Measured

| What                             | Value                                                                                                        | Command                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Unit tests                       | 4,323 passed, 90 files, 77 s (2026-10-13)                                                                    | `npm test -- --testTimeout=120000`                                                  |
| Modules                          | 37 (2026-10-13)                                                                                              | `node -e 'import("./src/_data/series.mjs").then(m=>console.log(m.default.length))'` |
| HTML files in `_site/`           | 90 (2026-10-13)                                                                                              | `npm run build`, then `find _site -name '*.html' \|                                 |
| Sitemap entries (local build)    | 59 (2026-10-13)                                                                                              | `grep -c '<loc>' _site/sitemap.xml`                                                 |
| Open plan boxes on `main`        | not re-measured                                                                                              | `git show origin/main:docs/IMPLEMENTATION-PLAN.md \|                                |
| Open plan boxes with this sweep  | 46 open, 181 ticked (2026-10-13, after the fold)                                                             | `grep -c '^ *- \[ \]' docs/IMPLEMENTATION-PLAN.md`; `grep -c '^ *- \[x\]' ...`      |
| Guard and gate tests, by file    | `guard-bash` 961, `guard-edit` 103, `merge-pr` 326                                                           | `npx vitest run tests/unit/<file> --reporter=verbose`, counting test lines          |
| Thesis lint, roster, docs, prune | `thesis-lint` 276, `agent-roster` 27, `doc-facts` 27, `worktree-prune` 13                                    | same command                                                                        |
| Merged since the last snapshot   | #428, #429, #430, #431, #432, #443, #444, #445, #446, #447, #448, #449                                       | `gh pr list --state merged -L 15`                                                   |
| Open PRs                         | 2: #438, #442, both Dependabot (2026-10-13)                                                                  | `gh pr list --state open`                                                           |
| Ruleset `default` rules          | `deletion, non_fast_forward, code_scanning, code_quality, pull_request, required_status_checks` (2026-10-13) | `gh api repos/sandgraal/letstalkcdc/rulesets/16512225 --jq '[.rules[].type]'`       |
| Required status checks           | Seven: build, lint, unit-tests, e2e-tests, a11y-tests, smoke-tests, security-audit; strict off (2026-10-13)  | same command; no `required_status_checks` rule                                      |

## CI state of `main`

`gh run list --branch main -L 8` and
`gh run list --workflow=ci.yml --branch main -L 3`, read at the time of writing:

- `ci.yml` for `05f7e7d` and `0cab634` was still **in progress**; their final
  result is **unknown** at the time of writing. Check with
  `gh run list --workflow=ci.yml --branch main -L 5`.
- `ci.yml` for `fc9ebad`, `54c4647` and `48d8834` completed with success.
- For `05f7e7d`: Fortify, Link check, Deploy and CodeQL completed with success.
  The Deploy run for `0cab634` shows cancelled, which is a newer push replacing
  it, not a failure.

## Phase 17 status

| Item                                                   | State                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P17-1 charter and guard hooks                          | Shipped (#446). Residual hardening is P17-55 and P17-56, not started                                                                          |
| P17-2 merge script                                     | Shipped (#445)                                                                                                                                |
| P17-3 required status checks                           | Not started; maintainer task 2 in [`MAINTAINER-TASKS.md`](MAINTAINER-TASKS.md)                                                                |
| P17-4, P17-5, P17-8 lean `CLAUDE.md`, decisions, guide | Shipped (#432 with #443; #430; #431)                                                                                                          |
| P17-6 team charter, two roles, digest skill            | Shipped (#447)                                                                                                                                |
| P17-7 thesis lint                                      | Shipped (#444). Follow-ups P17-52 and P17-53 not started                                                                                      |
| P17-9 Phase 17 in the plan                             | Shipped (#448)                                                                                                                                |
| P17-10 cold-start drill                                | Open: three runs passed 12 of 12 (five contradictions each); fixes in #449 and the sweep PR; closes after a confirmation drill on real `main` |
| P17-59 post-merge sweep                                | Shipped in the sweep PR; drill runs 1 to 3 recorded in `docs/COLD-START-DRILL.md`                                                             |

## Decisions recorded 2026-10-11

In [`DECISIONS.md`](DECISIONS.md): no stronger model for now (the
`sme-reviewer` role stays disabled); a public contact address; a
vendor-disclosure policy (the wording is pending the maintainer's approval, and
no vendor-comparison content until it is published); the team merges as much as
it confidently can through the gate and asks in the chat otherwise;
content review (the maintainer reads the pages the weekly digest flags, plus
one outside practitioner for the new CDC modules); and the first two weeks
(autopsy part A with the no-regret track, readout after 2026-11-06). Still
pending: the domain name (due 2026-10-23) and approval of the disclosure
wording.

## Not re-measured today

Unknown or unchanged from the previous snapshot unless stated: Playwright
counts, playground unit and e2e counts, Lighthouse values, `npm audit`
results, the live sitemap count, Supabase row counts, GoatCounter and Search
Console data, and the production CSS hash (the current value is in
`.claude/css-baseline.sha256`; check with `npm run check:css-baseline`). The
`git diff --stat bd5a2a4..origin/main -- src` prints nothing, so no site
content, template or CSS source changed since the previous snapshot (two
playground documentation files did). The sections below are the 2026-10-09
snapshot, kept as it was.

---

# Previous snapshot (historical): 2026-10-09

> **Addendum 2026-10-11:** (a) the production CSS baseline hash now lives in
> `.claude/css-baseline.sha256` (check with `npm run check:css-baseline`), not
> in `CLAUDE.md`; (b) open plan boxes: do not trust the counts below, run
> `grep -c '^ *- \[ \]' docs/IMPLEMENTATION-PLAN.md` (63 when #448 lands,
> because Phase 17 adds the handoff-kit and autopsy items); (c) Phase 17
> (handoff kit, autopsy, next-phase menu) and the open PRs #444-#448 are not
> reflected below; (d) a new snapshot should be written once those merge (plan
> item P17-59).

A dated snapshot of Let's Talk CDC, written for someone who has not seen it
before. Every number below came from a command run on 2026-10-09 against
`main` at **`bd5a2a4`** (`bd5a2a4b2068ca6214966d9e4ccb1df4dbc7bde9`, "feat(playground):
destination-guard labs, redeliver op, ?try= links (P16-26)", #427). The
command is next to each number so you can re-run it.

This supersedes the 2026-05-19 snapshot (274 tests, 21 modules), which stays
reachable in Git history. The running checklist is
[`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md); this is its dashboard.
The deeper evidence kit (full measurements, content-accuracy guide, risk
register, two-week schedule) is [`AUTOPSY-BRIEF.md`](AUTOPSY-BRIEF.md): this
page does not repeat it.

## TL;DR

- 36 lessons ("modules"), 56 pages in the sitemap (57 live), a glossary of 32
  terms, and a separate playground app at `/playground/`.
- 108 PRs merged on 2026-10-09 alone. The PR queue is empty (`gh pr list`).
- 1,727 unit tests in 58 files pass locally. The CI run for `bd5a2a4`
  (run 37968897711) finished successfully. This is as of `bd5a2a4`; newer
  commits are not reflected.
- 8 plan boxes are open, each in exactly one bucket: two need Docker
  (P15-37, P15-46); three need a maintainer action or decision (P15-13,
  P15-39, P15-52); two wait for data (P16-12, P16-25); one is the
  `/intro/` performance box.
- Newsletter (Buttondown) and visit counts (GoatCounter) went live today.
  Search Console is verified and the sitemap is submitted (maintainer's report).
- No audience data exists yet. Do not choose the next phase's content from
  guesses; see "What is open".

## What the site is

An educational static site that teaches change data capture to engineers who
run pipelines. Eleventy 3.1 + Vite 8 + PostCSS, deployed to GitHub Pages at
<https://sandgraal.github.io/letstalkcdc/>. Every page is pre-rendered HTML;
JavaScript is progressive enhancement. There is no backend in production
except one optional Supabase project (assistant votes, and the playground).

The thesis every page is held to: delivery is at-least-once; correctness
lives in an idempotent sink ordered by source log position (LSN, SCN, GTID),
not by `ts_ms`; end-to-end exactly-once across independent systems is not
claimed. Code is MIT, written content CC BY 4.0 (`LICENSE-CONTENT.md`).

| Count                         |       Value | Command                                                                             |
| ----------------------------- | ----------: | ----------------------------------------------------------------------------------- |
| Modules (`series.mjs`)        |          36 | `node -e 'import("./src/_data/series.mjs").then(m=>console.log(m.default.length))'` |
| ...by level                   | 6 / 15 / 15 | same file, `skillLevel`: Beginner / Intermediate / Advanced                         |
| HTML files in `_site/`        |          87 | `find _site -name '*.html' \| wc -l` after `npm run build`                          |
| Sitemap entries (local build) |          56 | `grep -c '<loc>' _site/sitemap.xml`                                                 |
| Sitemap entries (live)        |          57 | `curl -s .../letstalkcdc/sitemap.xml \| grep -c '<loc>'`; adds `/newsletter/`       |
| Glossary entries              |          32 | `src/_data/glossary.mjs`                                                            |
| Errata entries                |           5 | `src/_data/errata.mjs`                                                              |
| Assistant intents             |          45 | `grep -c '^  - id:' src/data/assistant.yml`                                         |
| Playground scenarios (shared) |          14 | `import("./playground/assets/shared-scenarios.js")` then `.default.length`          |

The 87 HTML files are 59 content pages, 26 legacy redirect stubs, the 404 and
the Search Console verification file (`googleeb5f2ebb27afc761.html`), which
`npm run audit:seo` does not count (it reports 86); the split is in
`inventory.*`.

## Tests

| Suite                      | Result                                                               | Command                                            |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| Site unit tests (vitest 5) | 1,727 passed, 58 files, 12 s                                         | `npm test`                                         |
| Site e2e (Playwright)      | 1,104 listed over 3 browsers; 368 on chromium, which is what CI runs | `npx playwright test --list`; `--project=chromium` |
| Playground unit            | 229 passed, 28 files                                                 | `npm --prefix playground run test:unit`            |
| Playground simulation      | property tests over 24 generated scenarios                           | `npm --prefix playground run test:sim`             |
| Playground e2e             | 21 tests in 6 files                                                  | `npm --prefix playground run test:e2e -- --list`   |

Several unit tests read the docs and the plan (module counts in the README,
plan structure, agent roster), so editing those files can fail `npm test`.
The e2e count includes the layout-shift guard `tests/e2e/cls.spec.js`.

## CI and gates

Run on every push to and PR into `main` unless noted
(`ls .github/workflows`).

| Workflow                           | Jobs and what they gate                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`                           | `build`; `lint` (ESLint + Prettier); `unit-tests`; `security-audit` (`npm audit --production`); `smoke-tests` (`npm run smoke`); `a11y-tests` (pa11y-ci); `e2e-tests` (chromium); `lighthouse` (`build:lhci` + `npm run lighthouse`) |
| `deploy.yml`                       | Push to `main` and manual. Builds with the repository variables, runs `scripts/publish-playground.sh`, deploys to Pages                                                                                                              |
| `linkcheck.yml`                    | lychee over the built HTML, site URLs remapped to the checkout                                                                                                                                                                       |
| `fortify.yml`                      | Fortify scan on push, PR and Fridays 20:34 UTC. Needs secrets that may not be set (unverified)                                                                                                                                       |
| `playground-preflight.yml`         | Playground build, bundle check, scenario lint, simulation, e2e, harness. Only for `playground/**` changes                                                                                                                            |
| `playground-generated-bundles.yml` | Committed playground bundles match a fresh build (same paths)                                                                                                                                                                        |
| `playground-harness-nightly.yml`   | Harness smoke, daily 07:00 UTC                                                                                                                                                                                                       |
| CodeQL                             | GitHub default setup (settings, no file)                                                                                                                                                                                             |

**A red check does not block a merge.** The `default` ruleset
(`gh api repos/sandgraal/letstalkcdc/rulesets/16512225`) has the rules
`deletion, non_fast_forward, code_scanning, code_quality, pull_request` and no
required status checks. Merging after green CI is a working agreement, not a
mechanism.

Local minimum bar: `npm run verify-all` (format, lint, tests, build); add
`npm run smoke:core` for routing or templates. Size budgets: `npm run smoke:perf`.

## Performance floors and measured values

Floors live in `lighthouse-ci.config.json`: every category 0.9 at `warn` on
five URLs (`/`, `/intro/`, `/overview/`, `/quickstarts/`, `/snapshotting/`);
`/intro/` has **`error` floors of performance 0.84 and accessibility 0.93**
(performance ratcheted from 0.82 on 2026-10-09, P15-44). The runner takes the
best of 3 valid runs and retries `NO_LCP` / `NO_FCP` runs.

| Measured                                        | Value                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/intro/` performance, 10 CI jobs after #413    | best-of-3 per job 0.86 to 0.92, median 0.88 (30 runs: min 0.78, median 0.88, max 0.92)                                                                        |
| `/intro/` layout shift, Slow 4G + 4x CPU        | 0.33 before #413, 0 after; guard `tests/e2e/cls.spec.js` fails above 0.1                                                                                      |
| `/intro/` DOM size                              | 1,040 elements (3 local runs). Lighthouse 13.5 `dom-size-insight` scores 1; the older 12.6 `dom-size` audit scored 0.5 on the same page                       |
| Local run on this commit (median of valid runs) | performance `/` 0.96, `/intro/` 0.91, `/overview/` 0.95, `/quickstarts/` 0.95, `/snapshotting/` 0.93; accessibility 0.96 to 1.00; best-practices and SEO 1.00 |
| Gate result of that run                         | 22 assertions over 5 URLs: 0 errors, 0 warnings; valid runs `/` 2 of 3, `/overview/` 1 of 3, `/quickstarts/` 2 of 3 (`NO_FCP` / `NO_LCP`)                     |

Lab numbers vary by machine. There is no field (real-user) data.
Re-measure: `npm run build:lhci && npm run lighthouse`.

## Production CSS baseline

`c5806349294d3bc295a07c93054684a70545d291216916e45cef1c154017f944`, as of
2026-10-09 (the current value is in `.claude/css-baseline.sha256`, see the
addendum at the top); reproduced on this commit:

```bash
NODE_ENV=production npm run build:css && shasum -a 256 src/assets/css/styles.min.css
```

## Dependencies

| Check                                      | Result                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `npm audit --omit=dev` (root)              | 0 vulnerabilities                                                                 |
| `npm audit` (root, whole tree)             | 9 (4 moderate, 5 high): 2 distinct advisories, dev tooling only                   |
| `npm --prefix playground audit --omit=dev` | 0 vulnerabilities                                                                 |
| Open Dependabot alerts                     | 0 (`gh api "repos/sandgraal/letstalkcdc/dependabot/alerts?state=open" -q length`) |

The 9 root findings are `braces` (via `chokidar` 3 in Eleventy's dev server
and `nunjucks`) and `sprintf-js` (via `gray-matter`, `js-yaml`, `argparse`).
Both come in through `@11ty/eleventy` 3.1.x, have no fixed release, and never
reach the production build. Accepted in P15-19; revisit when Eleventy or
`gray-matter` move. `engines.node` is `^22.22.3 || ^24.15.0 || >=26`; CI uses 24.

## Deploy, hosting and services

- **Hosting:** GitHub Pages, deployed by `deploy.yml` on every push to `main`.
  Latest deploy of `bd5a2a4` succeeded. No custom domain; HTTPS enforced. The
  maintainer plans to move to an own domain (name not chosen): see
  [`DOMAIN-MIGRATION.md`](DOMAIN-MIGRATION.md) and P15-13.
- **Repository variables** (`gh variable list`, names only): `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`, `BUTTONDOWN_USERNAME`, `GOATCOUNTER_CODE`.
  `SITE_HOST` and `ELEVENTY_PATH_PREFIX` are not set; production uses the code
  fallbacks, which equal today's host.
- **GoatCounter:** live since 2026-10-09 (the home page loads one
  `gc.zgo.at/count.js`). Cookie-less, honours Do Not Track, disclosed on
  `/privacy/`. Counting started today.
- **Newsletter:** live since 2026-10-09 through Buttondown (username
  `letstalkcdc`). `/newsletter/` answers 200 and is in the sitemap. The
  maintainer signed up through the live form successfully.
- **Search Console:** the verification file answers 200 live; the maintainer
  reports the property verified and the sitemap submitted. Google first showed
  "Sitemap could not be read", which was transient: the live `sitemap.xml` is
  valid. The first 28-day snapshot is due 2026-11-06 (P16-12).
- **Headers:** GitHub Pages sends no CSP, `x-content-type-options` or
  `x-frame-options`, and the host-root `robots.txt` is 404. An own domain with
  a CDN is the fix, not a repository change.

## Playground

A separate React/Vite app in `playground/` (own `package.json`), merged on
2026-10-09 and published under `/playground/` by `publish-playground.sh`. Its
built bundles are committed. Features that matter for the thesis:

- **Redeliver op:** re-sends a delivered change with its original log position.
- **Destination guard modes:** none, `ts_ms`, log position, with optional
  delete markers on the log lane.
- **Three labs:** `replay-guard`, `ts-vs-position`, `delete-then-late-update`,
  linked from `/which-row-wins/`, `/deletes-stay-deleted/` and
  `/is-cdc-exactly-once/`.
- **`?try=<scenario-id>` deep links** that load a scenario.

Not done: the other lessons in the inventory are not linked, and the proposed
`append` guard mode was not built
([`playground-demos-inventory-2026-10.md`](playground-demos-inventory-2026-10.md)).

## Supabase

One project, shared by the site and the playground. Tables:
`assistant_feedback` (site; insert-only for the browser key; 12-month
retention; 2 rows on 2026-10-09 per the project notes, not re-queried here),
`events` and `scenarios` (playground; 30-day retention via daily `pg_cron`
jobs). The file `supabase/schema.sql` is desired state and CI never applies it,
so compare it with the live database before relying on it. Queries to read the
data are in [`AUTOPSY-BRIEF.md`](AUTOPSY-BRIEF.md) section 5.

## What is open

9 unticked boxes (`grep -c '^ *- \[ \]' docs/IMPLEMENTATION-PLAN.md`); 148
ticked. All nine decisions in Phase 14 are answered.

| ID                            | One line                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/intro/` perf debt (Phase 5) | Every sub-item is met except the `dom-size` line, which no PR has brought under a threshold (#293 and others trimmed it partially, 965 to 917 elements; #404, #413 and #420 did not touch it; now 1,040 against 1,035 in P13-5; scores 1 under Lighthouse 13.5). Trim, or the maintainer accepts and ticks |
| P15-13                        | One place for the host: code and runbook done; README still has `sandgraal.github.io` on 55 lines (71 occurrences); kept open for the own-domain move                                                                                                                                                      |
| P15-37                        | Playground Docker images are `node:20-alpine`; move to Node 24. Needs Docker                                                                                                                                                                                                                               |
| P15-39                        | Debezium docs say `wal_keep_size` caps a slot; PostgreSQL says `max_slot_wal_keep_size` does. Draft: [`upstream-issue-wal-keep-size.md`](upstream-issue-wal-keep-size.md); the maintainer files it                                                                                                         |
| P15-46                        | Labs run Debezium 2.7 / Confluent 7.7 / PostgreSQL 15 while pages teach 3.x. Needs Docker                                                                                                                                                                                                                  |
| P15-52                        | Confirm in the Codacy dashboard that nothing runs `.codacy/cli.sh`, then delete it                                                                                                                                                                                                                         |
| P16-12                        | SEO baseline: Lighthouse on the 10 key pages, and the 28-day snapshot due 2026-11-06                                                                                                                                                                                                                       |
| P16-25                        | Re-run the content-gap plan once `assistant_feedback` has 30 rows (2 now) and Search Console has data                                                                                                                                                                                                      |

**Maintainer action or decision:** P15-13 (the domain name), P15-39 (file the
issue), P15-52 (Codacy dashboard).
**Waiting for data:** P16-12 (28-day snapshot, due 2026-11-06) and P16-25
(30 feedback rows, Search Console data).
**Docker-only, left for the autopsy team:** P15-37 and P15-46; the
maintainer has no Docker and neither can be proven without it.
**Performance:** the `/intro/` box.

## Known flakes

All from CI history and logs; details and run ids in
[`AUTOPSY-BRIEF.md`](AUTOPSY-BRIEF.md) section 7.

- Lighthouse `NO_LCP` on `/overview/` and `NO_FCP` anywhere: mitigated by
  retries and best-of-3 (#396), not eliminated. Local macOS runs hit it
  often.
- `layout.spec.js` "`/intro/` accumulates no meaningful layout shift" failed
  once in a loaded full run and passed alone; cause unverified.
- lychee 5xx/403 from some external hosts: mitigated by remaps, concurrency
  limits and `.lycheeignore`.
- No CI failure in the last 40 runs across branches (`gh run list --workflow=ci.yml -L 40`).

## Re-measure everything

```bash
git fetch origin && git log --oneline bd5a2a4..origin/main   # what changed since this page
npm ci && npm run verify-all                                  # format, lint, tests, build
npm run smoke:core                                            # routing and page smoke
npm run audit:seo                                             # inventory, headings, links, JSON-LD
gh pr list --state open                                       # queue
grep -c '^ *- \[ \]' docs/IMPLEMENTATION-PLAN.md              # open boxes (9 here)
```

When the numbers drift, write a new dated snapshot instead of editing this
one in place.
