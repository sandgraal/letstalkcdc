---
name: content-update
description: The 8-step checklist for re-verifying and correcting one existing page against primary sources, including errata, dateModified and the thesis. Use when asked to audit, fact-check, refresh or correct a lesson page.
---

# Re-verify one page

From `docs/AUTOPSY-BRIEF.md` section 4. The thesis and the errata and date
rules are in `.claude/rules/content.md`; read them first.

1. **Baseline.** Record `git log -1 --format='%ad %h' -- src/<page>/` and the
   current `dateModified` in `src/<page>/index.11tydata.cjs`.
2. **List the claims.** Every configuration key, SQL statement, version
   number, default, limit and "always/never" sentence.
3. **Check each against the primary source** for the version the page names.
   `src/_data/toolVersions.mjs` separates `tools` (latest stable) from
   `tested` (what the labs pin); say which one a claim refers to.
4. **SQL.** Run it in that dialect, or confirm the page labels it untested.
   The guard must compare log position, use a strict comparison or a
   tie-break, and keep deletes as markers.
5. **Thesis.** No timestamp as an ordering key; "exactly-once" scoped to a
   hop; no claim of end-to-end exactly-once.
6. **Open every cited source.** Does it say what the page says it says?
   Cite by URL with an access date.
7. **Run the page's test:** `npx vitest run tests/unit/<page>-page.test.js`
   (not every page has one), then `npm run lint:content`.
8. **If the page is wrong:** add an entry to `src/_data/errata.mjs`
   (`id`, `urls`, `title`, `dateModified`, link-free `body`), fix the page,
   bump `dateModified`, and tell the maintainer. Do not fix silently.

## Also

- Bump `dateModified` only for a substantive change; a typo is not one.
- Do not write that the maintainer reviewed the page until he says so.
- Report what you checked and what you could not (no Docker, no vendor
  account). "Untested" is an honest answer; a guess is not.
- Close the plan item and add a `CHANGELOG.md` `[Unreleased]` line.
