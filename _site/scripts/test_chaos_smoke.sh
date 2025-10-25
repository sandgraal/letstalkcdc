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
require_command curl
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

CONNECT_URL=${CONNECT_URL:-http://localhost:8083}
CONNECTOR_NAME=${CONNECTOR_NAME:-inventory-connector}
TOPIC=${TOPIC:-server1.public.app_customer}
WAIT_TIMEOUT=${WAIT_TIMEOUT:-60}
POST_RESTART_WAIT=${POST_RESTART_WAIT:-10}

get_offset_sum() {
  "${COMPOSE[@]}" exec -T kafka \
    kafka-run-class kafka.tools.GetOffsetShell \
    --broker-list localhost:9092 \
    --topic "${TOPIC}" \
    --time -1 2>/dev/null | python3 - <<'PY'
import sys

total = 0
for line in sys.stdin:
    text = line.strip()
    if not text or text.startswith("SLF4J") or text.startswith("log4j"):
        continue
    try:
        offset = int(text.split(":")[-1])
    except ValueError:
        continue
    if offset >= 0:
        total += offset
print(total)
PY
}

connector_is_healthy() {
  local status_json
  status_json=$(curl -sS "${CONNECT_URL}/connectors/${CONNECTOR_NAME}/status" 2>/dev/null || true)
  if [ -z "${status_json}" ]; then
    return 1
  fi
  STATUS_JSON="${status_json}" python3 - <<'PY'
import json
import os
import sys

data = json.loads(os.environ["STATUS_JSON"])
connector = (data.get("connector") or {}).get("state")
tasks = data.get("tasks") or []
if connector != "RUNNING":
    sys.exit(1)
if any(task.get("state") != "RUNNING" for task in tasks):
    sys.exit(1)
sys.exit(0)
PY
}

wait_for_connector() {
  local start
  start=$(date +%s)
  while true; do
    if connector_is_healthy; then
      return 0
    fi
    if [ $(( $(date +%s) - start )) -ge ${WAIT_TIMEOUT} ]; then
      fail "Timed out waiting for connector '${CONNECTOR_NAME}' to become RUNNING"
    fi
    sleep 2
  done
}

log_info "Fetching initial offsets for topic '${TOPIC}'"
initial_offset=$(get_offset_sum)
log_info "Current offset sum: ${initial_offset}"

log_info "Requesting restart for connector '${CONNECTOR_NAME}'"
restart_code=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "${CONNECT_URL}/connectors/${CONNECTOR_NAME}/restart?includeTasks=true&onlyFailed=false")

if [[ "${restart_code}" != "200" && "${restart_code}" != "202" && "${restart_code}" != "204" ]]; then
  fail "Connector restart request failed with status ${restart_code}"
fi

log_info "Waiting for connector to return to RUNNING"
wait_for_connector

log_info "Sleeping ${POST_RESTART_WAIT}s to allow new events"
sleep "${POST_RESTART_WAIT}"

log_info "Fetching offsets after restart"
final_offset=$(get_offset_sum)
log_info "Offset sum after restart: ${final_offset}"

if [ "${final_offset}" -le "${initial_offset}" ]; then
  fail "Offsets did not advance (before=${initial_offset}, after=${final_offset})"
fi

log_pass "Offsets advanced from ${initial_offset} to ${final_offset} after restart"
