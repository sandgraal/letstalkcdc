type: Fixed

**`labs-verify` read-back (P17-25).** The first run (38451400038) failed to see any change event although kcat was reading the right topic, `dbserver1.public.products`: the `debezium/connect` image ignores the compose `KEY_CONVERTER_SCHEMAS_ENABLE` and `VALUE_CONVERTER_SCHEMAS_ENABLE` variables, so events arrive wrapped as `{schema, payload}` and the check looked for a flat envelope. The check now accepts both shapes, and a failed run writes `topics.log` (`kcat -L`) next to the other logs. `sandbox/README.md` now says PostgreSQL 16, the version the run logged (16.6).
