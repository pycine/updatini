#!/usr/bin/env bash
# Deploy the Worker and its static assets to Cloudflare.
#
# Wraps `wrangler deploy` with a few guard rails:
#   - checks that wrangler.toml exists
#   - checks that you are logged in (unless --dry-run)
#   - warns when the ADMIN_TOKEN secret has not been set
#
# Extra arguments are forwarded to Wrangler:
#   npm run deploy -- --dry-run
#   npm run deploy -- --env staging
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Deploy Updatini to Cloudflare.

Usage:
  npm run deploy                 Deploy the Worker and static assets
  npm run deploy -- --dry-run    Compile and bundle without deploying

Extra arguments are forwarded to `wrangler deploy`.
The ADMIN_TOKEN secret must be set with `npm run token` before the console can log in.
EOF
}

dry_run=0
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    --dry-run) dry_run=1 ;;
    *) ;;
  esac
done

if [[ ! -f "$ROOT/wrangler.toml" ]]; then
  printf '✖ wrangler.toml not found. Run this script from an Updatini checkout.\n' >&2
  exit 1
fi

ensure_wrangler || exit 1

if (( ! dry_run )); then
  if ! run_wrangler whoami >/dev/null 2>&1; then
    printf '✖ Not logged in to Cloudflare.\n' >&2
    printf '  Run: npx wrangler login\n' >&2
    printf '  Then retry: npm run deploy\n' >&2
    exit 1
  fi

  secrets="$(run_wrangler secret list 2>/dev/null || true)"
  if ! grep -q '"name"[[:space:]]*:[[:space:]]*"ADMIN_TOKEN"' <<<"$secrets"; then
    printf '⚠ ADMIN_TOKEN is not set on this Worker.\n' >&2
    printf '  The deployed console will reject every login until you run: npm run token\n\n' >&2
  fi
fi

if (( dry_run )); then
  printf 'Bundling a dry-run build (nothing will be deployed)…\n\n'
else
  printf 'Deploying Updatini to Cloudflare…\n\n'
fi

run_wrangler deploy "$@"

printf '\n✓ Deploy finished.\n'
printf '  If this was your first deploy, run `npm run token` and then open the URL above.\n'
