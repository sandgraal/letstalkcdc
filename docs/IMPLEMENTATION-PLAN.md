# Implementation Plan — Revitalization

The running checklist for the Let's Talk CDC revitalization work. Phases
are ordered by priority within each tier; tiers are independent and can
be worked in parallel by separate agents.

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
- Mark blockers with `> ⚠️ Blocked by: <reason>` directly under the item.

---

## Phase 1 — Production configuration validation

These items don't require code changes — they require checking
GitHub-side state and decisions.

- [ ] Confirm `vars.SITE_HOST` is set to `https://sandgraal.github.io` in
      the repo's **Variables** (not Secrets) at
      `https://github.com/sandgraal/letstalkcdc/settings/variables/actions`.
      `deploy.yml` reads it but doesn't fail loudly if unset, so the
      production canonical/OG URLs depend on it being correct.
- [ ] Confirm `vars.ELEVENTY_PATH_PREFIX` is `/letstalkcdc` (or
      explicitly unset — `lib/path-prefix.mjs` will auto-derive the same
      value from `GITHUB_REPOSITORY`).
- [ ] Trigger a `deploy.yml` run after confirming both, and spot-check
      a deployed page's `<link rel="canonical">` and Open-Graph tags
      resolve to the right host.

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
- [ ] Verify the next scheduled nightly at 05:00 UTC succeeds — see
      <https://github.com/sandgraal/letstalkcdc/actions/workflows/handoff-nightly.yml>.
- [ ] Decide what `handoff/Handoff.md` actually represents. Today it's
      placeholder template content ("Initial setup complete... None
      today...") that gets re-parsed every night into an identical
      log entry. Either:
  - Edit `Handoff.md` between maintainer sessions so each nightly sync
    captures real wins/stumbles/next-tasks; or
  - Retire the system (delete `handoff/`, the workflow, and
    `publish-dashboard.yml`).

---

## Phase 3 — Content debt (per `.lycheeignore` notes)

### Video embeds

- [ ] Pick a canonical intro-to-CDC video and replace the two deleted
      YouTube embeds in `src/intro/index.njk` (the upstream IDs
      `5CjPj9ShJVA` and `zYJn6GA5t1Q` are 404). Update the `<iframe>`
      `src`s + thumbnails, then drop the two
      `^https://img\.youtube\.com/vi/<id>/` patterns from
      `.lycheeignore`.

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

- [ ] **Investigation done; decision still required.** Confirmed:
      `src/assets/js/tracing-lite.js:9` hardcodes its default endpoint
      to `http://localhost:4318/v1/traces`, and `getEducationTracer()`
      (the only entry point, called from `app.js`) instantiates
      `new EducationTracer()` with no args. So in production every
      visitor's browser POSTs to _their own_ `localhost:4318`, which
      always fails (silently swallowed by the `catch` in
      `_sendTrace`). The tracer is dead weight in prod — ~363 LOC + a
      failed fetch per tracked event. Decide:
  - **Wire it up:** read the endpoint from `window.OTLP_TRACING_ENDPOINT`
    (set by the base layout from a build-time env var), no-op
    instantiation if unset. Document the endpoint env-var in
    `docs/TRACING.md`.
  - **Remove it:** drop the `import { getEducationTracer }` from
    `src/assets/js/app.js`, the `"tracing-lite"` entry from
    `vite.config.mjs`'s `rollupOptions.input`, and the file itself.
    Trim `docs/TRACING.md` to describe the feature as "removed in
    Month-N, was unused since 2.0.0".

---

## Phase 5 — Quality & test polish

- [x] Added a vitest suite for `lib/path-prefix.mjs` — 14 cases
      covering both env-var precedence, the `owner.github.io`
      root-deploy branch (incl. case-insensitive match), malformed
      `GITHUB_REPOSITORY` fallback, the `getPathPrefixForHost`
      trailing-slash strip, and `normalizePathPrefix` edge cases.
      See `tests/unit/lib/path-prefix.test.js`.
- [ ] Add a Playwright e2e for the cloud-progress sync flow
      (sign-in → complete a module → reload → progress persists).
      No test currently exercises Appwrite-backed paths.
- [ ] Add a Lighthouse perf assertion on `/intro/` at **error** level.
      The first attempt (raising it to `error` at `minScore: 0.9` via
      `assertMatrix` in `.lighthouserc.json`) failed the LHCI run on
      PR #265 — the actual CI perf score on `/intro/` is below 0.9, so
      the assertion needs either a realistic threshold or genuine perf
      work first. Walked back to the global warn-level coverage. To
      close: run LHCI locally against `_site/intro/index.html` to
      establish the actual baseline, then either tighten the score
      threshold to match (e.g. `minScore: 0.8`) or fix the perf
      regression and keep `0.9`.

---

## Phase 6 — Documentation freshness

- [ ] Pass each doc in `docs/*.md` (except `archive/`) for stale
      references; one doc per agent session is plenty. Look for: file
      paths that no longer exist, `.cjs`/`.mjs` mismatches, npm scripts
      that were renamed.
- [x] Moved `docs/PRD-SITE-REVAMP.md` → `docs/archive/PRD-SITE-REVAMP.md`.
      The "Historical document" banner at the top already declared its
      status; archive placement makes the status obvious from the file
      tree too. Updated references in `CLAUDE.md` and `docs/README.md`.

---

## Adding new phases

Append below this line. Keep phases narrow; if a phase grows past ~10
items, split it. Don't reorder existing phases — agents may have stale
links.
