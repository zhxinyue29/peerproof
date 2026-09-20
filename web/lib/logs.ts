import { parseAbiItem, type Address, type Hex } from "viem";
import { DEPLOY_BLOCK, ESCROW_ADDRESS, logsClient, LOGS_CHUNK, publicClient } from "@/lib/chain";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import { hasEnvio, readHistoryFromEnvio } from "@/lib/envio";

/// The direct-RPC reader, and the fallback behind Envio.
///
/// Monad caps `eth_getLogs` per request, so reconstructing an attestation graph from logs has to
/// be chunked. The cap is 100 blocks on the default endpoint but 1,000 on Alchemy's and Ankr's,
/// and at 300ms blocks a ten-minute window spans roughly 2,000 — which is the reason to index at
/// all. Reading through the higher-limit endpoint and fetching chunks in parallel keeps this path
/// usable when the index is not.
///
/// Both readers stay because Envio's free tier removes inactive deployments after 30 days and the
/// judging window outlasts that. A verification page that goes blank is worse than a slower one.
const CHUNK = LOGS_CHUNK;

/// The endpoint allows fifteen requests a second. This starts at most twelve.
///
/// A rate, not a concurrency cap — the distinction cost a round. `Promise.all` over every chunk was
/// fine when the deployment block was minutes old and there were two of them; nine hours later the
/// span was 108,045 blocks, which at a hundred blocks a request is 1,080 chunks per event type and
/// 4,320 requests fired at once. Every one came back 429, so the page whose entire purpose is
/// letting a sceptic check the numbers showed none.
///
/// Capping in-flight requests at eight does not fix that: eight that each return in 100ms is eighty
/// a second. What has to be bounded is how often a request *starts*.
const MIN_GAP_MS = 80;

let nextSlot = 0;
async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return fn();
}

function ranges(fromBlock: bigint, toBlock: bigint): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    out.push([start, start + CHUNK - 1n > toBlock ? toBlock : start + CHUNK - 1n]);
  }
  return out;
}

async function logsIn<T>(
  event: ReturnType<typeof parseAbiItem>,
  rs: Array<[bigint, bigint]>,
): Promise<T[]> {
  const batches = await Promise.all(
    rs.map(([start, end]) =>
      rateLimited(() =>
        logsClient.getLogs({
          address: ESCROW_ADDRESS,
          event: event as never,
          fromBlock: start,
          toBlock: end,
        }),
      ),
    ),
  );
  return batches.flat() as unknown as T[];
}

const registeredEvent = parseAbiItem(
  "event Registered(uint256 indexed eventId, address indexed attendee, address attestKey)",
);
const attestedEvent = parseAbiItem(
  "event Attested(uint256 indexed eventId, address indexed attester, address indexed subject, uint64 epoch)",
);
const confirmedEvent = parseAbiItem(
  "event Confirmed(uint256 indexed eventId, address indexed attendee, bool viaOrganizer)",
);
const settledEvent = parseAbiItem(
  "event Settled(uint256 indexed eventId, uint32 confirmed, uint32 noShows, uint256 sharePerAttendee)",
);

export type Vouch = { from: Address; to: Address; hash: Hex; block: bigint };
export type Participant = {
  address: Address;
  confirmed: boolean;
  viaOrganizer: boolean;
  /// The block their registration landed in. `null` from the indexer, which does not return it —
  /// so anything drawing registrations against time has to cope with not knowing, rather than
  /// assuming zero and putting every registration at the start of the window.
  block: bigint | null;
};

export type EventHistory = {
  participants: Participant[];
  vouches: Vouch[];
  settlement: { confirmed: number; noShows: number; sharePerAttendee: bigint; hash: Hex } | null;
  fromBlock: bigint;
  toBlock: bigint;
  /// Which reader answered. Surfaced on /verify rather than kept internal: a page whose whole
  /// claim is "check this yourself" should say where its numbers came from.
  source: "envio" | "rpc";
};

/// Reads the whole attestation graph for one event, starting at the block the contract was
/// deployed in. `maxBlocks` is a safety valve: if a deployment block was never configured, scan a
/// recent window rather than the whole chain.
export async function readHistoryFromRpc(
  eventId: bigint,
  maxBlocks = 20_000n,
): Promise<EventHistory> {
  const tip = await logsClient.getBlockNumber();
  const floor = DEPLOY_BLOCK > 0n ? DEPLOY_BLOCK : tip > maxBlocks ? tip - maxBlocks : 0n;

  type RegLog = { args: { eventId: bigint; attendee: Address }; blockNumber: bigint };
  type AttLog = { args: { eventId: bigint; attester: Address; subject: Address }; transactionHash: Hex; blockNumber: bigint };
  type ConfLog = { args: { eventId: bigint; attendee: Address; viaOrganizer: boolean } };
  type SetLog = { args: { eventId: bigint; confirmed: number; noShows: number; sharePerAttendee: bigint }; transactionHash: Hex };

  // Backwards from the tip, a window at a time, stopping as soon as every registration this event
  // has is accounted for.
  //
  // An event's logs all sit in the stretch of chain it was alive for, and that stretch is near the
  // tip while it matters. Scanning from the deployment block instead meant the work grew with the
  // age of the contract rather than with the size of the event: the same ten-minute meetup costs
  // four requests on its opening day and twenty thousand a month later, for identical output. The
  // escrow already knows how many people registered, so there is a cheap, exact place to stop.
  //
  // An event whose window has long passed still falls through to the full span — correctly, since
  // its logs really are back there. That case is what the indexer is for; this is the fallback,
  // and a slow correct answer beats a fast wrong one.
  const registeredCount = await publicClient
    .readContract({ address: ESCROW_ADDRESS, abi, functionName: "getEvent", args: [eventId] })
    .then((e) => Number((e as { registered: number }).registered))
    .catch(() => -1);

  // Nobody registered, so there is nothing to find — and `getEvent` answers for an event that does
  // not exist with a zero struct rather than a revert, so this covers a fresh contract and a stale
  // link as well. Reading the whole chain to establish that there is nothing is how this page came
  // to spend 4,320 requests on an empty answer.
  if (registeredCount <= 0) {
    return { participants: [], vouches: [], settlement: null, fromBlock: tip, toBlock: tip, source: "rpc" };
  }

  // Sixteen chunks a pass, not sixty-four. The window is how much work a read costs when it
  // succeeds immediately, and at a hundred blocks a chunk this is roughly eight minutes of chain —
  // wide enough that a live event's registrations are usually all inside the first pass, narrow
  // enough that a pass is a few seconds rather than twenty. It walks further back when it has to.
  const WINDOW = CHUNK * 16n;
  let fromBlock = tip;
  let regs: RegLog[] = [];
  let scanned: Array<[bigint, bigint]> = [];
  for (let end = tip; end >= floor; ) {
    const start = end - WINDOW + 1n > floor ? end - WINDOW + 1n : floor;
    const rs = ranges(start, end);
    scanned = rs.concat(scanned);
    regs = (await logsIn<RegLog>(registeredEvent, rs)).concat(regs);
    fromBlock = start;
    const found = regs.filter((r) => r.args.eventId === eventId).length;
    if (registeredCount >= 0 && found >= registeredCount) break;
    if (start === floor) break;
    end = start - 1n;
  }

  const [atts, confs, settles] = await Promise.all([
    logsIn<AttLog>(attestedEvent, scanned),
    logsIn<ConfLog>(confirmedEvent, scanned),
    logsIn<SetLog>(settledEvent, scanned),
  ]);

  const mine = <T extends { args: { eventId: bigint } }>(xs: T[]) =>
    xs.filter((x) => x.args.eventId === eventId);

  const confirmedBy = new Map<string, boolean>();
  for (const c of mine(confs)) confirmedBy.set(c.args.attendee.toLowerCase(), c.args.viaOrganizer);

  const participants: Participant[] = mine(regs).map((r) => ({
    address: r.args.attendee,
    confirmed: confirmedBy.has(r.args.attendee.toLowerCase()),
    viaOrganizer: confirmedBy.get(r.args.attendee.toLowerCase()) ?? false,
    block: r.blockNumber,
  }));

  const vouches: Vouch[] = mine(atts).map((a) => ({
    from: a.args.attester,
    to: a.args.subject,
    hash: a.transactionHash,
    block: a.blockNumber,
  }));

  const last = mine(settles).at(-1);
  return {
    participants,
    vouches,
    settlement: last
      ? {
          confirmed: Number(last.args.confirmed),
          noShows: Number(last.args.noShows),
          sharePerAttendee: last.args.sharePerAttendee,
          hash: last.transactionHash,
        }
      : null,
    fromBlock,
    toBlock: tip,
    source: "rpc",
  };
}

/// Envio first, logs second. The fallback is not a hedge against Envio being unreliable — it is
/// there because the deployment is removed if it goes idle for 30 days, and the page has to keep
/// verifying after that.
///
/// Failures are swallowed on purpose, but never silently: the reason is logged, and /verify names
/// the reader it ended up using.
export async function readHistory(eventId: bigint): Promise<EventHistory> {
  if (hasEnvio) {
    try {
      return await readHistoryFromEnvio(eventId);
    } catch (err) {
      console.warn("[peerproof] index unavailable, reading logs directly:", err);
    }
  }
  return readHistoryFromRpc(eventId);
}
