#!/usr/bin/env bash
set -euo pipefail
CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
NAME=$(jq -r '.name' < "${1:-connectors/postgres-inventory.json}")
echo "Registering connector: $NAME -> $CONNECT_URL/connectors"
curl -s -X PUT -H 'Content-Type: application/json'   --data @"${1:-connectors/postgres-inventory.json}"   "$CONNECT_URL/connectors/$NAME/config" | jq .
curl -s "$CONNECT_URL/connectors/$NAME/status" | jq .
