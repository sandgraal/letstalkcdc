# SEO baseline audit — 2026-10 (P16-1)

Scope: the built site (`_site/`, built from `origin/main` at `f462635` with
`npm ci --ignore-scripts && npm run build`, default host
`https://sandgraal.github.io` and prefix `/letstalkcdc/`), plus the repo
sources that generate it. **There is no traffic, ranking or Search Console
data**; analytics are not installed yet. Nothing below is a claim about how
the site ranks. Every number comes from one of the scripts listed under
"Evidence and scripts"; the keyword targets in section 3 are **inferences**
from titles, H1s and ledes.

## 1. Summary (top 10, ranked by impact x ease)

| Rank | ID   | Finding                                                                                                                                                                                                                   | Size | Domain-dependent |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------- |
| 1    | F-01 | 45 of 47 content pages have no Open Graph or Twitter card tags at all; only `/` and `/intro/` do, with one shared image and no image dimensions or alt                                                                    | S    | no               |
| 2    | F-02 | `robots.txt` is shipped at `/letstalkcdc/robots.txt`, which crawlers do not read on a project site, and its `Sitemap:` line names `letstalkcdc.github.io`, not the real host                                              | S    | yes              |
| 3    | F-03 | All 46 sitemap `<lastmod>` values are identical (the build date), while page JSON-LD carries four distinct `dateModified` dates                                                                                           | S    | no               |
| 4    | F-04 | The sitemap lists `/dashboard/` (67 words, per-user state) and `/mermaid-sandbox/` (89 words, no `<h1>`, no `<main>`, no robots meta, no inbound links)                                                                   | S    | no               |
| 5    | F-05 | 4 pages (`/schema-evolution/`, `/strategy/`, `/tooling/`, `/use-cases/`) reuse the site-wide default description; the home page begins with it                                                                            | S    | no               |
| 6    | F-06 | `/partitioning/` title is 109 characters and repeats the brand twice; 14 of 47 titles exceed 60 characters; 8 descriptions exceed 160                                                                                     | S    | no               |
| 7    | F-07 | Internal links: the glossary has 1 content link into it (from `/`) and none out; 26 of 47 pages are absent from the header and footer; five cloud labs, four quickstarts and `/oracle-notes/` have exactly 1 inbound link | M    | no               |
| 8    | F-08 | Structured data: no `image` on any of the 30 Article blocks, BreadcrumbList on 3 of 47 pages, 15 pages with no JSON-LD, three pages carry two article-type blocks                                                         | M    | no               |
| 9    | F-09 | 21 of 30 Article pages were last committed to more than 30 days after their stated `dateModified` (upper bound, see F-12)                                                                                                 | S    | no               |
| 10   | F-10 | Heading structure: 2 pages with no `<h1>` (`/merge-cookbook/`, `/mermaid-sandbox/`), 10 pages that skip levels (for example h2 to h4)                                                                                     | S    | no               |

Things that are in good shape (so nobody re-checks them): no missing titles,
no duplicate titles, no missing descriptions, 46 of 47
canonicals are absolute and self-referencing, no redirect stub appears in the
sitemap, all 26 stubs canonical to a target that exists, 0 images without an
`alt` attribute, 0 JSON-LD parse failures, 0 generic "click here" link texts,
feed items all absolute and resolving. The `/intro/` Lighthouse SEO category
scored 1.00 in nine runs (P13-5) but that is one page and a coarse check.

### Surprising

- The in-repo `src/static/robots.txt` is **dead weight today**: it is served
  from `/letstalkcdc/robots.txt`, and a spot check (ad hoc `curl`,
  2026-10-08) of the host root `https://sandgraal.github.io/robots.txt`
  returned GitHub's "Site not found" HTML page. Crawlers would read the host
  root, not our file, so the sitemap is not advertised by `robots.txt` at all
  (F-02). The `letstalkcdc.github.io` host in the `Sitemap:` line is reported
  by the conductor to 404; I did not request that host. A fix is already in
  PR #354.
- `gh variable list` (ad hoc, 2026-10-08) shows no `SITE_HOST` or
  `ELEVENTY_PATH_PREFIX` repository variable, so production relies on the
  `site.mjs` fallbacks. They currently equal the real host, so output is
  correct, but a build warning is emitted and the moment the domain changes
  nothing will notice (relates to P15-13).
- `/playground/` is not in `_site/` after `npm run build`; it is copied in
  by `scripts/publish-playground.sh` during deploy. That is why 45 internal
  link checks against `_site/` fail (F-14). It is also **absent from the
  sitemap** and its source `playground/index.html` has no meta description,
  canonical or robots tag (F-13).

## 2. Findings table

Script tags in brackets refer to the table under "Evidence and scripts".
"Domain" = would change or need redoing if the site moves to its own domain.

| ID   | Area               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                    | Why it matters                                                                                                                                                                                                                      | Proposed fix                                                                                                                                                                                     | Size | Domain |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------ |
| F-01 | Social / OG        | [02] `og:*` and `twitter:*` keys appear on 2 of 47 pages (`/`, `/intro/`, set in each page's `head_extra`); 45 pages have no `og:title`/`og:image`. One distinct `og:image` value (`/images/cdc-cover.jpg`); 0 pages declare `og:image:width`/`og:image:alt`. `base.njk` emits no OG tags.                                                                                                                                  | A shared lesson link renders as a bare URL or whatever the platform scrapes. Social previews were not checked (see section 6).                                                                                                      | Emit OG/Twitter in `base.njk` from `title`, `description`, `canonical`, default cover; pages may override `ogImage`. Add width, height, alt.                                                     | S    | no     |
| F-02 | robots.txt         | [03] `robots.txt` Sitemap line is `https://letstalkcdc.github.io/sitemap.xml`; the real sitemap is `https://sandgraal.github.io/letstalkcdc/sitemap.xml`. File lives at `_site/robots.txt` = `/letstalkcdc/robots.txt`. Ad hoc `curl` of the host root returned "Site not found".                                                                                                                                           | Search engines read `/robots.txt` at the host root only. On a project site we do not control it, so the sitemap must be submitted in Search Console. Fixed in PR #354 (line).                                                       | Verify #354; submit the sitemap in Search Console (maintainer step). On an own domain, serve `robots.txt` from the root with a host derived from `SITE_HOST`.                                    | S    | yes    |
| F-03 | Sitemap            | [03] 46 `<url>` entries, 46 identical `lastmod` (`2026-10-09`, build time); `sitemap.11ty.cjs` uses `item.date`, no page sets `date:` front matter. [03]/[04] JSON-LD `dateModified` has 4 distinct dates (2026-02-06, 2026-05-13, 2026-08-25, 2026-08-27) on 30 pages. No `changefreq`/`priority` (fine).                                                                                                                  | A `lastmod` that is the same on every URL carries no information and is typically ignored by crawlers (general knowledge, not verified today).                                                                                      | Use `dateModified` (fallback `datePublished`) for `lastmod`; omit it when unknown.                                                                                                               | S    | no     |
| F-04 | Sitemap hygiene    | [03] sitemap includes `/dashboard/` and `/mermaid-sandbox/`. [02] `/dashboard/` = 67 words; `/mermaid-sandbox/` = 89 words, 0 `<h1>`, no `<main>`, no robots meta, title "Mermaid Sandbox" with no brand, 0 inbound links; only `scripts/smoke.mjs` and an e2e test reference it. `/styleguide/` is `noindex` and correctly absent.                                                                                         | Thin, non-content pages dilute the sitemap and can be indexed.                                                                                                                                                                      | Add `noindex` to both and exclude from the sitemap (the generator already honours `eleventyExcludeFromSitemap` and a `noindex` tag).                                                             | S    | no     |
| F-05 | Descriptions       | [02] 0 missing; 1 duplicate group: `/schema-evolution/`, `/strategy/`, `/tooling/`, `/use-cases/` share the site default ("Learn why Change Data Capture (CDC) projects fail..."). The home description begins with the same sentence. 3 are under 70 characters (`/dashboard/` 60, `/errata/` 53, `/styleguide/` 69).                                                                                                      | The snippet for four core lessons says nothing about the lesson.                                                                                                                                                                    | Write four specific descriptions (120-155 characters). Add a test that no two pages share a description.                                                                                         | S    | no     |
| F-06 | Titles             | [02] 14 of 47 titles > 60 characters, 6 > 70; max 109 (`/partitioning/`: "... \| CDC: The Missing Manual \| CDC: The Missing Manual", brand typed into front matter and appended again). 44 of 47 end with the brand suffix; exceptions `/` (own `seoTitle`), `/mermaid-sandbox/`, `/styleguide/`. 0 duplicate titles. 8 descriptions > 160 (max 186: `/case-study/`, `/compare/`).                                         | Long titles and descriptions are truncated in results. The doubled brand is a plain bug.                                                                                                                                            | Fix `/partitioning/`. Cap page titles near 50 before the suffix; shorten `/methodology/`, `/lab-kafka-debezium/`, `/connector-builder/`. Trim the 8 long descriptions to 160.                    | S    | no     |
| F-07 | Internal links     | [03] 1683 internal link edges. Content links (outside global header/footer) into `/glossary/`: 1 (from `/`), none to a term anchor; [07] 12 glossary terms are used on 5 or more pages. 26 of 47 pages are not linked from the header or footer. 10 pages have exactly 1 inbound, plus `/glossary/` with 1 content inbound (list in section 4). `/overview/` has 26 content inbound links, the next highest has 10.         | Authority and discoverability concentrate on one hub; deep lessons depend on it. The glossary is not feeding the lessons.                                                                                                           | Add a related-lessons block (from `series.mjs`), link first use of glossary terms, add section 4 opportunities. Link quickstart and cloud-lab pages from the lessons they support.               | M    | no     |
| F-08 | Structured data    | [04] 39 JSON-LD blocks on 47 pages, 0 parse failures. Types: Article 30, TechArticle 3, BreadcrumbList 3, WebSite 1, FAQPage 1, ItemList 1. 15 pages have none (list in section 4). Article: required fields present on 30 of 30; `image` missing on 30 of 30. `/exactly-once/`, `/intro/`, `/multi-tenancy/` carry Article and TechArticle (`/multi-tenancy/` headlines differ). Visible breadcrumb on 1 page (`/intro/`). | Missing `image` is a recommended Article property. Duplicate article types are noise. Google restricts FAQ rich results to a few site types (general knowledge, not verified today) so do not expect value from the single FAQPage. | Add `image` (cover) to Article. Generate BreadcrumbList for all module pages. Merge Article and TechArticle into one. Add Article or equivalent to the 15 uncovered content pages where it fits. | M    | no     |
| F-09 | Freshness          | [05] Article `dateModified` vs the last commit touching `src/<slug>/`: 21 of 30 differ by more than 30 days (max 202 days for `/event-envelope/`, `/snapshotting/`). 20 pages still say `2026-02-06`. [04] feed `pubDate` = `dateModified`, so the feed's newest item is dated 2026-08-27.                                                                                                                                  | Visible "updated" dates that lag real edits understate freshness. A commit can be a non-content change, so this is an upper bound.                                                                                                  | Editorial pass: bump `dateModified` on pages with substantive edits; add a rule to CONTRIBUTING.                                                                                                 | S    | no     |
| F-10 | Headings           | [02] 12 of 47 pages have an issue: `<h1>` count 0 on `/merge-cookbook/` and `/mermaid-sandbox/`; level skips on `/cloud-labs/aws-dms/`, `/cloud-labs/fivetran/`, `/cloud-labs/goldengate/`, `/cloud-labs/matillion-cdc/`, `/cloud-labs/snowflake-cdc/`, `/dashboard/`, `/exactly-once/`, `/lab-kafka-debezium/`, `/partitioning/`, `/use-cases/` (h1 to h3 or h2 to h4).                                                    | The page title is not a heading on `/merge-cookbook/`; skips weaken outline for assistive tech and snippet extraction.                                                                                                              | Add an `<h1>` to `/merge-cookbook/`; demote or promote the skipped levels. (Heading markup is HTML, not CSS, but check for style coupling first.)                                                | S    | no     |
| F-11 | Title vs H1        | [02] many pages have an H1 that differs from the pre-suffix title (the script lists them; many are intentional). Examples: `/exactly-once/` title "Exactly-Once Semantics" vs H1 "Exactly-Once Processing, For Real"; `/tooling/` "CDC Tooling Comparison" vs "The Modern CDC Toolkit"; `/schema-evolution/` title "Schema Evolution" has no "CDC".                                                                         | Mismatch is not an error, but titles like "Schema Evolution" do not say what domain they are about.                                                                                                                                 | Fold the practitioner's phrase into titles (section 3); keep the H1 as the editorial voice.                                                                                                      | S    | no     |
| F-12 | Redirect stubs     | [02] 26 stubs (21 top-level `.html` files, 4 under `/quickstart/`, and `/from-change-capture-to-ci/index.html`). 26 of 26: canonical equals the target and the target exists. None in the sitemap. 1 stub (`from-change-capture-to-ci`) combines `noindex` with a canonical to `/strategy/`. 404 page is `noindex`, generic description.                                                                                    | The stubs are fine. The combination of `noindex` and canonical on one stub sends mixed signals (low impact).                                                                                                                        | Optional: drop `noindex` on that stub. Keep the others.                                                                                                                                          | S    | no     |
| F-13 | Playground         | Ad hoc `rg`/read of `playground/index.html` (not in `_site`): title "Lets Talk CDC - Change Feed Playground" (no apostrophe, different brand form), no meta description, no canonical, no robots, no OG. Not in the sitemap (built outside Eleventy).                                                                                                                                                                       | The most distinctive interactive asset is the least described page.                                                                                                                                                                 | Coordinate with the playground owner (P16-3 says so) before touching `playground/`; add head tags and a sitemap entry via `eleventy.config.mjs`.                                                 | S    | no     |
| F-14 | Link integrity     | [03] 45 internal links fail against `_site/`; the 40 printed all target `/letstalkcdc/playground/` (published at deploy). I did not inspect the other 5. 2 fragment targets are missing: `/cloud-labs/snowflake-cdc/` -> `#setup` and `/mermaid-sandbox/` -> `#main`. 0 generic link texts, 0 empty links, 0 non-TLS external links.                                                                                        | Mostly a false alarm from build-time scope; the two fragments are real.                                                                                                                                                             | Fix `#setup`. Run `smoke:core` against the assembled site including `/playground/`.                                                                                                              | S    | no     |
| F-15 | Feed               | [04] 30 items = 30 series pages = the `feedLimit` of 30 in `feed.11ty.cjs`; 4 items with no description; channel `<link>` has no trailing slash; all item links absolute and resolve to real pages; autodiscovery `<link>` on 45 of 47 pages.                                                                                                                                                                               | The next module pushes the oldest page out of the feed.                                                                                                                                                                             | Raise `feedLimit`, fill the 4 descriptions.                                                                                                                                                      | S    | no     |
| F-16 | Host single source | [03] canonical, `og:url`, feed, sitemap and JSON-LD all derive from `site.host`; only `robots.txt`, `scripts/deployment-verify.mjs`, `src/feed.11ty.cjs` comment and docs hardcode a host (ad hoc `rg`). No `SITE_HOST` repository variable (ad hoc `gh variable list`).                                                                                                                                                    | Domain move is mostly a variable change plus `robots.txt` and the deploy verifier. Covered by P15-13.                                                                                                                               | Do not duplicate; cross-reference P15-13.                                                                                                                                                        | M    | yes    |
| F-17 | Performance basics | From `docs/IMPLEMENTATION-PLAN.md` P13-5 (not re-run): `/intro/` only, median of 9: performance 0.97 (0.88 to 0.97), LCP 2.43 s, CLS 0.0025, TBT 31 ms, 351 KiB over 32 requests, DOM size 1,035 elements (audit 0.5). Other pages unmeasured.                                                                                                                                                                              | Only one page has Core Web Vitals evidence; field data needs real users.                                                                                                                                                            | Measure the other 9 key pages with the same recipe before claiming anything; GoatCounter/Search Console CWV report later.                                                                        | S    | no     |
| F-18 | Images             | [02] 82 `<img>`, 0 missing `alt`, 75 intentionally empty (45 logo, 30 author photo), 7 with text (6 diagram images, 1 YouTube thumbnail).                                                                                                                                                                                                                                                                                   | Not a gap: the site is text and inline widgets, so there is little image search surface.                                                                                                                                            | None now. Revisit if diagrams are added as exportable assets.                                                                                                                                    | S    | no     |

## 3. On-page review of the 10 key pages (targets are inferences)

Source: [06] and [03]. "Content in/out" counts distinct pages linking in or
out of the page from outside the global header and footer, including the
prev/next series navigation.

| Page               | Inferred target phrase                                   | Title / H1 / description observation                                                                                                                                      | Words / H2 | Content in / out | Missing links (mentions in body)                                                                                                                            | Thin or FAQ notes                                                                                                                                            |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                | "change data capture", "why CDC pipelines fail"          | Title 62 chars ("CDC: The Missing Manual \| A Deep Dive into Change Data Capture"); H1 "Why Change Data Capture Still Breaks, and How To Get It Right."; description 143. | 705 / 4    | 2 / 7            | No body link to `/exactly-once/`, `/snapshotting/`, `/event-envelope/`, `/compare/`, `/use-cases/` (matrix in [06]).                                        | H2 "What is Change Data Capture (CDC)?" is already question-form.                                                                                            |
| `/intro/`          | "what is CDC", "log-based vs trigger vs query-based CDC" | Title "Interactive Introduction to CDC"; description 103 (generic).                                                                                                       | 2668 / 12  | 6 / 14           | No link to `/compare/` (5 mentions).                                                                                                                        | 4 sections under 40 words ("Outcome" 20, "Who it's for" 28, "See a change become an event" 36, "Visualize the trade-offs" 27). 6 quiz questions as headings. |
| `/exactly-once/`   | "exactly-once CDC", "duplicates at-least-once"           | Title "Exactly-Once Semantics"; H1 "Exactly-Once Processing, For Real"; description 137 mentions the outbox.                                                              | 1543 / 3   | 7 / 3            | `/ops-offsets/` (10), `/merge-cookbook/` (7), `/event-envelope/` (3 on the other side). Only 3 outbound: `/snapshotting/`, `/overview/`, `/multi-tenancy/`. | Only 3 H2 and 13 H4 (h2 to h4 skip). Six question-form headings come from the quiz.                                                                          |
| `/snapshotting/`   | "CDC initial snapshot", "backfill"                       | Title "Snapshotting (Initial Load)"; description 110.                                                                                                                     | 2598 / 15  | 5 / 3            | `/merge-cookbook/` (9), `/ops-offsets/` (6), `/partitioning/` (3), `/observability/` (3).                                                                   | "Observability: what to track" is 31 words. "backfill" is used on 12 pages and is not a glossary term.                                                       |
| `/event-envelope/` | "Debezium event format", "before/after image"            | Title 62 chars "Event Envelope & Delivery Guarantees"; H1 "Design the Event Envelope".                                                                                    | 1990 / 13  | 5 / 6            | `/partitioning/` (7), `/merge-cookbook/` (4), `/exactly-once/` (3), `/connector-builder/` (3).                                                              | "Envelope readiness tracker" 13 words; "Further resources" 24 words.                                                                                         |
| `/compare/`        | "Debezium vs Fivetran vs DMS", "CDC tools comparison"    | Title "Compare CDC Platforms"; description **186 chars** (truncates).                                                                                                     | 924 / 4    | **0** / 4        | Reachable only from the nav; no lesson links to it.                                                                                                         | Overlaps `/tooling/` in intent (see below).                                                                                                                  |
| `/tooling/`        | "CDC tools", "Debezium alternatives"                     | Title "CDC Tooling Comparison"; H1 "The Modern CDC Toolkit"; **description is the site default**.                                                                         | 1709 / 6   | 8 / 3            | Does not link `/compare/` (3 mentions); outbound is `/strategy/`, `/overview/`, `/case-study/` only.                                                        | Two pages, `/tooling/` and `/compare/`, both answer "compare CDC tools": candidates to differentiate or consolidate.                                         |
| `/quickstarts/`    | "Debezium Postgres quickstart"                           | Title "CDC Quickstart Guides"; description 90.                                                                                                                            | 319 / 7    | 7 / 7            | The four child pages have 1 inbound each and do not link `/snapshotting/` (3 to 5 mentions each).                                                           | Hub is thin by design: 6 of 7 H2 sections under 40 words. Children are 270 to 451 words with no JSON-LD.                                                     |
| `/glossary/`       | "CDC glossary", "what is LSN / tombstone"                | Title 79 chars; description 156.                                                                                                                                          | 1013 / 3   | 1 / **0**        | Mentions of `/snapshotting/` (8), `/exactly-once/` (7), `/partitioning/` (5) are not links. 14 terms only.                                                  | No JSON-LD. Terms used on many pages but undefined: see section 5.                                                                                           |
| `/use-cases/`      | "CDC use cases"                                          | Title "CDC Use Cases & Applications"; H1 "CDC in the Wild"; **description is the site default**.                                                                          | 1753 / 8   | 4 / 4            | `/merge-cookbook/` (7); no link to `/tooling/` or `/compare/`.                                                                                              | Heading order is broken (h3 "Use Case 1" appears before the first h2). Six question-form quiz headings.                                                      |

Practitioner phrasing is an editorial judgement: queries such as "debezium
duplicate events", "postgres replication slot growing" or "cdc initial load
without locking" are the likely shape of real questions, but **I did not
verify any of this with search data**.

## 4. Orphans and link opportunities (script [03], [06])

### Orphans and near-orphans

| Class                                                          | Pages                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero inbound links from any page                               | `/mermaid-sandbox/`, `/styleguide/` (the latter is `noindex`)                                                                                                                                                                                                                                                                                                             |
| Linked only from the global header or footer (no content link) | `/compare/`, `/dashboard/`, `/methodology/`                                                                                                                                                                                                                                                                                                                               |
| Exactly 1 inbound link                                         | `/cloud-labs/aws-dms/`, `/cloud-labs/fivetran/`, `/cloud-labs/goldengate/`, `/cloud-labs/matillion-cdc/`, `/cloud-labs/snowflake-cdc/`, `/oracle-notes/`, `/quickstarts/quickstart-mssql/`, `/quickstarts/quickstart-mysql/`, `/quickstarts/quickstart-oracle/`, `/quickstarts/quickstart-postgres/`                                                                      |
| Exactly 2 content inbound                                      | `/` (from `/intro/`, `/styleguide/`), `/merge-cookbook/`, `/tests/`, `/troubleshooting/`                                                                                                                                                                                                                                                                                  |
| Not linked from the header or footer (26 of 47)                | the five cloud labs, `/case-study/`, `/event-envelope/`, `/materialization/`, `/merge-cookbook/`, `/multi-tenancy/`, `/non-relational/`, `/observability/`, `/ops-offsets/`, `/oracle-notes/`, `/partitioning/`, the four quickstarts, `/reconciliation-surgery/`, `/security/`, `/snapshotting/`, `/strategy/`, `/troubleshooting/failure-drills/`, plus the two orphans |

Click depth from home: using all links, 1 page at depth 0, 21 at depth 1, 22
at depth 2, 1 at depth 3 (`/oracle-notes/`), 2 unreachable (the orphans).
Using content links only: 7 at depth 1, 27 at depth 2, 7 at depth 3, 5
unreachable. The core lessons are two clicks away through `/overview/`.

Pages with no JSON-LD (15): `/cloud-labs/`, `/dashboard/`, `/glossary/`,
`/merge-cookbook/`, `/mermaid-sandbox/`, `/methodology/`, `/oracle-notes/`,
the four quickstart pages, `/styleguide/`, `/troubleshooting/failure-drills/`,
`/troubleshooting/`, `/versions/` ([04]).

### Link opportunities

Heuristic: a page mentions a topic phrase at least 3 times in body text and
has no content link to the topic page. [06] found 65. They are candidates for
an editor to accept or reject; phrase matching is crude. Top by mention count:

| From                               | Consider linking     | Mentions |
| ---------------------------------- | -------------------- | -------- |
| `/troubleshooting/failure-drills/` | `/dlq-triage/`       | 25       |
| `/troubleshooting/failure-drills/` | `/snapshotting/`     | 16       |
| `/oracle-notes/`                   | `/snapshotting/`     | 12       |
| `/troubleshooting/`                | `/snapshotting/`     | 12       |
| `/cloud-labs/fivetran/`            | `/schema-evolution/` | 11       |
| `/cloud-labs/snowflake-cdc/`       | `/partitioning/`     | 11       |
| `/cloud-labs/snowflake-cdc/`       | `/ops-offsets/`      | 11       |
| `/troubleshooting/failure-drills/` | `/schema-evolution/` | 10       |
| `/exactly-once/`                   | `/ops-offsets/`      | 10       |
| `/materialization/`                | `/merge-cookbook/`   | 10       |
| `/reconciliation-surgery/`         | `/snapshotting/`     | 9        |
| `/snapshotting/`                   | `/merge-cookbook/`   | 9        |
| `/glossary/`                       | `/snapshotting/`     | 8        |
| `/glossary/`                       | `/exactly-once/`     | 7        |
| `/event-envelope/`                 | `/partitioning/`     | 7        |
| `/exactly-once/`                   | `/merge-cookbook/`   | 7        |
| `/use-cases/`                      | `/merge-cookbook/`   | 7        |
| `/observability/`                  | `/dlq-triage/`       | 7        |

One-way links among the key pages ([06]): `/` to `/tooling/`, `/quickstarts/`
and `/glossary/`; `/intro/` to `/snapshotting/`, `/tooling/`, `/exactly-once/`;
`/compare/` to `/exactly-once/` and `/tooling/`. Nothing links back.

## 5. Candidate content gaps (hypotheses, not data)

**Caveats before reading this list.** (a) The 136 "unanswered" queries in the
conductor's `unans.txt` were authored by an agent to probe the assistant
matcher (`queries.mjs`, `q2.mjs`); they are **not visitor queries**. Against
the current `src/data/assistant.yml` (23 intents, 229 triggers) [07] confirmed
0 of the 136 are answered in any of 29 module contexts. (b) Search volume,
competition and intent are **not verified**. (c) The assistant's
`assistant_feedback` table has no reviewed data yet.

### What the repo itself signals [07]

- Of 43 content pages, 19 are the link target of no assistant intent, among
  them `/dlq-triage/`, `/merge-cookbook/`, `/connector-builder/`,
  `/debezium-decoder/`, `/troubleshooting/failure-drills/`, `/versions/`, the
  cloud labs and `/oracle-notes/`.
- Themes among the 136 synthetic unanswered queries (counts are my
  keyword-bucket assignment): CDC explainers 29, site-meta/navigation 17,
  lag and freshness 14, use cases and examples 10, schema change 9, read
  model/compaction 9, vendor specifics 9, DLQ/reconciliation 9,
  scaling/keys 8, troubleshooting symptoms 7, offsets/LSN 6, backfill 5,
  multi-tenant 4.
- The glossary has 14 entries. Terms used on 5 or more pages and not defined
  there: upsert (29 pages), Kafka Connect (18), dedup (18), slot (13),
  backfill (12), at-least-once (12), replication slot (10), schema registry
  (10), `ts_ms` (10), outbox (9), SMT (9), watermark (6), GTID (6), Avro (6),
  SCD (6), out-of-order (6), heartbeat (5), LogMiner (5), REPLICA IDENTITY
  (5), supplemental logging (5), consumer group (5), Kinesis (5).
- Pages mentioning each candidate topic at all [07]: Iceberg/Delta/Hudi/
  lakehouse 1 page (`/use-cases/`); Flink/Spark 1 (`/materialization/`);
  integration or contract testing 3; backfill 12; GDPR/erasure 4; data
  contracts 4; SMTs 2; Debezium Server/embedded engine 1; search sync
  (Elasticsearch/OpenSearch) 1.

### Editorial suggestions (hypotheses, each needs a thesis check)

All must hold the site thesis: at-least-once delivery, idempotent sinks
keyed on the primary key, ordering by log position (never `ts_ms`), no
cross-system exactly-once.

1. CDC into lakehouse table formats (Iceberg, Delta, Hudi) — merge-on-read,
   compaction, small files. Site coverage today: 1 page.
2. Testing CDC pipelines — contract tests on the envelope, replay tests,
   idempotency tests. Site coverage: 3 pages mention testing.
3. Backfills and re-snapshots as a first-class topic (12 pages use the word,
   no page owns it).
4. GDPR deletes and the change log that outlives the row (extends
   `/security/`, 4 pages mention it).
5. Schema and data contracts (4 pages mention them, none owns the topic).
6. Cost modelling for self-hosted vs managed CDC (the word "cost" appears on
   20 pages; no model).
7. Replication slots and WAL growth as a stand-alone troubleshooting page
   (11 pages touch it; "slot" is not a glossary term).
8. Search-index sync (CDC to Elasticsearch/OpenSearch): a use case with one
   page of coverage.
9. Debezium Server and the embedded engine as non-Kafka paths (1 page).

## 6. What I could not verify

- **Traffic, rankings, impressions, click-through rates, query data.**
  Analytics are not installed (GoatCounter planned); Search Console is not
  connected. No search volumes or competitor positions are quoted because I
  have none from a verifiable source.
- **Real crawl and indexing behaviour.** I do not know which of the 46 sitemap
  URLs are indexed, whether Google ever fetched `sitemap.xml`, or how the
  26 meta-refresh stubs are treated. The site has not been tested in the URL
  Inspection tool.
- **Social previews.** I read the tags; I did not render a preview in
  LinkedIn, Slack or X, and no validator was run.
- **Live site vs build.** The script `08-live.mjs` (spot checks of the live
  deployment) was written but **not run**, on the conductor's instruction to
  stop collecting data. The only live facts here are two ad hoc requests on
  2026-10-08: the live `sitemap.xml` returned HTTP 200, and the host-root
  `robots.txt` returned GitHub's "Site not found" page. Whether production
  equals this local build was not compared.
- **The `letstalkcdc.github.io` host.** Reported by the conductor to 404; I
  did not request it.
- **Core Web Vitals.** Only `/intro/` was measured (P13-5), mobile preset in
  a lab, not field data. I did not re-run Lighthouse.
- **Google's current rules** (FAQ rich results, `lastmod` handling, how
  `noindex` combines with canonical) are from general knowledge, not
  verified today.
- **Whether GitHub redirects the `github.io/letstalkcdc` URLs to a custom
  domain** once one is configured. Treat as an open question for
  P15-13's `docs/DOMAIN-MIGRATION.md`.
- 5 of the 45 failing internal links were not printed (the script prints the
  first 40); the 40 seen all point to `/letstalkcdc/playground/`.
- An ad hoc inspection (output not saved) showed the `ItemList` on
  `/overview/` listing 4 modules while the feed lists 30; treat that as an
  observation to re-check.

## 7. Proposed Phase 16 backlog (for approval)

Numbering continues after P16-1 (this audit), P16-2 (content plan) and P16-3
(demos). Format follows the plan.

- [ ] **P16-4 · Site-wide Open Graph and Twitter cards.** Outcome: every
      indexable page produces a usable link preview. Accept: `base.njk` emits
      `og:type`, `og:url`, `og:title`, `og:description`, `og:image` (with
      width, height, alt) and `twitter:card` for all indexable pages, derived
      from front matter and `site.host`, with an `ogImage` override; the
      `head_extra` copies on `/` and `/intro/` are removed; a test asserts no
      indexable page lacks `og:image` and that `og:url` equals the canonical.
      Verify: `npm test`, `npm run build`, a re-run of the audit script [02]
      showing 47 of 47 pages with `og:image`. Size: S. Role: `implementer`,
      `reviewer`.
- [ ] **P16-5 · Sitemap and robots hygiene.** Outcome: crawlers get an
      honest sitemap. Accept: `lastmod` comes from `dateModified` (fallback
      `datePublished`, else omitted); `/dashboard/` and `/mermaid-sandbox/`
      carry `noindex` and leave the sitemap; `/styleguide/` stays out; the
      `robots.txt` `Sitemap:` line is correct once PR #354 lands (verify, do
      not duplicate); a unit test asserts no stub, no `noindex` page and no
      page without a `<title>` appears in the sitemap. **Maintainer step:**
      submit the sitemap in Search Console. Verify: `npm test`, sitemap
      script [03] shows more than one distinct `lastmod` and 44 entries.
      Size: S. Role: `implementer`, `reviewer`. Depends on domain: yes for
      the robots host (re-check after P15-13).
- [ ] **P16-6 · Titles and descriptions pass.** Outcome: snippets say what
      each lesson is. Accept: `/partitioning/` title has one brand suffix;
      `/schema-evolution/`, `/strategy/`, `/tooling/` and `/use-cases/` have
      their own descriptions of 120 to 155 characters; the 8 descriptions
      over 160 are shortened; titles over 60 characters are listed with an
      explicit decision per page (shorten or keep); a test fails on duplicate
      descriptions, descriptions over 160 and a doubled brand. Verify: script
      [02] reports 0 duplicate descriptions, 0 over 160, 0 doubled brands.
      Size: S. Role: `scribe` (copy), `implementer` (test), `reviewer`.
- [ ] **P16-7 · Structured data completion.** Outcome: one coherent set of
      JSON-LD on every content page. Accept: Article gets `image`;
      `BreadcrumbList` (Series Overview > page) on every module page, with a
      visible breadcrumb matching it; Article and TechArticle merged into one
      block on the three pages that have both; `/overview/` `ItemList`
      generated from `series.mjs` rather than hand-listed; the 15 pages with
      no JSON-LD are classified (add Article, or record why not). Verify:
      script [04] reports `image` missing on 0 Articles, BreadcrumbList on
      every module page, 0 parse failures; `/css-byte-check` is untouched
      unless the visible breadcrumb needs CSS, in which case route to
      `css-refactor`. Size: M. Role: `implementer`, `css-refactor`
      (breadcrumb only), `reviewer`.
- [ ] **P16-8 · Internal link repair.** Outcome: no lesson depends on a
      single link, and the glossary feeds the lessons. Accept: a
      "Related lessons" block on each module page, driven by data; the
      accepted subset of the 65 opportunities in section 4 linked in prose;
      every cloud lab and quickstart page linked from at least 3 pages;
      `/compare/` and `/methodology/` linked from at least one lesson;
      first use of glossary terms linked to `/glossary/#slug` on `/intro/`,
      `/snapshotting/`, `/exactly-once/` and `/event-envelope/`; `/glossary/`
      links out to the owning lesson. Verify: script [03] shows 0 pages with
      fewer than 3 content inbound links except the two non-content pages,
      and 0 broken fragments. Size: M. Role: `scout` (confirm each
      opportunity reads naturally), `implementer`, `reviewer`.
- [ ] **P16-9 · Heading and fragment fixes.** Outcome: every content page has
      one `<h1>` and no skipped levels. Accept: `/merge-cookbook/` has an
      `<h1>`; the 10 pages with skips are corrected; the `#setup` link on
      `/cloud-labs/snowflake-cdc/` resolves; a test asserts one `<h1>` and
      no skip on every indexable page. Verify: script [02] reports 0 pages
      with a heading issue (or only the non-indexed sandbox). Size: S. Role:
      `implementer`, `reviewer`.
- [ ] **P16-10 · Honest modification dates and a fuller feed.** Outcome:
      "updated" dates reflect real edits and the feed does not drop modules.
      Accept: the 21 pages in script [05] are reviewed and `dateModified`
      bumped where the edit was substantive; the 4 feed items without a
      description are fixed; `feedLimit` is raised above the series count;
      CONTRIBUTING states when to bump `dateModified`. Verify: script [05]
      count of pages more than 30 days stale is below 5 or each remaining one
      is explained; script [04] shows 0 items without description. Size: S.
      Role: `scribe`, `reviewer`.
- [ ] **P16-11 · SEO head for the playground.** Outcome: `/playground/` is a
      described, canonical, listed page. Accept: coordinated with the
      playground owner first; `playground/index.html` gets a description,
      canonical (built from `SITE_HOST`) and the brand spelling used on the
      main site; the sitemap includes `/playground/`. Verify: a post-deploy
      check of the live page; `npm run smoke:core`. Size: S. Role:
      `implementer`. Depends on domain: yes (canonical host).
- [ ] **P16-12 · Baseline measurement.** Outcome: from now on SEO claims are
      measured. Accept: GoatCounter installed per the plan; Search Console
      property verified and the sitemap submitted; Lighthouse run for the 10
      key pages with the P13-5 recipe and recorded; a dated first snapshot of
      impressions, clicks and indexed-page count written into this plan after
      28 days. **Maintainer step** for the accounts. Size: S. Role: `scout`
      (Lighthouse), maintainer. Depends on domain: yes (re-verify after a
      move).
- [ ] **P16-13 · Differentiate `/tooling/` and `/compare/`.** Outcome: two
      pages with two jobs. Accept: a one-paragraph decision (consolidate,
      or re-scope: `/compare/` = decision matrix, `/tooling/` = tool
      profiles), titles and descriptions that say so, reciprocal content
      links. Verify: script [06] matrix shows both directions. Size: S.
      Role: `scribe`, `reviewer`.
- [ ] **P16-14 · Glossary expansion from usage.** Outcome: the glossary
      defines the words the lessons use. Accept: at least the 10 most-used
      missing terms from section 5 (upsert, Kafka Connect, dedup, replication
      slot, backfill, at-least-once, schema registry, outbox, SMT, watermark)
      are added with anchors and `related`, each linked from at least two
      lessons; definitions obey the thesis. Verify: script [07] reports those
      terms as defined and the content-link count into `/glossary/` is above 20. Size: M. Role: `scribe`, `reviewer`.

Not proposed as items: the 26 redirect stubs (working, and F-12 is low
impact), alt text (F-18), and a vendor-neutral domain move (P15-13 owns it).

## 8. Evidence and scripts

All in `/private/tmp/claude-501/-Volumes-Samsung-T9-Websites-letstalkcdc/2025f79f-eafc-4d20-8c82-28c41c731fdd/scratchpad/seo/`.
Build: `npm run build` exited 0 (77 files written, 109 copied by Eleventy;
`_site/` holds 74 HTML files: 47 content pages, 26 redirect stubs, 1 404).

| Tag  | Script / output                                          | What it produced                                                                                     |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [01] | `01-crawl.mjs` -> `pages.json`                           | Parses every `_site/**/*.html` (title, meta, canonical, headings, JSON-LD, images, links, ids)       |
| [02] | `02-technical.mjs` -> `02-technical.out.txt`             | Inventory, stubs, 404, robots meta, titles, descriptions, canonicals, headings, images, OG/Twitter   |
| [03] | `03-sitemap-links.mjs` -> `03-sitemap-links.out.txt`     | Sitemap vs pages, robots.txt, link integrity, inbound counts, orphans, click depth, link text        |
| [04] | `04-jsonld-feed.mjs` -> `04-jsonld-feed.out.txt`         | JSON-LD inventory and Article validation, RSS feed health                                            |
| [05] | `05-freshness-breadcrumbs.mjs` -> `05-freshness.out.txt` | `dateModified` vs last git commit, visible breadcrumbs, double article types                         |
| [06] | `06-onpage.mjs` -> `06-onpage.out.txt`, `opps.json`      | Key-page dumps, thin sections, 65 link opportunities, reciprocity matrix                             |
| [07] | `07-content-gap.mjs` -> `07-content-gap.out.txt`         | Assistant KB coverage, unanswered queries re-run against the current KB, glossary and topic presence |
| [08] | `08-live.mjs`                                            | **Written, not run** (see section 6)                                                                 |

Method notes: "content link" means an `<a>` outside `.global-header` and
`.site-footer`. The first pass classified `nav`/`header` inside `<main>` as
site chrome and undercounted content links; [01], [03] and [06] were re-run
with the corrected rule and the numbers above are from the re-run. A few
facts are from one-off commands with no saved script output and are labelled
"ad hoc" where used: the `curl` checks, `gh variable list`, `rg` for hardcoded
hosts, and reading `playground/index.html`.
