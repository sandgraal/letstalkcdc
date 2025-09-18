#!/usr/bin/env bash
# Verifies containers are up and Connect REST is reachable.

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/helpers.sh"

echo "▶ stack sanity checks"

require curl
require jq
require docker
require awk

# Containers up?
assert_ok "zookeeper container up" dc ps --services --status=running | grep -q '^zookeeper$'
assert_ok "broker container up"    dc ps --services --status=running | grep -q '^broker$'
assert_ok "connect container up"   dc ps --services --status=running | grep -q '^connect$'
assert_ok "pg container up"        dc ps --services --status=running | grep -q '^pg$'

# Connect REST reachable?
status_json="$(curl -sf "$CONNECT_URL/connectors" | jq .)"
test -n "$status_json" || fail "connect REST not reachable at $CONNECT_URL"

pass "connect REST reachable ($CONNECT_URL)"
