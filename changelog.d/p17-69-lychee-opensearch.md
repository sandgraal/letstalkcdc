type: Fixed

**Link check no longer fails on docs.opensearch.org (P17-69).** From CI runners
`docs.opensearch.org/latest/` pages redirect in a loop ("Too many redirects"
via `/latest/404.html`) although both URLs linked from `src/non-kafka-cdc/`
return 200 from a normal client (verified 2026-10-13). `linkcheck.yml` now
passes lychee `--exclude '^https://docs\.opensearch\.org/latest/'`, narrower
than excluding the host.
