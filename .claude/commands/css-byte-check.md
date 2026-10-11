---
description: Verify production CSS output is byte-identical to the main branch baseline
---

# /css-byte-check

Build the production CSS and compare its sha256 against the baseline recorded
in `.claude/css-baseline.sha256`. Use this any time you refactor anything under
`src/assets/css/` — renaming files, deleting orphans, reordering imports — to
prove the shipped stylesheet hasn't changed.

## Steps

1. Run a production CSS build:
   ```bash
   NODE_ENV=production npm run build:css
   ```
2. Compare it with the baseline (builds nothing; prints both hashes; exits 1
   on a mismatch or a missing file):
   ```bash
   npm run check:css-baseline
   ```
3. The baseline is one line (64 hex characters) in
   `.claude/css-baseline.sha256`, and nowhere else. The history of earlier
   baselines and why each one moved is in
   [`docs/css-baseline-history.md`](../../docs/css-baseline-history.md).
4. **Identical** → the refactor is visually safe; commit it.
5. **Different** → either you intentionally changed a rule (note it in the
   commit message, update `.claude/css-baseline.sha256` and add a line to
   `docs/css-baseline-history.md`), or you introduced a regression. Run the
   full build and diff `_site/assets/css/styles.css` against the same file
   built from `main` to localize the change.

## Notes

- `NODE_ENV=production` matters — without it, comments and whitespace stay
  in the bundle and the hash will differ even when no rule changed.
- Page-specific CSS under `src/assets/css/pages/` is not part of this hash;
  test those pages by linking them in the browser.
- The CHANGELOG's "Net effect" lines in the CSS-purge entry use this same
  hash to document the safety of the refactor.
