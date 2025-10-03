#!/usr/bin/env bash

# Register the sample Debezium Postgres connector with Kafka Connect.
#
# Optional environment variables:
#   CONNECT_HOST     Base URL for Kafka Connect (default: http://localhost:8083)
#   CONNECTOR_NAME   Connector name to register (default: inventory-connector)
#   CONFIG_PATH      Path to the connector config JSON
#                    (default: alongside this script: postgres-inventory.json)

set -euo pipefail

CONNECT_HOST=${CONNECT_HOST:-http://localhost:8083}
CONNECTOR_NAME=${CONNECTOR_NAME:-inventory-connector}
CONFIG_PATH=${CONFIG_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/postgres-inventory.json}

if [ ! -f "${CONFIG_PATH}" ]; then
  echo "Connector config not found: ${CONFIG_PATH}" >&2
  exit 1
fi

echo "Registering ${CONNECTOR_NAME} with ${CONNECT_HOST} using ${CONFIG_PATH}" >&2

response=$(curl -s -X PUT "${CONNECT_HOST}/connectors/${CONNECTOR_NAME}/config" \
  -H 'Content-Type: application/json' \
  -d @"${CONFIG_PATH}")

if command -v jq >/dev/null 2>&1; then
  echo "$response" | jq '.'
else
  echo "$response"
fi

echo "Done." >&2
