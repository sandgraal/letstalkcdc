---
name: new-module
description: Checklist for adding a new lesson page (module) to the CDC series. Use when asked to add a new topic page, lesson or module; covers series.mjs, the page directory, sitemap, tests and the plan item.
---

# Add a new module

Distilled from `docs/adding-modules.md`; read that file for full examples.
Content rules (thesis, errata, dates) are in `.claude/rules/content.md`.

1. **Plan item.** Find or add the item in `docs/IMPLEMENTATION-PLAN.md`
   (Phase 17, the plan's current phase, is the team queue). A new item is a `plan.d/` fragment with `action: add`; you close it with `action: done` in the same PR. Never edit the plan.
2. **Register in `src/_data/series.mjs`** first: `key` (the slug), `title`,
   `description`, `href` (`<key>/`, no leading slash, copy a neighbour),
   `tags`, `skillLevel` and `related` (other keys). This drives the overview
   grid, prev/next strip and navigation.
3. **Create `src/<key>/`** with:
   - `index.njk`: front matter `layout: base.njk`, `title`, `description`
     (160 characters max), `canonicalPath: "/<key>/"`, `skillLevel`.
   - `index.11tydata.cjs`: `seriesKey` (equals the `key`), `datePublished`,
     `dateModified` (`YYYY-MM-DD`), `schemaType`, `heroConfig`.
4. **Template hygiene.** Every internal URL uses `| url`. Use the shared macros
   (`{% from "components/ui.njk" import ui %}`). Page CSS goes under
   `src/assets/css/pages/`; if you need CSS, stop and route it to `css-refactor`.
5. **Sitemap and feed.** Nothing to register: `src/sitemap.11ty.cjs` and the
   feed read pages and their dates. Do not set `eleventyExcludeFromSitemap`
   unless the page is noindex on purpose. Run `npm run audit:seo` afterwards
   (see the `seo-check` skill).
6. **Thesis check.** At-least-once; order by log position, not `ts_ms`;
   exactly-once only per hop. Name versions; label untested SQL.
7. **Tests.** Add `tests/unit/<key>-page.test.js` modelled on a neighbour such
   as `tests/unit/which-row-wins-page.test.js` (build output or source
   assertions about what a reader can do). Update tests that count pages if
   they fail (search for the old count).
8. **Assistant and glossary** (optional): add an intent to
   `src/data/assistant.yml` with a golden-question test; add glossary terms in
   `src/_data/glossary.mjs`.
9. **Verify.** `npm run verify-all` and `npm run smoke:core`.
10. **Close out.** Add a `plan.d/<item-id>-<topic>.md` fragment with `action: done` (never edit the plan) and a `changelog.d/<topic>.md` fragment (never edit `CHANGELOG.md`).
