---
description: Verify production CSS output is byte-identical to the main branch baseline
---

# /css-byte-check

Build the production CSS and compare its sha256 against the baseline recorded
in `CLAUDE.md`. Use this any time you refactor anything under
`src/assets/css/` — renaming files, deleting orphans, reordering imports — to
prove the shipped stylesheet hasn't changed.

## Steps

1. Run a production CSS build:
   ```bash
   NODE_ENV=production npm run build:css
   ```
2. Hash the output:
   ```bash
   sha256sum src/assets/css/styles.min.css
   ```
3. Compare against the baseline in `CLAUDE.md`. As of this writing the
   `main`-branch baseline is:
   ```
   c5806349294d3bc295a07c93054684a70545d291216916e45cef1c154017f944
   ```
   (re-baselined 2026-10-09 for P16-8: `.series-related` rules for the Related
   lessons list added to components/progress.css, nothing else; previously
   `fceb82df…`, re-baselined the same day for P15-50: the dead `.copy-snippet` selectors
   and rule removed from components/code-block.css, deletions only; previously
   `f59f964f…`, re-baselined the same day for P16-9: `.h-as-3` / `.h-as-4` heading-level
   helpers in 05-utilities.css, nothing else; previously `83943ab3…`,
   re-baselined the same day for P13-6: metric-matched fallback `@font-face`
   rules and the `--font-*` tokens that list them, nothing else; previously
   `7ba70b50…`, re-baselined the same day for P13-8: cssnano 7 to 9 tool upgrade, no
   source CSS change, output proven computed-style and pixel equivalent;
   previously `c32d01ac…`, re-baselined the same day for the P15-21 contrast debt: new
   `components/code-block.css`, light-theme `--color-success/-warning/-error`
   darkened to 4.5:1 and the `.status-badge` variants moved onto them;
   previously `163231e6…`, the visible-UI fixes: `.discussion-callout`
   rules in 02-base.css, the orphaned stats-chip / session-modal rules
   removed from 09-mobile-responsive.css along with their markup, the
   `.button-primary` text and hover colours in dashboard-page.css, and the
   `a.button:where(:hover, :active, :focus-visible)` text-colour rule in
   04-components.css; the `--accent-dark` / `--hover-bg` token
   replacements in dashboard-page.css; previously `1d52a8f2…` and `e70f54c7…`
   (same PR, earlier states) and `424e77a0…`, the light-theme
   accent contrast fix: only
   `--color-accent-primary/-hover/-active` and `--color-info/-info-hover`
   in the light block changed; previously `e54f4182…`, which added the
   `.page-meta__author > .author-photo` headshot rule over `b1478af0…`.)
4. **Identical** → the refactor is visually safe; commit it.
5. **Different** → either you intentionally changed a rule (note it in the
   commit message and update the baseline in `CLAUDE.md`), or you introduced
   a regression. Run the full build and diff `_site/assets/css/styles.css`
   against `git show main:_site/assets/css/styles.css` (or rebuild from
   main) to localize the change.

## Notes

- `NODE_ENV=production` matters — without it, comments and whitespace stay
  in the bundle and the hash will differ even when no rule changed.
- Page-specific CSS under `src/assets/css/pages/` is not part of this hash;
  test those pages by linking them in the browser.
- The CHANGELOG's "Net effect" lines in the CSS-purge entry use this same
  hash to document the safety of the refactor.
