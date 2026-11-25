#!/usr/bin/env bash
# Generate a strong admin token and store it where it is needed.
#
#   npm run token        -> writes ADMIN_TOKEN as a Worker secret (production)
#   npm run token:local  -> writes ADMIN_TOKEN to .dev.vars (local dev only)
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Generate an ADMIN_TOKEN for Updatini.

Usage:
  npm run token                 Update the ADMIN_TOKEN Worker secret (production)
  npm run token:local           Write ADMIN_TOKEN to .dev.vars (local development)

Options:
  --local       Write to .dev.vars instead of the deployed Worker
  -h, --help    Show this help

The token is generated locally from 32 random bytes (64 hex characters).
Cloudflare cannot show the value again, so store it in a password manager.
EOF
}

local_mode=0
for arg in "$@"; do
  case "$arg" in
    --local) local_mode=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      printf 'Unknown option: %s\n\n' "$arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ROOT/wrangler.toml" ]]; then
  printf '✖ wrangler.toml not found. Run this script from an Updatini checkout.\n' >&2
  exit 1
fi

if command -v openssl >/dev/null 2>&1; then
  token="$(openssl rand -hex 32)"
elif command -v node >/dev/null 2>&1; then
  token="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
else
  printf '✖ Need openssl or Node.js to generate a token.\n' >&2
  exit 1
fi

if (( local_mode )); then
  umask 077
  tmp="$(mktemp "$ROOT/.dev.vars.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT

  if [[ -f "$ROOT/.dev.vars" ]]; then
    # Preserve other local variables, replace any existing ADMIN_TOKEN line.
    grep -v -E '^[[:space:]]*ADMIN_TOKEN[[:space:]]*=' "$ROOT/.dev.vars" > "$tmp" || true
  fi

  printf 'ADMIN_TOKEN="%s"\n' "$token" >> "$tmp"
  mv "$tmp" "$ROOT/.dev.vars"
  chmod 600 "$ROOT/.dev.vars"
  trap - EXIT

  printf '✓ Wrote a fresh ADMIN_TOKEN to .dev.vars (local development only).\n'
else
  ensure_wrangler || exit 1

  if ! run_wrangler whoami >/dev/null 2>&1; then
    printf '✖ Not logged in to Cloudflare.\n' >&2
    printf '  Run: npx wrangler login\n' >&2
    printf '  Then retry: npm run token\n' >&2
    exit 1
  fi

  if ! output="$(printf '{"ADMIN_TOKEN":"%s"}' "$token" | run_wrangler secret bulk 2>&1)"; then
    printf '✖ Could not update the ADMIN_TOKEN secret.\n' >&2
    if [[ -n "$output" ]]; then
      printf '\n%s\n' "$output" >&2
    fi
    exit 1
  fi

  printf '✓ ADMIN_TOKEN updated on the deployed Worker.\n'
fi

printf '\n'
printf '================================================================\n'
printf '  New admin token — copy it now. It is not stored anywhere.\n'
printf '================================================================\n\n'
printf '  %s\n\n' "$token"

if (( local_mode )); then
  printf '  Use it with `npm run dev` — the token is already in .dev.vars.\n'
else
  printf '  Open your Worker URL, paste it into “Admin token”, and connect.\n'
fi

printf '  Rotate at any time with `npm run token` or `npm run token:local`.\n'
