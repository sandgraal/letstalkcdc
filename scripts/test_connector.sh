#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${ROOT_DIR}"

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

require_command curl
require_command python3

CONNECT_URL=${CONNECT_URL:-http://localhost:8083}
CONNECTOR_NAME=${CONNECTOR_NAME:-inventory-connector}

status_json=$(curl -sS --fail "${CONNECT_URL}/connectors/${CONNECTOR_NAME}/status" \
  || fail "Failed to fetch status for connector '${CONNECTOR_NAME}' from ${CONNECT_URL}")

task_count=$(
  STATUS_JSON="${status_json}" python3 - "${CONNECTOR_NAME}" <<'PY'
import json
import os
import sys

name = sys.argv[1]
try:
    data = json.loads(os.environ["STATUS_JSON"])
except Exception as exc:  # pragma: no cover - defensive
    print(f"Unable to parse connector status JSON: {exc}", file=sys.stderr)
    sys.exit(1)

connector_state = (data.get("connector") or {}).get("state")
tasks = data.get("tasks") or []
if connector_state != "RUNNING":
    print(f"Connector {name} is {connector_state!r}", file=sys.stderr)
    sys.exit(1)

not_running = [t for t in tasks if t.get("state") != "RUNNING"]
if not_running:
    details = ", ".join(
        f"id={t.get('id')} state={t.get('state')!r}" for t in not_running
    )
    print(f"Connector {name} has non-running tasks: {details}", file=sys.stderr)
    sys.exit(1)

print(len(tasks))
PY
) || fail "Connector '${CONNECTOR_NAME}' is not healthy"

log_pass "Connector '${CONNECTOR_NAME}' is RUNNING with ${task_count} task(s)"
