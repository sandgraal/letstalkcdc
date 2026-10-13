item: P17-26
action: done

Shipped: optional `reviewedBy` + `reviewedOn` drive a "Technically reviewed by NAME on DATE" line and JSON-LD `reviewedBy`, only when both are set; the byline date now reads "Last updated". No page sets either field. Proved by `tests/unit/review-provenance.test.js`, `npm run verify-all` and `npm run smoke:core`.
