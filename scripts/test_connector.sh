#!/usr/bin/env bash
# Checks that the connector exists and is RUNNING, with at least one RUNNING task.

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/helpers.sh"

echo "▶ connector checks"

# Connector present
list="$(curl -sf "$CONNECT_URL/connectors" | jq -r '.[]')"
echo "$list" | grep -qx "$CONNECTOR_NAME" || fail "connector '$CONNECTOR_NAME' not found on connect"

pass "connector '$CONNECTOR_NAME' is registered"

# Connector state
state="$(curl -sf "$CONNECT_URL/connectors/$CONNECTOR_NAME/status" | jq -r '.connector.state')"
assert_eq "RUNNING" "$state" "connector state is RUNNING"

# At least one task RUNNING
task_state="$(curl -sf "$CONNECT_URL/connectors/$CONNECTOR_NAME/status" | jq -r '.tasks[].state' | head -1)"
assert_eq "RUNNING" "$task_state" "one task is RUNNING"
