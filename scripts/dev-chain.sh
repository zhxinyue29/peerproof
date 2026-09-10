#!/usr/bin/env bash
# Local dev fixture: deploys AttendanceEscrow to a running anvil, opens one event, registers a
# few attendees, and warps the chain into the attestation window so the app lands on a usable
# floor screen. No real funds involved.
#
#   anvil --block-time 1 &
#   scripts/dev-chain.sh
#
# Writes web/.env.local with the addresses the frontend needs.
set -euo pipefail

RPC=${RPC:-http://127.0.0.1:8545}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# anvil's deterministic accounts. Never use these anywhere real.
ORGANIZER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BEACON_PK=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
ATTENDEE_PKS=(
  0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
  0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
  0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
  0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
)

DEPOSIT=30000000000000000000   # 30 MON
CAPACITY=50
MIN_QUORUM=4                  # low enough to exercise settlement with a handful of accounts
K=3
REGISTRATION=600              # registration stays open ten minutes so the browser can join
WINDOW=7200                   # two hours of attestation window, so dev sessions do not expire

cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || { echo "no anvil on $RPC — start it first"; exit 1; }

echo "→ deploying"
ESCROW=$(cd "$ROOT/contracts" && forge create src/AttendanceEscrow.sol:AttendanceEscrow \
  --private-key "$ORGANIZER_PK" --rpc-url "$RPC" --broadcast 2>/dev/null \
  | awk '/Deployed to:/ {print $3}')
[ -n "$ESCROW" ] || { echo "deploy failed"; exit 1; }
echo "  escrow $ESCROW"

BEACON_ADDR=$(cast wallet address --private-key "$BEACON_PK")
NOW=$(cast block latest --rpc-url "$RPC" --field timestamp)
REG_DEADLINE=$((NOW + REGISTRATION))
ATTEST_OPEN=$((NOW + REGISTRATION))
ATTEST_CLOSE=$((ATTEST_OPEN + WINDOW))

echo "→ creating event"
cast send "$ESCROW" \
  "createEvent(address,uint96,uint32,uint32,uint8,uint64,uint64,uint64)" \
  "$BEACON_ADDR" "$DEPOSIT" "$CAPACITY" "$MIN_QUORUM" "$K" \
  "$REG_DEADLINE" "$ATTEST_OPEN" "$ATTEST_CLOSE" \
  --private-key "$ORGANIZER_PK" --rpc-url "$RPC" >/dev/null
EVENT_ID=$(cast call "$ESCROW" "nextEventId()(uint256)" --rpc-url "$RPC")
EVENT_ID=$((EVENT_ID - 1))
echo "  event #$EVENT_ID, beacon $BEACON_ADDR"

echo "→ registering ${#ATTENDEE_PKS[@]} attendees"
for pk in "${ATTENDEE_PKS[@]}"; do
  addr=$(cast wallet address --private-key "$pk")
  # In dev the wallet doubles as its own attest key; the app derives a separate one from PRF.
  cast send "$ESCROW" "register(uint256,address)" "$EVENT_ID" "$addr" \
    --value "$DEPOSIT" --private-key "$pk" --rpc-url "$RPC" >/dev/null
  echo "  $addr"
done

# Registration is still open on purpose: the app's key is derived from a passkey, so the browser
# has to register itself. The floor screen's dev panel warps the chain when you're ready.
cat > "$ROOT/web/.env.local" <<EOF
# Written by scripts/dev-chain.sh — local anvil only. These keys are anvil's public defaults.
NEXT_PUBLIC_CHAIN=local
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_ESCROW_ADDRESS=$ESCROW
NEXT_PUBLIC_EVENT_ID=$EVENT_ID
NEXT_PUBLIC_DEV_BEACON_PK=$BEACON_PK
NEXT_PUBLIC_DEV_FUNDER_PK=$ORGANIZER_PK
NEXT_PUBLIC_DEV_PEER_PK=${ATTENDEE_PKS[0]}
NEXT_PUBLIC_DEV_PEER_PKS=$(IFS=,; echo "${ATTENDEE_PKS[*]}")
EOF

echo
echo "status:    $(cast call "$ESCROW" "statusOf(uint256)(uint8)" "$EVENT_ID" --rpc-url "$RPC") (0=Open)"
echo "confirmed: $(cast call "$ESCROW" "confirmedCount(uint256)(uint32)" "$EVENT_ID" --rpc-url "$RPC")"
echo "escrowed:  $(cast balance "$ESCROW" --rpc-url "$RPC" --ether) MON"
echo
echo "wrote web/.env.local — restart \`npm run dev\` to pick it up"
