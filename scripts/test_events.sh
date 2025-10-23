#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT_DIR}"

log_info() {
  printf 'ℹ️  %s\n' "$1"
}

log_pass() {
  printf '✅ %s\n' "$1"
}

fail() {
  printf '❌ %s\n' "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command '$1' is not available"
  fi
}

require_command docker
require_command python3

if [ -n "${COMPOSE_CMD:-}" ]; then
  # shellcheck disable=SC2206
  COMPOSE=(${COMPOSE_CMD})
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
elif docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  fail "Neither 'docker compose' nor 'docker-compose' is available"
fi

TOPIC=${TOPIC:-server1.public.app_customer}
MESSAGE_LIMIT=${MESSAGE_LIMIT:-10}
KAFKA_BROKER_INTERNAL=${KAFKA_BROKER_INTERNAL:-kafka:9092}

log_info "Consuming up to ${MESSAGE_LIMIT} message(s) from topic '${TOPIC}'"

set +e
consumer_output=$("${COMPOSE[@]}" exec -T kcat \
  kcat -b "${KAFKA_BROKER_INTERNAL}" -t "${TOPIC}" -C -o beginning -e -q -c "${MESSAGE_LIMIT}")
exit_code=$?
set -e

if [ ${exit_code} -ne 0 ]; then
  fail "Failed to consume messages from topic '${TOPIC}' (exit code ${exit_code})"
fi

parsed=$(
  MESSAGES_RAW="${consumer_output}" python3 - <<'PY'
import json
import os
import sys

raw = os.environ.get("MESSAGES_RAW", "")
lines = [line.strip() for line in raw.splitlines() if line.strip()]
if not lines:
    print("No messages consumed", file=sys.stderr)
    sys.exit(1)

allowed_ops = {"c", "u", "d"}
valid_ops = set()
other_ops = set()
for line in lines:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError as exc:
        print(f"Message is not valid JSON: {exc}\n{line}", file=sys.stderr)
        sys.exit(1)

    op = None
    if isinstance(payload, dict):
        if isinstance(payload.get("op"), str):
            op = payload["op"].lower()
        elif isinstance(payload.get("payload"), dict) and isinstance(payload["payload"].get("op"), str):
            op = payload["payload"]["op"].lower()

    if op is None:
        other_ops.add("missing")
        continue

    if op in allowed_ops:
        valid_ops.add(op)
    else:
        other_ops.add(op)

if not valid_ops:
    detail = ", ".join(sorted(other_ops)) if other_ops else "none"
    print(f"No change events with op in {sorted(allowed_ops)} (saw: {detail})", file=sys.stderr)
    sys.exit(1)

print(", ".join(sorted(valid_ops)))
PY
) || fail "Consumed messages did not include valid change events"

log_pass "Found change events with operations: ${parsed}"
