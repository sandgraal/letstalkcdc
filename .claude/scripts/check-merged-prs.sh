#!/usr/bin/env bash
#
# Poll GitHub for newly-merged `claude/*` PRs authored by the current user
# and, on a fresh merge, emit a SessionStart-shaped JSON envelope that
# instructs Claude to continue work from docs/IMPLEMENTATION-PLAN.md.
#
# Wired into .claude/settings.json:
#   - SessionStart: runs once per session; injects context if a merge
#     landed since the last session.
#   - Stop (asyncRewake: true): runs after every assistant turn in the
#     background. On a fresh merge it exits with code 2, which the
#     harness interprets as "rewake the model with this stdout as
#     system-reminder context" — that's how we get auto-continue
#     without a real GitHub webhook.
#
# State lives in .claude/.merge-watcher-state.json (gitignored). The
# file stores the highest PR number we've already acknowledged so we
# never double-trigger on the same merge.
#
# Silent-fail policy: if `gh` isn't installed, isn't authed, the repo
# isn't a GitHub remote, or `jq` is missing — emit nothing and exit 0.
# A noisy hook is worse than a missing hook.

set -u

# Resolve repo root via `git rev-parse` so this works in both the main
# checkout and any git-worktree (where `.git` is a file pointer, not a
# directory).
command -v gh >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$repo_root" ] || exit 0
state_file="$repo_root/.claude/.merge-watcher-state.json"
plan_file="$repo_root/docs/IMPLEMENTATION-PLAN.md"

gh auth status >/dev/null 2>&1 || exit 0

# Query merged PRs by the authenticated user. Filter to claude/* branches.
prs_json="$(gh pr list --state merged --author @me --limit 10 \
  --json number,title,mergedAt,headRefName 2>/dev/null)" || exit 0
[ -n "$prs_json" ] || exit 0

# Pick the most recently merged claude/* PR.
latest="$(printf '%s' "$prs_json" | jq -c '
  [ .[] | select(.headRefName | startswith("claude/")) ]
  | sort_by(.mergedAt) | reverse | .[0] // empty
')"
[ -n "$latest" ] && [ "$latest" != "null" ] || exit 0

latest_num="$(printf '%s' "$latest" | jq -r '.number')"
latest_title="$(printf '%s' "$latest" | jq -r '.title')"
latest_branch="$(printf '%s' "$latest" | jq -r '.headRefName')"
latest_merged_at="$(printf '%s' "$latest" | jq -r '.mergedAt')"

# Read last-acknowledged PR number from state file (defaults to 0).
last_seen=0
if [ -f "$state_file" ]; then
  last_seen="$(jq -r '.lastSeenPR // 0' "$state_file" 2>/dev/null || echo 0)"
fi

# Nothing new — silent exit.
if [ "$latest_num" -le "$last_seen" ]; then
  exit 0
fi

# Record the new acknowledgement *before* emitting context, so even if the
# downstream rewake fails for any reason we don't loop on the same PR.
mkdir -p "$(dirname "$state_file")"
jq -n \
  --argjson n "$latest_num" \
  --arg t "$latest_title" \
  --arg b "$latest_branch" \
  --arg m "$latest_merged_at" \
  '{ lastSeenPR: $n, lastSeenTitle: $t, lastSeenBranch: $b, lastSeenMergedAt: $m, acknowledgedAt: (now | todate) }' \
  > "$state_file"

# Determine the hook event from the JSON the harness piped in on stdin.
# SessionStart and Stop are the two registered call sites; default to
# SessionStart so the envelope is valid even if stdin is empty.
event="SessionStart"
if [ -t 0 ]; then
  :  # no stdin
else
  stdin_json="$(cat 2>/dev/null || true)"
  if [ -n "$stdin_json" ]; then
    parsed_event="$(printf '%s' "$stdin_json" | jq -r '.hook_event_name // empty' 2>/dev/null || true)"
    [ -n "$parsed_event" ] && event="$parsed_event"
  fi
fi

# Pull a short preview of the lowest open `- [ ]` in the plan (best effort —
# Claude will still read the whole file).
next_open=""
if [ -f "$plan_file" ]; then
  next_open="$(grep -n '^- \[ \]' "$plan_file" 2>/dev/null | head -1 || true)"
fi

# Build the system-reminder text. Keep it terse — Claude has the repo
# context already; just point at the trigger and the plan.
context=$(
  printf 'PR #%s merged on `main`: %s (branch: %s).\n\n' \
    "$latest_num" "$latest_title" "$latest_branch"
  printf 'Auto-continue directive: read docs/IMPLEMENTATION-PLAN.md, pick '
  printf 'the lowest-numbered open `- [ ]` item you can act on (skip items '
  printf 'that require human-only GitHub-side configuration like Phase 1), '
  printf 'and start work on it. Branch from `main` after `git fetch && git '
  printf 'checkout main && git pull`.\n'
  if [ -n "$next_open" ]; then
    printf '\nFirst open item by file order: %s\n' "$next_open"
  fi
)

# Emit the harness-shaped envelope. For Stop hooks with asyncRewake, we
# also exit 2 so the model is rewoken with this output as the system-
# reminder.
jq -n \
  --arg event "$event" \
  --arg ctx "$context" \
  '{ hookSpecificOutput: { hookEventName: $event, additionalContext: $ctx } }'

if [ "$event" = "Stop" ]; then
  exit 2
fi
exit 0
