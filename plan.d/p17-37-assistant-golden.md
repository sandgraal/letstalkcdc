item: P17-37
action: done

Shipped: `tests/fixtures/assistant-golden.json` (55 in-scope and 8 out-of-scope questions, 10 of them adversarial, with thesis assertions and a forbidden-claims list), `scripts/assistant-golden.mjs` (offline report of precision@1 and not-answered rate, per intent), and `tests/unit/assistant-golden.test.js` with floors in `tests/fixtures/assistant-golden-baseline.json`. Baseline 53/63 pass, precision@1 45/55; 10 known failures are recorded for follow-up. The questions are written from the lessons because P17-20 had not run (the fixture says so). Proved by `npx vitest run tests/unit/assistant-golden.test.js`.
