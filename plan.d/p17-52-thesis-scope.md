item: P17-52
action: done

Done 2026-10-13. The exactly-once scope words (hop, processing, transactions, opt-in and the rest) now excuse a claim only in its own clause and within eight words of it (`eosScoped` in `lib/thesis-lint.mjs`); 7 old false negatives fail in `tests/unit/thesis-lint.test.js`, each scope word has a mutation proof, and `npm run lint:thesis` is ok with the allowlist unchanged (4 entries). R3 is not implemented; the lint header records why.
