item: P17-52
action: done

Done 2026-10-13. The exactly-once scope words (hop, processing, transactions, opt-in and the rest) now excuse a claim only in its own clause and within eight words of it (`eosScoped` in `lib/thesis-lint.mjs`); 7 old false negatives fail in `tests/unit/thesis-lint.test.js`, each scope word has a mutation proof, and `npm run lint:thesis` is ok with 4 new hop-scoped allowlist entries (8 in all; no scope phrases were added to the lint, so "for sink connectors across the whole pipeline", "with respect to the end-to-end pipeline" and "exactly-once in its observable effect" fail). R3 is not implemented; the lint header records why.
