type: Changed

**The thesis lint no longer accepts a loose scope word as per-hop scoping (P17-52).**
A word such as `hop`, `processing` or `transactions` now excuses an
exactly-once claim only when it sits in the claim's own clause and within
eight words of it, so "Transactions are fine, but the pipeline is
exactly-once" fails the lint. Four real lines that state a per-hop claim in context are allowlisted
in `lib/thesis-lint.allow.json` instead of loosening the scope words. The lint header records why rule R3 is not implemented.
