#!/usr/bin/env bash
# Validates that the topic has data and that consumed messages parse as JSON with c/u/d ops.

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/helpers.sh"

echo "▶ topic & event checks"

# Topic exists with non-zero latest offset
off="$(latest_offset "$TOPIC" || echo 0)"
assert_cmp "${off:-0}" ">" 0 "topic '$TOPIC' has non-zero latest offset"

# Consume up to 10 messages quickly; ensure at least one parses as JSON
# We run the consumer inside the broker container against localhost:9092.
kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic "$TOPIC" \
  --from-beginning \
  --timeout-ms 4000 \
  --max-messages 10 2>/dev/null | jq -c . >/tmp/_evt.json || true

if [[ -s /tmp/_evt.json ]]; then
  pass "consumed messages parse as JSON"
else
  fail "no messages consumed in window — generate a change and re-run"
fi

# Check at least one op is create/update/delete
op_count="$(jq -r 'select(.op=="c" or .op=="u" or .op=="d") | .op' /tmp/_evt.json | wc -l | tr -d ' ')"
assert_cmp "${op_count:-0}" ">" 0 "contains c/u/d change events"
