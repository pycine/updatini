#!/usr/bin/env bash
# Shared helpers for Updatini's maintenance scripts.
# Source this file from scripts/*.sh; do not execute it directly.

LIB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$LIB_DIR/.." && pwd)"

# Verify that a Wrangler runner is available (local install or npx).
ensure_wrangler() {
  if [[ -x "$ROOT/node_modules/.bin/wrangler" ]] || command -v npx >/dev/null 2>&1; then
    return 0
  fi

  printf '✖ Wrangler is not available.\n' >&2
  printf '  Install Node.js 22.12+ and run: npm install\n' >&2
  return 1
}

# Run Wrangler from the repository root.
# Prefers the locally installed binary and falls back to npx.
# stdin, stdout and stderr are preserved so `secret bulk` can read JSON.
run_wrangler() {
  if [[ -x "$ROOT/node_modules/.bin/wrangler" ]]; then
    ( cd -- "$ROOT" && exec "$ROOT/node_modules/.bin/wrangler" "$@" )
  else
    ( cd -- "$ROOT" && exec npx --yes wrangler@4 "$@" )
  fi
}
