#!/usr/bin/env bash
# Optional smoke test: ensures offsets advance across a connector restart (assumes source churn).

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/helpers.sh"

echo "▶ chaos smoke: offsets advance across restart"

pre="$(latest_offset "$TOPIC")"
echo "   latest offset before: $pre"

# Bounce connector task
curl -sf -XPOST "$CONNECT_URL/connectors/$CONNECTOR_NAME/restart" >/dev/null || true

# Wait briefly and expect offsets to increase
sleep 5
post="$(latest_offset "$TOPIC")"
echo "   latest offset after:  $post"

assert_cmp "${post:-0}" ">" "${pre:-0}" "offsets advanced after restart"
