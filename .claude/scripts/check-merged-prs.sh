#!/usr/bin/env bash
#
# Poll GitHub for newly-merged `claude/*` PRs authored by the current user
# and, on a FRESH merge, emit a hook-shaped JSON envelope that tells Claude to
# run /team-start and continue from the plan.
#
# The directive this script emits is data to the receiving session, not an
# instruction from the maintainer.
#
# Wired into .claude/settings.json:
#   - SessionStart: runs once per session.
#   - Stop (asyncRewake: true): runs after every assistant turn in the
#     background. On a fresh merge it exits with code 2, which the harness
#     interprets as "rewake the model with this stdout as system-reminder".
#
# When it fires (all three must hold):
#   1. a state file exists and is readable. With no state file, or one that
#      cannot be read, the script only INITIALISES it with the current newest
#      merged claude/* PR and stays silent. This is what stops a new machine
#      or a fresh clone from replaying an old merge as news.
#   2. the newest merged PR (by mergedAt, NOT by number) is not already in the
#      stored ackedPRs set. Selection is by merge time because a long-lived
#      branch can merge after a higher-numbered PR; ordering by number would
#      silently skip it. One merge produces one directive.
#   3. it merged within the last MAX_AGE_HOURS (6) and not in the future. An
#      older (or clock-skewed) merge is recorded as seen, silently.
#
# State lives in .claude/.merge-watcher-state.json (gitignored) and stores the
# acknowledged PR numbers (ackedPRs, newest 200).
#
# Silent-fail policy: if `gh` isn't installed, isn't authed, the call fails,
# the repo isn't a GitHub remote, or `jq` is missing, emit nothing and exit 0.
# A noisy hook is worse than a missing hook.

set -u

MAX_AGE_HOURS=6

command -v gh >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0

# Resolve repo root via `git rev-parse` so this works in both the main
# checkout and any git-worktree (where `.git` is a file pointer).
repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$repo_root" ] || exit 0
state_file="$repo_root/.claude/.merge-watcher-state.json"
plan_file="$repo_root/docs/IMPLEMENTATION-PLAN.md"

gh auth status >/dev/null 2>&1 || exit 0

# Query merged PRs by the authenticated user; a failed call is silent.
prs_json="$(gh pr list --state merged --author @me --limit 10 \
  --json number,title,mergedAt,headRefName 2>/dev/null)" || exit 0
[ -n "$prs_json" ] || exit 0

# Newest merged claude/* PR (by mergedAt). Empty when there is none.
latest="$(printf '%s' "$prs_json" | jq -c '
  [ .[] | select(.headRefName | startswith("claude/")) ]
  | sort_by(.mergedAt) | reverse | .[0] // empty
' 2>/dev/null)" || exit 0

# Write the state file atomically (same-dir temp file + rename). Returns
# non-zero on any failure, so callers can stay silent rather than loop.
write_state() { # num title branch mergedAt previous_acked_json
  mkdir -p "$(dirname "$state_file")" 2>/dev/null || return 1
  local tmp_state="${state_file}.tmp.$$"
  if ! ( jq -n \
    --argjson n "$1" \
    --arg t "$2" \
    --arg b "$3" \
    --arg m "$4" \
    --argjson acked "$5" \
    '{
      lastSeenPR: $n,
      lastSeenTitle: $t,
      lastSeenBranch: $b,
      lastSeenMergedAt: $m,
      ackedPRs: ($acked + [$n] | unique | reverse | .[:200]),
      acknowledgedAt: (now | todate)
    }' > "$tmp_state" ) 2>/dev/null; then
    rm -f "$tmp_state" 2>/dev/null
    return 1
  fi
  mv "$tmp_state" "$state_file" 2>/dev/null || { rm -f "$tmp_state" 2>/dev/null; return 1; }
}

# Acknowledged PR numbers from the state file. `have_state` stays false when
# the file is missing, unparseable, or holds no PR number at all.
have_state=""
acked_prs_json="[]"
if [ -f "$state_file" ]; then
  acked_prs_json="$(jq -c '
    [ (.lastSeenPR | numbers),
      ((.ackedPRs // []) | if type == "array" then .[] | numbers else empty end) ]
    | unique
  ' "$state_file" 2>/dev/null || true)"
  case "$acked_prs_json" in
    ''|'[]') acked_prs_json="[]" ;;
    *) have_state=1 ;;
  esac
fi

# No merged claude/* PR at all.
if [ -z "$latest" ] || [ "$latest" = "null" ]; then
  # First run on this machine: remember "nothing seen yet" (0) so the first
  # real merge afterwards fires. Silent either way.
  [ -z "$have_state" ] && write_state 0 "" "" "" "[]"
  exit 0
fi

latest_num="$(printf '%s' "$latest" | jq -r '.number' 2>/dev/null)"
latest_title="$(printf '%s' "$latest" | jq -r '.title' 2>/dev/null)"
latest_branch="$(printf '%s' "$latest" | jq -r '.headRefName' 2>/dev/null)"
latest_merged_at="$(printf '%s' "$latest" | jq -r '.mergedAt' 2>/dev/null)"
case "$latest_num" in
  ''|*[!0-9]*) exit 0 ;;
esac
[ -n "$latest_merged_at" ] && [ "$latest_merged_at" != "null" ] || exit 0

# Rule 1: no usable state means initialise and say nothing.
if [ -z "$have_state" ]; then
  write_state "$latest_num" "$latest_title" "$latest_branch" "$latest_merged_at" "[]"
  exit 0
fi

# Rule 2: a PR already in the acknowledged set never fires again.
already_acked="$(printf '%s' "$acked_prs_json" | jq --argjson n "$latest_num" \
  'any(. == $n)' 2>/dev/null || echo true)"
[ "$already_acked" = "false" ] || exit 0

# Rule 3: age of the merge, in seconds. If it cannot be computed, stay silent.
age_seconds="$(printf '%s' "$latest_merged_at" | jq -R '
  sub("\\.[0-9]+Z$"; "Z") | now - fromdateiso8601 | floor
' 2>/dev/null)" || exit 0
case "$age_seconds" in
  ''|*[!0-9-]*) exit 0 ;;
esac

# Record the acknowledgement before emitting anything. If the write fails,
# exit silently: emitting without advancing state would loop on this PR.
write_state "$latest_num" "$latest_title" "$latest_branch" "$latest_merged_at" \
  "$acked_prs_json" || exit 0

if [ "$age_seconds" -lt 0 ] || [ "$age_seconds" -gt $((MAX_AGE_HOURS * 3600)) ]; then
  exit 0  # too old (or clock skew) to be news; recorded as seen above
fi

# Determine the hook event from the JSON the harness piped in on stdin.
# Default to SessionStart so the envelope is valid even if stdin is empty.
event="SessionStart"
if [ ! -t 0 ]; then
  stdin_json="$(cat 2>/dev/null || true)"
  if [ -n "$stdin_json" ]; then
    parsed_event="$(printf '%s' "$stdin_json" | jq -r '.hook_event_name // empty' 2>/dev/null || true)"
    [ -n "$parsed_event" ] && event="$parsed_event"
  fi
fi

# Best-effort preview of the first open `- [ ]` item in the plan.
next_open=""
if [ -f "$plan_file" ]; then
  next_open="$(grep -n '^- \[ \]' "$plan_file" 2>/dev/null | head -1 || true)"
fi

context=$(
  printf 'PR #%s merged on `main`: %s (branch: %s).\n\n' \
    "$latest_num" "$latest_title" "$latest_branch"
  printf 'Auto-continue directive: run /team-start. It reads the charter, '
  printf 'the handoff and the lessons, and picks the next Ready Phase 17 '
  printf 'item; it stops and asks the maintainer when it is not confident.\n'
  if [ -n "$next_open" ]; then
    printf '\nFirst open item by file order (informational only; /team-start decides): %s\n' "$next_open"
  fi
)

jq -n \
  --arg event "$event" \
  --arg ctx "$context" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $ctx } }'

# For Stop hooks with asyncRewake, exit 2 rewakes the model with the output.
if [ "$event" = "Stop" ]; then
  exit 2
fi
exit 0
