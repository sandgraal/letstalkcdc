# SEO baseline, after the Phase 16 work (P16-12)

Measured 2026-10-09 with `scripts/seo-audit.mjs` (`npm run audit:seo`), the
maintained version of the scripts behind [`seo-audit-2026-10.md`](seo-audit-2026-10.md).

- **After** = the built site (`_site/`) from `origin/main` at `a6bb3c6`,
  built as production would be:
  `ELEVENTY_PATH_PREFIX=/letstalkcdc SITE_HOST=https://sandgraal.github.io npm run build`
  (85 HTML files: 58 content pages, 26 redirect stubs, 1 404).
- **Before** = the audit's own commit `f462635`, rebuilt the same way (74 HTML
  files: 47 content pages, 26 stubs, 1 404; Eleventy reported "Copied 109
  Wrote 77 files", the same counts the original audit recorded) and run
  through the same script. The "before" column is therefore a re-measurement,
  not a copy of the old report, and section 2 says where the two disagree.

Scope is the **built HTML only**. There is still no traffic, ranking, indexing
or Search Console data and nothing here is a claim about how the site ranks.
Nothing was fixed in this change: it reports.

## 1. Headline

| Measure (content pages unless noted)            | Before (`f462635`) | After (`a6bb3c6`) | Delta    |
| ----------------------------------------------- | -----------------: | ----------------: | -------- |
| Content pages                                   |                 47 |                58 | +11      |
| Titles over 60 / over 70 characters             |             14 / 6 |             2 / 0 | -12 / -6 |
| Longest title                                   |                109 |                65 | -44      |
| Descriptions over 160 characters                |                  8 |                 0 | -8       |
| Duplicate description groups                    |                  1 |                 0 | -1       |
| Pages without `og:image` or a Twitter card      |                 45 |                 2 | -43      |
| Distinct `og:image` values                      |                  1 |                 1 | 0        |
| Articles without `image` in JSON-LD             |            30 / 30 |            0 / 50 | -30      |
| Pages with `BreadcrumbList`                     |                  3 |                39 | +36      |
| Pages with no JSON-LD                           |                 15 |                 6 | -9       |
| Sitemap entries / distinct `lastmod` values     |             46 / 1 |            55 / 8 | +9 / +7  |
| Feed items / items without description          |             30 / 4 |            39 / 0 | +9 / -4  |
| Broken fragment targets                         |                  2 |                 0 | -2       |
| Pages pointing at a missing internal page       |                  0 |                 0 | 0        |
| Pages with fewer than 3 content inbound links   |                 19 |                 2 | -17      |
| Content links into `/glossary/` (distinct page) |                  1 |                27 | +26      |
| Pages with a heading problem                    |                 12 |                12 | 0        |
| Articles more than 30 days behind git           |           21 of 30 |          18 of 45 | see 3.8  |

Three things moved the most: Open Graph and Twitter tags are present on every
page except two, Article JSON-LD is present on 50 pages and `BreadcrumbList`
on 39 (was 3), and the internal link graph has a floor of 3 content
links for every indexable page except `/` and `/privacy/`. One thing did not move at all: the 12 pages
with heading problems are the same 12 pages (see 3.1).

## 2. How far the old numbers can be reproduced

The original scripts were written in a scratchpad and are not in the repo.
`scripts/seo-audit.mjs` re-implements their measurements on jsdom, which is
already a devDependency (the originals used cheerio, which is only a
transitive dependency). I rebuilt `f462635` and compared.

**Reproduced exactly** (same number, same page lists where the original
printed them): 74 / 47 / 26 / 1 file inventory; 14 titles over 60 and 6 over
70, longest 109, one doubled brand (`/partitioning/`); 8 descriptions over 160,
3 under 70, 1 duplicate group; 1 missing canonical (`/styleguide/`); 2 pages
with no `<h1>`, 10 with level skips, 12 in all; 82 images and 0 without `alt`;
45 pages without `og:image`, one distinct image; 39 JSON-LD blocks, 0 parse
failures, type counts Article 30, TechArticle 3, BreadcrumbList 3, WebSite 1,
FAQPage 1, ItemList 1; 15 pages with no JSON-LD; `image` missing on 30 of 30;
3 pages with two article-type blocks; 1 visible breadcrumb; 46 sitemap
entries with one `lastmod`; a `robots.txt` Sitemap line that does not match the
real sitemap; 30 feed items, 4 without description; 2 broken fragments; 1
content link into the glossary; 26 pages not linked from header or footer; 2
pages with no inbound link at all; and the orphan lists in section 4 of the
original (0, 1 and 2 content inbound links), which match page for page.
Freshness also matches: 21 of 30 Articles more than 30 days behind the last
commit to `src/<slug>/`, maximum 202 days.

**Resolves an open question in the original.** The original could print only
40 of 45 failing internal links and said it had not inspected the other 5.
All 45 target `/letstalkcdc/playground/`, which `scripts/publish-playground.sh`
copies in at deploy time. The script now reports those as "published after
build" and counts any other missing target separately; that second count is 0
before and after.

**Does not match, and why:**

- Internal link edges: the original reports 1683, the script 1490. The
  script does not count same-page `#fragment` hrefs as edges (it checks their
  targets instead). I did not recover the exact 193-link difference, so treat
  the edge count as a different quantity, not a regression. Every inbound-link
  figure above uses distinct linking pages and does match.
- Distinct JSON-LD `dateModified`: the original text says four distinct dates
  but its printout shows five strings, one of them an ISO timestamp of
  `2026-08-25`. The script compares the date part only and finds four.
- Click depth: the original gave a histogram for all links and another for
  content links. The script reports only content-link reachability (maximum
  depth 3, unreachable pages listed), which agrees with the original's "5
  unreachable" before.

**Not re-implemented** (they were analysis, not measurement, or need things
this script does not have): the 10-page on-page review and the 65 link
opportunities ([06]); the content-gap and assistant-coverage work ([07]);
title versus H1 comparison (F-11); the live-site spot checks ([08], never run
in the original); and Lighthouse (F-17). They are not covered by the "after"
numbers either.

## 3. Remaining problems

Sizes: S = under half a day, M = up to two days. Role names follow
`docs/CONDUCTOR.md`. Each item says whether it is a regression, a leftover, or
new.

### 3.1 Heading structure, unchanged (leftover from F-10)

Evidence: `headings.pagesWithAnyIssue` = 12 before and after. No `<h1>` on
`/merge-cookbook/` and `/mermaid-sandbox/`. Level skips (h2 to h4, or h1 to
h3) on `/cloud-labs/aws-dms/`, `/cloud-labs/fivetran/`,
`/cloud-labs/goldengate/`, `/cloud-labs/matillion-cdc/`,
`/cloud-labs/snowflake-cdc/`, `/dashboard/`, `/exactly-once/`,
`/lab-kafka-debezium/`, `/partitioning/`, `/use-cases/`.
`tests/unit/internal-links-headings.test.js` lists the same pages as
`KNOWN_NO_H1` and `KNOWN_SKIPS`; its comment says the skips need a CSS hook
first and that `/merge-cookbook/` is "owned by another change". That other
change (#366, the cookbook rewrite) has merged and `/merge-cookbook/` still has
no `<h1>`, so that allowlist entry is stale reasoning.

Proposed fix: `/merge-cookbook/` `<h1>`, S (`implementer`). The ten skip
pages need a heading-level class so the visual size stays put, M
(`css-refactor` for the hook, then `implementer`). `/mermaid-sandbox/` and
`/dashboard/` are `noindex`; fix last.

### 3.2 `/dashboard/` has two conflicting robots metas (new)

Evidence: `inventory.pagesWithMoreThanOneRobotsMeta` = 1.
`_site/dashboard/index.html` line 12 is
`index,follow,max-image-preview:large` (from the layout) and line 64 is
`noindex, follow` (from the page). Crawlers combine them and the more
restrictive directive wins, but the page is exactly the thin per-user page that
F-04 asked to keep out, and it is out of the sitemap only because of
`eleventyExcludeFromSitemap`. A first-match reader (or a validator) sees
"index". The earlier audit's per-page robots figure did not catch this because
it may have read only the first tag; the script now joins all of them.

Proposed fix: have the layout emit one robots meta and let the page override
it, as `/newsletter/` already does (it has a single `noindex,follow`). S,
`implementer`.

### 3.3 Titles over 60, allowlisted (F-06 leftover)

Evidence: `titles.over60` = 2, `tests/unit/seo-titles-descriptions.test.js`
allowlists both.

| Page               | Length | Title                                                              | Note                                                                                                                                                    |
| ------------------ | -----: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                |     62 | CDC: The Missing Manual \| A Deep Dive into Change Data Capture    | Own `seoTitle`, brand first. Two characters over; low value.                                                                                            |
| `/merge-cookbook/` |     65 | merge / upsert cookbook — sinks for CDC \| CDC: The Missing Manual | Lowercase start and a slash; the test comment ties it to a change that has since merged (see 3.1). Shorten to about 50 before the suffix, S (`scribe`). |

No title is over 70 (6 before). The three titles without the brand suffix
(`/`, `/mermaid-sandbox/`, `/styleguide/`) are deliberate. Two descriptions are
under 70 characters, `/dashboard/` (60) and `/styleguide/` (69), both
`noindex`; no action.

### 3.4 One Open Graph image for every page (F-01 leftover)

Evidence: `social.distinctOgImages` = 1 (`/images/cdc-cover.jpg`, with width,
height and alt). 56 of 58 pages have the tags; the 2 without are
`/mermaid-sandbox/` and `/styleguide/` (both `noindex`, own `<head>`).
Every shared lesson link therefore previews with the same picture. I have not
rendered a preview in LinkedIn, Slack or X.

Proposed fix: a per-page `ogImage` for the six or seven most shared pages
(`/`, `/intro/`, `/exactly-once/`, `/snapshotting/`, `/compare/`,
`/is-cdc-exactly-once/`), M (`implementer` plus an image source; the repo has
no image generator and I did not add one). Optional.

### 3.5 Internal links: two thin pages, and header/footer coverage shrank (F-07 leftover)

Evidence: `links.indexablePagesWithFewerThan3ContentInbound` = 2, down from 19.

| Page        | Content inbound | All inbound | Note                                                                                                             |
| ----------- | --------------: | ----------: | ---------------------------------------------------------------------------------------------------------------- |
| `/privacy/` |               0 |          55 | Reachable only from the footer. New page. Normal for a privacy page, but no page links to it from its body text. |
| `/`         |               1 |          56 | The front door; header logo and footer carry the rest. Not a defect.                                             |

Also: `links.pagesNotLinkedFromHeaderOrFooter` rose from 26 to 36 of 58. All
nine new module pages are in that group; they are reachable through
`/overview/`, the series navigation and links in the lesson text (content
inbound 5 to 12 each). That is the design, not a fault, but the nav is not
where the new pages are discovered. Pages with exactly 3 content inbound links:
`/multi-tenancy/`, `/methodology/`, `/versions/`. `/newsletter/` has 0 inbound
links from anywhere; it is `noindex` and off until configured (P15-9), so
expected.

Proposed fix: link `/privacy/` from the analytics and newsletter explanations
where they mention data, S (`scribe`). Optionally a "latest modules" strip on
`/overview/`, S. Nothing else.

### 3.6 Structured data gaps that remain (F-08 leftover)

Evidence:

- `jsonld.indexablePagesWithoutBreadcrumbList` = 14: `/cloud-labs/`,
  `/glossary/`, `/merge-cookbook/`, `/methodology/`, `/oracle-notes/`,
  `/overview/`, `/privacy/`, the four `/quickstarts/quickstart-*` pages,
  `/troubleshooting/`, `/troubleshooting/failure-drills/`, `/versions/`.
- `jsonld.indexablePagesWithoutArticle` = 3: `/overview/` (carries an
  `ItemList`), `/privacy/`, `/versions/`. Six pages in all carry no JSON-LD
  (`/dashboard/`, `/mermaid-sandbox/`, `/newsletter/`, `/privacy/`,
  `/styleguide/`, `/versions/`); the non-indexable ones are fine.
- The `/overview/` `ItemList` is now generated and has 35 entries, but it is
  not the same set as the feed (39 items). It lists `/cloud-labs/` and
  `/troubleshooting/failure-drills/` and omits the five cloud-lab pages and
  `/compare/`. Whether that is intended is not documented. Observation, not a
  confirmed defect.
- Article required fields: 0 missing on 50 pages; `mainEntityOfPage` equals the
  canonical on every one; no page has two article-type blocks (3 before).

Proposed fix: add the breadcrumb to the hub and quickstart pages, S
(`implementer`); give `/versions/` and `/privacy/` a `WebPage` or `Article`
block, S; decide and document the `ItemList` scope, S. All low value; do them
only alongside other edits to those templates.

### 3.7 Sitemap and feed (F-03, F-15: fixed, with small leftovers)

Evidence: 55 entries, 8 distinct `lastmod` values (1 before). Two entries have
no `lastmod`: `/versions/` (no `dateModified` or `datePublished` in its front
matter, which is the template's rule working as designed) and `/playground/`
(built outside Eleventy, by design). No `noindex` page, stub or foreign host is
listed. The feed has 39 items, none without a description, newest dated
2026-10-09 (was 2026-08-27), `feedLimit` 100. `robots.txt` now names
`https://sandgraal.github.io/letstalkcdc/sitemap.xml`. This script reads the
file in `_site/`; the host-root `robots.txt` that crawlers actually fetch is a
separate, live question (F-02) and is **not measured here**.

Caveat on `lastmod`: 30 of 55 entries share `2026-10-09`. That is not the build
date (the template reads `dateModified`). Counted from the built site, 29 of
those 30 pages carry Article or TechArticle JSON-LD and the other is
`/privacy/`, which carries none. It is honest to the front matter but still
low-information when many pages share one date.

Proposed fix: add `datePublished` to `/versions/`, S (`scribe`). Nothing else.

### 3.8 Modified dates versus git (F-09: improved, but the check is blunt)

Evidence: `freshness.articlesMoreThan30DaysBehindGit` = 18 of 45 checked
(21 of 30 before); maximum lag 245 days. Distinct Article `dateModified` values:
6 (4 before). Nine Articles still say `2026-02-06`: `/debezium-decoder/`, `/dlq-triage/`,
`/lab-kafka-debezium/`, `/multi-tenancy/`, `/observability/`, `/quickstarts/`,
`/quickstarts/quickstart-mssql/`, `/reconciliation-surgery/`, `/strategy/`.

The check cannot tell content from metadata. Spot check:
`git log -- src/dlq-triage` shows its latest commit is
"feat(seo): titles and descriptions pass (P16-6) (#373)", and
`src/strategy`'s are #401 (an unrelated module) and #363 (sitemap/noindex).
Those touch the front matter or neighbours, not the lesson text. So the
18 is an upper bound, and I cannot say how many are real staleness.
Five of the 50 Articles were not checked because their source does not live in
`src/<slug>/`: the four `/quickstarts/quickstart-*` pages (source under
`src/quickstart/`) and `/troubleshooting/failure-drills/`.

Proposed fix: make the check ignore commits whose subject starts with
`feat(seo)`, `chore(` or `docs(`, S (`implementer`); then do the editorial pass
the plan already describes in P16-10. The first is a tooling tweak and I did not
make it here.

### 3.9 New in this period: the 11 new content pages

Nine module pages plus `/privacy/` and `/newsletter/`. (The brief said ten
modules; the build contains nine new module pages, and I did not find a tenth.)

| Page                           | Title | Desc | Canonical | OG, Twitter | JSON-LD             | Sitemap `lastmod` | Feed | Content inbound |
| ------------------------------ | ----: | ---: | --------- | ----------- | ------------------- | ----------------- | ---- | --------------: |
| `/backfill-resnapshot/`        |    57 |  153 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |               6 |
| `/cdc-data-contracts/`         |    60 |  149 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |               5 |
| `/deletes-stay-deleted/`       |    51 |  152 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |              10 |
| `/is-cdc-exactly-once/`        |    54 |  138 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |               8 |
| `/postgres-replication-slots/` |    53 |  151 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |              12 |
| `/sql-server-mysql-cdc/`       |    58 |  150 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |               7 |
| `/test-your-pipeline/`         |    48 |  151 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |               8 |
| `/transactional-outbox/`       |    56 |  159 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |               6 |
| `/which-row-wins/`             |    55 |  146 | self      | yes         | Article, Breadcrumb | 2026-10-09        | yes  |               8 |
| `/privacy/`                    |    56 |  146 | self      | yes         | none                | 2026-10-09        | no   |               0 |
| `/newsletter/`                 |    36 |   96 | self      | yes         | none                | not listed        | no   |               0 |

All nine modules pass every automated check. The only module-adjacent notes are
that `/cdc-data-contracts/` is at the 60-character title target and
`/transactional-outbox/` is one character under the 160-character description
limit (159); both pass, neither has headroom. `/privacy/` and `/newsletter/`
are discussed in 3.5 and 3.6; `/newsletter/` is `noindex` by design.

### 3.10 Not an SEO problem, but worth knowing

63 internal links target `/playground/`,
which is absent from `_site/`. Any link check run against `_site/` alone will
report them; the script classifies them as published-after-build. The page is
copied in at deploy time by `scripts/publish-playground.sh`, and its `<head>`
is checked by `tests/unit/playground-head.test.js`.

## 4. What this still does not measure

- Search Console, impressions, clicks, indexed-page count, GoatCounter
  traffic. The plan item P16-12 asks for these after 28 days; that is the
  maintainer's accounts and is untouched by this change.
- Lighthouse and Core Web Vitals for the key pages (F-17).
- The live deployment, including the host-root `robots.txt` (F-02) and
  whether production equals the build.
- Title versus H1 agreement (F-11), the 65 link opportunities, content gaps.
- Rendered social previews and Google's rich-result validator.

## 5. How to re-run

```bash
npm ci
ELEVENTY_PATH_PREFIX=/letstalkcdc SITE_HOST=https://sandgraal.github.io npm run build
npm run audit:seo                  # table on stdout, JSON in ./seo-audit.json (gitignored)
npm run audit:seo -- --verbose     # also list the pages behind each count
```

Options: `--site <dir>`, `--host <url incl. prefix>` (defaults to the home page
canonical), `--json <file>`, `--repo <dir>` and `--rev <commit>` for the git
freshness check, `--no-git` to skip it (needed in a shallow clone), `--quiet`.
The script reads only; it exits 0 whatever it finds and 2 if it cannot read
the site. The JSON has `metrics` (the table), `details` (the lists behind each
count) and `pages` (one row per content page, for diffs).

To reproduce the "before" column:

```bash
mkdir -p /tmp/before && git archive f462635 | tar -x -C /tmp/before
ln -s "$PWD/node_modules" /tmp/before/node_modules
( cd /tmp/before && ELEVENTY_PATH_PREFIX=/letstalkcdc SITE_HOST=https://sandgraal.github.io npm run build )
node scripts/seo-audit.mjs --site /tmp/before/_site --rev f462635 --json before.json
```

(The old commit is built with today's `node_modules`; the HTML counts match the
original audit, which is all this needs.)

`tests/unit/seo-audit.test.js` runs the script on a hand-made fixture site with
one known defect per measurement, and, when `_site/` exists, on the real build
(shape only, no values). The values to hold the line on are asserted by the
other SEO tests (`seo-head`, `seo-titles-descriptions`, `seo-sitemap-feed`,
`internal-links-headings`), which build their own site.
