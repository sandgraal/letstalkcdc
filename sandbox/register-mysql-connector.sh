#!/bin/bash
# Register MySQL Debezium connector
# This script waits for Kafka Connect to be ready, then registers the connector

set -e

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
CONNECTOR_CONFIG="${1:-sandbox/connectors/mysql-connector.json}"

echo "Waiting for Kafka Connect to be ready at ${CONNECT_URL}..."
for i in {1..30}; do
  if curl -s -f "${CONNECT_URL}/" > /dev/null 2>&1; then
    echo "Kafka Connect is ready!"
    break
  fi
  echo "Attempt $i/30: Kafka Connect not ready yet, waiting 5 seconds..."
  sleep 5
done

if ! curl -s -f "${CONNECT_URL}/" > /dev/null 2>&1; then
  echo "ERROR: Kafka Connect failed to become ready after 150 seconds"
  exit 1
fi

echo "Registering MySQL connector from ${CONNECTOR_CONFIG}..."
curl -i -X POST \
  -H "Accept:application/json" \
  -H "Content-Type:application/json" \
  "${CONNECT_URL}/connectors/" \
  -d @"${CONNECTOR_CONFIG}"

echo ""
echo "Connector registered successfully!"
echo "Check connector status with:"
echo "  curl ${CONNECT_URL}/connectors/mysql-inventory-connector/status"
