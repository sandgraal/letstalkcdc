#!/usr/bin/env bash
# Common helpers + defaults used by the test scripts.

set -euo pipefail

# Defaults (override with env vars if needed)
: "${CONNECT_URL:=http://localhost:8083}"
: "${CONNECTOR_NAME:=inventory-connector}"
: "${BROKER_SERVICE:=broker}"
: "${TOPIC:=server1.public.app_customer}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./assert.sh
. "$here/assert.sh"

dc(){ docker compose "$@"; }

require(){
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

# Run a Kafka CLI inside the broker container
kafka(){
  dc exec -T "$BROKER_SERVICE" "$@"
}

# Sum of latest offsets across partitions for a topic
latest_offset(){
  local topic="${1:?topic required}"
  local out
  # Use localhost inside the broker container for reliability
  out="$(kafka kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic "$topic" --time -1 2>/dev/null || true)"
  # Format: topic:partition:offset per line → sum offsets
  awk -F: '{sum+=$3} END{print sum+0}' <<<"$out"
}

# Wait until a command succeeds (returns 0), or timeout in N seconds
wait_until(){
  local seconds="${1:?timeout seconds}"; shift
  local desc="${1:?desc}"; shift
  local start now
  start="$(date +%s)"
  while true; do
    if "$@"; then pass "ready: $desc"; return 0; fi
    now="$(date +%s)"
    if (( now - start >= seconds )); then fail "timeout: $desc"; fi
    sleep 1
  done
}
