#!/usr/bin/env bash
set -euo pipefail

CURRENT_STEP=""

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

on_error() {
  local exit_code=$?
  if [[ -n "${CURRENT_STEP:-}" ]]; then
    echo "ERROR: ${CURRENT_STEP} failed with exit code ${exit_code}." >&2
  else
    echo "ERROR: lab stack verification failed with exit code ${exit_code}." >&2
  fi
  exit "${exit_code}"
}

trap 'on_error' ERR

ensure_command() {
  local cmd=$1
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: Required command '$cmd' not found in PATH." >&2
    exit 127
  fi
}

ensure_command docker
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: 'docker compose' command not available. Ensure Docker Compose v2 is installed." >&2
  exit 127
fi
ensure_command kafka-topics
ensure_command curl
ensure_command jq

CURRENT_STEP="Checking Docker Compose"
log "${CURRENT_STEP}..."
docker compose ps

CURRENT_STEP="Checking Kafka bootstrap from host (localhost:9092)"
log "${CURRENT_STEP}..."
kafka-topics --bootstrap-server localhost:9092 --list >/dev/null

CURRENT_STEP="Checking Connect API"
log "${CURRENT_STEP}..."
curl -sf http://localhost:8083/connectors | jq 'type=="array"' >/dev/null

trap - ERR
log "OK: lab stack is up"
