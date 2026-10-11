---
name: seo-check
description: Run the SEO audit on the built site and read its output against the October 2026 baseline. Use after adding or editing pages, titles, descriptions, links or structured data, or when asked about SEO regressions.
---

# SEO check

`scripts/seo-audit.mjs` measures the **built HTML only**. It reads `_site/`,
never changes anything, and exits 0 unless it cannot read the site (exit 2).
It is a measuring tool; the unit tests (`tests/unit/seo-*.test.js`) are the
gates. There is no traffic or ranking data in it.

## Run it

```bash
ELEVENTY_PATH_PREFIX=/letstalkcdc SITE_HOST=https://sandgraal.github.io npm run build
npm run audit:seo            # table on stdout, full detail in seo-audit.json
node scripts/seo-audit.mjs --verbose   # also list the pages behind each count
```

`seo-audit.json` is git-ignored. Build with the same variables production uses
or canonicals and sitemap hosts will differ from the baseline.

## What to read

Compare with the "After" column of `docs/seo-baseline-2026-10-after.md`
(definitions are the same, so numbers compare). Look first at:

- titles over 60 characters and descriptions over 160 (baseline: 2 and 0);
- duplicate descriptions, pages missing `og:image` or Twitter card;
- Article and `BreadcrumbList` JSON-LD coverage;
- broken fragment targets and pages pointing at a missing internal page
  (baseline: 0 and 0);
- content pages with fewer than 3 inbound content links;
- heading problems (baseline: 12 pages, unchanged);
- sitemap entries and distinct `lastmod` values; feed items;
- articles whose `dateModified` is far behind git (an upper bound, not proof).

A new page should add to the counts it should, and move none of the "bad"
numbers up. Report the numbers you saw, not adjectives. Background and
method: `docs/seo-audit-2026-10.md`.
