type: Added

**`labs-verify` workflow (P17-25).** A manual and weekly GitHub Actions workflow now starts the Postgres path of the `compose.yaml` sandbox on a hosted runner and fails if Kafka Connect does not answer, the five seed products are missing, the documented connector does not reach RUNNING, or the snapshot and UPDATE change events do not show up in Kafka. The logic is in `scripts/labs-verify.mjs`. It is not a required check; the MySQL path and the cloud labs are not covered.
