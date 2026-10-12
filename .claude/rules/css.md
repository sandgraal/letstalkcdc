---
paths:
  - "src/assets/css/**"
  - "src/css/**"
---

<!-- Applies to: src/assets/css/**, src/css/** -->

# CSS rules

- The shipped stylesheet is built from `src/assets/css/main.css` only. Never
  edit `src/assets/css/styles.min.css` or `_site/assets/css/styles.css`
  (generated).
- Route CSS changes to the `css-refactor` role (`.claude/agents/css-refactor.md`).
  Implementers stop and report when a fix needs CSS.
- No new top-level `XX-*.css`. Fold the rule into an existing layer, add
  `components/<name>.css` and import it from `04-components.css`, or put it
  under `pages/` and `<link>` it from that page's template.
- A `<link>` to a CSS file must be something Eleventy passes through, or
  production 404s. Add the passthrough in `eleventy.config.mjs`.
- Page CSS under `src/assets/css/pages/` is not in the production hash; check
  those pages in a browser.
- `src/css/assistant.css` is the assistant panel's stylesheet; the same
  tokens (`01-variables.css`) apply. Use existing custom properties, do not
  invent undefined ones (`tests/unit/css-custom-properties.test.js` checks).

## Byte-identity workflow

1. Before changing anything: `NODE_ENV=production npm run build:css` then
   `npm run check:css-baseline`. If it already differs, stop and reconcile.
2. Make the change, rebuild with `NODE_ENV=production`, check again.
3. Identical: a pure source refactor, visually safe.
4. Different on purpose: diff `_site/assets/css/styles.css` from a full
   `npm run build`, then update `.claude/css-baseline.sha256` and add a line
   to `docs/css-baseline-history.md` saying what changed.
5. The hash only means something with `NODE_ENV=production`.

`/css-byte-check` runs the same steps.
