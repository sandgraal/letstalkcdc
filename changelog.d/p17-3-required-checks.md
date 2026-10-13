type: Changed

**Required status checks on the `default` ruleset (P17-3).** `main` now requires `build`, `lint`, `unit-tests`, `e2e-tests`, `a11y-tests`, `smoke-tests` and `security-audit` (branches need not be up to date); `lychee` and `lighthouse` are not required, and `CLAUDE.md` and the maintainer tasks say so.
