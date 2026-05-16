# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **RSS 2.0 feed at `/feed.xml`** — closes the Phase 9
  "no RSS" gap from the brutal review. Hand-rolled
  `src/feed.11ty.cjs` (no new runtime dep; the format we emit is
  ~20 lines of XML and `@11ty/eleventy-plugin-rss` would have
  introduced its own Nunjucks shortcodes we'd then need to
  wire). Filters `collections.all` to items with `seriesKey`
  set, sorts by `dateModified` desc with `datePublished` as
  tiebreaker, caps at 30 entries. Emits the `atom:` self-link
  and `dc:creator` namespace; URLs use `site.host` (path-prefix
  aware) so prod and root-deploy builds both render correctly.
  `<link rel="alternate" type="application/rss+xml">` added to
  the base layout `<head>` so feed readers can auto-discover.
- **Three CI status badges in the README header** — CI
  (build/lint/test), Deploy (GitHub Pages), and Link check
  (lychee). Each is a GitHub-native auto-updating SVG badge that
  links back to the workflow run history. Closes the
  auto-updating slice of the Phase 11 README-badges item. The
  remaining two badges from the original brutal-review wording
  (Lighthouse perf, license) are tracked as explicit open
  follow-ups in `docs/IMPLEMENTATION-PLAN.md` Phase 11 — license
  is blocked on a license-file decision; Lighthouse is blocked
  on a hosted LHCI store or a manual-bump policy.
- **"Edit this page on GitHub" link** in
  `src/_includes/layouts/base.njk` footer. Rendered on every page
  that uses the base layout (every module + content page;
  `layout: null` outputs like `src/404.njk`,
  `src/mermaid-sandbox/index.njk`, and the redirect stubs
  intentionally have no footer). Uses Eleventy's built-in
  `page.inputPath` and the existing `site.repository` config to
  point at `https://github.com/{owner}/{repo}/edit/main/{path}`.
  Matches the contributor-affordance convention from Debezium,
  Eleventy, and Confluent Developer docs. Closes the Tier-2
  "no per-page edit link" gap from the May 2026 brutal review.
  `scripts/smoke.mjs` now asserts the link is present and
  correctly-shaped on three representative outputs (`index.html`,
  `intro/index.html`, `errata/index.html`).
- **`docs/IMPLEMENTATION-PLAN.md` Phases 8–11** appended, derived
  from the brutal-review roadmap: Phase 8 (trust & credibility —
  author photo, methodology page, inline errata, identity
  expansion), Phase 9 (comparison & conversion — `/compare/` hub,
  glossary, RSS, newsletter, suggested-next), Phase 10 (one real
  interactive demo), Phase 11 (repo hygiene — README badges,
  BreadcrumbList audit, e2e test for assistant-send visible-state
  target-size). Items in Phase 7 already done by PR #270/#274/#275
  are flipped to `[x]`; the open items in Phases 8–11 give
  auto-continue something concrete to pick up next.
- `npm run verify-all` — single command for the full pre-PR chain
  (`format:check && lint && test && build`). Same behavior as the
  long-standing `/verify-all` Claude slash command, but now runnable
  by any agent or contributor without invoking the harness.
- Expanded `.claude/settings.json` permission allowlist: `npm run
format`, `npm run verify-all`, `npm run lighthouse`, `npm run
test:coverage`, `npm run test:e2e`, `npm run a11y`, `npm run
lint:fix`, plus `npx playwright`, `npx update-browserslist-db`,
  `shasum`, `awk`, basic shell tests, and a read-only `gh` subset
  (`gh pr view/list/checks/diff`, `gh run list/view`,
  `gh issue view/list`) for PR / run inspection. The `deny` list
  blocks any `gh api` invocation with `-X|--method PATCH|POST|PUT|
DELETE` so the expansion can't grant write or destructive
  repository capabilities. Cuts permission-prompt noise during
  routine agent work without expanding write/destructive surface.

### Changed

- **`/intro/` LHCI thresholds tightened — Phase 7 final item.**
  Perf error-level assertion bumped from `minScore: 0.8` to
  `0.82`, and a new error-level `categories:accessibility`
  assertion locked in at `minScore: 0.93`. Picked 0.82 (not 0.85)
  for perf to keep a ~0.05 noise buffer against the worst
  observed outlier (0.79 on a heavily-loaded dev machine).
  Picked 0.93 (not 0.95) for a11y after PR #280's CI run
  surfaced a chromedriver/axe delta — local macOS Chrome
  consistently reports 0.97 on `/intro/`, but Ubuntu Noble's
  `google-chrome-stable` (the CI runner) reports 0.94 across
  three consecutive runs. 0.93 leaves a 0.01 buffer on the CI
  measurement and still locks in the Phase 7 a11y gains
  (originally 0.88). The original Phase 7 DoD (perf ≥ 0.92,
  a11y = 1.0, CLS ≤ 0.1) is the next bump target — remaining
  headroom is in `dom-size` (still 0.5, 1,068 elements on
  `/intro/`) and the deferred `cls-culprits-insight` audit.
- **Stylesheets no longer block first paint.** All five
  `<link rel="stylesheet">` tags emitted by the site — the three in
  `src/_includes/layouts/base.njk` (main bundle, auth.css,
  assistant.css) and the two emitted from per-page `head_extra`
  blocks (page-specific CSS + cdc-simulation.css on `/intro/`,
  `/snapshotting/`, etc.) — now use rel=preload + onload with a
  `<noscript>` blocking fallback for JS-disabled browsers. The
  head_extra transform is centralized in
  `lib/render-head-extra.mjs` so the 20 pages that inject
  page-specific CSS pick up the fix without per-page front-matter
  edits.

  A ~250-byte inline `<style>` block in `<head>` masks the brief
  pre-style window with the dark default body background + Inter
  font + `.skip-link` visually-hidden rule, so the FOUC isn't
  visually disruptive. CSS bundle is unchanged — only the load
  mechanism moved. Lighthouse `render-blocking-resources` audit on
  `/intro/`: **0 → 1.0** across all three LHCI runs.

- **Color tokens — `--color-text-muted` updated.** The dark-theme
  value (`#64748b` / slate-500) was darker than the light-theme
  value (`#94a3b8` / slate-400), the wrong direction for
  legibility on each theme's background: dark muted on near-black
  hit 4.0:1 (below WCAG AA), light muted on white was 3.0:1. Dark
  now uses `#94a3b8` and light uses `#52606d`. Light moved to
  `#52606d` rather than `#64748b` so the value also passes 4.5:1
  on the elevated surface (`--color-bg-elevated` = `#f1f5f9`) —
  `#64748b` against that is ≈4.07:1, which would have left
  muted-on-elevated cases (the assistant panel, quiz callouts)
  below AA in light mode.
- **Expanded legacy variable aliases in `01-variables.css`** —
  ~35 aliases total — so the text, surface, border, accent, and
  semantic families used across the page-specific stylesheets
  (cdc-simulation, quiz, assistant, dashboard-page, exactly-once,
  multi-tenancy, scorecard, …) all resolve to the design system's
  `--color-*` tokens. Specifically: `--text-{primary,secondary,
tertiary,muted,inverse}`, `--muted`, `--color-text`,
  `--color-heading`, `--bg`, `--bg-{primary,secondary,elevated,
code}`, `--surface`, `--card-bg`, `--color-background[-soft]`,
  `--color-bg[-code]`, `--color-surface[-alt|-hover]`, `--border`,
  `--border-color`, `--color-border`, `--accent`, `--accent-
{primary,light,hover}`, `--color-accent`, `--color-primary`,
  `--focus`, `--success`, `--ok`, `--warning`, `--warn`, `--err`,
  `--color-danger`, and the four `--color-{success|error|warning|
info}-light` callout backgrounds. Defined only in the dark/
  default `:root` block — the CSS cascade resolves each per-theme
  at the use site, so the light theme block does NOT duplicate the
  aliases. Lighthouse `color-contrast` on `/intro/`: **0 → 1.0**
  (20 nodes → 0). Renaming the 12 legacy callers to use
  `--color-*` directly is a separate cleanup, tracked in
  IMPLEMENTATION-PLAN Phase 7.
- `.lighthouserc.json` re-introduces the error-level
  `categories:performance` assertion on `*/intro/index.html` via
  `assertMatrix`. **Note:** LHCI throws
  `Cannot use assertMatrix with other options` if `assertMatrix` is
  used alongside top-level `assertions`, so the global warn-level
  category checks now live as a `matchingUrlPattern: ".*"` entry in
  the same matrix. (Threshold history: re-introduced at
  `minScore: 0.9` on the (since-discovered-to-be-unstyled) 1.0
  baseline; lowered to `minScore: 0.8` once the styled-page
  baseline of 0.86 was measured — see the **Fixed** section below.)

### Removed

- `handoff/` (the entire nightly-prompt-sync ritual, including
  `Handoff.md`, `dashboard.html`, `handoff-log.json`, `index.html`,
  `nightly-sync.sh`, and `README.md`),
  `.github/workflows/handoff-nightly.yml`, and
  `.github/workflows/publish-dashboard.yml`. The system had been
  logging empty entries for ≥3 days running (`Handoff.md` was never
  edited between maintainer sessions, so the parser produced an
  identical empty record nightly) and pushing
  `chore(handoff): nightly sync …` noise commits to `main`. The
  public `handoff/index.html` dashboard was rendering three empty
  days in a row — an anti-credibility surface for an educational
  site. Cross-session context now lives in
  `docs/IMPLEMENTATION-PLAN.md`, `CHANGELOG.md` `[Unreleased]`, and
  `git log` (the durable record). Also removed the matching section
  from `.github/copilot-instructions.md`.
- `src/assets/js/tracing-lite.js` (~363 LOC) and its `app.js`
  import. The tracer hardcoded its default endpoint to
  `http://localhost:4318/v1/traces` and instantiated with no args,
  so in production every visitor's browser POSTed to _their own_
  `localhost:4318` where every request was silently swallowed.
  `app.js` now defines an inline no-op `educationTracer` matching
  the old shape (`trackModuleView`, `trackProgress`,
  `trackInteraction`, `trackSearch`, `trackWebVital`) so the
  per-module `init*(tracer)` call sites and unit tests passing mock
  tracers continue to work without further refactor. `docs/TRACING.md`
  rewritten as a one-page removal note + reintroduction recipe;
  `docs/javascript-architecture.md` tracing section rewritten to
  describe the vestigial no-op. Stale references in `docs/SETUP.md`
  and `docs/README.md` updated to point at the removal note.

### Fixed

- **`/intro/` accessibility, `color-contrast: 0 → 1.0`** (a11y
  score 0.94 → 0.97). See the alias + token-swap entries in
  **Changed** above for the mechanism. Direct call-site fixes:
  - `.sim-btn-reset`: swapped hardcoded `#6b7280` (3.7:1 on the
    dark page background, failed AA) for
    `var(--color-text-secondary)`.
  - `#cdc-reset` (vendor-filter Reset on `/intro/`) was a bare
    `<button>` with browser-default styling — black text on the
    dark page. Gave it the existing `.cdc-chip` class.
  - `.assistant-suggestion-chip`: pointed `background` at
    `var(--color-accent-hover)` so white-on-accent passes AA
    (`#fff` on `#3b82f6` is 3.7:1; on `#2563eb` is 5.2:1).
- **`/intro/` perf baseline 0.86 → 0.95 (best run)** locked in
  from PR #270 — `unsized-images` 0.5 → 1.0, CLS 0.58 → 0,
  `mainthread-work-breakdown` 0.5 → 1.0. The `mainthread-work`
  jump is a side-effect: with SVG dimensions set, the browser
  stops re-laying-out on every image decode. Three-run averages
  still vary 0.87–0.95 by machine load, so the
  `.lighthouserc.json` threshold raise (Phase 7 final item) waits
  for that variance to settle.
- **`.assistant-send` button bumped from 36×36 to 44×44** for
  WCAG 2.2 `target-size`. Real users only see this when the FAB
  opens the panel, at which point it's the same 44px tier used on
  `.nav-chip` and the mobile menu toggle. Lighthouse still reports
  the audit failing because axe inspects the `hidden` panel
  computationally and reports `"44px by 7px"` for `display: none`;
  the audit will clear once a visible-state e2e test runs against
  the rendered panel.
- **268 vitest failures on `main`.** Every test errored before it ran
  at `tests/setup.js:8` with `localStorage` undefined. Root cause: a
  three-way collision between vitest 4 (which no longer promotes
  Storage to a bare global), jsdom 28 (whose Storage impl needs
  explicit setup in this environment), and Node 26's experimental
  `--localstorage-file` flag (gated behind a CLI arg we don't pass).
  Replaced the prior reliance on the environment with an in-memory
  `MemoryStorage` polyfill in `tests/setup.js` that's mounted on
  `globalThis`, `window`, and `globalThis.localStorage` /
  `sessionStorage`. All 268 tests now run and pass.
- **`unsized-images` audit failing site-wide.** The custom `{% img %}`
  shortcode in `eleventy.config.mjs` emitted `<img>` tags with no
  `width`/`height` attributes, so every diagram on the site contributed
  to CLS. The shortcode now resolves intrinsic dimensions from local
  SVGs at build time (parsing explicit `width`/`height` attrs first,
  falling back to `viewBox`) and emits them on the rendered tag.
  Caller-provided dimensions always win; remote URLs fall through
  unchanged. Cached per `src` so each SVG is read once per build.
  Closes the first Phase 7 sub-item.
- **Two 404'd YouTube embeds removed.** The deleted videos
  `5CjPj9ShJVA` (`/intro/`, Gunnar Morling intro talk) and
  `zYJn6GA5t1Q` (`/quickstart/quickstart-postgres/`, Postgres CDC
  tutorial) were rendering broken thumbnails on otherwise-marquee
  pages. The dead thumbnail on `/intro/` was the prime suspect for
  the 0.58 CLS baseline measured against the styled LHCI build.
  Removed both embeds and their now-unused `youtubeEmbed` macro
  imports; cleared both `^https://img\.youtube\.com/vi/<id>/` entries
  from `.lycheeignore`. Replacement videos remain a content decision
  parked under Phase 10.
- **LHCI was measuring an unstyled page.** The Lighthouse CI job
  has been auditing `_site/intro/index.html` etc. against a runner
  that 404s on every CSS / JS asset. Root cause: the production
  build emits asset URLs under the `/letstalkcdc/` path prefix, but
  `.lighthouserc.json` sets `staticDistDir: ./_site` and visits
  `http://localhost/intro/index.html` — those root-relative asset
  URLs (`/letstalkcdc/assets/css/...`) resolve to a non-existent
  `_site/letstalkcdc/` directory. Every previous Lighthouse run on
  this repo measured a DOM with no styles or scripts loaded.
  - Added `npm run build:lhci` (`ELEVENTY_PATH_PREFIX=/ npm run build`),
    a root-deployable build of the same site.
  - Updated `ci.yml` `lighthouse` job to run `build:lhci` instead of
    downloading the production-prefixed `site-build` artifact.
  - **Honest baseline** (against the styled page, single LHCI run):
    perf 0.86 (was a fake 1.0), a11y 0.94 (was a fake 0.97),
    best-practices 0.96, seo 1.0.
  - Lowered the `/intro/` error-level perf assertion from
    `minScore: 0.9` to `minScore: 0.8` so CI doesn't fail
    immediately on the honest baseline. The plan now tracks the
    perf-debt and remaining a11y issues that only surface on the
    styled page (color-contrast, layout shift, render-blocking
    resources, unsized images, DOM size).
- **`/intro/` accessibility regressions (a11y score 0.88 → 0.97).**
  Five of the six failing axe audits fixed at the DOM level. All are
  real semantic improvements that screen readers consume regardless
  of CSS:
  - `aria-prohibited-attr` (4 nodes): added `role="status"` to the
    `.stage-events` divs in `src/intro/index.njk` so their
    `aria-label`s are valid.
  - `aria-allowed-role` (~15 nodes): removed `role="listitem"` from
    `<article>` cards and `role="list"` from their grid parents in
    `src/intro/index.njk`. axe rejects `listitem` on `<article>`;
    `<article>` already conveys grouped content.
  - `aria-allowed-attr` (1 node): added `role="progressbar"` (plus
    `aria-valuemin`, `aria-valuemax`, `aria-label`) to the series-nav
    progress bar fill so `aria-valuenow` is allowed.
  - `heading-order` (2 nodes): bumped the `.intro-callout` `<h3>`s
    ("Outcome" / "Who it's for") to `<h2>` so the page doesn't jump
    from h1 → h3.
  - `label-content-name-mismatch` (1 node): the header progress link
    had visible text "Progress" + percentage but
    `aria-label="View detailed progress dashboard"`. Dropped the
    conflicting `aria-label`; visible text is now the accessible
    name, with the descriptive copy moved to `title`.
- **Touch-target sizing (`min-height: 44px`) on nav-chip,
  dropdown-menu links, and mobile-menu-toggle.** Defensive against
  the `target-size` axe rule (WCAG 2.2 AA = 24px, kept at the
  44px touch-friendly tier). The LHCI test setup currently serves
  `_site/` at root and HTML pages reference assets at
  `/letstalkcdc/...`, so CSS doesn't actually load in the audit —
  meaning this change moves the production experience but **not** the
  LHCI score. See `docs/IMPLEMENTATION-PLAN.md` Phase 5 for the
  test-setup fix that needs to land before re-measuring.
- **`ci.yml` smoke/a11y jobs hung on `apt install chromium-browser`.**
  On Ubuntu 24.04 (the GitHub-Actions Noble runner), `chromium-browser`
  is a Snap transitional package that needs `snapd`. CI containers
  don't run `snapd`, so the install hangs indefinitely. Switched both
  `smoke-tests` and `a11y-tests` jobs (and their
  `PUPPETEER_EXECUTABLE_PATH` env vars) to `google-chrome-stable` — a
  real `.deb` from the `dl.google.com/linux/chrome-stable` repo that's
  preconfigured on the runner.
- `docs/javascript-architecture.md` no longer lists the deleted
  `tracing.js` (removed in the OpenTelemetry-deps purge). The
  hardcoded "Total: 238 tests, 90.5% coverage" sentence now points
  readers at `npm test`'s footer to discover the current count.
- **Vendor doc URL drift (3 citations).** Three upstream docs URLs that
  `.lycheeignore` had been suppressing 404s for are now updated to
  their current canonical locations and re-enabled in the link-check:
  - Debezium signaling — `…/operations/signals.html` →
    `…/configuration/signalling.html` (note the upstream spelling
    change `signaling` → `signalling`). Cited from
    `src/reconciliation-surgery/index.njk:526`.
  - Fivetran changelog — `…/docs/getting-started/changelog` →
    `…/docs/changelog`. Cited from `src/_data/toolVersions.mjs`.
  - Matillion release notes — `…/matillion.com/resources/release-notes`
    → `https://docs.matillion.com/metl/docs/release-notes-index/`
    (moved from the marketing site to the docs subdomain). Cited from
    `src/_data/toolVersions.mjs`.

  All three regex entries removed from `.lycheeignore`; lychee will
  now catch a regression on any of them.

- **Path-prefix doubling in URLs.** 32 templates used
  `{{ site.host }}{{ '/path/' | url }}`, but `site.host` already
  contains the path prefix (`https://…/letstalkcdc`) and the `| url`
  filter adds it again — so every redirect-stub canonical and every
  `BreadcrumbList` `item` shipped pointing at
  `https://…/letstalkcdc/letstalkcdc/…`. Switched all 32 occurrences
  to `{{ site.origin }}{{ '/path/' | url }}` (the bare host, plus
  prefix from the filter). Removed the corresponding
  `^https?://[^/]+/letstalkcdc/letstalkcdc/` entry from
  `.lycheeignore`. Touched: `src/_redirects/*.html.njk` (26 files) +
  `src/{overview,intro,exactly-once,multi-tenancy}/index.njk` (4
  JSON-LD breadcrumbs).
- **`head_extra` rendering shipped literal `{{ site.origin }}`.** The
  initial path-prefix fix in PR #265 switched four `head_extra` JSON-LD
  blocks to `{{ site.origin }}{{ '/path/' | url }}`, but
  `renderHeadExtra` in `eleventy.config.mjs` only knew about
  `{{ site.host }}` and `{{ '...' | url }}`. Result: production HTML
  shipped the literal six-character string `{{ site.origin }}` in
  every `BreadcrumbList` `item` URL. Caught by Codex in PR review.
  Fixed by extracting the renderer into `lib/render-head-extra.mjs`,
  adding `{{ site.origin }}` to the substitution list, and locking it
  in with 16 vitest cases.
- **Wrong `defaultHost` in `src/_data/site.mjs`.** Hardcoded fallback
  was `https://letstalkcdc.github.io`, but production lives at
  `https://sandgraal.github.io/letstalkcdc/`. If `SITE_HOST` was ever
  unset, every canonical / OG / JSON-LD URL shipped pointing at a
  host that doesn't exist. Changed the default to the real production
  host and added a build-time `console.warn` if `SITE_HOST` is unset
  under `NODE_ENV=production`, so the fallback isn't silent on
  deploys.

### Added

- `tests/unit/lib/path-prefix.test.js` — 14 vitest cases for
  `lib/path-prefix.mjs`. Covers the `owner.github.io` root-deploy
  branch (case-insensitive), explicit-env-var precedence, malformed
  `GITHUB_REPOSITORY` fallback, the `getPathPrefixForHost`
  trailing-slash strip, and `normalizePathPrefix` edge cases. The
  module was previously uncovered.
- `lib/render-head-extra.mjs` — extracted the front-matter
  `head_extra` mini-renderer out of `eleventy.config.mjs` so it has
  a single home and a single unit-test target. Adds support for
  `{{ site.origin }}` alongside the pre-existing
  `{{ '/path' | url }}` and `{{ site.host }}` patterns; Codex caught
  the omitted-substitution bug on PR #265 where rendered HTML
  shipped the literal string `{{ site.origin }}` in JSON-LD
  `BreadcrumbList`s.
- `tests/unit/lib/render-head-extra.test.js` — 16 cases covering
  every supported expression, falsy input, root-deploy
  `pathPrefix=""`, multi-expression strings, missing context options,
  and unsupported-expression passthrough. **Adding a new
  substitution to `lib/render-head-extra.mjs` requires adding a test
  here**; the test header restates that contract.
- `CLAUDE.md` at repo root — single source of truth for AI agents (commands,
  architecture, conventions, anti-patterns, the CSS byte-identity check).
  `AGENTS.md` symlinked to it so Codex / cross-tool agentic systems pick up
  the same doc.
- `.claude/settings.json` — permission allowlist covering safe read/verify
  commands (git status/diff/log, npm test, npm run build, prettier --check,
  eslint, vitest, shell utils), plus a SessionStart hook that runs `npm ci`
  if `node_modules/` is absent so fresh checkouts work out of the box.
- `.claude/commands/css-byte-check.md` — codifies the production-CSS hash
  verification pattern used across the Month-0 CSS refactors.
- `.claude/commands/verify-all.md` — `/verify-all` runs the standard
  pre-PR chain (`format:check + lint + test + build`). Replaces the
  copy-paste sequence agents kept reinventing.
- `.claude/agents/css-refactor.md` — specialised subagent for any
  change under `src/assets/css/`. Enforces the byte-identity check
  workflow (capture hash → change → re-hash → revert or update
  baseline) and the CSS anti-pattern list. Invoke via the Agent tool.
- `docs/IMPLEMENTATION-PLAN.md` — phased checklist of the active
  revitalization work. Agents flip `- [ ]` to `- [x]` in the same
  commit that closes the task; the plan is the durable record of what
  shipped. Linked from `CLAUDE.md` and `docs/README.md`.
- `.github/CODEOWNERS` — formalizes review ownership for the agent context
  surfaces (`CLAUDE.md`, `.claude/`, `.chatgpt-context.yml`,
  `copilot-instructions.md`), CI/build configs, and `main.css`.
- `src/_data/author.mjs` — single source of truth for author identity
  (used by the base layout, JSON-LD, and future RSS / advisory surfaces).
- `datePublished` and `dateModified` front-matter on every module's
  `*.11tydata.cjs` data file (defaulted to the v2.0.0 ship date; bump per
  module as content is revised).
- Article JSON-LD and `article:published_time` / `article:modified_time`
  meta tags emitted in `<head>` for module pages.
- Visible page-meta block on module pages — author, last-reviewed date,
  optional advisory CTA — rendered at the bottom of `<main>`.

### Removed

- Retired the `ai/` agent subsystem and its auto-commit workflows
  (`ai-readme-sync`, `ai-changelog`, `ai-agents`, `analytics-discussions`,
  `quarterly-content-review`). The auto-synced `<!-- AI-STATUS -->` block in
  `README.md` is gone. Manual maintenance from here on.
- Removed the obsolete `prod-site-revamp` issue template; that project shipped
  as `2.0.0` in February 2026.
- Dropped `agent:analytics`, `agent:package`, and `agent:content-review` npm
  scripts.
- Deleted `src/assets/js/tracing.js` (278-line full-OpenTelemetry SDK
  implementation that's been unwired since 2.0.0 — nothing imports it).
  Production tracing has always been handled by the dependency-free
  `tracing-lite.js`. Removed the nine `@opentelemetry/*` devDependencies
  it was the sole consumer of (`api`, `exporter-trace-otlp-http`,
  `instrumentation-document-load`, `instrumentation-fetch`,
  `instrumentation-user-interaction`,
  `instrumentation-xml-http-request`, `resources`, `sdk-trace-web`,
  `semantic-conventions`). Trimmed `docs/TRACING.md` to match.
- Cleared the three remaining ESLint warnings: deleted the unused
  `parseJsonArray` helper in `eleventy.config.mjs`, and switched two
  `console.info(...)` calls (`scripts/progress.js`,
  `src/js/appwrite-config.js`) to `console.log(...)`, which the
  eslint config explicitly allows.
- Deleted `scripts/test-auth-modules.mjs`. It was an unwired post-build
  smoke check from the pre-Vite era — its substring check for
  `auth-ui.js` in the rendered HTML no longer matched after Vite started
  hashing bundles (`auth-ui.DzcSTLaD.js`), and the script crashed every
  run. Auth module presence is still exercised by the regular smoke
  pipeline + the Vite manifest resolution in `eleventy.config.mjs`.

### Changed

- Rewrote `docs/CONTRIBUTING.md` to focus on human contributors (was previously
  documentation of the retired agent system).
- Trimmed the CI failure runbook in `docs/HOSTING.md` to match the workflows
  that actually exist.
- Cleaned up `.github/copilot-instructions.md` and `.chatgpt-context.yml` so
  they no longer point at removed paths.
- Corrected stale facts throughout `.github/copilot-instructions.md`:
  Eleventy 2.x → 3.1.x, `eleventy.config.cjs` → `.mjs`, `lib/path-prefix.cjs`
  → `.mjs`, removed the dead CSS pipeline description (styles.css / CSSO),
  refreshed the dependency list (csso gone, vite/vitest/playwright in), and
  pruned doc links to files that don't exist
  (`TRACING-QUICKSTART.md`, `APPWRITE_QUICKSTART.md`,
  `assistant-feedback-setup.md`).
- Expanded `.chatgpt-context.yml` with the current stack (Eleventy 3.1.x,
  Vite 7, postcss + cssnano + autoprefixer, vitest, playwright, pa11y-ci),
  CSS / JS entry paths, npm command map, and commit / branch conventions.
- Added `.github/CODEOWNERS` to `.prettierignore` (prettier can't parse it)
  and dropped the deleted `theme-playground` entry.
- Dropped unused devDependencies `postcss-prefix-selector` (only used by
  the retired `build-dark-theme.mjs`) and `serve` (the `npm run serve`
  script uses `eleventy --serve`, not the `serve` package). `npm ci`
  installs 685 fewer transitive packages.
- Cleaned up `README.md` repo-tree diagram: removed the dangling
  `src/assets/css/styles.css` line, added entries for `dist/`,
  `vite.config.mjs`, and the new `CLAUDE.md`.
- Rewrote `docs/README.md` (the docs index): removed 10+ broken links
  pointing at non-existent files
  (`APPWRITE_QUICKSTART.md`, `TRACING-QUICKSTART.md`,
  `TRACING-BUNDLING.md`, `assistant-feedback-setup.md`,
  `auth-setup.md`, etc.), dropped the retired-AI `AI-CONTRIBUTING.md`
  link, and pointed agents at `CLAUDE.md` as the entry point.
- Redirected two `AI-CONTRIBUTING.md` references in `docs/SETUP.md` to
  the current `docs/CONTRIBUTING.md`.
- Added a "Historical document" banner to `docs/PRD-SITE-REVAMP.md`
  flagging that the `ai/` subsystem it describes was retired in Month 0
  and that `CLAUDE.md` is now the authoritative project context.
- Moved `docs/PRD-SITE-REVAMP.md` → `docs/archive/PRD-SITE-REVAMP.md`.
  The historical-document banner already declared the file's status;
  archive placement makes the same status obvious from the file tree.
  References in `CLAUDE.md` and `docs/README.md` updated.
- Deleted `src/static/sitemap.xml` — a 9-line stale sitemap from before
  the path-prefix system landed. It still claimed
  `https://letstalkcdc.github.io/index.html` (wrong host, wrong URL
  shape). Eleventy's dynamic `src/sitemap.11ty.cjs` was already
  overwriting it at `_site/sitemap.xml`, so production output is
  unchanged.
- Corrected stale `.cjs` references in `.github/copilot-instructions.md`:
  every `src/_data/*.cjs` mention is now `.mjs` to match the actual
  files (`appwrite`, `series`, `site`). Fixed the project-overview
  sentence that claimed Appwrite "is optionally used only for storing
  assistant feedback" — `cloud-progress.js` actually uses the
  `progress` and `events` Appwrite collections too when a user is
  signed in, and the doc now lists all three collections from
  `appwrite.collections.json`. The earlier "These have been removed"
  note about `progress`/`events` was wrong and is gone.
- Added an `npm run seed:discussions` script (wraps the existing
  `scripts/seed-discussions.mjs`) so the GitHub-Discussions seeder is
  discoverable from `npm run`. Updated `README.md` to use the npm
  alias instead of the raw `node scripts/...` invocation.
- Documented the unwired-but-working sandbox debug scripts
  (`scripts/verify.sh`, `scripts/test_stack.sh`, `scripts/test_connector.sh`,
  `scripts/test_events.sh`, `scripts/test_chaos_smoke.sh`) in a new
  "Verifying the Stack" subsection of `docs/SANDBOX.md`. They aren't
  in CI and aren't `npm`-discoverable, but they're real operator tools
  for debugging the Docker-Compose CDC stack; this section just makes
  them discoverable.
- Renumbered the trailing top-level CSS files so the source has clean
  sequential numbering after the orphan purge:
  `38-version-status.css` → `07-version-status.css`,
  `39-video-embed.css` → `08-video-embed.css`,
  `40-mobile-responsive.css` → `09-mobile-responsive.css`. `main.css`
  imports and `docs/video-embeds.md` updated; production output is still
  byte-identical (SHA256 `4843ff26…`).
- Removed retired-`ai/` paths from `.gitignore` (the subsystem is gone, so
  the ignore globs were dangling).
- Deleted the broken duplicate `test-appwrite-connection.js` (it used
  `require()` in an ESM-typed package and crashed on every invocation).
  Kept the working `test-appwrite.cjs`, and corrected three stale
  `test-appwrite.mjs` references in `docs/SETUP.md`.
- Deleted the obsolete per-page CSS build pipeline:
  `scripts/build-css.js`, `scripts/build-css.mjs`, `scripts/minify-css.js`.
  Nothing referenced them — the active build is `postcss main.css` driven
  from `package.json`. Also dropped the now-unused `csso` devDependency.
- Untracked the stray repo-root `.DS_Store` and added the standard
  `**/.DS_Store` ignore globs.
- Deleted orphan `src/css/dashboard.css` — a green-on-black retro
  terminal stylesheet not linked from any template. The active
  dashboard styles live in `src/assets/css/dashboard-page.css`
  (imported by `main.css`); the handoff/ dashboard ships inline CSS.

### Removed (CSS dead-code purge)

- Retired the legacy `src/assets/css/styles.css` (2.3k-line monolith). The
  production bundle is built from `src/assets/css/main.css`; the source
  `styles.css` was never passthrough-copied, never reached the browser, and
  was actively misleading.
- Deleted 31 orphan numbered files that only `styles.css` referenced
  (`07-code-blocks` through `37-chips-badges`, plus the duplicate-numbered
  `30-progress-indicators`, `30-timeline`, `38-skill-level-badges`). Their
  selectors were either unused or already covered by `02-base.css`,
  `03-layout.css`, `04-components.css` (which imports `components/*.css`),
  or page-specific CSS under `pages/`.
- Deleted `src/assets/css/search.css` (loose copy of `06-search.css`,
  unreferenced).
- Deleted `src/assets/css/web-vitals-dashboard.css` (no template links it;
  the JS just constructs the dashboard with `.web-vitals-dashboard` as an
  unstyled className).
- Retired the `theme-dark-prefixed.css` build pipeline:
  `scripts/build-dark-theme.mjs`, the `theme-playground/styles.css` source,
  the `build:dark-theme` npm script and its slot in the `build` chain. The
  generated `theme-dark-prefixed.css` was never linked from any template.

Net effect: `src/assets/css/` drops from 47 to 13 files. Verified the
production output `_site/assets/css/styles.css` is byte-identical
(SHA256 `4843ff26…`) before and after the purge — no shipped CSS rule
changed.

## [2.0.0] — 2026-02-06

Site Revamp — all 9 PRD phases complete. Eleventy 3.x, Vite build, modular JS,
interactive components, enhanced search, improved assistant, and full test
suite.

### Phase 1 — Foundation

#### 1.1 Eleventy 3.0 Migration (PR #244)

- Upgraded Eleventy from 2.0.1 to 3.1.2
- Migrated all configuration and data files from CommonJS to ESM
- Converted `eleventy.config.cjs` → `eleventy.config.mjs`
- Converted `postcss.config.cjs` → `postcss.config.mjs`
- Converted `lib/path-prefix.cjs` → `lib/path-prefix.mjs`
- Converted all `src/_data/*.cjs` → `src/_data/*.mjs`

#### 1.2 JS Modularization (PR #245)

- Split monolithic app.js into focused ES modules
- Created `src/js/modules/` with theme, navigation, search, code-blocks,
  toast, depth-toggle, scorecard, timeline, interactive-diagrams
- Each module self-registers via `initX()` pattern
- Central `src/js/app.js` orchestrates module loading

#### 1.3 Vite Build Pipeline (PR #246)

- Added Vite 7.x as frontend build tool
- Configured `vite.config.js` with Eleventy integration
- Asset fingerprinting and optimized production bundles

### Phase 2 — Features

#### 2.1 Enhanced Search (PR #250)

- Fuzzy search with scoring and highlighting
- Real-time results panel with keyboard navigation
- Search index generated at build time from all content pages

#### 2.2 Interactive Components (PR #251)

- Interactive Mermaid diagrams with zoom/pan
- Animated CDC pipeline timeline
- Depth-toggle for progressive disclosure of technical content
- Enhanced code blocks with copy-to-clipboard and syntax hints

#### 2.3 Improved Assistant (PR #252)

- Inline chat assistant with 13 CDC domain intents
- Fuzzy intent matching with confidence scoring
- Contextual follow-up suggestions
- Module-aware deep links with anchor support
- Feedback collection (thumbs up/down)
- Robust YAML parser for multi-line trigger arrays

### Phase 3 — Quality

#### 3.1 Vitest Unit Tests (PR #247)

- 184 unit tests across 11 test files
- JSDOM environment for browser API testing
- Coverage for all JS modules

#### 3.2 Playwright E2E Tests (PR #248)

- End-to-end browser tests for critical user flows
- Multi-browser testing (Chromium, Firefox, WebKit)

#### 3.3 CI/CD Pipeline (PR #249)

- GitHub Actions workflow for build, test, and deploy
- Automated smoke tests, accessibility checks, performance budgets
- Dependency security scanning

### Fixed

- YAML parser now handles multi-line JSON arrays with trailing commas
