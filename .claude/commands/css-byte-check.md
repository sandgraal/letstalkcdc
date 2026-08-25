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
   4f653676b79a548ee3e7e31c2bfbfbf06930286439431b8f8596c0e9e1a34ef2
   ```
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
