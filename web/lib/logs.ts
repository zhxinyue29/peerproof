import { parseAbiItem, type Address, type Hex } from "viem";
import { DEPLOY_BLOCK, ESCROW_ADDRESS, publicClient } from "@/lib/chain";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import { hasEnvio, readHistoryFromEnvio } from "@/lib/envio";
import { clientFor, logProviders, type LogProvider } from "@/lib/rpcProviders";

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
// One sixteen-call HTTP batch per progress window. Larger concurrent batches are faster in Node,
// but the browser endpoint rejects them intermittently, leaving the public page stuck again.
//
// Both numbers now come from the provider rather than from a module constant, because each
// endpoint caps `eth_getLogs` differently — 100 blocks on Monad's own node, 10 on an Alchemy free
// tier — and a window built from the wrong cap is rejected outright, not merely served slowly.
const windowFor = (provider: LogProvider) => provider.chunk * 16n;

/// Single reads leave room for the event-state poll that shares the public node. Log windows use
/// the client's JSON-RPC batch transport below, so this primarily governs block lookup.
///
/// A rate, not a concurrency cap — the distinction cost a round. `Promise.all` over every chunk was
/// fine when the deployment block was minutes old and there were two of them; nine hours later the
/// span was 108,045 blocks, which at a hundred blocks a request is 1,080 chunks per event type and
/// 4,320 requests fired at once. Every one came back 429, so the page whose entire purpose is
/// letting a sceptic check the numbers showed none.
///
/// Capping in-flight requests at eight does not fix that: eight that each return in 100ms is eighty
/// a second. What has to be bounded is how often a request *starts*.
const MIN_GAP_MS = 200;

let nextSlot = 0;
async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return fn();
}

async function retryRpc<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt >= 3 ||
        !/(?:429|rate.?limit|too many requests|request failed|timed? ?out|network|fetch)/i.test(message)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
    }
  }
}

function rpcRead<T>(fn: () => Promise<T>): Promise<T> {
  return retryRpc(() => rateLimited(fn));
}

function ranges(fromBlock: bigint, toBlock: bigint, chunk: bigint): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    out.push([start, start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n]);
  }
  return out;
}

async function logsIn(
  provider: LogProvider,
  eventId: bigint,
  rs: Array<[bigint, bigint]>,
): Promise<HistoryLog[]> {
  const client = clientFor(provider);
  const batches = await retryRpc(() =>
    Promise.all(
      rs.map(([start, end]) =>
        client.getLogs({
          address: ESCROW_ADDRESS,
          // All four events share the indexed event id, so one RPC call can fetch the complete
          // history for this event. The old reader made four passes over the same block range.
          events: historyEvents as never,
          args: { eventId } as never,
          fromBlock: start,
          toBlock: end,
        }),
      ),
    ),
  );
  return batches.flat() as unknown as HistoryLog[];
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

const historyEvents = [registeredEvent, attestedEvent, confirmedEvent, settledEvent] as const;

type RegLog = {
  eventName: "Registered";
  args: { eventId: bigint; attendee: Address };
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
};
type AttLog = {
  eventName: "Attested";
  args: { eventId: bigint; attester: Address; subject: Address };
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
};
type ConfLog = {
  eventName: "Confirmed";
  args: { eventId: bigint; attendee: Address; viaOrganizer: boolean };
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
};
type SetLog = {
  eventName: "Settled";
  args: { eventId: bigint; confirmed: number; noShows: number; sharePerAttendee: bigint };
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
};
type HistoryLog = RegLog | AttLog | ConfLog | SetLog;

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
  /// Which endpoint inside that reader answered — "envio", or one of the names in
  /// `lib/rpcProviders.ts`. Not shown in the product: a visitor needs to know the record came off
  /// the chain, not which of three URLs served it. It is recorded so that a failure can be
  /// attributed from the console without guessing which endpoint was in play.
  provider: string;
};

type RpcCache = {
  logs: HistoryLog[];
  history: EventHistory;
};

const rpcCache = new Map<string, RpcCache>();

function mergeLogs(current: HistoryLog[], incoming: HistoryLog[]): HistoryLog[] {
  const byId = new Map<string, HistoryLog>();
  for (const log of [...current, ...incoming]) {
    byId.set(`${log.transactionHash}:${log.logIndex}`, log);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
}

function makeHistory(
  eventId: bigint,
  logs: HistoryLog[],
  fromBlock: bigint,
  toBlock: bigint,
  provider: string,
): EventHistory {
  const mine = logs.filter((log) => log.args.eventId === eventId);
  const regs = mine.filter((log): log is RegLog => log.eventName === "Registered");
  const atts = mine.filter((log): log is AttLog => log.eventName === "Attested");
  const confs = mine.filter((log): log is ConfLog => log.eventName === "Confirmed");
  const settles = mine.filter((log): log is SetLog => log.eventName === "Settled");

  const confirmedBy = new Map<string, boolean>();
  for (const c of confs) confirmedBy.set(c.args.attendee.toLowerCase(), c.args.viaOrganizer);

  const participants: Participant[] = regs.map((r) => ({
    address: r.args.attendee,
    confirmed: confirmedBy.has(r.args.attendee.toLowerCase()),
    viaOrganizer: confirmedBy.get(r.args.attendee.toLowerCase()) ?? false,
    block: r.blockNumber,
  }));
  const vouches: Vouch[] = atts.map((a) => ({
    from: a.args.attester,
    to: a.args.subject,
    hash: a.transactionHash,
    block: a.blockNumber,
  }));
  const last = settles.at(-1);

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
    toBlock,
    source: "rpc",
    provider,
  };
}

async function blockAtOrBefore(
  provider: LogProvider,
  timestamp: bigint,
  floor: bigint,
  tip: bigint,
): Promise<bigint> {
  const client = clientFor(provider);
  const readBlock = (blockNumber: bigint) => rpcRead(() => client.getBlock({ blockNumber }));
  const tipBlock = await readBlock(tip);
  if (timestamp > tipBlock.timestamp) return tip + 1n;

  const floorBlock = await readBlock(floor);
  if (timestamp <= floorBlock.timestamp) return floor;

  // Block production is regular enough that interpolation lands close to the target in one read.
  // Correct only in the backwards direction: an early anchor costs a few empty queries, while a
  // late one could omit valid attestations.
  const timeSpan = tipBlock.timestamp - floorBlock.timestamp;
  let candidate =
    floor + ((timestamp - floorBlock.timestamp) * (tip - floor)) / (timeSpan > 0n ? timeSpan : 1n);
  while (candidate > floor) {
    const block = await readBlock(candidate);
    if (block.timestamp <= timestamp) return candidate;
    const secondsLate = block.timestamp - timestamp;
    const step = secondsLate * 4n + 64n;
    candidate = candidate > floor + step ? candidate - step : floor;
  }
  return floor;
}

/// Reads the whole attestation graph for one event, starting at the block the contract was
/// deployed in. `maxBlocks` is a safety valve: if a deployment block was never configured, scan a
/// recent window rather than the whole chain.
export async function readHistoryFromRpc(
  eventId: bigint,
  provider: LogProvider = logProviders()[0],
  maxBlocks = 20_000n,
  onProgress?: (history: EventHistory) => void,
): Promise<EventHistory> {
  const client = clientFor(provider);
  const WINDOW = windowFor(provider);
  const tip = await client.getBlockNumber();
  const floor = DEPLOY_BLOCK > 0n ? DEPLOY_BLOCK : tip > maxBlocks ? tip - maxBlocks : 0n;

  const event = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "getEvent",
    args: [eventId],
  });
  const registeredCount = Number(event.registered);
  const confirmedCount = Number(event.peerConfirmed) + Number(event.orgConfirmed);
  const settled = Number(event.status) === 2;

  // Nobody registered, so there is nothing to find — and `getEvent` answers for an event that does
  // not exist with a zero struct rather than a revert, so this covers a fresh contract and a stale
  // link as well. Reading the whole chain to establish that there is nothing is how this page came
  // to spend 4,320 requests on an empty answer.
  if (registeredCount <= 0) {
    return {
      participants: [], vouches: [], settlement: null,
      fromBlock: tip, toBlock: tip, source: "rpc", provider: provider.name,
    };
  }

  const cacheKey = eventId.toString();
  const cached = rpcCache.get(cacheKey);
  if (cached) {
    onProgress?.(cached.history);
    if (tip <= cached.history.toBlock) return cached.history;
    let logs = cached.logs;
    let history = cached.history;
    for (let start = cached.history.toBlock + 1n; start <= tip; start += WINDOW) {
      const end = start + WINDOW - 1n > tip ? tip : start + WINDOW - 1n;
      logs = mergeLogs(logs, await logsIn(provider, eventId, ranges(start, end, provider.chunk)));
      history = makeHistory(eventId, logs, cached.history.fromBlock, end, provider.name);
      rpcCache.set(cacheKey, { logs, history });
      onProgress?.(history);
    }
    return history;
  }

  // Contract rules put every attestation at or after `attestOpen`. Start there and walk forwards,
  // publishing each small window as it arrives. A live event therefore paints its graph in a few
  // seconds even when the public RPC still needs another minute to verify a long quiet tail.
  const anchor = await blockAtOrBefore(provider, event.attestOpen, floor, tip);
  let logs: HistoryLog[] = [];
  let fromBlock = anchor <= tip ? anchor : tip;
  let toBlock = anchor <= tip ? anchor - 1n : tip;
  /// Publishes when the graph is provably whole, and says so.
  ///
  /// "Whole" is not a guess: the escrow counts its own registrations and confirmations, and both
  /// counters were read at `tip` above. Holding that many of each — plus the `Settled` log when the
  /// contract says the event is settled — means nothing else exists to be found in this window.
  const publish = () => {
    const registrations = logs.filter((log) => log.eventName === "Registered").length;
    const confirmations = logs.filter((log) => log.eventName === "Confirmed").length;
    const hasSettlement = logs.some((log) => log.eventName === "Settled");
    const complete =
      registrations >= registeredCount &&
      confirmations >= confirmedCount &&
      (!settled || hasSettlement);
    if (complete) onProgress?.(makeHistory(eventId, logs, fromBlock, toBlock, provider.name));
    return complete;
  };

  for (let start = anchor; start <= tip; start += WINDOW) {
    const end = start + WINDOW - 1n > tip ? tip : start + WINDOW - 1n;
    logs = mergeLogs(logs, await logsIn(provider, eventId, ranges(start, end, provider.chunk)));
    toBlock = end;
    // Stop the moment the answer is complete, rather than walking on to the tip.
    //
    // For a live event these are the same thing — the anchor is near the tip, so there is barely
    // anything left to walk. For an event that closed weeks ago they are not: measured on event #2,
    // the graph was complete and published at 40s, and the scan then spent another 2h57m and 746
    // requests crossing 1.8M empty blocks before the endpoint gave out. The page had the right
    // answer the whole time and the promise still rejected.
    //
    // Correctness comes from the counters, not from reaching the tip: the contract says how many
    // registrations and confirmations exist as of `tip`, and once this has them all, the remaining
    // blocks cannot contain another one.
    if (publish()) break;
  }

  // Registrations may happen before the doors open. Only walk backwards if the forward pass did
  // not already account for the contract's exact registration count, and stop the moment it does.
  for (let end = anchor > tip ? tip : anchor - 1n; end >= floor; ) {
    const found = logs.filter((log) => log.eventName === "Registered").length;
    if (found >= registeredCount) break;
    const start = end - WINDOW + 1n > floor ? end - WINDOW + 1n : floor;
    logs = mergeLogs(logs, await logsIn(provider, eventId, ranges(start, end, provider.chunk)));
    fromBlock = start;
    toBlock = tip;
    publish();
    if (start === floor) break;
    end = start - 1n;
  }

  const history = makeHistory(eventId, logs, fromBlock, tip, provider.name);
  rpcCache.set(cacheKey, { logs, history });
  onProgress?.(history);
  return history;
}

/// Envio first, logs second. The fallback is not a hedge against Envio being unreliable — it is
/// there because the deployment is removed if it goes idle for 30 days, and the page has to keep
/// verifying after that.
///
/// Failures are swallowed on purpose, but never silently: the reason is logged, and /verify names
/// the reader it ended up using.
export async function readHistory(
  eventId: bigint,
  onProgress?: (history: EventHistory) => void,
): Promise<EventHistory> {
  if (hasEnvio) {
    try {
      return await readHistoryFromEnvio(eventId);
    } catch (err) {
      console.warn("[peerproof] index unavailable, reading logs directly:", err);
    }
  }

  // Then every configured endpoint in turn, widest block window first. One provider being down,
  // rate-limited or hung must not end the read: with a single endpoint, /verify sat on "reading
  // chain events…" for as long as the tab stayed open, because there was nothing else to try.
  //
  // Progress already published by a provider that then fails is not withdrawn. The logs it found
  // were real, and blanking a partly-drawn graph to start again would be a worse answer than the
  // one already on screen.
  //
  // The last failure is rethrown rather than swallowed. A page that quietly renders an empty graph
  // when it could not reach the chain is claiming nobody vouched for anybody.
  const providers = logProviders();
  let last: unknown;
  for (const provider of providers) {
    try {
      return await readHistoryFromRpc(eventId, provider, 20_000n, onProgress);
    } catch (err) {
      last = err;
      console.warn(`[peerproof] logs via ${provider.name} failed, trying the next endpoint:`, err);
    }
  }
  throw last ?? new Error("no log provider configured");
}
