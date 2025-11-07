#!/usr/bin/env bash
# Drill #2: Dead Letter Queue - Serialization Errors
# Duration: ~20 minutes
# Prerequisites: Sink connector configured with DLQ settings

set -euo pipefail

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-localhost:29092}"
DLQ_TOPIC="${DLQ_TOPIC:-dlq.sink.inventory}"
CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
SINK_CONNECTOR="${SINK_CONNECTOR:-jdbc-sink-connector}"

echo "======================================"
echo "Drill #2: Dead Letter Queue Testing"
echo "======================================"
echo

# Check if DLQ is configured
echo "Checking sink connector DLQ configuration..."
curl -s "$CONNECT_URL/connectors/$SINK_CONNECTOR/config" | \
  jq -r '.["errors.deadletterqueue.topic.name"]' || echo "Warning: Could not fetch connector config"
echo

# Step 1: Setup DLQ monitoring
echo "Step 1: Setting up DLQ consumer (run this in a separate terminal)..."
echo "Command:"
echo "  kafka-console-consumer --bootstrap-server $KAFKA_BOOTSTRAP \\"
echo "    --topic $DLQ_TOPIC --from-beginning \\"
echo "    --property print.headers=true \\"
echo "    --property print.timestamp=true"
echo
read -p "Press Enter when DLQ consumer is ready in another terminal..."

# Step 2: Trigger error scenarios
echo
echo "Step 2: Choose an error scenario to trigger:"
echo "  [1] Inject incompatible data type"
echo "  [2] Create missing target table scenario"
echo "  [3] Insert oversized payload"
read -p "Enter choice (1-3): " choice

case $choice in
  1)
    echo "Triggering scenario 1: Incompatible data type..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "INSERT INTO public.problematic_table (id, age) VALUES (999, 'not-a-number');" || \
      echo "Note: This may fail if the table doesn't exist. The error will appear in DLQ."
    ;;
  2)
    echo "Triggering scenario 2: Missing target table..."
    echo "Renaming target table in sink database..."
    docker exec -it postgres-sink psql -U sink_user -d warehouse -c \
      "ALTER TABLE public.app_customer RENAME TO app_customer_backup;" || \
      echo "Warning: Failed to rename table. Check if postgres-sink container exists."
    echo "Now inserting data that will fail..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "INSERT INTO public.app_customer (name, email) VALUES ('DLQ Test', 'dlq@test.com');"
    ;;
  3)
    echo "Triggering scenario 3: Oversized payload..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "INSERT INTO public.app_customer (name, email) VALUES (repeat('X', 5000), 'large@example.com');" || \
      echo "Note: This will send to DLQ if sink column has VARCHAR limit."
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac
echo

# Step 3: Observe and triage
echo "Step 3: Checking connector status..."
curl -s "$CONNECT_URL/connectors/$SINK_CONNECTOR/status" | jq '.tasks[].trace' || \
  echo "No errors in connector task trace (messages may be in DLQ)"
echo

echo "Step 4: Inspecting DLQ messages..."
echo "Fetching first 5 messages from DLQ topic..."
kafka-console-consumer --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic "$DLQ_TOPIC" --from-beginning \
  --property print.headers=true \
  --max-messages 5 --timeout-ms 10000 || \
  echo "No messages in DLQ yet, or topic doesn't exist."
echo

# Recovery guidance
echo "========================================="
echo "Recovery Options:"
echo "========================================="
echo
echo "Option A: Fix and Replay"
echo "  1. Fix the root cause (restore table, fix schema)"
echo "  2. Re-drive DLQ messages to original topic"
echo "  3. Let connector reprocess"
echo
echo "Option B: Transform and Retry"
echo "  1. Write script to transform bad records"
echo "  2. Publish corrected versions"
echo "  3. Archive original DLQ messages"
echo
echo "If you renamed the table, restore it with:"
echo "  docker exec -it postgres-sink psql -U sink_user -d warehouse -c \\"
echo "    \"ALTER TABLE public.app_customer_backup RENAME TO app_customer;\""
echo
echo "Validation checklist:"
echo "  [ ] DLQ captured poison pill messages"
echo "  [ ] Connector remained running (didn't crash-loop)"
echo "  [ ] Error headers contain actionable diagnostics"
echo "  [ ] Good messages continued processing normally"
echo "  [ ] DLQ alerts fired when messages arrived"
echo
echo "Drill #2 complete!"
