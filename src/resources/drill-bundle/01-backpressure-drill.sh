#!/usr/bin/env bash
# Drill #1: Backpressure Simulation - Sink Shutdown
# Duration: ~15 minutes
# Prerequisites: Running CDC lab setup with Postgres, Kafka, Connect, and Debezium connector

set -euo pipefail

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-localhost:29092}"
CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
SINK_CONNECTOR="${SINK_CONNECTOR:-jdbc-sink-connector}"
CONSUMER_GROUP="${CONSUMER_GROUP:-sink-group-inventory}"

echo "==================================="
echo "Drill #1: Backpressure Simulation"
echo "==================================="
echo

# Step 1: Baseline metrics
echo "Step 1: Recording baseline consumer lag..."
kafka-consumer-groups --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --describe --group "$CONSUMER_GROUP" || echo "Warning: Consumer group may not exist yet"
echo

# Step 2: Stop or pause the sink connector
echo "Step 2: Pausing sink connector '$SINK_CONNECTOR'..."
curl -X PUT "$CONNECT_URL/connectors/$SINK_CONNECTOR/pause" || {
  echo "Warning: Could not pause connector. It may not exist."
  echo "Attempting to delete instead..."
  curl -X DELETE "$CONNECT_URL/connectors/$SINK_CONNECTOR" || echo "Failed to delete connector"
}
echo
echo "Sink connector paused/stopped. Waiting 5 seconds..."
sleep 5

# Step 3: Generate source changes
echo "Step 3: Generating source database changes..."
docker exec -it postgres psql -U start_data_engineer -d inventory -c \
  "INSERT INTO public.app_customer (name, email) VALUES ('Backpressure Test User', 'backpressure@test.com');" || \
  echo "Warning: Failed to insert test data. Check if postgres container is running."
echo

# Step 4: Monitor lag
echo "Step 4: Monitoring consumer lag (press Ctrl+C to stop)..."
echo "Run this command in another terminal to watch lag in real-time:"
echo "  watch -n 5 \"kafka-consumer-groups --bootstrap-server $KAFKA_BOOTSTRAP --describe --group $CONSUMER_GROUP | grep -v 'Consumer group'\""
echo
echo "Observing lag for 30 seconds..."
for i in {1..6}; do
  echo "--- Sample $i/6 ---"
  kafka-consumer-groups --bootstrap-server "$KAFKA_BOOTSTRAP" \
    --describe --group "$CONSUMER_GROUP" | grep -v 'Consumer group' || true
  if [ $i -lt 6 ]; then
    sleep 5
  fi
done
echo

# Recovery instructions
echo "========================================="
echo "Recovery Steps:"
echo "========================================="
echo "To resume the sink connector, run:"
echo "  curl -X PUT $CONNECT_URL/connectors/$SINK_CONNECTOR/resume"
echo
echo "Or to recreate it, use:"
echo "  curl -X POST $CONNECT_URL/connectors -H 'Content-Type: application/json' -d @sink-config.json"
echo
echo "After recovery, verify:"
echo "  1. Lag returns to zero"
echo "  2. All accumulated changes are applied"
echo "  3. No duplicate rows in sink"
echo "  4. Monitoring alerts fired appropriately"
echo
echo "Drill #1 monitoring phase complete!"
