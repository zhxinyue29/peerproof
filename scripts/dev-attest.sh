#!/usr/bin/env bash
# Makes the fixture's attendees vouch for each other on a local chain, so the verification page
# and the attestation graph have real data to render. Warps into the attestation window first.
#
#   scripts/dev-attest.sh [n]     # n = how many of the attendees take part (default 3)
#
# Every signature and transaction here is genuine; only the keys are anvil's public defaults.
set -euo pipefail

RPC=${RPC:-http://127.0.0.1:8545}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV="$ROOT/web/.env.local"
[ -f "$ENV" ] || { echo "no web/.env.local — run scripts/dev-chain.sh first"; exit 1; }

ESCROW=$(grep '^NEXT_PUBLIC_ESCROW_ADDRESS=' "$ENV" | cut -d= -f2)
EVENT_ID=$(grep '^NEXT_PUBLIC_EVENT_ID=' "$ENV" | cut -d= -f2)
BEACON_PK=$(grep '^NEXT_PUBLIC_DEV_BEACON_PK=' "$ENV" | cut -d= -f2)

# Same order as dev-chain.sh registers them; each was registered with its own address as its
# attest key, so the wallet key also signs its rotating codes.
PKS=(
  0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
  0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
  0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
  0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
)
N=${1:-3}
(( N <= ${#PKS[@]} )) || { echo "only ${#PKS[@]} attendees in the fixture"; exit 1; }

OPEN=$(cast call "$ESCROW" "getEvent(uint256)" "$EVENT_ID" --rpc-url "$RPC" >/dev/null 2>&1; \
       cast call "$ESCROW" "statusOf(uint256)(uint8)" "$EVENT_ID" --rpc-url "$RPC")
echo "event $EVENT_ID status=$OPEN"

echo "→ warping into the attestation window"
NOW=$(cast block latest --rpc-url "$RPC" --field timestamp)
# createEvent put attestOpen at registerDeadline; jump generously past it and mine.
cast rpc evm_increaseTime 700 --rpc-url "$RPC" >/dev/null
cast rpc evm_mine --rpc-url "$RPC" >/dev/null

beacon_sig() {
  local bep; bep=$(cast call "$ESCROW" "currentBeaconEpoch()(uint64)" --rpc-url "$RPC" | awk '{print $1}')
  local dg; dg=$(cast call "$ESCROW" "beaconDigest(uint256,uint64)(bytes32)" "$EVENT_ID" "$bep" --rpc-url "$RPC")
  echo "$bep $(cast wallet sign --private-key "$BEACON_PK" --no-hash "$dg")"
}

# Arrival is its own transaction now, and every attendee below has to have made it. One pass at
# the door, then the pairs can be walked without touching the beacon again.
echo "→ checking in $N attendees at the door"
for ((i=0; i<N; i++)); do
  read -r bep bsig <<< "$(beacon_sig)"
  cast send "$ESCROW" "checkIn(uint256,uint64,bytes)" "$EVENT_ID" "$bep" "$bsig" \
    --private-key "${PKS[$i]}" --rpc-url "$RPC" >/dev/null
done

echo "→ vouching (every pair among the first $N attendees)"
for ((i=0; i<N; i++)); do
  for ((j=i+1; j<N; j++)); do
    # Alternate direction: presence also requires having vouched for somebody, so always making
    # the higher index the subject would leave the last attendee unconfirmed.
    if (( (i+j) % 2 == 0 )); then a=$i; b=$j; else a=$j; b=$i; fi
    attester_pk=${PKS[$a]}; subject_pk=${PKS[$b]}
    subject=$(cast wallet address --private-key "$subject_pk")

    epoch=$(cast call "$ESCROW" "currentEpoch()(uint64)" --rpc-url "$RPC" | awk '{print $1}')
    digest=$(cast call "$ESCROW" "codeDigest(uint256,address,uint64)(bytes32)" \
              "$EVENT_ID" "$subject" "$epoch" --rpc-url "$RPC")
    code=$(cast wallet sign --private-key "$subject_pk" --no-hash "$digest")

    cast send "$ESCROW" "attest(uint256,address,uint64,bytes)" \
      "$EVENT_ID" "$subject" "$epoch" "$code" \
      --private-key "$attester_pk" --rpc-url "$RPC" >/dev/null
    echo "  $(cast wallet address --private-key "$attester_pk") → $subject"
  done
done

echo
echo "confirmed: $(cast call "$ESCROW" "confirmedCount(uint256)(uint32)" "$EVENT_ID" --rpc-url "$RPC" | awk '{print $1}')"
echo "open /verify to see the graph"
