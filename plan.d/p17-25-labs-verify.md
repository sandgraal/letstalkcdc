item: P17-25
action: status

Workflow `.github/workflows/labs-verify.yml` (manual plus weekly) and `scripts/labs-verify.mjs` added; they run the Postgres path of `compose.yaml` and check Connect, the 5 seed rows, the connector, and the snapshot plus UPDATE events read back with kcat. Parsing and decisions are unit-tested (`tests/unit/labs-verify.test.js`). Docker was not available where this was written, so the item stays open until a green `workflow_dispatch` run URL and its log are recorded here; the runner image and Docker versions come from that log.
