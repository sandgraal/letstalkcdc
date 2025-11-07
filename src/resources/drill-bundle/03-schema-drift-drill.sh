#!/usr/bin/env bash
# Drill #3: Schema Drift - Incompatible Column Changes
# Duration: ~25 minutes
# Prerequisites: Active CDC pipeline with Debezium source and sink connectors

set -euo pipefail

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
SOURCE_CONNECTOR="${SOURCE_CONNECTOR:-inventory-connector}"

echo "========================================="
echo "Drill #3: Schema Drift Testing"
echo "========================================="
echo

# Step 1: Document current schema
echo "Step 1: Documenting current schema..."
docker exec -it postgres psql -U start_data_engineer -d inventory -c \
  "\d public.app_customer" || echo "Warning: Could not describe table"
echo

echo "Step 2: Baseline a known-good record..."
docker exec -it postgres psql -U start_data_engineer -d inventory -c \
  "SELECT * FROM public.app_customer LIMIT 1;"
echo

# Step 3: Choose scenario
echo "Step 3: Choose a schema change scenario:"
echo "  Breaking Changes:"
echo "    [1] Drop a column with active data"
echo "    [2] Change column type (incompatible)"
echo "    [3] Add NOT NULL constraint"
echo
echo "  Compatible Changes:"
echo "    [4] Add nullable column (forward-compatible)"
echo "    [5] Increase column width"
echo
read -p "Enter choice (1-5): " choice

case $choice in
  1)
    echo "Executing: Drop email column..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "ALTER TABLE public.app_customer DROP COLUMN email;" || \
      echo "Failed to drop column. It may not exist."
    echo "Impact: Sink may fail if it expects email column; Debezium emits event without field"
    ;;
  2)
    echo "Executing: Change id type from integer to text..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "ALTER TABLE public.app_customer ALTER COLUMN id TYPE TEXT USING id::TEXT;" || \
      echo "Failed to change column type."
    echo "Impact: Type mismatch may cause sink errors if target schema is strict"
    ;;
  3)
    echo "Executing: Add phone column with NOT NULL constraint..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "ALTER TABLE public.app_customer ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '';" || \
      echo "Failed to add column."
    echo "Impact: Existing rows get default; new inserts must provide value"
    ;;
  4)
    echo "Executing: Add loyalty_points column (nullable)..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "ALTER TABLE public.app_customer ADD COLUMN loyalty_points INTEGER DEFAULT 0;" || \
      echo "Failed to add column."
    echo "Impact: ✓ Safe - Sink ignores unknown columns or auto-adds if using schema sync"
    ;;
  5)
    echo "Executing: Increase name column width..."
    docker exec -it postgres psql -U start_data_engineer -d inventory -c \
      "ALTER TABLE public.app_customer ALTER COLUMN name TYPE VARCHAR(500);" || \
      echo "Failed to increase column width."
    echo "Impact: ✓ Safe - Widening columns rarely breaks downstream systems"
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac
echo

# Step 4: Observe behavior
echo "Step 4: Observing connector behavior..."
echo "Checking source connector status..."
curl -s "$CONNECT_URL/connectors/$SOURCE_CONNECTOR/status" | \
  jq '{name: .name, state: .connector.state, tasks: [.tasks[].state]}' || \
  echo "Could not fetch connector status"
echo

echo "Step 5: Test with a new change..."
docker exec -it postgres psql -U start_data_engineer -d inventory -c \
  "INSERT INTO public.app_customer (name) VALUES ('Schema Drift Test') RETURNING *;" 2>&1 || \
  echo "Insert may have failed due to schema constraints"
echo

# Recovery patterns
echo "========================================="
echo "Recovery Patterns:"
echo "========================================="
echo
echo "When Schema Drift Breaks the Pipeline:"
echo "  1. Stop ingestion - Pause connector"
echo "  2. Assess impact - Check affected messages"
echo "  3. Choose strategy:"
echo "     - Rollback: Revert schema change if caught early"
echo "     - Forward fix: Align sink schema, restart connector"
echo "     - Transform: Add SMT to handle migration"
echo "  4. Validate: Confirm historical data integrity"
echo
echo "To pause the connector:"
echo "  curl -X PUT $CONNECT_URL/connectors/$SOURCE_CONNECTOR/pause"
echo
echo "To resume:"
echo "  curl -X PUT $CONNECT_URL/connectors/$SOURCE_CONNECTOR/resume"
echo
echo "Validation checklist:"
echo "  [ ] Documented which changes are safe vs. breaking"
echo "  [ ] Tested sink resilience to unknown fields"
echo "  [ ] Verified DLQ captures schema mismatches"
echo "  [ ] Confirmed schema registry versioning (if using)"
echo "  [ ] Created runbook for schema change approval process"
echo
echo "Drill #3 complete!"
