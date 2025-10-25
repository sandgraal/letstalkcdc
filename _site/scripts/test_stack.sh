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

PROJECT_NAME=${COMPOSE_PROJECT_NAME:-$(basename "${ROOT_DIR}")}
CONNECT_URL=${CONNECT_URL:-http://localhost:8083}
SERVICES=(zookeeper kafka connect pg)

log_info "Checking containers for project '${PROJECT_NAME}'"

for service in "${SERVICES[@]}"; do
  container_id=$(docker ps \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=${service}" \
    --format '{{.ID}}' | head -n 1)

  if [ -z "${container_id}" ]; then
    fail "Service '${service}' is not running (container not found)"
  fi

  state=$(docker inspect -f '{{.State.Status}}' "${container_id}")
  if [ "${state}" != "running" ]; then
    fail "Service '${service}' is not running (state=${state})"
  fi

  log_pass "${service} container is running"
done

log_info "Pinging Kafka Connect at ${CONNECT_URL}"

if ! curl -sS --fail -o /dev/null "${CONNECT_URL}/connectors"; then
  fail "Kafka Connect REST API is not reachable at ${CONNECT_URL}"
fi

log_pass "Kafka Connect REST API responded ('${CONNECT_URL}/connectors')"

log_info "Stack looks healthy"
