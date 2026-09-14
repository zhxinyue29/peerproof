#!/usr/bin/env bash
# Builds the deployable static site.
#
#   scripts/build-static.sh testnet 0xEscrowAddress [eventId]   # eventId defaults to `latest`
#   scripts/build-static.sh mainnet 0xEscrowAddress [eventId]
#
# Pass an id only to pin the site to one event on purpose. `latest` follows whatever the escrow's
# newest event is, and `?event=N` overrides it per link either way.
#
# Output lands in web/out — 1.8MB of static files, no server. Host it anywhere.
#
# Why a script rather than a .env file: the local .env.local holds anvil's private keys, and
# `NEXT_PUBLIC_*` values are inlined into the bundle at build time. Building the public site with
# that file present would publish them. This runs the build in a clean environment instead, and
# next.config.ts refuses to build if a dev key is visible.
set -euo pipefail

NETWORK=${1:-}
ESCROW=${2:-}
# `latest`, not 1. A numeric id here switches off the resolve-to-newest path entirely, so the site
# shows one fixed event forever — and since the id is optional, a build that forgot it pinned
# itself silently. That is what put a finished event on the public demo: the page rendered
# correctly, it was simply describing something that had ended.
EVENT_ID=${3:-latest}
DEPLOY_BLOCK=${4:-0}
BASE_PATH=${BASE_PATH:-}

usage() { echo "usage: $0 <testnet|mainnet> <escrow-address> [eventId] [deployBlock]"; exit 1; }
[ -n "$NETWORK" ] && [ -n "$ESCROW" ] || usage
[[ "$ESCROW" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "not an address: $ESCROW"; exit 1; }

case "$NETWORK" in
  testnet)
    CHAIN_ID=10143
    RPC=https://testnet-rpc.monad.xyz
    # Left empty so lib/chain.ts picks the endpoint and its matching chunk size together. This
    # used to force drpc on the strength of a 1,000-block measurement; drpc has since withdrawn
    # eth_getLogs entirely, and hardcoding it here meant that failure could not be fixed by
    # fixing chain.ts.
    LOGS_RPC=
    ;;
  mainnet)
    CHAIN_ID=143
    RPC=https://rpc.monad.xyz
    # Ankr's endpoint allows 1,000-block getLogs; the default caps at 100, which cannot cover an
    # attestation window at all.
    LOGS_RPC=https://rpc3.monad.xyz
    ;;
  *) usage ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"

echo "→ building for $NETWORK (chain $CHAIN_ID)"
echo "  escrow   $ESCROW"
echo "  event    $EVENT_ID"
echo "  block    $DEPLOY_BLOCK"
[ -n "$BASE_PATH" ] && echo "  basePath $BASE_PATH"

rm -rf .next out

# `env -i` guarantees .env.local's dev keys cannot reach the bundle. Next still reads .env.local
# from disk, so it is moved aside for the duration of the build.
#
# A dev server watches that file. It reloads the moment it disappears, comes back configured
# against nothing, and keeps serving "No contract configured" long after this script has restored
# the file — the restore is not a change it watches for. That is not a hypothetical: it produced a
# full set of documentation screenshots that were all pictures of an unconfigured app, and it took
# a second occurrence to notice, because nothing about it looks like a build problem.
DEV_PID=$(ss -lptnH 'sport = :3000' 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
if [ -n "${DEV_PID:-}" ]; then
  echo
  echo "⚠️  A dev server is running on :3000 (pid $DEV_PID)."
  echo "   This build hides web/.env.local for its duration, and the dev server will notice and"
  echo "   come back unconfigured. Restart it when this finishes, before taking any screenshots."
  echo
fi

MOVED=0
if [ -f .env.local ]; then mv .env.local .env.local.bak && MOVED=1; fi
restore() {
  [ "$MOVED" = 1 ] && mv -f .env.local.bak .env.local || true
  if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    echo "⚠️  Restart the dev server (pid $DEV_PID) — it is serving an unconfigured app."
  fi
}
trap restore EXIT

NEXT_PUBLIC_CHAIN="$NETWORK" \
NEXT_PUBLIC_RPC_URL="$RPC" \
NEXT_PUBLIC_LOGS_RPC_URL="$LOGS_RPC" \
NEXT_PUBLIC_ESCROW_ADDRESS="$ESCROW" \
NEXT_PUBLIC_EVENT_ID="$EVENT_ID" \
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" \
  NEXT_PUBLIC_DEPLOY_BLOCK="$DEPLOY_BLOCK" \
  NEXT_PUBLIC_PRIVY_APP_ID="${NEXT_PUBLIC_PRIVY_APP_ID:-${PRIVY_APP_ID:-}}" \
  npm run build

echo
echo "✓ web/out ready ($(du -sh out | cut -f1))"
echo
# GitHub Pages only. The Cloudflare Pages hint used to be here and it was worse than no hint:
# MetaMask blocks *.pages.dev sites outright — 14,600 of those subdomains are on its phishing list,
# so a fresh one asking for a signature is judged malicious before anyone reads the page.
echo "deploy — GitHub Pages:"
echo "  git push     # the Actions workflow builds and publishes"
