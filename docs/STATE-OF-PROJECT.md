# State of the project — 2026-05-19

A dated snapshot of where Let's Talk CDC is right now, written through
five expert lenses (engineering, content & SEO, a11y & perf, trust &
conversion, Claude / agent-ops).

Read this when you want a fast read of where things stand. The
authoritative running checklist remains
[`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md); this doc is its
dashboard, not its replacement.

> Previous snapshot: see Git history at
> [`2026-05-18`](https://github.com/sandgraal/letstalkcdc/blob/b024c4d/docs/STATE-OF-PROJECT.md).
> A new snapshot is written rather than editing this one in place
> when the numbers drift materially.

---

## TL;DR

- **Site shape unchanged**: Eleventy 3.1 + Vite 7 + PostCSS static
  site at <https://sandgraal.github.io/letstalkcdc/>. 21 modules with
  `seriesKey`; 42 top-level `src/` directories.
- **Last 48 hours delivered 14 PRs.** Tier-1 trust surfaces shipped
  (errata callouts, glossary, methodology); `/intro/` perf work
  (CDC platforms data-driven + expand-on-demand) cut a real **48
  rendered-tree elements** off initial paint via `<template>`. Dev
  ergonomics fixed (`npm run dev` builds CSS first). State-of-project
  audit + Claude-Code best-practice pass landed.
- **PR queue is empty** as of HEAD `4b2d132`. No conflicts to clear,
  no reviews pending. Tomorrow's agents start with a clean slate.
- **Tests are green**: 274 unit cases across 14 files, 6 Playwright
  e2e specs, `verify-all` clean on `origin/main`.
- **LHCI baseline on `/intro/`** unchanged thresholds: error-level
  perf ≥ 0.82, a11y ≥ 0.93. Expand-on-demand drops rendered-tree
  count by ~5% so the next `npm run lighthouse` should reflect a
  small but real bump.
- **Plan checkbox totals on `origin/main`**: 39 `[x]` / 16 `[ ]`.
  Of those 16, **eight require maintainer-only decisions** (assets,
  vendor stance, license, provider choice); two are deferred by
  explicit policy; the remaining six are diagnostic / partial /
  blocked.
- **Agent ops unchanged**. Three friction notes from yesterday's
  audit still open as future Phase 12 candidates.

---

## What landed since the 2026-05-18 snapshot

Chronological, freshest first. All on `main`:

| PR       | Title                                                                             | Notes                                                                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#294** | perf(intro): show first 6 vendor cards inline, rest in `<template>`               | Real 48-element rendered-tree reduction on `/intro/` (965 → 917). Expand-on-demand JS handles Show-All click + filter / hash interactions. `<noscript>` points to `/tooling/`. Closes Phase 5 perf-debt sub-item. |
| **#293** | refactor(intro): data-drive CDC platforms catalog from `src/_data/cdcVendors.mjs` | Pure refactor: ~135 template lines → data file; byte-identical HTML. Sets up #294 and any future `/compare/` or `/tooling/` source-share.                                                                         |
| **#292** | docs: add `STATE-OF-PROJECT.md` (five-lens snapshot + agent-ops audit)            | The original dashboard doc; this snapshot supersedes it.                                                                                                                                                          |
| **#291** | docs(plan): close 4 stale `[ ]` items effectively done by later work              | Plan housekeeping; closed Phase 5 `target-size`, Phase 5 a11y debt, Phase 6 doc audit parent, Phase 9 RSS duplicate.                                                                                              |
| **#290** | docs: refresh `/css-byte-check` baseline hash to current main                     | Stale hash had pointed at pre-color-tokens output for weeks; refreshed to current `f0da8ca8…`.                                                                                                                    |
| **#289** | fix(dev): build CSS before `npm run serve` so dev doesn't render unstyled         | Fresh-clone friction fix. Added `preserve` npm pre-hook.                                                                                                                                                          |
| **#288** | perf(intro): drop no-op checklist checkboxes; audit remaining dom-size            | First chip at `/intro/` `dom-size` debt. Removed 10 dead-affordance `<input>`s. Audit named the next two trim targets.                                                                                            |
| **#287** | feat(methodology): `/methodology/` page                                           | New credibility-surface page describing the editorial pipeline. Footer link.                                                                                                                                      |
| **#286** | feat(glossary): standalone `/glossary/` page                                      | 14 terms in `src/_data/glossary.mjs`; data-driven `<dl>` with stable anchors.                                                                                                                                     |
| **#285** | feat(errata): inline per-page errata callouts                                     | URL-tagged callouts driven by `src/_data/errata.mjs`. `base.njk` partial renders nothing when no entry matches.                                                                                                   |
| **#284** | chore(cleanup): remove deprecated auth + cloud-progress code                      | Deleted ~1,400 LOC of dead auth + cloud-sync that was still shipping (injecting a non-functional "Log In" button).                                                                                                |
| **#283** | test(e2e): assistant FAB panel coverage + hidden-panel hit-testing fix            | Playwright spec for the 44×44 visible-state assertion the LHCI `target-size` audit can't measure.                                                                                                                 |
| **#282** | fix(seo): BreadcrumbList JSON-LD audit + 2 page fixes                             | `/multi-tenancy/` and `/exactly-once/` were emitting literal Nunjucks expressions in `item` URLs; fixed via `eleventyComputed: head_extra:`.                                                                      |
| **#281** | feat(feed): RSS 2.0 at `/feed.xml`                                                | Hand-rolled `src/feed.11ty.cjs`, `<link rel="alternate">` in `<head>`.                                                                                                                                            |

---

## Engineering & architecture

Stack and pipeline unchanged. `npm run verify-all` is the local
minimum bar (format + lint + 274 unit tests + build). Four CI
workflows: `ci.yml` (verify-all + LHCI), `deploy.yml` (Pages),
`linkcheck.yml` (lychee), `fortify.yml` (SAST).

The CDC platforms work in PRs #293 and #294 closed the largest
maintainability target on `/intro/`. Next structural DOM trim per
PR #288's audit: the **Methods at a Glance table** (~135 elements,
each cell uses `<span class="cell-indicator">` + `<span class="cell-text">`;
collapsing the indicator into a `::before` pseudo-element would
save ~36 spans across the table at the cost of a small a11y
trade-off).

**Next moves**:

- Land the Methods-table indicator-span collapse when an agent
  has bandwidth — it's a self-contained ~50-line CSS + template
  change, similar shape to PR #288.
- Phase 4 / Phase 11 `@layer` migration stays deferred per
  explicit Phase 11 policy ("Defer unless a real specificity bug
  forces it; no user value otherwise").

---

## Content & SEO

Unchanged from yesterday — every credibility surface is now live.
The 14-PR delivery this week filled in the entire Tier-1 trust
surface from the May 2026 brutal-review roadmap (methodology,
glossary, errata, edit-on-GitHub, dateModified, RSS, JSON-LD,
BreadcrumbList, sitemap, three README badges).

**Next moves** — each maintainer-blocked:

- Author photo asset (Phase 8 L437) — drop a JPEG at
  `src/static/author/` and flip `image: null` to its public path
  in `src/_data/author.mjs`.
- Author identity expansion (Phase 8 L493) — add LinkedIn /
  talks / podcast URLs to `sameAs` when they exist.
- `/compare/` vendor hub (Phase 9 L507) — needs maintainer
  authority on Debezium vs. AWS DMS vs. Fivetran vs. Airbyte.
- Newsletter provider choice (Phase 9 L554) — Buttondown / Kit /
  ConvertKit.

---

## A11y & perf

LHCI thresholds in [`.lighthouserc.json`](../.lighthouserc.json)
unchanged: warn-level 0.9 floor across all sampled URLs;
`/intro/` error-level perf ≥ 0.82 and a11y ≥ 0.93.

`/intro/` `dom-size` audit was the only currently-tracked perf
sub-item moving the needle this week. PR #288 trimmed 10
no-op-checkbox elements; PR #294's expand-on-demand cut **48
more**. Combined: roughly -58 rendered-tree elements on `/intro/`
since the audit started, a ~6% reduction.

Still open on `/intro/`:

- `cumulative-layout-shift: 0.58` — culprits not yet localized
  (Phase 7 line 343, blocked on a maintainer-run Lighthouse pass
  for a shared baseline).
- `mainthread-work-breakdown: 0.5` — never investigated.
- Methods-table span collapse (named above) — the next concrete
  trim per the PR #288 audit.

**Next moves**:

- Maintainer-only ask still standing: one local Lighthouse run
  from a quiet machine + share the `cls-culprits-insight` audit
  screenshot. On-machine variability (0.97 local / 0.94 CI on
  a11y) means an agent-side investigation without a shared
  reference run is speculation.

---

## Trust & conversion

The brutal-review Tier-1 list is fully shipped. Tier-2 items
remain maintainer-blocked (asset / authority / provider choices).

**Next moves** — single ranked list of Tier-2 maintainer-only
items:

1. **License file** (Phase 11 L644). Easiest decision. MIT for
   code + CC-BY 4.0 for content is the conventional
   educational-repo pattern. Unblocks the README license badge.
2. **Author photo** (Phase 8 L437). Single asset + template
   tweak.
3. **Author identity expansion** (Phase 8 L493). LinkedIn at
   minimum.
4. **`/compare/` hub** (Phase 9 L507). Highest-leverage SEO win
   in the roadmap, but highest editorial risk — needs
   maintainer-authored takes.
5. **Newsletter** (Phase 9 L554). Provider decision first.

---

## Claude / agent-ops

The workflow is healthy. `.claude/settings.json` hooks use the
current docs schema (`asyncRewake: true`, exit code 2). The
[`check-merged-prs.sh`](../.claude/scripts/check-merged-prs.sh)
auto-continue mechanism worked reliably across the 14 merges
this week — no missed triggers, no double-fires.

The three friction items recorded yesterday are unchanged and
remain candidates for a future **Phase 12** chapter:

1. **Auto-continue preview points at Phase 1.** Every merge's
   `additionalContext` ends with "First open item by file order:
   30:- [ ] Confirm `vars.SITE_HOST` ..." even though the
   directive in the same message tells the model to skip Phase
   1. Costs each agent one plan re-read on resume.
2. **`git push --force-with-lease` is denied.** Correct policy;
   real friction on rebased branches — the workaround is
   `git merge --no-ff origin/main` (used four times this week).
3. **No `/plan` slash command.** Yesterday's state-of-project
   audit was hand-driven; a packaged command would make it
   reproducible.

**Next moves**: a Phase 12 chapter in `IMPLEMENTATION-PLAN.md`
gathering these + any new agent-ops papercuts. Land when the
maintainer has appetite.

---

## Outstanding `[ ]` items on `origin/main`

16 open items as of HEAD `4b2d132`. Cross-referenced with line
numbers in [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md).

| Phase | Line | Item                                | Status                      |
| ----- | ---- | ----------------------------------- | --------------------------- |
| 1     | 34   | Confirm `vars.SITE_HOST`            | maintainer-only             |
| 1     | 39   | Confirm `vars.ELEVENTY_PATH_PREFIX` | maintainer-only             |
| 1     | 42   | Trigger `deploy.yml` + spot-check   | maintainer-only             |
| 4     | 135  | CSS `@layer` migration              | deferred (Ph. 11)           |
| 5     | 252  | `/intro/` perf debt parent          | partial; methods-table next |
| 7     | 361  | CLS culprits investigation          | needs maintainer LHCI       |
| 8     | 480  | Author photo                        | maintainer-only             |
| 8     | 536  | Author identity expansion           | maintainer-only             |
| 9     | 550  | `/compare/` vendor hub              | maintainer-only             |
| 9     | 596  | Newsletter capture                  | maintainer-only             |
| 10    | 618  | Pick one interactive demo           | maintainer-only             |
| 10    | 624  | Ship demo as ESM module             | depends on 618              |
| 10    | 629  | Fill old YouTube embed slots        | depends on 618              |
| 11    | 686  | README license badge                | maintainer-only             |
| 11    | 693  | README Lighthouse badge             | maintainer-only             |
| 11    | 740  | CSS `@layer` migration              | deferred                    |

Eight items are blocked on maintainer-only decisions; two are
deferred by explicit Phase 11 policy; the remaining six are
partial / diagnostic / dependent on a maintainer-only
prerequisite.

---

## What tomorrow's agents should do first

If the auto-continue hook fires (a `claude/*` PR merged
overnight), the directive points at the lowest-numbered open
`[ ]` item by file order — that's Phase 1 L34, which they should
skip per the directive. The next autonomously-actionable item is
the **Methods-at-a-Glance indicator-span collapse** on
`/intro/` (the second perf-debt sub-item PR #288 audited).
Concrete shape:

- Edit `src/intro/index.njk` around the Methods-at-a-Glance
  table (line ~270): collapse each cell's
  `<span class="cell-indicator">…</span>` + `<span class="cell-text">…</span>`
  pair into a single span where the indicator emoji is rendered
  via a CSS `::before { content: var(--cell-indicator) }`
  pseudo-element keyed off a `data-status="ok|warn|star"`
  attribute on the cell.
- Adjust `src/assets/css/pages/intro.css` `#methods-table` rules
  accordingly.
- Verify rendered-tree element count drops by ~30; ensure
  screen-reader behavior is preserved (the existing
  `aria-hidden="true"` on the indicator span comes off; the
  emoji rendered via `content:` is read by some screen readers
  and silenced by others — keep it decorative via a
  `speak: never;` equivalent or test with VoiceOver).

If the maintainer has appetite for an agent-ops chapter, opening
**Phase 12** in `IMPLEMENTATION-PLAN.md` with the three friction
items above is a clean entry point.

---

## Verification

To confirm this snapshot is still accurate when you read it later:

```bash
# PR queue should still be empty (or the count is whatever's
# landed since this snapshot dated).
gh pr list --author @me --state open

# Plan checkbox totals should match (39 / 16 on origin/main today).
grep -c '^- \[x\]' docs/IMPLEMENTATION-PLAN.md
grep -c '^- \[ \]' docs/IMPLEMENTATION-PLAN.md

# Local verification should be green.
npm run verify-all
npm run smoke:core
```

When the numbers drift materially, write a new dated snapshot
rather than editing this one in place — historical snapshots
are useful for tracking pace.
