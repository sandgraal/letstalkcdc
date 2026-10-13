type: Fixed

**CI keeps `_site/.well-known` between jobs (P17-64, L-015).** The `build` job's
`actions/upload-artifact` step now sets `include-hidden-files: true`, so the
smoke job sees `/.well-known/security.txt` again. The temporary CI skip in
`scripts/smoke.mjs` and `lib/smoke-security-txt.mjs` is removed: a missing
file fails the smoke check everywhere.
