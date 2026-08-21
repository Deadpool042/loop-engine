#!/usr/bin/env bash
set -euo pipefail

target_limit=8192
soft_limit=$(ulimit -Sn)
hard_limit=$(ulimit -Hn)

if [ "$soft_limit" -lt "$target_limit" ]; then
  if [ "$hard_limit" -lt "$target_limit" ]; then
    printf 'gui:start requires NOFILE >= %s (soft=%s hard=%s).\n' "$target_limit" "$soft_limit" "$hard_limit" >&2
    exit 1
  fi
  if ! ulimit -n "$target_limit"; then
    printf 'gui:start could not raise NOFILE to %s (soft=%s hard=%s).\n' "$target_limit" "$soft_limit" "$hard_limit" >&2
    exit 1
  fi
fi

exec pnpm exec electron-forge start "$@"
