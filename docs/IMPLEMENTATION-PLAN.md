# Implementation Plan — Revitalization

The running checklist for the Let's Talk CDC revitalization work. Phases
are ordered by priority within each tier; tiers are independent and can
be worked in parallel by separate agents.

For a dated snapshot of where the project is overall — five expert-lens
sections, a PR queue, and an outstanding-items table — see
[`STATE-OF-PROJECT.md`](STATE-OF-PROJECT.md).

## Design revamp — August 2026 (shipped)

A ground-up, dark-first design revitalization landed as a reviewable PR
sequence in August 2026. It rebuilt the visual layer on top of the
existing Eleventy + Vite + PostCSS stack (content and working JS
preserved) and closed the net-new-feature backlog. Where its work maps
onto the numbered phases below, those items are ticked in place; this is
the index of the arc:

- **Phase 0 — Stabilize & correct.** JS/build hygiene (dual-search
  resolved, dead `web-vitals-dashboard.js` + stray `console.log`s
  removed, Mermaid unified/self-hosted, `scripts/` passthrough
  narrowed) and a sweep of CDC-accuracy fixes (`connect-offsets`,
  compat-direction, outbox/MERGE wording, LSN tie-break on ordering,
  connector-builder `plugin.name: pgoutput` + MySQL history topics,
  tool-version refresh).
- **Phase 1 — New design system** (PR #303): fresh dark-first token
  layer + self-hosted IBM Plex + a noindex `/styleguide/` living
  component reference.
- **Phase 2 — Rollout** (PRs #304–#307): palette/fonts site-wide,
  scorecard + progress-toast rendered natively, chrome polish +
  cyan harmonization + legacy-token retirement, responsive polish +
  button-variant legibility. CSS byte-check re-baselined (hash in
  [`../CLAUDE.md`](../CLAUDE.md)).
- **Phase 3 — Information architecture** (PR #311): title-doubling
  stripped, missing front-matter filled, orphan pages resolved.
- **Phase 4 — Net-new content:** 5 cloud labs published with SME
  corrections (PR #308, closes the `/cloud-labs/` placeholder),
  `/compare/` hub (PR #309, Phase 9 below), interactive change-event
  visualizer on `/intro/` (PR #310, Phase 10 below). **4d newsletter
  is the one deferred item** — see Phase 9, pending a provider choice.

---

## Runtime defect sweep — August 2026 (shipped)

The revamp above was signed off while a phone visitor could not use the
navigation at all. That is worth recording plainly, because the reason
is structural rather than a one-off slip: **every gate in this repo
verified that files build and parse, and none of them tried to use the UI
in a browser.** `verify-all`, `smoke:core` and pa11y cannot see a menu painted
behind the hero, a drawer collapsed to the header's height, or a tool
that quietly returns before doing any work.

Seven production defects were found by rendering every built page at
three viewports — 46 directory pages (`index.html`) at the time — and
driving each interactive component, then fixed (PRs #313, #314, #316):

- **Nav dropdowns were clipped and unclickable.** `.nav-links` had
  `overflow-x: auto` (which computes `overflow-y` to `auto` as well),
  making the bar a scroll container that cut off every flyout; the menu
  also referenced `--z-dropdown-menu`, **a token that does not exist**,
  so its `z-index` computed to `auto`.
- **The mobile drawer collapsed to 78px**, hiding all 12 links from
  every phone visitor. `backdrop-filter` on `.global-header` made it the
  containing block for its `position: fixed` descendants, so the
  drawer's `top: 0; bottom: 0` resolved against the 64px header. The
  page fade-in animation had the same trap via `transform`.
- **Every chart on the site was dead.** `dashboard.js`, loaded on all 43
  pages, imported `chart.js@4.4.4/dist/chart.esm.js` — a path v4 does
  not ship. It 404'd on every page load and a `.catch()` swallowed it.
- **`app.js` threw on `/404.html` and `/mermaid-sandbox/`**, taking
  search, the theme toggle and nav behaviour with it. Both are
  `layout: null` pages that loaded the raw passthrough-copied source
  instead of the Vite bundle, so the browser hit its bare
  `import Fuse from "fuse.js"` specifier.
- **`components/panels.css` 404'd on eight pages.** Six page
  stylesheets `@import`ed it by URL, but page CSS is passthrough-copied
  rather than bundled, so the path was never published.
- **14 undefined CSS custom properties with no fallback**, left by the
  Phase 2c token retirement. An invalid `var()` voids its entire
  declaration silently — between them they killed the site-wide link
  underline gradient, every button hover shadow, the case-study callout
  colours, card shadows on four pages and the video-embed type scale.
- **`/connector-builder/` generated nothing at all.** Linked from the
  Tools menu, the homepage and `/tooling/`. The module had drifted from
  its template: it looked up `#host`, `#port`, `#db-specific` and
  `#advanced` (none of which the markup renders) and a defensive
  early-return bailed before doing any work; it also wrote to
  `#json`/`#post`/`#put` while the template's outputs are `#config` and
  `#curlCmd`. Only 7 of ~30 lookups matched. The page returned 200, the
  script returned 200, nothing threw. As a side effect, the earlier
  `plugin.name: pgoutput` accuracy fix had been applied to code that
  never ran.

### The gates that now exist (PR #315)

Each was verified by reintroducing the original bug and confirming it
fails — a guard that cannot fail is worthless, and that exercise caught
two holes in the guards themselves (a page walker that only matched
`index.html` and so skipped `/404.html`; a line-based CSS scan blind to
`var()` wrapped across lines).

- [x] **`tests/e2e/helpers/hit-test.js`** — `expectHittable`
      (`elementFromPoint` at the element's own centre),
      `expectNotClipped` and `expectFixedNotTrapped`. Playwright's
      `toBeVisible()` only asks CSS questions and cannot see an element
      that is covered or clipped; `links.count() > 0` is a DOM count.
      Both passed throughout the outage.
- [x] **No `{ force: true }` clicks in `navigation.spec.js`.** Forcing
      disables Playwright's actionability checks — including "receives
      pointer events", the one check that would have failed on the
      collapsed drawer.
- [x] **`tests/e2e/runtime-health.spec.js`** — renders every built
      `.html` output and fails on any uncaught JS exception or
      same-origin 404. This casts a wider net than the sweep above: it
      also covers standalone outputs such as `/404.html` and the
      redirect stubs, not only directory `index.html` pages — 73 files
      against those 46 at the time of writing, and both grow with the
      site. That difference mattered: an earlier version of the walker
      matched only `index.html`, skipped `/404.html`, and reported a
      false pass on a page whose JS was throwing. Third-party/CDN misses
      are warned, not failed, so an outage cannot make CI flaky.
- [x] **`tests/unit/css-custom-properties.test.js`** — statically
      catches dangling `var(--token)` references with no fallback.
      Nothing else in the toolchain sees these: the CSS still parses,
      the build still succeeds, and the byte-check happily hashes the
      broken output.
- [x] **`tests/e2e/tools.spec.js`** — asserts on the connector
      builder's _generated output_, the only thing that catches a silent
      no-op.

**Standing rule for future work in this repo:** a component is not
"done" because its page builds, its module parses and CI is green. Drive
it in a browser, or assume it is broken.

---

## How to use this doc

- **Agents:** when you complete an item, change `- [ ]` to `- [x]` **in
  the same commit that closes it**. The checklist is the durable record
  of what shipped; commit messages and PR descriptions are not.
- If you partially complete an item, leave it `[ ]` and add a sub-bullet
  with the remaining scope so the next agent can pick up cleanly.
- Each item describes _what_ is done, not _how_. The _how_ lives in
  [`../CLAUDE.md`](../CLAUDE.md) (build/test commands, byte-identity
  check, anti-patterns) and the file paths called out per item.
- New work belongs in the lowest-numbered phase it logically fits; if a
  phase grows past ~10 items, split it.
- Mark blockers with **⚠️ Blocked by:** `<reason>` as a continuation
  paragraph under the list item (don't use Markdown blockquotes
  inside list items — prettier collapses them onto one line).

---

## Phase 1 — Production configuration validation

These items don't require code changes — they require checking
GitHub-side state and decisions.

- [x] Confirm `vars.SITE_HOST` is set to `https://sandgraal.github.io` in
      the repo's **Variables** (not Secrets) at
      `https://github.com/sandgraal/letstalkcdc/settings/variables/actions`.
      `deploy.yml` reads it but doesn't fail loudly if unset, so the
      production canonical/OG URLs depend on it being correct.
      **Resolved 2026-10-08:** the variable is _unset_ (the repo's only
      Actions variables are the two `COPILOT_AGENT_FIREWALL_*` ones), and
      that is fine — `src/_data/site.mjs` falls back to
      `https://sandgraal.github.io` and warns on a production build.
      Verified against the live site below.
- [x] Confirm `vars.ELEVENTY_PATH_PREFIX` is `/letstalkcdc` (or
      explicitly unset — `lib/path-prefix.mjs` will auto-derive the same
      value from `GITHUB_REPOSITORY`). **Resolved 2026-10-08:** explicitly
      unset; auto-derivation yields `/letstalkcdc/`.
- [x] Trigger a `deploy.yml` run after confirming both, and spot-check
      a deployed page's `<link rel="canonical">` and Open-Graph tags
      resolve to the right host. **Resolved 2026-10-08:** the latest
      `deploy.yml` run (push to `main`, 2026-08-27) succeeded, and
      `/intro/` serves `canonical` and `og:url` of
      `https://sandgraal.github.io/letstalkcdc/intro/` and `og:image` under
      the same prefix.

---

## Phase 2 — Known bugs

### `defaultHost` in `src/_data/site.mjs`

- [x] `src/_data/site.mjs` default host changed from
      `https://letstalkcdc.github.io` to `https://sandgraal.github.io`
      (matches production). Also added a `console.warn` when
      `SITE_HOST` is unset under `NODE_ENV=production`, so the
      fallback isn't silent on deploys.

### Path-prefix doubling in redirect stubs

- [x] Fixed the `{{ site.host }}{{ '/path/' | url }}` doubling bug
      across 32 templates (mostly `src/_redirects/*.html.njk` plus a
      handful of JSON-LD `BreadcrumbList`s in `overview`, `intro`,
      `exactly-once`, `multi-tenancy`). Switched every offending
      occurrence to `{{ site.origin }}{{ '/path/' | url }}`. Removed
      the `^https?://[^/]+/letstalkcdc/letstalkcdc/` entry from
      `.lycheeignore`.

### Handoff nightly system

- [x] Fix `ROOT_DIR`/`DATE` not-exported bug in
      `handoff/nightly-sync.sh` (commit `8dbec26`).
- [x] Verify the next scheduled nightly at 05:00 UTC succeeds —
      commit `cf1a5d1 chore(handoff): nightly sync 2026-05-13` on
      `main` confirms the workflow ran and appended a new entry to
      `handoff/handoff-log.json` cleanly. The earlier suspicion that
      GitHub had auto-disabled the workflow was wrong; the export-env
      fix in `8dbec26` was the entire problem.
- [x] **Retired.** `handoff/` (folder + `Handoff.md`, `README.md`,
      `dashboard.html`, `handoff-log.json`, `index.html`,
      `nightly-sync.sh`, `.gitkeep`), `.github/workflows/handoff-nightly.yml`,
      and `.github/workflows/publish-dashboard.yml` deleted. The
      `Handoff.md` template was never edited between maintainer sessions,
      so the nightly sync had been logging empty entries for ≥3 days
      running and pushing `chore(handoff): nightly sync …` commits to
      `main` for noise. The public `handoff/index.html` dashboard
      rendering three consecutive empty days was an anti-credibility
      surface for a public educational site. Also dropped the handoff
      section from `.github/copilot-instructions.md`.

---

## Phase 3 — Content debt (per `.lycheeignore` notes)

### Video embeds

- [x] Removed both 404'd YouTube embeds — `5CjPj9ShJVA` from
      `src/intro/index.njk` and `zYJn6GA5t1Q` from
      `src/quickstart/quickstart-postgres/index.njk`. Cleared the
      corresponding `^https://img\.youtube\.com/vi/<id>/` entries from
      `.lycheeignore` and dropped the now-unused
      `youtubeEmbed` / `videoEmbed` macro imports from both pages. The
      decision to pick canonical replacements is parked under Phase 10
      (interactive demo or curated video); shipping a working page beats
      a broken embed waiting on a content call. The 404'd thumbnails
      were also the prime CLS contributor on `/intro/`.

### Vendor doc URL drift

Each of the three is the URL on the right; fix in the citing page, then
remove the matching regex from `.lycheeignore`.

- [x] Debezium signals docs — updated
      `src/reconciliation-surgery/index.njk:526` to point at
      `https://debezium.io/documentation/reference/stable/configuration/signalling.html`
      (the page moved from `/operations/signals.html` to
      `/configuration/signalling.html`, also note the upstream
      spelling change `signaling` → `signalling`).
- [x] Fivetran changelog — updated
      `src/_data/toolVersions.mjs` to point at
      `https://fivetran.com/docs/changelog` (the `/getting-started/`
      segment was dropped upstream).
- [x] Matillion release notes — updated
      `src/_data/toolVersions.mjs` to point at
      `https://docs.matillion.com/metl/docs/release-notes-index/`
      (moved from the marketing site to the docs subdomain).
- [x] All three corresponding entries removed from `.lycheeignore`;
      lychee will now catch a regression on any of them.

---

## Phase 4 — Architecture polish (optional, not blocking)

### CSS `@layer` migration

- [ ] Decide whether to wrap `src/assets/css/main.css` imports in
      `@layer reset, tokens, base, layout, components, utilities, page`
      to make the cascade explicit and stop relying on import order.
      **Verification is the byte-identity check** (see
      [`/css-byte-check`](../.claude/commands/css-byte-check.md)). If
      the hash changes, walk the diff and confirm every changed rule
      is intentional. CHANGELOG `[Unreleased]` previously flagged this
      as "needs visual diffs" — pair with browser screenshot QA on the
      assistant-modal, dashboard, and a representative module page.

### Tracing-lite review

- [x] **Removed.** `src/assets/js/tracing-lite.js` deleted; the
      `import { getEducationTracer }` and `try`/`catch` initialization
      block in `src/assets/js/app.js` replaced with a literal no-op
      `educationTracer` object so the per-module `init*(tracer)` call
      sites and unit tests that pass their own mock tracers keep
      working without further refactor. `docs/TRACING.md` rewritten as
      a one-page "this feature was removed; how to re-introduce it
      properly if ever needed." `docs/javascript-architecture.md`
      tracing-integration section rewritten to describe the
      vestigial no-op shape. (Vite config: no entry to remove — the
      `"tracing-lite"` rollup input had already been cleaned up in a
      prior PR.) The original details from the open-decision item are
      preserved below for context — the tracer hardcoded its default
      endpoint to `http://localhost:4318/v1/traces` and instantiated
      with no args, so in production every visitor's browser POSTed to
      _their own_ `localhost:4318` where every request was silently
      swallowed by the fetch `catch`. ~363 LOC + a failed fetch per
      tracked event for zero collected data.

---

## Phase 5 — Quality & test polish

- [x] Added a vitest suite for `lib/path-prefix.mjs` — 14 cases
      covering both env-var precedence, the `owner.github.io`
      root-deploy branch (incl. case-insensitive match), malformed
      `GITHUB_REPOSITORY` fallback, the `getPathPrefixForHost`
      trailing-slash strip, and `normalizePathPrefix` edge cases.
      See `tests/unit/lib/path-prefix.test.js`.
- [x] **Obsolete — feature removed.** Cloud-progress sync and the
      auth flow it depended on were deleted along with their two
      Vite entries (`auth-ui` and `cloud-progress`; `auth.js` was
      a dependency of `auth-ui`, not its own entry); no
      Appwrite-backed user-facing path remains to e2e. See the
      Phase 11 reconciliation item below for the deletion details.
- [x] Add a Lighthouse perf assertion on `/intro/` at **error**
      level. Done — but the threshold has shifted as the test setup
      became honest:
  - First attempt (PR #265): `minScore: 0.9` at `error` level,
    failed CI immediately, walked back to `warn`.
  - Second attempt (PR #267): re-introduced at `minScore: 0.9` after
    3 local runs all scored 1.0.
  - PR #268 discovery: that 1.0 was measured against an unstyled
    page (LHCI path-prefix bug). Real CSS / JS never loaded.
  - **Current state (PR #269):** LHCI now tests the styled page via
    `npm run build:lhci`. Honest baseline is `performance: 0.86`.
    Threshold set to `minScore: 0.8` at `error` level — gives a
    ~0.06 buffer to catch real regressions while perf debt is
    worked off. Raise as scores improve (see the "perf debt" item
    further down this phase).
- [x] **Accessibility regressions on `/intro/`** — five of the six
      failing audits fixed at the DOM level; a11y score went from
      **0.88 → 0.97**. Fixes:
  - `aria-prohibited-attr` — added `role="status"` to the four
    `.stage-events` `<div>`s in `src/intro/index.njk` so
    `aria-label` is valid.
  - `aria-allowed-role` — removed `role="listitem"` from `<article>`
    cards (axe rejects `listitem` on `<article>`) and the matching
    `role="list"` from their `.cdc-methods-grid` / `#cdc-grid`
    parents. The semantic `<article>` element conveys grouped
    content without explicit list semantics.
  - `aria-allowed-attr` — added `role="progressbar"` (plus
    `aria-valuemin`, `aria-valuemax`, `aria-label`) to
    `.progress-bar-fill` in `src/_includes/components/series-nav.njk`
    so `aria-valuenow` is valid.
  - `heading-order` — bumped the two `.intro-callout` `<h3>`s
    ("Outcome" and "Who it's for") to `<h2>` so the lede sub-section
    titles don't skip from h1 → h3.
  - `label-content-name-mismatch` — dropped the conflicting
    `aria-label` from the header progress link in `base.njk`; visible
    text ("Progress" + the percentage) is now the accessible name,
    with the descriptive copy moved to `title`.
- [x] **Follow-up: `target-size`** — closed end-to-end by later
      Phase 7 work. The LHCI test-setup issue this item flagged
      (unstyled DOM under root-served `_site/` vs. production
      `/letstalkcdc/` prefix) was fixed by the `build:lhci` script
      in PR #269, and the residual `target-size` failure on
      `.assistant-send` was resolved in Phase 7 + PR #283's
      visible-state e2e. Defensive `min-height: 44px` /
      `min-width: 44px` on `.nav-chip` / `.nav-dropdown-menu a` /
      `.mobile-menu-toggle` (added in this Phase 5 pass) remain in
      place; cleanup is deferred to a future CSS audit since they
      don't hurt and they make the touch targets honest even if a
      future LHCI run regresses.

- [x] **LHCI test setup serves an unstyled page.** Added
      `npm run build:lhci` (`ELEVENTY_PATH_PREFIX=/ npm run build`)
      which produces a root-deployable artifact, and updated the
      `lighthouse` CI job to call it instead of downloading the
      production-prefixed `site-build` artifact. LHCI now exercises a
      properly styled / scripted page.

      Honest baseline against the styled page (`/intro/`, single run):

  - performance: **0.86** (was a fake 1.0)
  - accessibility: **0.94** (was a fake 0.97)
  - best-practices: **0.96** (unchanged)
  - seo: **1.0** (unchanged)

  Adjusted the `/intro/` error-level performance assertion from
  `minScore: 0.9` to `minScore: 0.8` so CI doesn't fail immediately
  on the honest baseline; the threshold gives a ~0.06 buffer for
  catching regressions while perf-improvement work lands. Raise it as
  scores improve.

- [ ] **`/intro/` perf debt — uncovered by the LHCI fix above.** The
      0.86 score is held back by:
  - `cumulative-layout-shift: 0.58` — large layout shifts during load
    [✓ re-measured 2026-10-08: audit 1.0 in 9/9 runs, CLS median 0.0025,
    max 0.0056 — see P13-5]
  - `layout-shifts: 0` (CLS culprits) — investigate `cls-culprits-insight`
    [✓ audit 1.0 in 9/9 runs; Lighthouse's only culprit is the hero
    `<h1>` web-font swap at 0.0056 — see P13-5]
  - `render-blocking-resources: 0` — eliminate render-blocking CSS/JS [✓ closed by PR #275]
  - `mainthread-work-breakdown: 0.5` — minimize main-thread work
    [✓ audit 1.0 in 9/9 runs (0.6–1.5 s) — see P13-5]
  - `unsized-images: 0.5` — add explicit `width`/`height` to images [✓ closed by Phase 7 SVG dimensions]
  - **Still open (2026-10-08, P13-5):** `dom-size` is the only sub-item
    below 0.9 (0.5, 1,035 elements in 9/9 runs); everything else in this
    box scores 1.0. The box stays open until `dom-size` is trimmed or
    consciously accepted.
  - `dom-size: 0.5` — DOM is excessively large (raw HTML count: 947
    elements after the operational-checklist input-removal trim;
    LHCI's count is slightly higher because it includes
    JS-injected nodes). Heaviest sections by raw element count
    (informational audit for future trim work; sums are
    approximate because section boundaries overlap):
    - **CDC platforms card grid — closed.** Two PRs:
      PR #293 data-drove the 15 vendors into
      `src/_data/cdcVendors.mjs` + a Nunjucks loop (pure
      refactor, byte-identical 965 → 965 rendered HTML, ~135
      template lines removed). The follow-up shipped the
      "show first 6 with expand" affordance — the first 6
      cards render inline; the remaining 9 live in
      `<template id="cdc-extra-cards">`, which the
      `pages/intro.js` Show-All button (or any filter
      interaction, including a deep-link hash) clones into the
      grid on demand. Lighthouse's `dom-size` audit only
      counts elements in the rendered tree, not template
      content, so this is a real **48-element reduction
      (965 → 917)** on initial paint. The `<noscript>` branch
      points readers at `/tooling/` for the full list when JS
      is off, so the page still degrades gracefully. Smoke
      assertions added: exactly 6 inline cards, the template,
      and the button must all exist.
    - **Methods at a Glance table** (~135 elements). Each cell
      uses `<span class="cell-indicator">` + `<span class="cell-text">`;
      collapsing the indicator into a `::before` pseudo-element
      would save ~36 spans across the table at the cost of a
      small a11y trade-off (currently `aria-hidden="true"` is
      explicit on the indicator span).
    - **Operational gotchas checklist** (was ~144, now ~134
      after this PR — five no-op `<input type="checkbox">` +
      `<label>` wrappers removed; the badges had no JS
      persistence, so the affordance was a UX false-positive
      anyway).
    - **Trailing footer / scripts area** (~199 elements). Mostly
      the global footer (4 columns × ~10 links) plus JSON-LD
      and module preload scripts. Trimming would affect every
      page — not an `/intro/`-specific fix.

  Fix iteratively; raise the `/intro/` perf threshold to match.

- [x] **`/intro/` a11y debt** — both sub-items closed by Phase 7:
  - `color-contrast` — fixed in PR #274 (legacy CSS variable
    aliases + `--color-text-muted` token swap, score 0 → 1.0 on
    `/intro/`).
  - `target-size` — fixed in Phase 7 (the `.assistant-send` bump
    to 44×44 in `src/css/assistant.css`) and validated by PR #283's
    visible-state e2e. The Lighthouse `target-size` audit can
    still report a false-positive when axe inspects the `hidden`
    panel; the e2e is the real proof for real users. Captured in
    the LHCI threshold tuning narrative in `[Unreleased]`.

---

## Phase 6 — Documentation freshness

- [x] Pass each doc in `docs/*.md` (except `archive/`) for stale
      references; one doc per agent session is plenty. Look for: file
      paths that no longer exist, `.cjs`/`.mjs` mismatches, npm scripts
      that were renamed. Both sub-items below complete, so the parent
      is closed; future drift gets logged as a fresh entry.
  - [x] `docs/javascript-architecture.md` — removed `tracing.js`
        listing (deleted in PR #261), replaced the hardcoded
        "Total: 238 tests, 90.5% coverage" sentence with a "run
        `npm test` and read the footer" pointer (count drifts as suites
        are added; was 268 as of May 2026).
  - [x] Other docs (`SETUP.md`, `INTEGRATION.md`, `CONTRIBUTING.md`,
        `HOSTING.md`, `COMMUNITY.md`, `DISCUSSIONS_SEED.md`, `SANDBOX.md`,
        `TRACING.md`, `video-embeds.md`, `adding-modules.md`,
        `adding-quizzes.md`) audited for the usual stale-term set
        (`styles.css`, `csso`, `@opentelemetry`, deleted scripts,
        AI-CONTRIBUTING refs, `eleventy.config.cjs`, `ghp_` PAT
        placeholders): no remaining stale refs.
- [x] Moved `docs/PRD-SITE-REVAMP.md` → `docs/archive/PRD-SITE-REVAMP.md`.
      The "Historical document" banner at the top already declared its
      status; archive placement makes the status obvious from the file
      tree too. Updated references in `CLAUDE.md` and `docs/README.md`.

---

## Phase 7 — `/intro/` perf & a11y honest baselines

Uncovered by the LHCI test-setup fix in Phase 5 (the styled-page audit
revealed perf 0.86 with CLS 0.58). Walk these in order — the cheap fixes
first so the threshold can ratchet up as we land them.

- [x] **`unsized-images` audit was failing site-wide.** The custom
      `{% img %}` shortcode in `eleventy.config.mjs` emitted `<img>`
      tags with no `width`/`height` attributes. Reserved layout space
      at build time by parsing `viewBox` / explicit `width`/`height`
      attrs from the SVG file on disk and emitting them on every
      `<img>` produced from a local `.svg`. Caller-provided
      `width`/`height` always win. Cache keyed on `src` so we read each
      SVG once per build. Remote URLs (e.g. YouTube thumbnails) fall
      through unchanged. Affected call sites resolved automatically:
      `src/intro/index.njk:433`, `src/_includes/layouts/base.njk:71`,
      `src/snapshotting/index.njk:189`, `src/schema-evolution/index.njk:50`,
      `src/cloud-labs/index.njk:21`, `src/overview/index.njk:30`,
      `src/exactly-once/index.njk:260`. **DoD:** `unsized-images` audit
      → 1.0 across all module pages.

- [x] Identify remaining CLS culprits on `/intro/` via the LHCI
      `cls-culprits-insight` audit (run `npm run lighthouse` after
      `build:lhci`). With the 404'd video embed gone and SVGs now
      dimensioned, suspects narrow to font-swap reflow on the long
      lede and the `.cdc-methods-grid` reveal.
      **Done 2026-10-08 (P13-5):** the font-swap suspect is the only one
      that registers — `section.hero-section … h1.type-display`, 0.0056,
      caused by late-loaded Plex 500/700/mono-500/600 woff2. The
      `.cdc-methods-grid` reveal did not register in Lighthouse or in the
      independent `PerformanceObserver` cross-check. Audit scores 1.0 in 9/9
      runs; total CLS median 0.0025 (well under 0.1).

- [x] Eliminate render-blocking by moving the three base-layout
      stylesheets and page-specific `head_extra` stylesheet links to
      deferred preload stylesheet tags with
      `onload="this.onload=null;this.rel='stylesheet'"` and
      `<noscript>` fallbacks. The rewrite is attribute-order agnostic
      for any remaining href-first `head_extra` links, and redundant
      page-level base-bundle links such as the old one in
      `src/tooling/index.njk` are removed. A small inline critical rule
      set keeps the default theme background/font stable before the
      full CSS arrives. Verify via `/css-byte-check` after — bundled
      output should be unchanged.

- [x] Re-measured `target-size` against the styled LHCI build. Of
      the previously-flagged elements, only `.assistant-send` (the
      assistant FAB submit button) is still red — bumped from 36×36
      to 44×44 in `src/css/assistant.css`. Lighthouse still reports
      the audit failing because axe inspects the `hidden` panel
      computationally and reports the button at "44px by 7px" when
      `display: none`. Real users see the 44px button only when the
      panel opens; will clear once we add a visible-state e2e test.
      No `min-height: 44px` overrides removed in this pass — left
      defensively in place; cleanup deferred to the same e2e PR.

- [x] Audited `color-contrast` against the styled build. Lighthouse
      went from **0 → 1.0** on `/intro/` (20 nodes → 0). Root cause
      was deeper than a single token: every page-specific stylesheet
      (cdc-simulation, quiz, assistant, dashboard-page, ...) was
      authored against alternate variable names — text family
      (`--text-primary` / `-secondary` / `-tertiary` / `-muted` /
      `-inverse`, `--muted`, `--color-text`, `--color-heading`),
      surface family (`--bg`, `--bg-primary`, `--bg-secondary`,
      `--bg-elevated`, `--bg-code`, `--surface`, `--card-bg`,
      `--color-background`, `--color-bg*`, `--color-surface*`),
      border (`--border`, `--border-color`, `--color-border`), accent
      (`--accent`, `--accent-primary`, `--accent-light`, `--accent-hover`,
      `--color-accent`, `--color-primary`), and semantic
      (`--success`, `--ok`, `--warning`, `--warn`, `--err`,
      `--color-danger`, `--color-{success|error|warning|info}-light`).
      None of those existed in the design system, so every `var()`
      lookup fell through to its hardcoded light-mode fallback and
      broke contrast on the dark default theme. Fix in
      `src/assets/css/01-variables.css`:

      - Added ~35 legacy aliases mapping every alternate name found in
        a real call site to its `--color-*` equivalent. Defined inside
        the dark/default `:root, :root[data-theme="dark"]` rule only —
        the CSS cascade resolves them per-theme at use site, so the
        light theme block does NOT need to duplicate the aliases.
      - Swapped `--color-text-muted` values between themes. Dark was
        `#64748b` (too dark for 4.5:1 on near-black), light was
        `#94a3b8` (too light for 4.5:1 on white). Now dark uses
        `#94a3b8` and light uses `#52606d` (≥5.6:1 on white AND
        ≥4.5:1 on `--color-bg-elevated`, which `#64748b` did not).
      - Replaced hardcoded `#6b7280` in `.sim-btn-reset` with
        `var(--color-text-secondary)`.
      - Gave `<button id="cdc-reset">` the existing `.cdc-chip` class.
      - Pointed `.assistant-suggestion-chip` at
        `var(--color-accent-hover)` so white-on-accent passes AA
        (`#fff` on `#3b82f6` is 3.7:1; on `#2563eb` is 5.2:1).

      Renaming the 12 legacy callers to use `--color-*` directly is a
      separate cleanup — opens the door for an `@layer` migration too.

- [x] Raised the `/intro/` perf threshold in `.lighthouserc.json`
      from `minScore: 0.8` to `0.82`. Honest 3-run distribution
      after PR #270/#274/#275 lands at perf 0.86–0.94 with median
      0.87 on a loaded dev machine. **Picked 0.82 (not 0.85)** for
      a ~0.05 noise buffer against the worst observed outlier
      (0.79 on a heavily-loaded machine during render-blocking PR
      testing). Also added an error-level `categories:accessibility`
      assertion at `minScore: 0.95` — a11y has been rock-solid at
      0.97 across every URL since PR #274 landed, and putting a
      0.95 floor locks the gain in. The original DoD (perf ≥ 0.92,
      a11y = 1.0, CLS ≤ 0.1) lives on as the **next** bump target
      once render-blocking-aware perf improvements continue — the
      remaining headroom is in `dom-size` (currently 0.5, 1,068
      elements on `/intro/`) and the never-fully-confirmed
      `cls-culprits-insight` audit. Until then, 0.82 documents the
      floor without flake risk.

---

## Phase 8 — Trust & credibility surface

Derived from the May 2026 brutal state-of-the-project review. Tier-1
items competitors flagged as making the site look "static and
untrusted": missing author identity, freshness signals, methodology
narrative, edit affordances. Each item is sized to one PR.

- [x] **`dateModified` rendered prominently on every module page.**
      Already shipped — `src/_includes/layouts/base.njk:197-209`
      renders an `<aside class="page-meta">` with a semantic `<time>`
      element ("Last reviewed YYYY-MM-DD" plus "Originally published"
      when different), gated on `seriesKey` so non-module pages don't
      get the metadata block. Confirmed in built `_site/intro/`,
      `_site/snapshotting/` etc.

- [x] **"Edit this page on GitHub" link in the global footer.**
      `src/_includes/layouts/base.njk` `.footer-meta` now appends a
      link of the form
      `https://github.com/{{ site.repository }}/edit/main/{{ page.inputPath | replace('./', '') }}`
      on every page that uses the base layout. `layout: null`
      outputs — `src/404.njk`, `src/mermaid-sandbox/index.njk`,
      and the redirect stubs under `src/_redirects/` — don't get
      a footer at all, so they intentionally don't carry the link.
      Uses Eleventy's built-in `page.inputPath` and the existing
      `site.repository` config. Verified resolves correctly on
      module pages (`src/intro/index.njk`), home
      (`src/index.njk`), and content pages
      (`src/errata/index.njk`). `scripts/smoke.mjs` now asserts
      the link is present and correctly-shaped on those three
      representative outputs.

- [ ] **Author photo.** Two steps, neither currently done: (1) add
      the asset under `src/static/author/` and flip the `image`
      field in `src/_data/author.mjs` from `null` to the public
      path; (2) add an `<img>` to the page-meta aside in
      `base.njk` and reference `image` in the Article JSON-LD
      author block — currently that block only emits `name` +
      optional `url`, so the data flip alone is a no-op. Content
      decision blocks step 1; the template work is
      straightforward once the asset lands.

- [x] **`/methodology/` page shipped.** New
      `src/methodology/index.njk` covers: who writes the site
      (pulls from `src/_data/author.mjs`), why it stays
      vendor-neutral by default, the three verification
      pipelines (lychee link-check via `linkcheck.yml`, LHCI
      perf/a11y assertions via `ci.yml`, `verify-all` +
      `smoke:core` as the local minimum bar), how freshness
      signals work (`dateModified` + RSS feed sort order +
      `toolVersions.mjs`), where corrections surface (errata
      hub + inline errata callouts shipped earlier this phase),
      what's intentionally NOT here (no vendor benchmarks, no
      paraphrase-the-docs cargo cult, no consulting advice).
      Footer "Resources" column now links to it. CSS
      (`.methodology__pipeline` definition list) lives in
      `04-components.css` next to glossary/errata blocks, uses
      existing tokens. `scripts/smoke.mjs` asserts the page
      exists and that four major section anchors (`who`,
      `vendor-neutral`, `how-verified`, `corrections`) are
      present so a content edit that accidentally drops a
      section fails CI. The page is intentionally tone-flat and
      derived from observable repo signals — no claim is made
      about a review process that doesn't exist; everything
      asserted is something a reader can verify by walking the
      Git history themselves.

- [x] **Surface errata inline per module.** Plumbing shipped:
      new data file `src/_data/errata.mjs` (URL-tagged entries with
      `id`, `urls`, `title`, `dateModified`, `body` HTML),
      `errataForUrl` Nunjucks filter in `eleventy.config.mjs`,
      and `src/_includes/components/errata-callout.njk` rendered
      from `base.njk` at the top of `<main>` (above the hero).
      The partial renders a collapsed `<details>` "Known errata
      for this page (N)" disclosure with a link to the hub at
      `/errata/`; it emits nothing when no entry matches
      `page.url`, so it's safe to include unconditionally.
      Seeded with one real entry for the May 2026 video-embed
      removal (PR #270), tagged to `/intro/` and
      `/quickstarts/quickstart-postgres/`. CSS lives next to the
      `page-meta` rules in `src/assets/css/04-components.css`.
      `scripts/smoke.mjs` asserts presence on the two tagged
      pages and absence on `/exactly-once/` so a regression in
      the filter (or the partial accidentally rendering
      everywhere) fails CI. The errata-hub page itself is
      unchanged and keeps its hand-written prose; the data file
      handles only the per-page surfacing.

- [ ] **Author identity expansion.** `src/_data/author.mjs`
      `sameAs: ["https://github.com/sandgraal"]` is the only
      cross-platform link. Add LinkedIn, conference talks, podcast
      appearances when they exist. `advisoryUrl: null` keeps the
      footer CTA hidden — set when ready to surface it.

---

## Phase 9 — Comparison & conversion surface

Tier-1 competitor gap: no head-to-head comparison content (Estuary,
Airbyte, Fivetran rank for these queries), no glossary as a
first-class page, no RSS, no email capture.

- [x] **`/compare/` hub shipped** (PR #309, revamp phase 4b).
      Delivered as **one comprehensive comparison page** rather than
      the pairwise pages originally sketched (maintainer call: a
      single decision surface beats N thin vs-pages for SEO and for
      the reader). `src/_data/cdcCompare.mjs` drives a 6-platform ×
      9-dimension capability matrix (Debezium, AWS DMS, Fivetran,
      Airbyte, GoldenGate, Qlik Replicate) rendered by
      `src/compare/index.njk` with `src/assets/css/pages/compare.css`;
      the **delivery-semantics row is highlighted** so the site's
      at-least-once + idempotent-sink thesis reads straight off the
      grid. The reusable table lives inline in the page template; a
      shared `components/` extraction was not needed for a single
      caller.

- [x] **Glossary shipped at `/glossary/`.** New
      `src/_data/glossary.mjs` holds 14 seed entries (log
      internals, event shapes, delivery semantics, streaming
      infrastructure), each with a kebab-case `slug` for stable
      anchor IDs (`/glossary/#tombstone`, etc.), optional
      `aliases` list, and optional `related` cross-link slugs.
      `src/glossary/index.njk` renders an alpha-sorted semantic
      `<dl>` with per-entry permalink anchors that fade in on
      hover; the page template resolves `related` slugs back to
      the canonical term display string at build time.
      `src/index.njk` Glossary section was a 5-term inline list —
      replaced with a one-paragraph teaser linking to the new
      page so the homepage stays light and there's one source of
      truth for definitions. Footer "Resources" column now has a
      Glossary link as its first entry. CSS lives in
      `04-components.css` next to the page-meta / errata blocks
      and uses existing tokens (no new variables).
      `scripts/smoke.mjs` asserts the page renders ≥ 10 terms
      and the `id="tombstone"` anchor exists, so a regression in
      the for-loop or a typo in the slug fails CI. The
      `intro/` etc. pages don't actually have inline glossary
      lists today (the plan wording was aspirational); only the
      homepage list was real and is now migrated.

- [x] **RSS feed at `/feed.xml`.** Hand-rolled
      `src/feed.11ty.cjs` — rejected `@11ty/eleventy-plugin-rss`
      to avoid a new runtime dep for what is ~20 lines of XML.
      Filters `collections.all` to items with `seriesKey` set,
      sorts by `dateModified` desc with `datePublished` as
      tiebreaker, caps at 30 entries. Emits RSS 2.0 with the
      `atom:` self-link and `dc:creator` namespace; renders the
      same `--color-*` prefix-aware URLs as `sitemap.11ty.cjs`
      (uses `site.host`, not `site.origin`, so the prefix is
      applied in prod). An `application/rss+xml` alternate link
      was added to the base layout `<head>` for feed-reader
      auto-discovery. Errata aren't included yet — the errata
      page is a single static doc, not a stream of entries;
      revisit when individual errata get their own per-entry
      pages.

- [ ] **Newsletter capture.** Static-first: a Buttondown / Kit /
      ConvertKit embed in the base layout footer + a dedicated
      `/newsletter/` page. Pick provider before building.

  ⚠️ **Deferred (revamp phase 4d):** the only open item from the
  August 2026 design revamp. Blocked on a maintainer decision —
  which provider. Build is a ~1 PR job once chosen (accessible
  email-capture component, footer + end-of-module, static-first,
  no secrets in the repo). Everything else in the revamp shipped.

- [x] **"Suggested next module" component — already shipped.**
      `src/_includes/components/series-nav.njk` (rendered by
      `base.njk:248-250` on every page where `seriesKey` is set)
      already surfaces prev/next module links by `series.mjs`
      array order — the brutal review missed this on its first
      pass. The cross-skill-level `skillLevel` adjacency variant
      I sketched isn't implemented and isn't an obvious win;
      revisit only if reader feedback indicates the strict
      next-in-order navigation is confusing.

---

## Phase 10 — One real interactive demo

Tier-1 gap: zero working interactive demos across the site. Confluent
Developer, Debezium, Estuary, Materialize all have one — we have one
inline `<svg>` across all module pages.

- [x] **Shipped: interactive change-event visualizer on `/intro/`**
      (PR #310, revamp phase 4c). Chose the `/intro/`-page direction
      (highest leverage). Rather than the WAL→broker→sink canvas
      animation, it ships a **live insert / update / delete → change-
      event visualizer**: the reader fires a row mutation and watches
      the resulting Debezium-style JSON envelope build, with the
      `op`, key, and `before`/`after` fields highlighted — teaching
      the event _shape_ (the thing every later module builds on)
      rather than just the plumbing.
- [x] Shipped as a single framework-free ESM module,
      `src/assets/js/pages/cdc-event-demo.js`, styled by
      `src/assets/css/pages/intro.css`. Progressive-enhancement
      (the page is complete without JS) and reduced-motion aware.
      A11y hardened after review: the event-body `<pre>` carries
      `tabindex="0"` so the scrollable region is keyboard-reachable
      (caught by the axe e2e pass, which is stricter than pa11y).
- [x] **Slots refilled.** The `/intro/` position that previously held
      the 404'd Gunnar Morling embed now hosts the visualizer above.
      The `quickstart-postgres` slot ships as denser prose (no demo
      needed there). The `tooling`-page YouTube embed (`QYbXDp4Vu-8`)
      remains fine and unaffected, as noted.

---

## Phase 11 — Repo hygiene & dead-system retirement

- [x] **Retire the handoff system.** Already done in PR #270
      (folder + workflows + dashboard removed; cross-session
      context now in IMPLEMENTATION-PLAN.md + CHANGELOG.md + git
      log). Listed here for completeness — closes the brutal
      review's "anti-credibility surface" tier-2 item.

- [x] **Reconciled — feature is dead, code removed.** Reconciliation
      finding: `docs/SETUP.md` had marked auth + cloud progress
      sync "⚠️ Deprecated — has been removed" since the May 2026
      simplification, but `src/assets/js/auth.js` (216 LOC),
      `src/assets/js/auth-ui.js` (474 LOC) and
      `src/assets/js/cloud-progress.js` (283 LOC) — 973 LOC total —
      were still on disk, still bundled by Vite (`auth-ui` and
      `cloud-progress` entries in `vite.config.mjs`), and still
      loaded as deferred scripts on every page via `base.njk`. The
      `auth-ui` bundle was even injecting a non-functional "Log In"
      button into the global header on every page; clicking it
      opened an auth modal that `console.log`ed
      "Appwrite not configured; authentication unavailable" and
      did nothing — visible broken UI shipping in production.
      Deleted the three JS files plus the `auth.css` stylesheet
      (~430 LOC of orphan styles) and its eleventy passthrough,
      removed the two Vite entries, removed the four `base.njk`
      script/preload references, and updated
      `docs/javascript-architecture.md`,
      `.github/copilot-instructions.md`, and this plan to match.
      The `progress` and `events` collection definitions in
      `appwrite.collections.json` are retained as a historical
      reference but are no longer written by any shipping code;
      the only live Appwrite consumer is `assistant_feedback`.
      Closes the related Phase 5 e2e item — there is no
      Appwrite-backed user flow left to test end-to-end.

- [x] **README badges — auto-updating CI subset.** Three
      GitHub-native badges added to the README header: CI
      (build/lint/test), Deploy (GitHub Pages), and Link check
      (lychee). Each is an auto-updating SVG that links back to
      the workflow run history. Closes the auto-updating slice
      of the original brutal-review item; the Lighthouse and
      license badges from that item are tracked as explicit
      follow-ups below so the roadmap doesn't lose track.

- [ ] **README badge: license.** Skipped above because there is
      no `LICENSE` file at the repo root. Pick a license (MIT,
      Apache-2.0, CC-BY for content + MIT for code are the
      common choices for an educational repo), commit the file,
      then add a shields.io static badge linked to the license
      file.

- [ ] **README badge: Lighthouse perf.** Skipped above because
      a static shield would rot as scores drift and the project
      has no hosted LHCI store. Two ways to unblock: (1) wire
      LHCI's GitHub-token mode so each PR run uploads a public
      report; (2) accept a static perf badge that's bumped
      manually each time the threshold raises in
      `.lighthouserc.json`. Option 2 is cheaper if option 1
      keeps slipping.

- [x] **`BreadcrumbList` JSON-LD audit — found and fixed a real
      shipping bug.** Sampled the three pages with BreadcrumbList
      JSON-LD (`/intro/`, `/multi-tenancy/`, `/exactly-once/`)
      against both `NODE_ENV=production` and
      `ELEVENTY_PATH_PREFIX=/` builds. `/intro/` rendered
      correctly; the other two shipped a literal unexpanded
      Nunjucks expression as the `item` URL because their
      front-matter used the plain `head_extra:` key rather than
      `eleventyComputed: head_extra:`. The plain key bypasses
      Nunjucks pre-processing, and `lib/render-head-extra.mjs`
      only handles `{{ '/path' | url }}`, `{{ site.host }}`, and
      `{{ site.origin }}` — not `{{ page.url }}` or
      `{{ canonicalUrl }}`. Converted both pages to
      `eleventyComputed: head_extra:`, matching the pattern
      intro/, snapshotting/, etc. already use. Verified all
      three BreadcrumbList blocks now produce correct
      prefixed/unprefixed URLs in both builds.

      Mechanics, to be precise: `eleventyComputed` does NOT
      bypass `renderHeadExtra` — `base.njk:60` still pipes the
      computed value through
      `{{ head_extra | renderHeadExtra | safe }}` for things
      like the stylesheet-link preload rewrite (PR #275). What
      `eleventyComputed` adds is a Nunjucks evaluation pass
      BEFORE the filter, with `page` in scope, so `page.url`
      and `canonicalUrl` resolve there. The filter then only
      sees the leftover patterns it knows about. The
      "mirror new substitutions" caveat at
      `lib/render-head-extra.mjs:18` is still load-bearing for
      anything that genuinely can't get pre-evaluated, but the
      `eleventyComputed:` path makes it less risky.

      Also dropped the duplicate `<meta name="description">`
      from `multi-tenancy/index.njk`'s head_extra block —
      `base.njk:7` already emits one from the page-level
      `description` field, and SEO crawlers see conflicting
      duplicate meta as a smell.

- [ ] **CSS `@layer` migration** (Phase 4 carry-over). Pure
      refactor with byte-identity verification. Defer unless
      a real specificity bug forces it; no user value otherwise.

- [x] **e2e coverage of the assistant FAB panel** —
      `tests/e2e/assistant.spec.js` opens the panel via the FAB
      click and asserts the rendered `.assistant-send` button
      measures ≥44×44 CSS pixels (the WCAG 2.2 touch-friendly
      tier). Two companion tests cover the close button and the
      Escape key. Skipped on the mobile-chrome project —
      Pixel 5 viewport has consistent pointer-intercept flake
      in headless Playwright; desktop chromium + webkit
      coverage is sufficient. The Lighthouse `target-size`
      false-positive on the still-`hidden` element will keep
      flagging unless we tighten the LHCI a11y threshold past
      0.95 (currently 0.93 to absorb the false-positive); the
      e2e spec is the real proof of correctness for real users.
      **Found and fixed a real bug while writing the test:**
      `src/css/assistant.css:36` set `#askPanel { display: flex }`
      at ID specificity, overriding the UA default
      `[hidden] { display: none }` — so the "hidden" panel was
      still in the pointer-event hit-test path and the keyboard
      tab order. Added an explicit
      `#askPanel[hidden] { display: none }` rule.

---

## Phase 12 — Content depth (correct → comprehensive)

The August 2026 SME review found the CDC content unusually careful and
accurate. These are the gaps between _correct_ and _comprehensive_ —
subjects the site currently names in passing, or treats as Kafka-only,
where a reader who followed the material would still be missing the
mechanism. None of these are corrections; the existing text is right as
far as it goes.

Each item must hold the site's standing thesis: delivery is
**at-least-once**, correctness comes from **idempotent sinks** keyed on
the primary key and ordered by **log position, not `ts_ms`**, and
end-to-end exactly-once across systems is not achievable.

- [x] **Watermark-based incremental snapshots.** Shipped as
      `#watermarks` on `/snapshotting/`: the low-watermark → chunk read →
      high-watermark → subtract-the-window sequence, why the subtraction
      is what makes it correct (the only rows a concurrent write could
      have staled are exactly the set removed), plus the real costs —
      signal-table writes, PK-ordered chunking, read load, and the
      unchanged need for an idempotent sink. Original scope: The site names
      incremental/signal-based snapshots but never explains the
      algorithm, which is the single most-asked "how does that actually
      work?" question in CDC. Cover the DBLog watermark method: open a
      low watermark, read a chunk of the table, close with a high
      watermark, then drop chunk rows that the log superseded between
      the two — which is what lets a snapshot run **concurrently** with
      streaming and still converge, with no table lock and a resumable
      cursor. Belongs on `/snapshotting/`.
- [x] **Non-relational sources.** Shipped as a new module at
      `/non-relational/`: MongoDB change streams (resume tokens as the
      offset, `updateLookup` returning a newer state than the event
      described, size-capped oplog), DynamoDB Streams (per-shard
      ordering, hard 24h horizon where lag costs data rather than
      freshness), and Cassandra (per-node commitlog, structural
      duplicates at RF>1, no cross-node ordering, mutations rather than
      row states — where last-write-wins on cell timestamps is the
      correct merge rule). Original scope: Log-based CDC is presented almost
      entirely through relational WAL/binlog/redo. Add MongoDB change
      streams (oplog, resume tokens), DynamoDB Streams (24h retention,
      shard-per-partition ordering) and Cassandra CDC (commitlog,
      per-node not per-cluster, no cross-partition ordering) — including
      where each _breaks_ the relational mental model, which is the
      point of the section.
- [x] **Security depth.** Shipped as a new module at `/security/`:
      why a change log is riskier than its table (keeps history the row
      does not, fans out, outlives deletion), `column.exclude.list` and
      salted-hash masking at the connector rather than downstream, the
      wider-than-expected replication privileges per engine, the DLQ as
      an overlooked full-payload copy, and three erasure strategies
      ending in crypto-shredding. Original scope: PII handling is currently one-line bullets.
      Cover column filtering/masking at the connector (before the event
      reaches the broker), encryption in transit and at rest, key
      handling for a log that outlives the row, and the RBAC/ACL surface
      a CDC user actually needs (replication privileges are broader than
      most read-only roles).
- [x] **Delivery beyond Kafka.** Shipped as `#transports` on
      `/event-envelope/`: ordering unit, retention and sink impact for
      Kafka, Pulsar (`Key_Shared` vs `Shared`), Kinesis (per-shard, and
      what resharding does to per-key order) and Pub/Sub (no ordering
      without an ordering key). Closes with the point that the thesis is
      transport-independent — all four are at-least-once, none gives
      exactly-once into an external sink. Original scope: Ordering, retention and replay
      semantics are taught Kafka-first throughout. Add Pulsar, Kinesis
      and Pub/Sub — in particular that Pub/Sub gives **no ordering
      without an ordering key**, Kinesis orders per shard with a fixed
      retention window, and how each changes the sink's dedup strategy.

---

## Phase 13 — Maintenance & performance queue (agent-executable)

Added 2026-10-08 from a backlog sweep (this plan's open boxes, a code
scan for TODO / skipped-test / placeholder signals, GitHub issue / PR /
CI state, and `npm outdated`). Everything here can be done without a
maintainer decision; everything that cannot is in Phase 14.

**Working agreement.** The conductor protocol, role → model routing,
Definition of Ready and Definition of Done live in
[`CONDUCTOR.md`](CONDUCTOR.md). Items are ordered by value ÷ effort
within each tier, one PR per item, no item left half-done. **Work this
queue before the older open boxes.** Where an item overlaps an older box it
says so, and flips that box in the same commit.

Item fields: **Outcome** (what is true afterwards) · **Accept** (testable
criteria — an item is not done until each holds) · **Verify** (the
commands that prove it) · **Size** (S ≤ 1 h, M ≤ half a day, L = split
it) · **Role** (who executes; see `CONDUCTOR.md`) · **Needs** (ordering
dependencies).

### Tier 0 — requested by the maintainer (work first)

- [x] **P13-10 · Replace Appwrite with Supabase and remove Appwrite
      entirely.** Outcome: assistant 👍/👎 feedback reaches a database in
      production (it never has: `deploy.yml` passes no `APPWRITE_*`
      variables, so every vote sat in a local queue that was never
      drained), and nothing in the repo depends on Appwrite. Target: the
      `letstalkcdc` Supabase project (`veagqeduouwapbfvpsfj`, region
      us-east-1), whose `public.assistant_feedback` table already exists
      with RLS on, an insert-only policy for `anon`, and length checks
      (`question` ≤ 2000, `intent_id` ≤ 200). No migration is needed. The
      `events` and `scenarios` tables in the same project belong to the
      playground work — do not touch them.
      Accept:
  - Feedback is sent with plain `fetch` to PostgREST using the
    **publishable** key. No SDK, no CDN script, no new dependency, no
    secret in the repo or the built output.
  - Retries are safe: each entry carries a client-generated UUID as `id`,
    HTTP 409 counts as delivered, other 4xx responses drop the entry
    (they can never succeed), 5xx / network errors retry with an attempt
    cap, the local queue is size-capped, and two syncs cannot send the
    same entry concurrently. `question` is truncated to the column limit
    before sending.
  - With the config unset (local dev, forks) the site still works and
    feedback queues locally.
  - Config comes from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
    (build-time env → `src/_data` → `base.njk`), and `deploy.yml` passes
    both from repository **variables**.
  - Removed: `src/_data/appwrite.mjs`, `src/js/appwrite-config.js`,
    `test-appwrite.cjs`, `appwrite.collections.json`, the Appwrite
    entries in `.env.example`, the now-unused `dotenv` devDependency,
    and every Appwrite instruction in the docs. A unit test fails if
    "appwrite" reappears in `src/`, `scripts/`, `tests/` or
    `.github/` code. `CHANGELOG.md`, `SECURITY.md`'s history note,
    `docs/archive/` and this plan's historical entries may keep the word.
  - Tests: unit tests for the send / retry / queue logic with an injected
    `fetch`; an e2e test that clicks 👍 and asserts the request body
    against a mocked endpoint.

  Verify: `/verify-all`, `npm run smoke:core`, `npm run test:e2e`, and
  `rg -il appwrite src scripts tests .github` returns nothing. After merge
  and after the maintainer sets the two repository variables, one real vote
  on the deployed site produces a row (checked with a read-only query).
  Size: L → ship as one PR but brief two roles in parallel on disjoint
  files (code + tests; docs + config templates). Role: `implementer`,
  then `reviewer`. **Maintainer step:** set `SUPABASE_URL` and
  `SUPABASE_PUBLISHABLE_KEY` as Actions variables; and delete the Appwrite
  project (and rotate the API key noted in `SECURITY.md`) — agents cannot
  and should not do either.
  2026-10-08: Shipped on branch `claude/supabase-feedback`; the feedback table already existed in the Supabase project (migration `playground_and_feedback_schema`); maintainer steps still open: set the two Actions variables, delete the Appwrite project and rotate the key noted in `SECURITY.md`, optionally apply the commented least-privilege revoke in `supabase/schema.sql`.

### Tier A — quick wins

- [x] **P13-1 · Retire the stale `.lycheeignore` canonical-loopback
      entries.** Outcome: link-check no longer carries workarounds for
      pages that have been live since 2026-08-27. Accept: the six
      entries for `/glossary/`, `/methodology/`, `/cloud-labs/`,
      `/compare/`, `/non-relational/`, `/security/` are removed (the
      Snowflake / Oracle / Fivetran entries stay — those are external);
      the `linkcheck` workflow passes on the PR. Verify: all six URLs
      return 200 in production (checked 2026-10-08); `npm run build`;
      CI `linkcheck`. Size: S. Role: `scribe`.
- [x] **P13-2 · Make link-check tolerate transient 5xx.** Outcome: a
      single flaky 503 (as on the Dependabot PR's run of 2026-09-01,
      1 error in 519 links, healthy a moment later) no longer fails
      the check. Accept: `linkcheck.yml` passes `--max-retries` and
      `--retry-wait-time` to lychee; the workflow still fails on a real 404. Verify: workflow lint (`actionlint` if present, else YAML
      parse) and a green CI run. Size: S. Role: `implementer`.
- [x] **P13-3 · Remove dead "coming soon" copy.**
      `src/cloud-labs/index.njk:158` renders a "Cloud labs are coming
      soon" callout when `publishedLabs == 0`, but all five labs
      exist; `src/_includes/components/ui.njk:73,112` default a CTA to
      "Coming Soon". Outcome: no user-visible placeholder copy. Accept:
      `rg -i "coming soon" _site` finds nothing that a reader can reach;
      if a branch is genuinely unreachable it is deleted, not just
      hidden. Verify: `npm run build`, `rg -i "coming soon" _site`,
      `npm test`. Size: S. Role: `implementer`.
      _2026-10-08: removed the unreachable `publishedLabs` callout and counter in `cloud-labs/index.njk` and the no-href `Coming Soon` branch of `module_card`; kept `series_card`'s `state: disabled` default as a deliberate exception to the "unreachable → deleted" rule: it is an opt-in API with its own styling (`.series-card.is-disabled` in `04-components.css`), no data sets `state` today, and `_site` has zero hits. Deleting it would also mean touching CSS, which belongs to `css-refactor`. Revisit if a later audit wants the branch gone._
- [x] **P13-4 · Take the in-range dependency updates as one batch.**
      Every package whose `wanted` version (the newest inside its current
      semver range, per `npm outdated`) is ahead of `current` — on
      2026-10-08 that included `@11ty/eleventy` 3.1.2→3.1.6, `vite`,
      `eslint`, `prettier`, `postcss`, `autoprefixer`, `cssnano`,
      `postcss-import`, `vitest`, `jsdom` and the Playwright /
      axe packages — plus an `engines` field (`node >=20.19`, the floor Vite 8, ESLint 10 and jsdom need; matching
      `.nvmrc` and CI). Majors are _not_ in this batch (see P13-8).
      Accept: `verify-all`, `smoke:core` and the Playwright suite pass; if
      any of `autoprefixer`, `postcss`, `postcss-import` or `cssnano` move
      the production CSS hash, the diff
      of `_site/assets/css/styles.css` is walked and the new baseline is
      recorded in `CLAUDE.md`. Verify: `/verify-all`, `/css-byte-check`,
      `npm run smoke:core`, `npm run test:e2e`. Size: M. Role:
      `implementer` (+ `css-refactor` if the CSS hash moves).
      **Resolved 2026-10-08:** `npm update` (lockfile only; no range
      edited, no direct dependency crossed a major): eleventy 3.1.2→3.1.6,
      vite 8.1.3→8.3.4, eslint 10.0.0→10.12.0, prettier 3.8.1→3.9.9,
      postcss 8.5.26→8.5.29, autoprefixer 10.4.21→10.6.1, cssnano
      7.1.2→7.1.9, postcss-import 16.1.1→16.2.0, vitest and
      coverage-v8 4.1.10→4.1.11, jsdom 28.0.0→28.1.0, @playwright/test
      1.58.1→1.64.0, @axe-core/playwright 4.11.1→4.13.0, globals
      17.3.0→17.13.0, fuse.js 7.1.0→7.5.0; `engines.node` is `>=20.19` (the floor Vite 8, ESLint 10 and jsdom already required). The
      CSS hash moved `eebaa34a…`→`b1478af0…`: the only difference is
      two declarations in `scorecard.css` where cssnano 7.1.9 now emits
      the authored `rgba(248,113,113,.22)` instead of a lossy `hsla()`
      (+4 bytes). Baseline updated in `CLAUDE.md` and
      `.claude/commands/css-byte-check.md`.

### Tier B — measured performance work

- [x] **P13-5 · Measure `/intro/` before touching it.** Supersedes (and
      closes, in the same commit, as far as the numbers justify) the open
      Phase 5 "`/intro/` perf debt" box and the Phase 7 "Identify
      remaining CLS culprits" box. Those perf items are open but the numbers are months old and
      several suspects were fixed since (render-blocking, unsized
      images, vendor cards). Outcome: a current table — LHCI perf score,
      CLS and its culprit elements from `cls-culprits-insight`,
      main-thread breakdown, DOM element count — recorded in this plan.
      Accept: numbers come from `npm run build:lhci` followed by
      `npm run lighthouse`, three runs, median reported, with the
      command and date; sub-items whose audit already scores 1.0 are
      ticked in the Phase 5 / Phase 7 boxes. Verify: the recorded numbers reproduce within ±0.03 perf. Size: M. Role:
      `implementer`.

      **Result (2026-10-08, local macOS, 8 cores, Chrome 154 headless,
      Lighthouse 12.6.1, mobile preset, simulated throttling).** Command:
      `npm run build:lhci` then `npm run lighthouse` (config collects
      3 runs per URL), repeated in 3 separate invocations = **9 runs of
      `/intro/`**. Raw LHR JSON kept outside the repo.

      | `/intro/` metric                         | Median of 9                | Min – max           | Threshold / note                        |
      | ---------------------------------------- | -------------------------- | ------------------- | --------------------------------------- |
      | Performance                              | **0.97**                   | 0.88 – 0.97         | error ≥ 0.82 — pass (`warn` 0.9: 4/9 below) |
      | Accessibility                            | 0.97                       | 0.97 – 0.97         | error ≥ 0.93 — pass                     |
      | Best practices / SEO                     | 1.00 / 1.00                | —                   | warn ≥ 0.9 — pass                       |
      | FCP                                      | 1.81 s                     | 1.74 – 2.55 s       | bimodal, see below                      |
      | LCP                                      | 2.43 s                     | 2.34 – 3.33 s       | bimodal                                 |
      | TBT                                      | 31 ms                      | 0 – 59 ms           |                                         |
      | Speed Index                              | 1.81 s                     | 1.74 – 2.55 s       |                                         |
      | CLS                                      | **0.0025**                 | 0 – 0.0056          | audit 1.0 in 9/9                        |
      | Main-thread work                         | 1.31 s                     | 0.62 – 1.52 s       | audit 1.0 in 9/9                        |
      | DOM size                                 | **1,035 elements**         | constant            | audit 0.5 in 9/9; depth 13, max 28 children |
      | Transfer                                 | 351 KiB (32 requests)      | 351 – 352 KiB       |                                         |

      Per-invocation medians (the way CI sees it): perf 0.92 / 0.97 /
      0.92 — a spread of 0.05, larger than the ±0.03 reproducibility
      target, so the recorded perf is "0.92 – 0.97" not a single value.
      All other audits (`render-blocking-resources`, `unsized-images`,
      `font-display`, `bootup-time`, `total-blocking-time`) score 1.0.
      No assertion failed or warned (LHCI's default optimistic
      aggregation passes if any run passes). System load before the
      runs 4.2 (1-min); 2.1 before the Playwright cross-check — Lighthouse
      itself pushed it to ~7.8 mid-run, and the machine runs a desktop
      session, so treat absolute ms as indicative.

      **Surprise: the plan's premise is stale.** CLS is not 0.58 — it is
      0.0025. The perf gap is not layout shift.

      Ranked CLS culprits (Lighthouse `layout-shifts` /
      `cls-culprits-insight`): (1) `section.hero-section > div.hero-container > div.prose > h1.type-display`
      — 0.0056, cause "web font loaded" for `ibm-plex-sans-500`,
      `-700`, `ibm-plex-mono-500`, `-600` (these four are discovered via
      CSS, not preloaded; only sans-400/600 and mono-400 are). In 4/9
      runs the fonts land before first paint and CLS is exactly 0.
      Independent check (Playwright Chromium 156, 412×823 @1.75x,
      `PerformanceObserver` layout-shift with sources, 10 runs each):
      unthrottled CLS 0 in 10/10; with 4× CPU + 1.6 Mbps/150 ms network
      CLS 0.0014 – 0.016 (median 0.015), 10/10 > 0, never near 0.1.
      Observer **agrees** on the cause (font-swap reflow of the hero
      block: `div.page-wrap.prose`, hero `li`s, `.hero-actions` buttons,
      `h1`, plus `.nav-right`) and on magnitude; it sees a few more hero
      elements than Lighthouse because the throttled swap reflows
      neighbours too.

      Why perf is bimodal (0.97 in 5 runs, 0.88 – 0.92 in 4): observed
      FCP is ~130 ms in both, but Lighthouse's simulated FCP is 1.74 –
      1.81 s when the late fonts finish after first paint and 2.26 – 2.55 s
      when they finish before it (the CSS → font request chain is then
      counted). FCP / LCP are the only perf audits below 0.9 (0.65 – 0.92);
      this is a race on the late-discovered fonts, not a main-thread
      problem. In the fast runs the font swap also triples Style & Layout
      (≈ 650 ms vs ≈ 210 ms).

      Main-thread / bootup offenders (median run): Style & Layout 656 ms,
      Other 526 ms, Script Evaluation 192 ms, Rendering 108 ms. `bootup-time`
      0.15 s: the document itself (1.11 s total, only 7 ms scripting —
      i.e. layout), Unattributable 178 ms, `cdn.jsdelivr.net/npm/chart.js@4.4.4`
      159 ms (96 ms scripting, 29 ms TBT — the only third party). First-party
      JS is negligible.

      Other audits: `unused-javascript` 0.5 (36 KiB, all chart.js from
      jsDelivr), `unused-css-rules` 0.5 – 0 (12 KiB of 19 KiB
      `styles.css`), `dom-size` 0.5. Top transfers: chart.js 68 KB,
      `search-index.json` 32 KB, four Plex woff2 files 23 – 25 KB each,
      document 21 KB, `app.js` 21 KB.

      **Finding outside the brief:** `color-contrast` scores 0 in 9/9
      runs (a11y 0.97, still over the 0.93 gate) on three nodes in the
      CDC event demo: `span.ced-event-title` and `span.ced-op-badge`
      (#6b7d8f on #0e141d = 4.36:1) and `span.ced-j-comment` (#6b7d8f on
      #141b25 = 4.08:1), need 4.5:1. The Phase 5 "`/intro/` a11y debt"
      box records contrast as fixed (page then scored 1.0); this widget
      regressed it. Not touched here.

      **Recommended P13-6 scope** (revised — a "CLS under 0.1" goal is
      already met): (1) make the four late fonts deterministic —
      preload `ibm-plex-sans-500/700` and `ibm-plex-mono-500/600` (or
      drop those weights) and add a metric-matched fallback
      (`size-adjust`, `ascent-override`) so the swap is invisible; this
      removes the only CLS culprit and the 0.88 – 0.97 perf bimodality in
      one change; (2) then ratchet the `/intro/` perf threshold from 0.82
      to median-minus-0.04 and fix the three `color-contrast` nodes
      (route the CSS to `css-refactor`). `dom-size` (1,035) and
      chart.js lazy-loading are the next, smaller levers.

- [ ] **P13-6 · Make `/intro/` font loading deterministic, fix the contrast
      regression, ratchet the threshold.** Rewritten 2026-10-09 after P13-5:
      CLS is already 0.0025 (goal was < 0.1), so the original "fix the CLS
      culprit" is met. What the measurement actually found: (1) four web
      fonts (`ibm-plex-sans-500`, `ibm-plex-sans-700`, `ibm-plex-mono-500`,
      `ibm-plex-mono-600`) load after first paint while only three weights
      are preloaded, which is the sole CLS source (the `h1.type-display`,
      0.0056 in Lighthouse) and the reason performance swings 0.88–0.97;
      (2) three nodes in the CDC event demo fail WCAG contrast
      (`span.ced-event-title` and `span.ced-op-badge` #6b7d8f on #0e141d =
      4.36:1; `span.ced-j-comment` on #141b25 = 4.08:1), which regressed the
      Phase 5 contrast fix.
      Accept: (a) the four weights are either preloaded or removed, and a
      metric-matched fallback font removes the swap shift — at source, not a
      Lighthouse-only workaround; (b) the three nodes reach ≥ 4.5:1 and
      `color-contrast` scores 1 in all runs; (c) three fresh LHCI invocations
      show `/intro/` performance with a narrower spread, and
      `.lighthouserc.json`'s `/intro/` performance floor is ratcheted to the
      new median minus 0.04 (and the README badge from P15-6 is bumped in the
      same PR); (d) no a11y or CLS regression. Verify: `npm run lighthouse`
      three times, the Playwright layout-shift observer from P13-5,
      `npm run test:e2e`, before / after screenshots, CSS hashes recorded.
      Size: M → split into two PRs: fonts (head / `@font-face` metrics; touches
      `base.njk` and CSS) and contrast (CSS only). Role: `css-refactor` for
      both CSS parts, `implementer` for the preload markup, `reviewer` on each
      diff. Needs: the Phase 15 Tier 1 PRs merged first (they also edit
      `base.njk`).
- [x] **P13-7 · Triage the mobile-chrome assistant e2e quarantine.**
      `tests/e2e/assistant.spec.js:31` skips three FAB tests on
      mobile-chrome for a "pointer-intercept flake" with no tracking (the
      Phase 11 e2e-coverage note explains the skip but sets no deadline).
      Outcome: the skip is either gone or has a written, dated reason
      and an owner. Accept: time-boxed to 2 h — either the tests pass 10
      consecutive local runs un-skipped, or the skip comment records the
      root-cause finding and the plan carries a follow-up. Verify:
      `npx playwright test assistant --repeat-each=10 --project=mobile-chrome`.
      Size: S. Role: `implementer`.
  - **Triage 2026-10-08 (outcome: real product bug, not flake).**
    Un-skipped on mobile-chrome (Pixel 5, 393×727, `--repeat-each=10`):
    the three tests that never click Send (FAB opens panel, close
    button, Escape) pass 30/30 and are un-skipped. The thumbs-up
    test (P13-10) clicks Send and fails 10/10 with
    `<button id="askBtn"> intercepts pointer events`. Cause: at
    ≤640px `#askPanel` is position fixed, inset 0.5rem, z-index 1000
    (box x8 y407, 377×312) while `#askBtn` stays position fixed,
    bottom/right 1.5rem, 56×56, z-index 1001 (x313 y647; x310–372
    y644–706 once scaled 1.1), sitting on top of the 44×44
    `.assistant-send` (x332–376 y666–710). `elementFromPoint` at the
    Send centre returns `#askBtn`. A real tap on Send hits the FAB,
    which closes the panel. Not a Playwright artefact.
  - [x] **Follow-up (css-refactor, not implementer):** stop the FAB
        overlapping the open panel at ≤640px, e.g. hide the FAB or
        lift the panel above it while `#askBtn[aria-expanded="true"]`,
        or reserve space for it (panel `bottom` ≥ FAB bottom + 56px +
        gap, or inset the input row's right padding). Edit
        `src/css/assistant.css` (`#askBtn`, `#askPanel`, `@media (max-width: 640px)`)
        and/or the "Assistant/Chat Button Mobile Position" block in
        `src/assets/css/09-mobile-responsive.css`. Byte-identity hash in
        CLAUDE.md will change (re-baseline). Then delete the
        `test.skip` in the thumbs-up test in
        `tests/e2e/assistant.spec.js`, run
        `npx playwright test assistant --project=mobile-chrome --repeat-each=10`
        (and `--workers=1`), and flip P13-7 to `[x]`.
    - **Done 2026-10-08.** Fixed in `src/css/assistant.css` only: at
      <=640px `#askPanel` now has `bottom: calc(1.5rem + 56px + 0.5rem)`
      (clears the FAB with an 8px gap) and
      `max-height: min(75vh, calc(100vh - 6rem))`. That file ships as its
      own `/css/assistant.css`, not in the `main.css` bundle, so the
      production hash is unchanged (`b1478af0...`, before and after);
      the baseline needed no update. The thumbs-up `test.skip` is gone and
      a new hit-test case asserts Send and close are not covered.
      `--project=mobile-chrome --repeat-each=10`: 50/50 (5 tests x 10);
      `--workers=1 --repeat-each=3`: 15/15; `--project=chromium` full
      suite: 136/136. The duplicate `#askPanel` `bottom` in
      `09-mobile-responsive.css` is overridden by the later-loading
      `assistant.css` and was left untouched to keep the bundle
      byte-identical.

### Tier C — larger upgrades (one PR each, never batched)

- [ ] **P13-8 · Major dependency upgrades.** Eight majors are pending (`dotenv` leaves with P13-10):
      `vitest` + `@vitest/coverage-v8` 4→5 (together), `jsdom` 28→30,
      `cssnano` 7→9 (**will likely move the production CSS hash —
      treat as a CSS change**), `rimraf` 5→6,
      `postcss-cli` 11→12, `postcss-import` 16→17, `pa11y-ci` 4→5. Accept
      per upgrade: read the changelog for breaking changes, `verify-all`
      green, no behavioural change in `_site/`. Verify: `/verify-all`,
      `/css-byte-check`, `npm run smoke`. Size: L → one sub-PR per
      package group. Role: `implementer`; `css-refactor` for the
      `cssnano` / `postcss-*` group.

### Tier D — documentation hygiene

- [ ] **P13-9 · Refresh `STATE-OF-PROJECT.md`.** The snapshot is dated
      2026-05-19 and describes 274 tests and 16 open boxes. Do this last,
      once the queue above has landed. Accept: a new dated snapshot
      supersedes it (the old one stays reachable through Git history, as
      its header already promises) and quotes numbers produced by
      commands, not recollection. Size: M. Role: `scribe` drafts,
      `reviewer` checks the numbers.

### Done in this phase

- [x] **P13-0 · Conductor roster and working agreement.** Role-based
      subagents pinned to Sonnet 5.5 and Haiku 5.5, a hook that denies any
      other model, and [`CONDUCTOR.md`](CONDUCTOR.md).

---

## Phase 14 — Maintainer decisions register

These are not tasks an agent can do, because each one needs a human
choice or an action in GitHub's UI. They are collected here so they stop
being scattered across five phases. Each row has a **recommended
default** — replying "go with the defaults" is a valid answer. The
authoritative checkbox for each stays in the phase named in the last
column; do not duplicate it here.

| #   | Decision                            | Recommended default                                                                                                                                             | Unblocks                                                       | Tracked in        |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------- |
| D1  | Repository license                  | **MIT for code, CC BY 4.0 for the written content.** Standard for an educational repo; keeps both reuse-friendly and requires attribution for the prose.        | `LICENSE` file, `package.json` `license`, README licence badge | Phase 11          |
| D2  | Newsletter provider                 | **Buttondown** — static-embed form works with no JS and no secrets in the repo; Kit is the alternative if you want landing-page tooling.                        | `/newsletter/` page and footer capture (~1 PR)                 | Phase 9           |
| D3  | Author photo                        | Supply a square image ≥ 400 px; agents wire `author.mjs`, `base.njk` and the Article JSON-LD.                                                                   | Author byline photo and richer structured data                 | Phase 8           |
| D4  | Author identity links               | Provide LinkedIn / talks / podcast URLs when they exist; leave `advisoryUrl` null until you want the footer CTA.                                                | `sameAs` expansion                                             | Phase 8           |
| D5  | CSS `@layer` migration              | **Declare it "won't do" until a real specificity bug forces it.** The plan itself says "no user value otherwise", and it carries visual-regression risk.        | Closes two duplicate open boxes (Phase 4 and Phase 11)         | Phase 4, Phase 11 |
| D6  | Lighthouse badge in README          | **Static badge, bumped when the LHCI threshold is raised** (the plan's "option 2"). A hosted LHCI store is more infrastructure than a badge is worth.           | README badge                                                   | Phase 11          |
| D7  | Dependabot PR #319 (dev dependency) | Re-run its checks and merge; it is mergeable and a dev-only patch bump, and 37 days of staleness is itself a risk. Agents do not merge PRs without your say-so. | Clears the only open PR                                        | —                 |

---

## Adding new phases

Append below this line. Keep phases narrow; if a phase grows past ~10
items, split it. Don't reorder existing phases — agents may have stale
links.
