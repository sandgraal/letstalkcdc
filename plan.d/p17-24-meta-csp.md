item: P17-24
action: done

Shipped: a meta Content-Security-Policy on every page (lib/csp.mjs, Eleventy transform) with SHA-256 hashes for inline scripts and no script unsafe-inline or unsafe-eval; checked by `tests/unit/csp.test.js`, `tests/e2e/csp.spec.js` (95 tests, zero violations) and `npm run smoke:core`. Open gap: style-src keeps unsafe-inline; see docs/HOSTING.md.
