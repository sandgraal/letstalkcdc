---
description: Run the standard pre-PR verification suite (format + lint + tests + build)
---

# /verify-all

Run the full pre-PR verification in order. Each step must pass before
the next one runs. If you're working on a branch and any step fails,
**stop and fix it** — do not push or open a PR with red checks.

## Steps

```bash
npm run format:check && \
npm run lint && \
npm test && \
npm run build
```

If individual steps fail, fix them in order:

| Step           | If it fails                                                  |
| -------------- | ------------------------------------------------------------ |
| `format:check` | `npm run format` to apply prettier, then re-stage and retry. |
| `lint`         | `npm run lint:fix` for auto-fixable; investigate the rest.   |
| `test`         | Fix the test or the code under test.                         |
| `build`        | Fix the build error; never `_site/`-edit your way around it. |

CI runs the same chain plus `smoke:core`, `smoke:a11y`, and the
Playwright `e2e` jobs. Locally those are slower; run `npm run smoke`
only when you've touched routing / passthroughs / page templates.

## When to also run `/css-byte-check`

If your change touches anything under `src/assets/css/`, also run
[`/css-byte-check`](css-byte-check.md) and include the before/after
hash in your commit message or PR body.
