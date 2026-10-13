type: Docs

**Closed four ledger entries that now have a mechanism (P17-62).**
`docs/LESSONS.md` gains L-018 to L-021, closing L-002, L-004, L-006 and L-001.
New tests back two of them: `tests/unit/hermetic-git.test.js` fails a
commit-making test that skips the hermetic git environment, and
`tests/unit/doc-facts.test.js` fails on time-relative wording such as "not on
main yet" in tracked Markdown.
