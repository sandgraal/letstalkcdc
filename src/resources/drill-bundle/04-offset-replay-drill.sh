#!/usr/bin/env bash
# Drill #4: Offset Wipe & Replay - Snapshot + Stream Behavior
# Duration: ~30 minutes
# Prerequisites: Idempotent sink (UPSERT mode), backup of current state recommended

set -euo pipefail

# Configuration via environment variables
KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-localhost:9092}"
CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
SOURCE_CONNECTOR="${SOURCE_CONNECTOR:-inventory-connector}"
SINK_CONNECTOR="${SINK_CONNECTOR:-jdbc-sink-connector}"
OFFSETS_TOPIC="${OFFSETS_TOPIC:-my_connect_offsets}"
BACKUP_DIR="${BACKUP_DIR:-${TMPDIR:-/tmp}}"

echo "============================================"
echo "Drill #4: Offset Wipe & Replay"
echo "============================================"
echo

# Step 1: Verify idempotent sink
echo "Step 1: Verifying sink connector uses UPSERT mode..."
curl -s "$CONNECT_URL/connectors/$SINK_CONNECTOR/config" | \
  jq -r '.["insert.mode"]' || echo "Warning: Could not fetch insert mode"
echo
read -p "Confirm your sink is configured for UPSERT/idempotent writes (y/n): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Please configure idempotent writes before proceeding."
  exit 1
fi

# Step 2: Backup current state
echo
echo "Step 2: Backing up connector offsets..."
BACKUP_FILE="${BACKUP_DIR}/offsets-backup-$(date +%s).json"
kafka-console-consumer --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic "$OFFSETS_TOPIC" --from-beginning --timeout-ms 5000 > "$BACKUP_FILE" || \
  echo "Warning: Could not backup offsets. Topic may not exist."
echo "Offsets backed up to $BACKUP_FILE"
echo

echo "Step 3: Recording sink row count..."
docker exec -it postgres-sink psql -U sink_user -d warehouse -c \
  "SELECT COUNT(*) FROM public.app_customer;" 2>&1 || \
  echo "Warning: Could not query sink. Container may not exist."
echo

# Step 4: Stop connectors
echo "Step 4: Stopping connectors gracefully..."
echo "Deleting source connector..."
curl -X DELETE "$CONNECT_URL/connectors/$SOURCE_CONNECTOR" 2>/dev/null || \
  echo "Source connector deletion failed or already deleted"
echo
echo "Deleting sink connector..."
curl -X DELETE "$CONNECT_URL/connectors/$SINK_CONNECTOR" 2>/dev/null || \
  echo "Sink connector deletion failed or already deleted"
echo
echo "Waiting 10 seconds for graceful shutdown..."
sleep 10

# Step 5: Wipe offsets
echo
echo "Step 5: Wiping connector offsets..."
echo "Dropping replication slot..."
docker exec -it postgres psql -U start_data_engineer -d inventory -c \
  "SELECT pg_drop_replication_slot('debezium');" 2>&1 || \
  echo "Replication slot may not exist or already dropped"
echo
echo "Note: In production, use offset management APIs. For lab, we're using a new connector name."
echo

# Step 6: Re-register with fresh snapshot
echo "Step 6: Re-registering source connector with snapshot mode..."
echo "Creating new connector 'inventory-connector-v2' with fresh snapshot..."
CONFIG_FILE="${BACKUP_DIR}/source-connector-resnapshot.json"
cat > "$CONFIG_FILE" <<EOF
{
  "name": "inventory-connector-v2",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "snapshot.mode": "initial",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "start_data_engineer",
    "database.password": "password",
    "database.dbname": "inventory",
    "topic.prefix": "server2",
    "table.include.list": "public.app_customer",
    "slot.name": "debezium_v2"
  }
}
EOF

curl -X POST "$CONNECT_URL/connectors" \
  -H "Content-Type: application/json" \
  -d @"$CONFIG_FILE" || \
  echo "Failed to create source connector. Check if Connect is running."
echo

# Step 7: Monitor snapshot
echo "Step 7: Monitoring snapshot phase..."
echo "Watching connector state (Ctrl+C to stop)..."
for i in {1..10}; do
  state=$(curl -s "$CONNECT_URL/connectors/inventory-connector-v2/status" 2>/dev/null | \
    jq -r '.tasks[0].state' 2>/dev/null || echo "UNKNOWN")
  echo "[$i/10] Connector state: $state"
  if [ "$state" = "RUNNING" ]; then
    break
  fi
  sleep 3
done
echo

echo "Step 8: Checking snapshot progress in logs..."
echo "Looking for snapshot completion messages..."
docker logs connect --tail 50 2>&1 | grep -i snapshot | tail -10 || \
  echo "Could not fetch connector logs"
echo

echo "Step 9: Counting messages after snapshot..."
kafka-console-consumer --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic server2.public.app_customer --from-beginning \
  --timeout-ms 10000 2>/dev/null | wc -l || echo "0"
echo

# Step 10: Test streaming mode
echo "Step 10: Testing streaming mode..."
echo "Making a live change..."
docker exec -it postgres psql -U start_data_engineer -d inventory -c \
  "UPDATE public.app_customer SET name = 'Updated After Snapshot' WHERE id = 1;" || \
  echo "Update failed"
echo
echo "Waiting 5 seconds for streaming event..."
sleep 5

echo "Checking for streaming event (look for op:u)..."
kafka-console-consumer --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic server2.public.app_customer \
  --offset latest --partition 0 --timeout-ms 5000 2>/dev/null | tail -5 || \
  echo "No new events"
echo

# Validation
echo "========================================="
echo "Validation Steps:"
echo "========================================="
echo
echo "1. Check sink row count (should match original):"
echo "   docker exec -it postgres-sink psql -U sink_user -d warehouse -c \"SELECT COUNT(*) FROM public.app_customer;\""
echo
echo "2. Check for duplicate primary keys:"
echo "   docker exec -it postgres-sink psql -U sink_user -d warehouse -c \\"
echo "     \"SELECT id, COUNT(*) AS occurrences FROM public.app_customer GROUP BY id HAVING COUNT(*) > 1;\""
echo "   Expected: Zero rows (no duplicates)"
echo
echo "3. Verify latest updates preserved (not overwritten by snapshot):"
echo "   docker exec -it postgres-sink psql -U sink_user -d warehouse -c \\"
echo "     \"SELECT * FROM public.app_customer WHERE name = 'Updated After Snapshot';\""
echo
echo "Validation checklist:"
echo "  [ ] Connector completed snapshot phase"
echo "  [ ] Streaming mode activated after snapshot"
echo "  [ ] Sink has no duplicate primary keys"
echo "  [ ] Latest updates preserved"
echo "  [ ] Offset reset procedure documented"
echo
echo "Drill #4 complete!"
