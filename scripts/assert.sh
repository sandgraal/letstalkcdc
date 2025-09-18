#!/usr/bin/env bash
# Simple assertion helpers for shell tests
# Usage: source this file, then call pass/fail/assert_* functions.

set -euo pipefail

pass(){ printf "✅ %s\n" "$*"; }
fail(){ printf "❌ %s\n" "$*\n"; exit 1; }

# assert that a command exits 0
assert_ok(){
  local msg="${1:-ok}"; shift || true
  "$@" >/dev/null 2>&1 && pass "$msg" || fail "$msg"
}

# assert string equality
assert_eq(){
  local expected="$1"; local got="$2"; local msg="${3:-assert_eq failed}"
  if [[ "$expected" == "$got" ]]; then pass "$msg"; else
    printf "   expected: %s\n   got:      %s\n" "$expected" "$got"
    fail "$msg"
  fi
}

# numeric comparison: a op b (op like >, >=, ==, <, etc.)
assert_cmp(){
  local a="$1" op="$2" b="$3" msg="${4:-assert_cmp failed}"
  awk "BEGIN{ if (!($a $op $b)) exit 1 }" </dev/null \
    && pass "$msg" || { printf "   %s %s %s failed\n" "$a" "$op" "$b"; fail "$msg"; }
}
