#!/usr/bin/env bash
# Builds the deployable static site.
#
#   scripts/build-static.sh testnet 0xEscrowAddress [eventId]
#   scripts/build-static.sh mainnet 0xEscrowAddress [eventId]
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
EVENT_ID=${3:-1}
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
MOVED=0
if [ -f .env.local ]; then mv .env.local .env.local.bak && MOVED=1; fi
restore() { [ "$MOVED" = 1 ] && mv -f .env.local.bak .env.local || true; }
trap restore EXIT

NEXT_PUBLIC_CHAIN="$NETWORK" \
NEXT_PUBLIC_RPC_URL="$RPC" \
NEXT_PUBLIC_LOGS_RPC_URL="$LOGS_RPC" \
NEXT_PUBLIC_ESCROW_ADDRESS="$ESCROW" \
NEXT_PUBLIC_EVENT_ID="$EVENT_ID" \
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" \
  NEXT_PUBLIC_DEPLOY_BLOCK="$DEPLOY_BLOCK" \
  npm run build

echo
echo "✓ web/out ready ($(du -sh out | cut -f1))"
echo
echo "deploy — Cloudflare Pages:"
echo "  npx wrangler pages deploy out --project-name=peerproof"
echo "deploy — GitHub Pages:"
echo "  git subtree push --prefix web/out origin gh-pages     # or use the Actions workflow"
