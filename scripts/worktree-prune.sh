#!/usr/bin/env bash
# Remove finished agent worktrees under .claude/worktrees/.
#
# DRY RUN by default: prints what would be removed. Pass --execute to act.
#
# A worktree is removed only when ALL of these hold:
#   - it lives under <main checkout>/.claude/worktrees/
#   - it is not locked, and is not the worktree you are running from
#   - it has a branch (detached HEADs are never touched)
#   - it has no uncommitted changes (tracked or untracked)
#   - its branch is finished: either merged into origin/main (a strict
#     ancestor, so a brand-new branch sitting on origin/main is not
#     mistaken for finished work), or its remote branch is gone
#     (squash-merge + delete-branch leaves no ancestor, so this is the
#     common case)
#
# With no network the fetch is skipped with a warning; the "remote branch
# is gone" check is then skipped too (it would read stale refs) and the
# merged check uses whatever origin/main is already known locally.
# Removal uses plain `git worktree remove` (never --force), then
# `git worktree prune`. Branches are left in place.

set -u

execute=0
for arg in "$@"; do
  case "$arg" in
    --execute) execute=1 ;;
    -h | --help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "worktree-prune: unknown argument: $arg (use --execute or --help)" >&2
      exit 2
      ;;
  esac
done

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "worktree-prune: not inside a git repository" >&2
  exit 1
fi

here=$(git rev-parse --show-toplevel)
main_root=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
base="$main_root/.claude/worktrees/"

# Refresh remote state. Offline is fine; we just lose the "gone" check.
remote_ok=0
if git remote get-url origin > /dev/null 2>&1; then
  if GIT_TERMINAL_PROMPT=0 git -C "$main_root" \
    -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 \
    fetch --prune --quiet origin > /dev/null 2>&1; then
    remote_ok=1
  else
    echo "warning: could not reach origin; skipping the remote-branch-gone check" >&2
  fi
else
  echo "warning: no 'origin' remote; skipping the remote checks" >&2
fi

have_origin_main=0
if git rev-parse --verify --quiet refs/remotes/origin/main > /dev/null; then
  have_origin_main=1
else
  echo "warning: no origin/main ref; the merged check cannot run" >&2
fi

if [ "$execute" -eq 1 ]; then
  echo "worktree-prune: EXECUTE"
else
  echo "worktree-prune: DRY RUN (pass --execute to remove)"
fi

total_kb=0
removed=0
listed=0

# Decide one worktree. Prints the verdict; sets $verdict to "remove" or "keep".
consider() {
  local path=$1 branch=$2 locked=$3
  verdict=keep
  local rel=${path#"$base"}

  if [ "$locked" -eq 1 ]; then
    echo "  keep    $rel (locked)"
    return
  fi
  if [ "$path" = "$here" ]; then
    echo "  keep    $rel (current worktree)"
    return
  fi
  if [ -z "$branch" ]; then
    echo "  keep    $rel (detached HEAD)"
    return
  fi
  if [ -n "$(git -C "$path" status --porcelain 2> /dev/null)" ]; then
    echo "  keep    $rel (uncommitted changes)"
    return
  fi

  local reason=""
  if [ "$have_origin_main" -eq 1 ]; then
    local tip main_tip
    tip=$(git rev-parse "refs/heads/$branch")
    main_tip=$(git rev-parse refs/remotes/origin/main)
    if [ "$tip" != "$main_tip" ] &&
      git merge-base --is-ancestor "$tip" "$main_tip" 2> /dev/null; then
      reason="merged into origin/main"
    fi
  fi
  if [ -z "$reason" ] && [ "$remote_ok" -eq 1 ]; then
    local track
    track=$(git for-each-ref --format='%(upstream:track)' "refs/heads/$branch")
    if [ "$track" = "[gone]" ]; then
      reason="remote branch gone"
    fi
  fi
  if [ -z "$reason" ]; then
    echo "  keep    $rel ($branch: not merged, remote branch present)"
    return
  fi

  verdict=remove
  reason_out=$reason
}

path=""
branch=""
locked=0
reason_out=""
verdict=keep

process() {
  [ -n "$path" ] || return 0
  case "$path" in
    "$base"*) ;;
    *) return 0 ;;
  esac
  consider "$path" "$branch" "$locked"
  if [ "$verdict" = remove ]; then
    local kb
    kb=$(du -sk "$path" 2> /dev/null | cut -f1)
    kb=${kb:-0}
    listed=$((listed + 1))
    total_kb=$((total_kb + kb))
    if [ "$execute" -eq 1 ]; then
      if git worktree remove "$path" > /dev/null 2>&1; then
        removed=$((removed + 1))
        echo "  removed ${path#"$base"} ($branch: $reason_out, ${kb} KiB)"
      else
        echo "  failed  ${path#"$base"} (git worktree remove refused; left in place)"
        total_kb=$((total_kb - kb))
      fi
    else
      echo "  remove  ${path#"$base"} ($branch: $reason_out, ${kb} KiB)"
    fi
  fi
}

# Porcelain output: blank-line separated records of "key value" lines.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    "worktree "*)
      process
      path=${line#worktree }
      branch=""
      locked=0
      ;;
    "branch "*) branch=${line#branch refs/heads/} ;;
    locked*) locked=1 ;;
  esac
done < <(git worktree list --porcelain)
process

if [ "$execute" -eq 1 ]; then
  git worktree prune
  echo "worktree-prune: removed $removed worktree(s), reclaimed $((total_kb / 1024)) MiB (${total_kb} KiB)"
else
  echo "worktree-prune: $listed worktree(s) would be removed, reclaiming $((total_kb / 1024)) MiB (${total_kb} KiB)"
fi
