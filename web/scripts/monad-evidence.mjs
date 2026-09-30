#!/usr/bin/env node
// Read-only chain evidence for PeerProof's Event #2 on Monad testnet.
//
//   npm run evidence:monad                 # from web/
//   MONAD_RPC_URL=<url> npm run evidence:monad
//   npm run evidence:monad -- --json       # machine-readable, for docs/monad-evidence.md
//
// It reads six published transactions and their receipts, decodes AttendanceEscrow's own events,
// and checks the facts the README and docs state about them. It loads no key, signs nothing and
// sends nothing, so it needs no testnet MON. Any failed check exits non-zero.
//
// What it deliberately does not do: work out latency, throughput or finality. A receipt records
// which block a transaction landed in, not how long anybody waited for it, so any such number
// derived here would be an inference presented as evidence. The live app measures its own
// submit-to-receipt time on the device, at the moment of a real scan.
//
// Behind an HTTP proxy, Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node 24+).
import { createPublicClient, decodeEventLog, formatEther, formatGwei, http, parseAbi } from "viem";

const EXPECTED_CHAIN_ID = 10143; // Monad testnet
const RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const ESCROW = "0xEa057c5a6F431eFF29F573E4db4bc49cD52Ee679";
const EXPLORER = "https://testnet.monadscan.com";
const EVENT_ID = 2n;
const SHARE = 20_000_000_000_000_000n; // 0.0200 MON

const TXS = [
  ["createEvent", "0x3271d17c29abe91767ba66c13aacf67cad1b8b473b12c388521efd9f579c4539"],
  ["register", "0x9cd76bf8a052990548981160cfa1b867edf30af5439cbdbb1b6e04389eac12b5"],
  ["checkIn", "0xb75fee5af6275bd19bab7efdca1b5d31653f9a7d52d2a7c6d81231451d664248"],
  ["attest", "0x2c4352624a7a13a66c1f5a77cea9d456d2d30893a24e3fd99f742a5fd583b288"],
  ["settle", "0x8e151c79daf64e140b481f3d1f5639e43f2f01da5895c81f1882959bb65760bf"],
  ["claim", "0xcd58dbb46884debdc87d6c60091aa5ff6176d6731fea85233908dce759e3e3c9"],
];

// Copied from contracts/src/AttendanceEscrow.sol, whose deployed bytecode Sourcify reports as an
// exact_match. A signature that drifted from the contract would decode nothing, and the checks
// below would fail loudly rather than pass on an empty list.
const ESCROW_EVENTS = parseAbi([
  "event EventCreated(uint256 indexed eventId, address indexed organizer, uint96 deposit, uint32 capacity, uint32 minQuorum, uint8 k, uint64 registerDeadline, uint64 attestOpen, uint64 attestClose)",
  "event BeaconKeySet(uint256 indexed eventId, address beaconKey)",
  "event Registered(uint256 indexed eventId, address indexed attendee, address attestKey)",
  "event CheckedIn(uint256 indexed eventId, address indexed attendee, uint64 beaconEpoch)",
  "event Attested(uint256 indexed eventId, address indexed attester, address indexed subject, uint64 epoch)",
  "event Confirmed(uint256 indexed eventId, address indexed attendee, bool viaOrganizer)",
  "event EventCancelled(uint256 indexed eventId, uint32 registered, uint32 minQuorum)",
  "event Settled(uint256 indexed eventId, uint32 confirmed, uint32 noShows, uint256 sharePerAttendee)",
  "event Claimed(uint256 indexed eventId, address indexed attendee, uint256 amount)",
]);

const json = process.argv.includes("--json");
const log = (...a) => {
  if (!json) console.log(...a);
};
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// The endpoint's origin only: a keyed RPC URL carries its key in the path or query.
let endpoint;
try {
  endpoint = new URL(RPC_URL).origin;
} catch {
  console.error("MONAD_RPC_URL is not a valid URL.");
  process.exit(2);
}

const client = createPublicClient({ transport: http(RPC_URL, { retryCount: 3, retryDelay: 800, timeout: 20_000 }) });

const chainId = await client.getChainId().catch((e) => {
  console.error(`Could not reach ${endpoint}: ${e.shortMessage ?? e.message}`);
  process.exit(2);
});
if (chainId !== EXPECTED_CHAIN_ID) {
  console.error(`Wrong network: ${endpoint} reports chain ID ${chainId}, expected ${EXPECTED_CHAIN_ID} (Monad testnet).`);
  process.exit(2);
}

log(`PeerProof · Event #${EVENT_ID} · read-only receipt evidence`);
log(`RPC ${endpoint} · chain ID ${chainId} · AttendanceEscrow ${ESCROW}`);
log("");

const checks = [];
const check = (ok, what) => checks.push({ ok: !!ok, what });
const rows = [];

for (const [i, [action, hash]] of TXS.entries()) {
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });

  const events = [];
  for (const l of receipt.logs) {
    if (!same(l.address, ESCROW)) continue;
    try {
      const d = decodeEventLog({ abi: ESCROW_EVENTS, data: l.data, topics: l.topics });
      events.push({ name: d.eventName, args: d.args });
    } catch {
      events.push({ name: "unknown", args: {} });
    }
  }

  // Monad charges the gas limit, not the gas used: "total gas deducted from the sender's balance
  // is value + gas_bid * gas_limit" (docs.monad.xyz, Differences between Monad and Ethereum).
  const price = receipt.effectiveGasPrice ?? null;
  const fee = price !== null && tx.gas != null ? tx.gas * price : null;

  const row = {
    action,
    hash,
    status: receipt.status,
    from: tx.from,
    to: tx.to,
    blockNumber: receipt.blockNumber.toString(),
    blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    gasUsed: receipt.gasUsed.toString(),
    gasLimit: tx.gas != null ? tx.gas.toString() : null,
    effectiveGasPriceGwei: price !== null ? formatGwei(price) : null,
    feeMon: fee !== null ? formatEther(fee) : null,
    events: events.map((e) => e.name),
    explorer: `${EXPLORER}/tx/${hash}`,
    detail: events,
  };
  rows.push(row);

  log(`[${i + 1}/${TXS.length}] ${action}`);
  log(`  hash         ${hash}`);
  log(`  status       ${row.status}`);
  log(`  from → to    ${short(tx.from)} → ${tx.to ? short(tx.to) : "unavailable"}`);
  log(`  block        ${row.blockNumber} · ${row.blockTimestamp}`);
  log(`  gas used     ${row.gasUsed} of limit ${row.gasLimit ?? "unavailable"}`);
  log(`  gas price    ${row.effectiveGasPriceGwei !== null ? `${row.effectiveGasPriceGwei} gwei (effective)` : "unavailable"}`);
  log(`  fee          ${row.feeMon !== null ? `${row.feeMon} MON (gas limit × effective gas price)` : "unavailable"}`);
  log(`  events       ${row.events.length ? row.events.join(", ") : "none"}`);
  log(`  explorer     ${row.explorer}`);
  log("");

  // Every transaction: succeeded, went to the escrow, and every escrow event is about event #2.
  check(receipt.status === "success", `${action}: receipt status is success`);
  check(same(tx.to, ESCROW), `${action}: sent to AttendanceEscrow ${short(ESCROW)}`);
  check(events.length > 0 && events.every((e) => e.args.eventId === EVENT_ID), `${action}: every PeerProof event is for event #${EVENT_ID}`);
}

const find = (action, name) => rows.find((r) => r.action === action)?.detail.find((e) => e.name === name);
const eventCreated = find("createEvent", "EventCreated");
const registered = find("register", "Registered");
const checkedIn = find("checkIn", "CheckedIn");
const attested = find("attest", "Attested");
const confirmed = find("attest", "Confirmed");
const settled = find("settle", "Settled");
const claimed = find("claim", "Claimed");

check(eventCreated, "createEvent emitted EventCreated");
check(registered, "register emitted Registered");
check(checkedIn, "checkIn emitted CheckedIn");
check(attested && confirmed, "attest emitted both Attested and Confirmed");
check(confirmed && attested && same(confirmed.args.attendee, attested.args.attester) && confirmed.args.viaOrganizer === false,
  "the confirmed attendee is the scanner, confirmed by peers (viaOrganizer = false)");
check(settled && settled.args.confirmed === 1, "Settled.confirmed = 1");
check(settled && settled.args.noShows === 1, "Settled.noShows = 1");
check(settled && settled.args.sharePerAttendee === SHARE, "Settled.sharePerAttendee = 0.0200 MON");
check(claimed && claimed.args.amount === SHARE, "Claimed.amount = 0.0200 MON");
check(claimed && confirmed && same(claimed.args.attendee, confirmed.args.attendee), "the claimant is the confirmed attendee");

if (!json) {
  if (eventCreated) {
    const a = eventCreated.args;
    log(`Event #${EVENT_ID} as created: deposit ${formatEther(a.deposit)} MON · k = ${a.k} · minimum ${a.minQuorum} · capacity ${a.capacity}`);
  }
  if (attested) log(`Attestation: ${short(attested.args.attester)} scanned ${short(attested.args.subject)}`);
  if (settled) {
    log(`Settlement: confirmed ${settled.args.confirmed} · noShows ${settled.args.noShows} · share ${formatEther(settled.args.sharePerAttendee)} MON · sent by ${short(rows.find((r) => r.action === "settle").from)}`);
  }
  if (claimed) log(`Claim: ${short(claimed.args.attendee)} received ${formatEther(claimed.args.amount)} MON`);
  log("");
  for (const c of checks) log(`${c.ok ? "✓" : "✗"} ${c.what}`);
}

const failed = checks.filter((c) => !c.ok).length;
if (json) {
  const plain = (v) => (typeof v === "bigint" ? v.toString() : v);
  console.log(
    JSON.stringify(
      {
        chainId,
        rpcOrigin: endpoint,
        escrow: ESCROW,
        eventId: EVENT_ID.toString(),
        transactions: rows.map(({ detail, ...r }) => ({
          ...r,
          decoded: detail.map((e) => ({ name: e.name, args: Object.fromEntries(Object.entries(e.args).map(([k, v]) => [k, plain(v)])) })),
        })),
        checks,
        passed: failed === 0,
      },
      null,
      2,
    ),
  );
} else {
  log("");
  log(failed ? `${failed} of ${checks.length} checks FAILED` : `All ${checks.length} checks passed. No transaction was sent.`);
}
process.exit(failed ? 1 : 0);
