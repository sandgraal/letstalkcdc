---
paths:
  - "src/**/*.njk"
  - "src/_data/**"
---

<!-- Applies to: src/**/*.njk, src/_data/** -->

# Content rules

The content is the product. Every page is held to this thesis:

1. Delivery is **at-least-once**: expect duplicates, replays and restarts.
2. Correctness lives in the **sink**: idempotent writes keyed on the primary
   key, **ordered by source log position** (LSN, SCN, GTID), never `ts_ms`.
3. **End-to-end exactly-once across independent systems is not claimed**;
   "exactly-once" is scoped to a hop, or to processing (at-least-once
   transport plus an idempotent sink).

## Rules

- A hardcoded `/` in a template is a bug: use `| url`. Errata `body` text
  stays link-free (rendered raw, so root links would skip the prefix).
- Front matter: `title`, `description` (160 characters max), `canonicalPath`;
  `datePublished` / `dateModified` (`YYYY-MM-DD`) live in `index.11tydata.cjs`.
- **dateModified:** bump on a substantive edit (changed claim, SQL, config
  key, version, new section); not for typos, formatting or link fixes.
- **Errata:** if a published claim was wrong, never fix it silently. Add an
  entry to `src/_data/errata.mjs`, fix the page, bump `dateModified`, and tell
  the maintainer.
- Version-specific claims name the version and whether it is `tools` (latest)
  or `tested` (lab-pinned) in `toolVersions.mjs`. SQL is run or labelled untested.
- Checks: `npm run lint:content`; the page's test
  (`npx vitest run tests/unit/<page>-page.test.js`); thesis guards such as
  `tests/unit/exactly-once-per-hop.test.js`; and `npm run lint:thesis`.
- **Thesis lint** (`npm run lint:thesis`, `scripts/thesis-lint.mjs`,
  `lib/thesis-lint.mjs`): scans lesson pages, `src/_data`, JSON, assistant
  answers, `src/js` strings, playground copy and the README for two rules. R1:
  a timestamp (for example `ts_ms` or `updated_at`) used as the ordering
  key. R2: an end-to-end exactly-once claim. It understands negation and
  teaching contrast ("never order by `ts_ms`") and ignores quiz wrong answers.
  It runs inside `npm test` (`tests/unit/thesis-lint.test.js`), so a bad
  sentence fails the unit suite and CI. It is a regression net, not proof of
  correctness. A line it cannot clear is listed in `lib/thesis-lint.allow.json`
  and should be marked for editor review; an allowlist entry that no longer
  matches any text is **stale and fails the lint**, so remove the entry in the
  same PR that fixes the line. Do not add an entry to silence a real claim.
- **Provenance:** much of the text is AI-assisted. A page may say it was
  reviewed by the maintainer only after he confirms it; never write
  "SME-reviewed" (the repo does not record who the reviewer was).
  To re-verify a page, use the `content-update` skill.
