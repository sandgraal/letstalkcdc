# State of the project — 2026-05-18

A dated snapshot of where Let's Talk CDC is right now, written through
five expert lenses (engineering, content & SEO, a11y & perf, trust &
conversion, Claude / agent-ops).

Read this when you want a fast read of where things stand. The
authoritative running checklist remains
[`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md); this doc is its
dashboard, not its replacement.

---

## TL;DR

- **Site shape**: Eleventy 3.1 + Vite 7 + PostCSS static site, deployed
  to GitHub Pages at <https://sandgraal.github.io/letstalkcdc/>. Dozens
  of pages carry a `seriesKey`; 42 top-level `src/` directories total.
- **Just landed (last 48 hours, PRs #281–#288)**: RSS 2.0 feed at
  `/feed.xml`, BreadcrumbList JSON-LD fixes, three GitHub status
  badges, deprecated auth + cloud-progress cleanup, inline errata
  callouts driven by `src/_data/errata.mjs`, a 14-term glossary at
  `/glossary/`, a methodology page at `/methodology/`, and a small
  `/intro/` dom-size trim with an audit of remaining heavy sections.
- **In flight (3 open PRs)**: #289 (dev CSS prebuild, conflicting
  after #288 merge), #290 (CSS byte-check baseline refresh,
  mergeable), #291 (plan cleanup, mergeable).
- **Tests are green**: 274 unit cases across 14 files, 6 Playwright
  e2e specs, `verify-all` chain clean on `origin/main`.
- **LHCI honest baseline** on `/intro/`: perf **0.86**, a11y **0.97
  local / 0.94 CI**, color-contrast **1.0**, render-blocking
  **1.0**, unsized-images **1.0**. Remaining perf headroom is in
  CLS (0.58), main-thread work, and DOM size (947 raw HTML elements
  on `/intro/`).
- **Plan checkbox totals on `origin/main`**: 36 `[x]` / 20 `[ ]`. Of
  those 20, 10 are marked `maintainer-only` (assets, vendor stance,
  licence, provider choice); four will close on PR #291 merge; the
  rest are deferred or partial.
- **Agent workflow is healthy**. The `Stop` hook auto-continue
  mechanism uses the current `asyncRewake: true` schema and atomic
  state writes correctly. One friction point: the hook's
  `additionalContext` preview always names a Phase 1 item the
  directive simultaneously tells the model to skip.

---

## Engineering & architecture

The stack and pipeline match what
[`CLAUDE.md`](../CLAUDE.md) describes. `npm run verify-all` is the
local minimum bar: `format:check && lint && test && build`. Four
GitHub Actions workflows back it up — `ci.yml` (the verify-all chain
plus Lighthouse CI), `deploy.yml` (Pages), `linkcheck.yml` (lychee),
and `fortify.yml` (Fortify SAST). Tests: 14 unit files
(`tests/unit/`) with 274 cases as of the last green run; 6 e2e
specs at `tests/e2e/` covering accessibility, the assistant FAB,
modules, navigation, search, and theme.

Two slash commands and one sub-agent live in `.claude/`:
[`/verify-all`](../.claude/commands/verify-all.md),
[`/css-byte-check`](../.claude/commands/css-byte-check.md), and the
[`css-refactor`](../.claude/agents/css-refactor.md) sub-agent that
enforces the production-CSS byte-identity workflow.

The only currently-tracked perf headroom item is **DOM size on
`/intro/`**. PR #288 trimmed 10 elements (957 → 947 raw HTML opens)
by removing no-op `<input type="checkbox">` wrappers from the
operational-gotchas list, and left a structured audit of the next
heaviest sections in the plan (CDC platforms cards ≈ 135 elements,
Methods at a Glance table ≈ 135, footer ≈ 199).

**Next moves**:

- Rebase [#289](https://github.com/sandgraal/letstalkcdc/pull/289)
  after [#288](https://github.com/sandgraal/letstalkcdc/pull/288)'s
  merge into main (it conflicts on `scripts/smoke.mjs`); then land
  #289 and the two doc-only PRs (#290 + #291).
- Pick up the deferred `dom-size` sub-items from PR #288's audit —
  data-drive the CDC platforms cards from `src/_data/`, collapse the
  Methods-at-a-Glance `<span class="cell-indicator">` /
  `<span class="cell-text">` pairs into a single span with a
  `::before` pseudo-element.
- The deferred CSS `@layer` migration (Phase 4 line 131, also Phase
  11 line 723) stays deferred: Phase 11 explicitly notes "Defer
  unless a real specificity bug forces it; no user value
  otherwise."

---

## Content & SEO

Every credibility surface a modern educational site usually needs is
now live: per-page `dateModified` stamp + JSON-LD Article +
BreadcrumbList in
[`base.njk`](../src/_includes/layouts/base.njk), a sitemap at
[`src/sitemap.11ty.cjs`](../src/sitemap.11ty.cjs), RSS at
[`src/feed.11ty.cjs`](../src/feed.11ty.cjs), an "Edit this page on
GitHub" footer link, an errata hub at
[`src/errata/index.njk`](../src/errata/index.njk) with inline
per-page callouts driven by
[`src/_data/errata.mjs`](../src/_data/errata.mjs), a 14-term
glossary at [`src/glossary/index.njk`](../src/glossary/index.njk)
backed by [`src/_data/glossary.mjs`](../src/_data/glossary.mjs), and
a methodology page at
[`src/methodology/index.njk`](../src/methodology/index.njk).
README header carries three auto-updating CI badges.

The remaining content debt is concentrated in
[`src/_data/author.mjs`](../src/_data/author.mjs): `image: null`,
`advisoryUrl: null`, `sameAs` has a single entry. None of those is
an engineering problem — they're maintainer-decision items (asset
upload + identity surfaces).

**Next moves** (each is currently maintainer-blocked):

- Author photo (Phase 8 line 462) — drop a JPEG at
  `src/static/author/` and flip the `image` field.
- Author identity expansion (Phase 8 line 518) — add LinkedIn,
  conference talks, or podcast URLs to `sameAs` when they exist.
- `/compare/` vendor hub (Phase 9 line 532) — needs maintainer
  authority on the Debezium vs. AWS DMS vs. Fivetran vs. Airbyte
  stance; agent shouldn't draft these unilaterally.
- Newsletter provider (Phase 9 line 579) — Buttondown / Kit /
  ConvertKit, then a `/newsletter/` page.

---

## A11y & perf

LHCI thresholds in [`.lighthouserc.json`](../.lighthouserc.json):
warn-level 0.9 across all sampled URLs (`/`, `/intro/`, `/overview/`,
`/quickstarts/`, `/snapshotting/`); `/intro/` has error-level perf
≥ 0.82 and a11y ≥ 0.93. The earlier honest-baseline correction
landed in PR #269 — pre-fix scores of 1.0 were measured against an
unstyled DOM because the LHCI runner served `_site/` at root while
pages referenced assets at `/letstalkcdc/...`. The `build:lhci`
script now produces a root-deployable artifact so LHCI exercises a
styled, scripted page.

Color-contrast went 0 → 1.0 on `/intro/` in PR #274 via the
expanded legacy-variable aliases in `01-variables.css` plus the
`--color-text-muted` token swap. Render-blocking-resources cleared
to 1.0 in PR #275 via deferred preload stylesheets. Unsized-images
cleared in Phase 7 via the `img` shortcode reading SVG `viewBox` /
`width` / `height` from disk.

What's left on `/intro/` perf:

- `cumulative-layout-shift: 0.58` — culprits not yet localized.
- `mainthread-work-breakdown: 0.5` — never investigated.
- `dom-size: 0.5` — 957 raw elements; PR #288 started chipping.

**Next moves**:

- The maintainer-only ask is one local Lighthouse run from a quiet
  machine (`npm run lighthouse` after `npm run build:lhci`) and a
  shared screenshot of the `cls-culprits-insight` audit — the
  on-machine variability between local macOS Chrome (0.97) and
  Ubuntu Noble CI (0.94) means agent-side investigation without a
  shared reference run is speculation.
- Continue the structural DOM trims enumerated in PR #288's
  audit; each gains roughly 30–100 elements at the cost of a small
  visual change.

---

## Trust & conversion

The May 2026 brutal-review trust-surface gaps are mostly closed.
Tier-1 items shipped: methodology narrative (PR #287), per-page
errata callouts (PR #285), standalone glossary (PR #286), errata
hub, RSS feed, `dateModified` stamps, "Edit on GitHub" link, three
README CI badges. Tier-2 items in flight or deferred: license file,
Lighthouse perf badge, `/compare/` hub, newsletter.

The remaining trust gap is **author identity** — the byline points
at a single GitHub URL and no photo. Confluent Developer, Debezium,
and Estuary all carry author photos and broader identity surfaces.
That gap is maintainer-only (content/asset decision), not
engineering.

**Next moves** — single ranked list of the maintainer-only items:

1. License file (Phase 11 line 669). Easiest decision (MIT for code
   - CC-BY 4.0 for content is the conventional educational-repo
     pattern). Unblocks the README license badge.
2. Author photo (Phase 8 line 462). Single asset + a two-line
   change to `author.mjs` + an `<img>` in the page-meta aside.
3. Author identity expansion (Phase 8 line 518). LinkedIn at
   minimum; talks/podcasts as they exist.
4. `/compare/` hub (Phase 9 line 532). Highest-leverage SEO win
   per the brutal review, but the highest editorial risk too. Needs
   maintainer-authored vendor takes; agent should not draft these.
5. Newsletter (Phase 9 line 579). Provider decision first, then
   ~30 minutes of integration work.

---

## Claude / agent-ops

The agent workflow is healthy. The `Stop` hook in
[`.claude/settings.json`](../.claude/settings.json) uses the
current docs schema correctly:
[`asyncRewake: true`](https://code.claude.com/docs/en/hooks#async-hooks-and-rewake)
is the documented field name, exit code 2 is the documented signal
for "wake Claude with this output as system-reminder". The
[`check-merged-prs.sh`](../.claude/scripts/check-merged-prs.sh)
script writes its state atomically (tmp + `mv`), handles the
worktree case via `git rev-parse --show-toplevel`, and silent-fails
when `gh`, `jq`, or `git` aren't installed. The permissions allow
list is broad-but-safe (read-only `gh pr/run/issue`, all `npm run
*`, common shell tools); the deny list blocks `git push --force*`,
`git reset --hard*`, and every `gh api * -X PATCH/POST/PUT/DELETE`
variant. Two slash commands and one sub-agent are defined; all use
the current frontmatter format.

Three real friction points surfaced in the last week of agent work:

1. **The auto-continue preview always points at Phase 1.** The
   hook's `additionalContext` ends with "First open item by file
   order: 30:- [ ] Confirm `vars.SITE_HOST` ..." but the very same
   directive instructs Claude to skip Phase 1 (GitHub-side config).
   Every auto-continue costs the model one re-read of the plan to
   find what to actually act on. The hook could pre-filter Phase 1
   entries before emitting the preview, or pass a `skipPhase`
   field the model honors.
2. **`git push --force-with-lease` is denied.** That's the correct
   policy, but it means rebased branches can't be pushed; the
   agent has to fall back to `git merge --no-ff origin/main` to
   pull in main additively. Worked through it twice this session
   without drama, but the friction is real for any new rebase.
3. **No `/plan` slash command.** This audit was opened by hand
   from the user's prompt; a packaged command would make it
   reproducible.

**Next moves** — defer all of these to a future Phase 12 chapter
per the user's "audit only, no agent-ops edits in this PR" decision:

- Add a `/plan` slash command that mirrors this audit's structure.
- Tweak `check-merged-prs.sh` to skip Phase 1 entries in the
  preview, or annotate them in a structured way the model can act
  on without re-reading the plan.
- Consider an `output-styles` config or an MCP server for any
  external state Claude needs (issue tracker, monitoring) once the
  scope expands beyond GitHub.

---

## Outstanding `[ ]` items on `origin/main`

20 open items as of HEAD `f542997`. Cross-referenced with line
numbers in [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md).

| Phase | Line | Item                                | Status            |
| ----- | ---- | ----------------------------------- | ----------------- |
| 1     | 34   | Confirm `vars.SITE_HOST`            | maintainer-only   |
| 1     | 39   | Confirm `vars.ELEVENTY_PATH_PREFIX` | maintainer-only   |
| 1     | 42   | Trigger `deploy.yml` + spot-check   | maintainer-only   |
| 4     | 135  | CSS `@layer` migration              | deferred (Ph. 11) |
| 5     | 219  | target-size follow-up               | closing in #291   |
| 5     | 251  | `/intro/` perf debt parent          | partial           |
| 5     | 287  | `/intro/` a11y debt parent          | closing in #291   |
| 6     | 303  | doc audit parent                    | closing in #291   |
| 7     | 347  | CLS culprits investigation          | needs LHCI run    |
| 8     | 466  | Author photo                        | maintainer-only   |
| 8     | 522  | Author identity expansion           | maintainer-only   |
| 9     | 536  | `/compare/` vendor hub              | maintainer-only   |
| 9     | 566  | RSS [ ] (stale dup of [x])          | closing in #291   |
| 9     | 583  | Newsletter capture                  | maintainer-only   |
| 10    | 601  | Pick one interactive demo           | maintainer-only   |
| 10    | 607  | Ship demo as ESM module             | depends on 601    |
| 10    | 612  | Fill old YouTube embed slots        | depends on 601    |
| 11    | 669  | README license badge                | maintainer-only   |
| 11    | 676  | README Lighthouse badge             | maintainer-only   |
| 11    | 723  | CSS `@layer` migration              | deferred          |

Eight items are blocked on maintainer-only decisions; four flip to
`[x]` when PR #291 merges; two are deferred by explicit Phase 11
policy; the rest are partial or depend on a maintainer-only
prerequisite.

---

## Recommended next 3 PRs

1. **Land the in-flight queue.** Rebase
   [#289](https://github.com/sandgraal/letstalkcdc/pull/289) onto
   the post-#288 main; merge
   [#290](https://github.com/sandgraal/letstalkcdc/pull/290) and
   [#291](https://github.com/sandgraal/letstalkcdc/pull/291). After
   the three land, plan totals are 40 `[x]` / 16 `[ ]`.
2. **Pick one maintainer-blocked item to unblock.** License file
   is the lowest-cost decision and unblocks the README license
   badge automatically (Phase 11 line 669).
3. **Open Phase 12** in `IMPLEMENTATION-PLAN.md` once the queue is
   empty and at least one maintainer-blocked item has unblocked.
   Suggested charter from this audit: agent-ops cleanups (the
   three friction points above) plus pickup of the structural DOM
   trims from PR #288's audit.

---

## Verification

To confirm this snapshot is still accurate when you read it later:

```bash
# PR queue should match the "In flight" section above.
gh pr list --author @me --state open

# Plan checkbox totals should match (36 / 20 on origin/main today).
grep -c '^- \[x\]' docs/IMPLEMENTATION-PLAN.md
grep -c '^- \[ \]' docs/IMPLEMENTATION-PLAN.md

# Local verification should be green.
npm run verify-all
npm run smoke:core
```

When the numbers drift, write a new dated snapshot rather than
editing this one in place — historical snapshots are useful for
tracking pace.
