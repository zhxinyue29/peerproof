#!/usr/bin/env bash
# Builds the four event states the documentation screenshots need, on whatever escrow is already
# deployed locally, and writes their ids to docs/screens/fixture.json.
#
#   scripts/dev-shots.sh          # then: node scripts/screenshot-spec.mjs
#
# Why this exists: the screenshot script used to name event ids by hand. Fixture events age —
# a window that was open when the pictures were taken is closed a day later, so re-running the
# script silently produced the wrong screen for three of the frames. States, not ids, are what
# the pictures are of, so the script now asks for a state and this one supplies it.
#
# The chain clock only moves forward, so the states are built oldest-window-first: the settled
# event needs its window in the past, and warping past it would close a live one built earlier.
#
# Every signature here is genuine; only the keys are anvil's public defaults.
set -euo pipefail

RPC=${RPC:-http://127.0.0.1:8545}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV="$ROOT/web/.env.local"
[ -f "$ENV" ] || { echo "no web/.env.local — run scripts/dev-chain.sh first"; exit 1; }

ESCROW=$(grep '^NEXT_PUBLIC_ESCROW_ADDRESS=' "$ENV" | cut -d= -f2)
BEACON_PK=$(grep '^NEXT_PUBLIC_DEV_BEACON_PK=' "$ENV" | cut -d= -f2)
BEACON_ADDR=$(cast wallet address --private-key "$BEACON_PK")
FUNDER_PK=$(grep '^NEXT_PUBLIC_DEV_FUNDER_PK=' "$ENV" | cut -d= -f2)

DEPOSIT=${DEPOSIT:-10000000000000000000}   # 10 MON — large enough that the payout split is legible
CAPACITY=8
MIN_QUORUM=3
K=2

# anvil defaults, same four the other fixtures use.
PKS=(
  0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
  0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
  0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
  0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
)

# The browser identities the screenshots sign in as. Derived in screenshot-spec.mjs from fixed
# entropy, so their addresses are constant and can be funded and registered from here.
#   ab — the protagonist: registered everywhere, claims at the end
#   ef — funded but registered nowhere, so the registration call to action is what renders
#   cd — deliberately never funded; that is the whole subject of the funding screen
# Not a secret: this is derived from the literal entropy "ab" repeated 32 times, which is written
# in plain sight in screenshot-spec.mjs. It is checked in because the fixture has to fund and
# register the same address the browser will sign in as, and re-deriving it here would mean
# duplicating the BIP-39 path in bash. Never put anything in this account on a real chain.
AB_PK=0xe06216e7bcc680f25874ec18e338f51f4a576ec54fefe696190533ad0ba8d192
AB=$(cast wallet address --private-key "$AB_PK")
EF=$(node -e '
const {HDKey}=require("@scure/bip32"),{entropyToMnemonic,mnemonicToSeedSync}=require("@scure/bip39");
const {wordlist}=require("@scure/bip39/wordlists/english.js"),{privateKeyToAccount}=require("viem/accounts");
const e=Uint8Array.from("ef".repeat(32).match(/.{2}/g).map(h=>parseInt(h,16)));
const n=HDKey.fromMasterSeed(mnemonicToSeedSync(entropyToMnemonic(e,wordlist))).derive("m/44\x27/60\x27/0\x27/0/0");
process.stdout.write(privateKeyToAccount("0x"+Buffer.from(n.privateKey).toString("hex")).address);
' 2>/dev/null || echo "")

say() { echo "→ $*"; }
now() { cast block latest --rpc-url "$RPC" --field timestamp; }
warp() { cast rpc evm_increaseTime "$1" --rpc-url "$RPC" >/dev/null; cast rpc evm_mine --rpc-url "$RPC" >/dev/null; }
fund() { cast send "$1" --value "$2" --private-key "$FUNDER_PK" --rpc-url "$RPC" >/dev/null; }

create() { # reg_offset attest_open_offset attest_close_offset -> event id
  local n; n=$(now)
  cast send "$ESCROW" "createEvent(address,uint96,uint32,uint32,uint8,uint64,uint64,uint64)" \
    "$BEACON_ADDR" "$DEPOSIT" "$CAPACITY" "$MIN_QUORUM" "$K" \
    "$((n + $1))" "$((n + $2))" "$((n + $3))" \
    --private-key "$FUNDER_PK" --rpc-url "$RPC" >/dev/null
  local id; id=$(cast call "$ESCROW" "nextEventId()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
  echo $((id - 1))
}

enrol() { # event_id pk...
  local id=$1; shift
  for pk in "$@"; do
    local a; a=$(cast wallet address --private-key "$pk")
    cast send "$ESCROW" "register(uint256,address)" "$id" "$a" \
      --value "$DEPOSIT" --private-key "$pk" --rpc-url "$RPC" >/dev/null
  done
}

check_in() { # event_id pk — idempotent, so callers need not track who has already arrived
  local id=$1 pk=$2
  local who; who=$(cast wallet address --private-key "$pk")
  local at; at=$(cast call "$ESCROW" "checkedInAt(uint256,address)(uint64)" "$id" "$who" --rpc-url "$RPC" | awk '{print $1}')
  [ "$at" != "0" ] && return 0
  local bep; bep=$(cast call "$ESCROW" "currentBeaconEpoch()(uint64)" --rpc-url "$RPC" | awk '{print $1}')
  local bdg; bdg=$(cast call "$ESCROW" "beaconDigest(uint256,uint64)(bytes32)" "$id" "$bep" --rpc-url "$RPC")
  local bsig; bsig=$(cast wallet sign --private-key "$BEACON_PK" --no-hash "$bdg")
  cast send "$ESCROW" "checkIn(uint256,uint64,bytes)" "$id" "$bep" "$bsig" \
    --private-key "$pk" --rpc-url "$RPC" >/dev/null
}

vouch() { # event_id attester_pk subject_pk
  local id=$1 apk=$2 spk=$3
  check_in "$id" "$apk"
  local subject; subject=$(cast wallet address --private-key "$spk")
  local epoch; epoch=$(cast call "$ESCROW" "currentEpoch()(uint64)" --rpc-url "$RPC" | awk '{print $1}')
  local digest; digest=$(cast call "$ESCROW" "codeDigest(uint256,address,uint64)(bytes32)" \
                          "$id" "$subject" "$epoch" --rpc-url "$RPC")
  local code; code=$(cast wallet sign --private-key "$spk" --no-hash "$digest")
  cast send "$ESCROW" "attest(uint256,address,uint64,bytes)" \
    "$id" "$subject" "$epoch" "$code" \
    --private-key "$apk" --rpc-url "$RPC" >/dev/null
}

echo "escrow $ESCROW"
say "funding the browser identities"
fund "$AB" 200ether
[ -n "$EF" ] && fund "$EF" 200ether
# cd is left empty on purpose.

# ---------------------------------------------------------------- settled (verify + payout) ----
say "building SETTLED — three present, one no-show, deposits already split"
SETTLED=$(create 60 60 600)
enrol "$SETTLED" "${PKS[0]}" "${PKS[1]}" "${PKS[2]}" "${PKS[3]}"
enrol "$SETTLED" "$AB_PK"
warp 120
# Every unordered pair among the four who turned up, once each — a scan counts for both people in
# it, so the contract rejects the same pair twice and three pairs each is already over k. PKS[3]
# appears in none of them: that absence is what the settlement arithmetic is about.
# Directions are chosen so all four attest at least once, since presence also requires having
# vouched for somebody.
vouch "$SETTLED" "${PKS[0]}" "${PKS[1]}"
vouch "$SETTLED" "${PKS[1]}" "${PKS[2]}"
vouch "$SETTLED" "${PKS[2]}" "$AB_PK"
vouch "$SETTLED" "$AB_PK"   "${PKS[0]}"
vouch "$SETTLED" "${PKS[0]}" "${PKS[2]}"
vouch "$SETTLED" "${PKS[1]}" "$AB_PK"
echo "  confirmed $(cast call "$ESCROW" "confirmedCount(uint256)(uint32)" "$SETTLED" --rpc-url "$RPC" | awk '{print $1}')"
warp 700
cast send "$ESCROW" "settle(uint256)" "$SETTLED" --private-key "$FUNDER_PK" --rpc-url "$RPC" >/dev/null
cast send "$ESCROW" "claim(uint256)" "$SETTLED" --private-key "$AB_PK" --rpc-url "$RPC" >/dev/null
echo "  event $SETTLED settled and claimed"

# --------------------------------------------------------------------- live (check-in open) ----
# Built after the warps above so its window is still open by the time the browser gets here, and
# wide enough that a slow screenshot run cannot close it.
# Registration closes exactly when the doors open, which both the walk-in contract and the one
# before it accept. The fixture has to run against whichever is deployed locally, and no frame
# here is a picture of walk-ins — that lives in the create form, which renders from source.
say "building LIVE — check-in open right now"
LIVE=$(create 30 30 86400)
enrol "$LIVE" "${PKS[0]}" "${PKS[1]}" "${PKS[2]}"
enrol "$LIVE" "$AB_PK"
warp 60
vouch "$LIVE" "${PKS[0]}" "${PKS[1]}"
echo "  event $LIVE live"

# ------------------------------------------------------------- locked (doors not open yet) ----
say "building LOCKED — registered, doors still hours away"
LOCKED=$(create 43200 43200 129600)
enrol "$LOCKED" "$AB_PK"
echo "  event $LOCKED locked"

# ------------------------------------------------------------------ open (nobody signed up) ----
say "building OPEN — registration open, our identity not in it"
OPEN=$(create 86400 86400 172800)
enrol "$OPEN" "${PKS[0]}" "${PKS[1]}"
echo "  event $OPEN open"

# ------------------------------------------------------- mine (the organizer's own dashboard) ----
# Created by the browser identity rather than the funder, so the organizer-only parts of the
# dashboard render. Without this the dashboard screenshot is the read-only view, and the spec ends
# up describing a module the picture does not contain.
say "building MINE — an event the screenshot identity organizes"
MINE_ORG=$FUNDER_PK
FUNDER_PK=$AB_PK
MINE=$(create 86400 86400 172800)
FUNDER_PK=$MINE_ORG
enrol "$MINE" "${PKS[0]}" "${PKS[1]}" "${PKS[2]}"
echo "  event $MINE mine"

# ------------------------------------------------------------------------------ titles ----
# The listing page reads these from the directory contract, so without them every card on it is
# "Event #11" and the screenshot shows a product nobody would design for. Organizer-gated, and
# the organizer of all four is the funder key above.
# Derived, not read from the environment. NEXT_PUBLIC_DIRECTORY_ADDRESS is a leftover from before
# the directory went CREATE2, and it still holds an address the app has not read in some time —
# writing titles there produced a chain with the right data and a listing page showing none of it.
# The app computes this address; so does this.
DIRECTORY=$(ROOT="$ROOT" ESCROW="$ESCROW" node -e '
const fs = require("fs"), path = require("path");
const { getCreate2Address, keccak256, pad } = require(path.join(process.env.ROOT, "web/node_modules/viem"));
const src = fs.readFileSync(path.join(process.env.ROOT, "web/lib/directoryArtifact.ts"), "utf8");
const bytecode = src.match(/eventDirectoryBytecode = "(0x[0-9a-fA-F]+)"/)[1];
const init = bytecode + process.env.ESCROW.slice(2).toLowerCase().padStart(64, "0");
process.stdout.write(getCreate2Address({
  from: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
  salt: pad("0x5065657250726f6f662d6469726563746f7279", { size: 32 }),
  bytecodeHash: keccak256(init),
}));
')
# Deploy it if it is not there. The app does this from the browser on demand, which a fixture
# cannot do — and without it every card on the listing page reads "Event #5", so the screenshots
# would document a product with no titles.
#
# Through node rather than shell: the call is a 32-byte salt concatenated with init code, and
# getting that wrong in bash produces a transaction that succeeds while deploying nothing at an
# address nobody checks. viem computes the address too, so the result is verified rather than
# assumed.
if [ -n "${DIRECTORY:-}" ] && [ "$(cast code "$DIRECTORY" --rpc-url "$RPC")" = "0x" ]; then
  say "deploying the directory"
  ROOT="$ROOT" ESCROW="$ESCROW" RPC="$RPC" PK="$FUNDER_PK" node -e '
    const fs = require("fs"), path = require("path");
    const m = require(path.join(process.env.ROOT, "web/node_modules/viem"));
    const { privateKeyToAccount } = require(path.join(process.env.ROOT, "web/node_modules/viem/accounts"));
    const src = fs.readFileSync(path.join(process.env.ROOT, "web/lib/directoryArtifact.ts"), "utf8");
    const bytecode = src.match(/eventDirectoryBytecode = "(0x[0-9a-fA-F]+)"/)[1];
    const init = bytecode + process.env.ESCROW.slice(2).toLowerCase().padStart(64, "0");
    const salt = m.pad("0x5065657250726f6f662d6469726563746f7279", { size: 32 });
    const factory = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
    const expected = m.getCreate2Address({ from: factory, salt, bytecodeHash: m.keccak256(init) });
    const chain = m.defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "E", symbol: "E", decimals: 18 }, rpcUrls: { default: { http: [process.env.RPC] } } });
    const account = privateKeyToAccount(process.env.PK);
    const wallet = m.createWalletClient({ account, chain, transport: m.http(process.env.RPC) });
    const pub = m.createPublicClient({ chain, transport: m.http(process.env.RPC) });
    (async () => {
      const hash = await wallet.sendTransaction({ to: factory, data: (salt + init.slice(2)) });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("factory call reverted");
      const code = await pub.getCode({ address: expected });
      if (!code || code === "0x") throw new Error("nothing at " + expected);
      console.log("  directory " + expected);
    })().catch((e) => { console.error("  directory deploy failed: " + e.message); process.exit(1); });
  '
fi

if [ -n "${DIRECTORY:-}" ] && [ "$(cast code "$DIRECTORY" --rpc-url "$RPC")" != "0x" ]; then
  say "describing the events"
  describe() {
    cast send "$DIRECTORY" "describe(uint256,string,string,string)" "$1" "$2" "$3" "$4" \
      --private-key "$FUNDER_PK" --rpc-url "$RPC" >/dev/null
    echo "  #$1 $2"
  }
  describe "$OPEN"    "Web3 设计工作坊" \
    "一次关于界面与信任的下午。带上你正在做的东西，我们一起看。押金在你到场后原路退回。" \
    "https://example.org/web3-design"
  describe "$LOCKED"  "周四读书会 · 《技术的本质》" \
    "每周四晚，一本书，八个人。来了就退押金，放鸽子的那份分给到场的人。" ""
  describe "$LIVE"    "Monad Builders 深圳线下" \
    "开发者聚会，现场签到中。进门扫一下门口的大屏，再互相扫一下就算到场。" ""
  describe "$SETTLED" "九月摄影散步" \
    "沿着河走两个小时，随便拍。已经结束并结算完毕——四个人到场，一个人没来。" ""
  # MINE is described by its own organizer, not the funder.
  cast send "$DIRECTORY" "describe(uint256,string,string,string)" "$MINE" \
    "Monad Builders Shenzhen — September" \
    "An evening for people building on Monad. Scan the screen at the door, then scan the people around you." \
    "" --private-key "$AB_PK" --rpc-url "$RPC" >/dev/null
  echo "  #$MINE Monad Builders Shenzhen — September"
else
  echo "  (no directory deployed — the listing page will show ids instead of titles)"
fi

OUT="$ROOT/docs/screens/fixture.json"
cat > "$OUT" <<JSON
{
  "escrow": "$ESCROW",
  "open": $OPEN,
  "mine": $MINE,
  "locked": $LOCKED,
  "live": $LIVE,
  "settled": $SETTLED
}
JSON
echo
echo "wrote docs/screens/fixture.json"
cat "$OUT"
