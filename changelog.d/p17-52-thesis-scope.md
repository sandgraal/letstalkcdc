type: Changed

**The thesis lint no longer accepts a loose scope word as per-hop scoping (P17-52).**
A word such as `hop`, `processing` or `transactions` now excuses an
exactly-once claim only when it sits in the claim's own clause and within
eight words of it, so "Transactions are fine, but the pipeline is
exactly-once" fails the lint. Three scope phrases were added for wording the
lessons already use: `observable effect`, `with respect to` and `for source
connectors`. The lint header records why rule R3 is not implemented.
