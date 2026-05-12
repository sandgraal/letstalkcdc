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

- [ ] `src/_data/site.mjs:11` hardcodes
      `const defaultHost = "https://letstalkcdc.github.io"`. Production
      lives at `https://sandgraal.github.io/letstalkcdc/`. If
      `process.env.SITE_HOST` is ever unset (or set to a placeholder),
      every canonical/OG/JSON-LD URL ships pointing at a host that
      doesn't exist. Decide one of:
  - Change the default to `https://sandgraal.github.io`.
  - Add a build-time guard that fails when `SITE_HOST` is missing in
    `NODE_ENV=production`.
  - Leave it (if the maintainer plans to register
    `letstalkcdc.github.io` as a vanity org host).

### Path-prefix doubling in redirect stubs

- [ ] `.lycheeignore` excludes `^https?://[^/]+/letstalkcdc/letstalkcdc/`
      with the note "Redirect stubs use `{{ site.host }}{{ '/path/' | url }}`
      which doubles the path-prefix." Find the offending template(s) —
      grep for `site.host` + `| url` in close proximity — and fix to use
      either `site.origin` (host without prefix) or drop the `| url`
      filter. Remove the `.lycheeignore` entry once fixed.

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

- [ ] Debezium signals docs —
      `https://debezium.io/documentation/reference/stable/operations/signals.html`
      is gone. Find the current canonical URL upstream.
- [ ] Fivetran changelog —
      `https://fivetran.com/docs/getting-started/changelog` has moved.
- [ ] Matillion release notes —
      `https://www.matillion.com/resources/release-notes` has moved.

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

- [ ] `src/assets/js/tracing-lite.js` is imported by `app.js` and posts
      OTLP-formatted JSON via Fetch. Verify the configured endpoint
      actually resolves in production — if it doesn't, the tracer
      silently no-ops and the import is dead weight. Decide:
  - Wire it to a real collector (and document the endpoint env var
    handling); or
  - Remove the import from `app.js` and the entry from
    `vite.config.mjs`.

---

## Phase 5 — Quality & test polish

- [ ] Add a vitest case for `lib/path-prefix.mjs` covering the
      `owner.github.io` root-deploy branch (currently only the
      project-pages path is exercised).
- [ ] Add a Playwright e2e for the cloud-progress sync flow
      (sign-in → complete a module → reload → progress persists).
      No test currently exercises Appwrite-backed paths.
- [ ] Add a Lighthouse perf assertion on `/intro/` (the largest
      user-facing module page) to `.lighthouserc.json`.

---

## Phase 6 — Documentation freshness

- [ ] Pass each doc in `docs/*.md` (except `archive/`) for stale
      references; one doc per agent session is plenty. Look for: file
      paths that no longer exist, `.cjs`/`.mjs` mismatches, npm scripts
      that were renamed.
- [ ] Decide whether `docs/PRD-SITE-REVAMP.md` should move to
      `docs/archive/` now that the "Historical document" banner at the
      top makes its status explicit.

---

## Adding new phases

Append below this line. Keep phases narrow; if a phase grows past ~10
items, split it. Don't reorder existing phases — agents may have stale
links.
