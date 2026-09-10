import { parseAbiItem, type Address, type Hex } from "viem";
import { DEPLOY_BLOCK, ESCROW_ADDRESS, logsClient, LOGS_CHUNK } from "@/lib/chain";
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

/// Chunks are fetched in parallel rather than in sequence — the whole point of the higher-limit
/// endpoint is that there are only a couple of them, and waiting for each in turn would throw that
/// away.
async function chunkedLogs<T>(
  event: ReturnType<typeof parseAbiItem>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<T[]> {
  const ranges: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = start + CHUNK - 1n > toBlock ? toBlock : start + CHUNK - 1n;
    ranges.push([start, end]);
  }
  const batches = await Promise.all(
    ranges.map(([start, end]) =>
      logsClient.getLogs({
        address: ESCROW_ADDRESS,
        event: event as never,
        fromBlock: start,
        toBlock: end,
      }),
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
export type Participant = { address: Address; confirmed: boolean; viaOrganizer: boolean };

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
  const fromBlock =
    DEPLOY_BLOCK > 0n ? DEPLOY_BLOCK : tip > maxBlocks ? tip - maxBlocks : 0n;

  type RegLog = { args: { eventId: bigint; attendee: Address } };
  type AttLog = { args: { eventId: bigint; attester: Address; subject: Address }; transactionHash: Hex; blockNumber: bigint };
  type ConfLog = { args: { eventId: bigint; attendee: Address; viaOrganizer: boolean } };
  type SetLog = { args: { eventId: bigint; confirmed: number; noShows: number; sharePerAttendee: bigint }; transactionHash: Hex };

  const [regs, atts, confs, settles] = await Promise.all([
    chunkedLogs<RegLog>(registeredEvent, fromBlock, tip),
    chunkedLogs<AttLog>(attestedEvent, fromBlock, tip),
    chunkedLogs<ConfLog>(confirmedEvent, fromBlock, tip),
    chunkedLogs<SetLog>(settledEvent, fromBlock, tip),
  ]);

  const mine = <T extends { args: { eventId: bigint } }>(xs: T[]) =>
    xs.filter((x) => x.args.eventId === eventId);

  const confirmedBy = new Map<string, boolean>();
  for (const c of mine(confs)) confirmedBy.set(c.args.attendee.toLowerCase(), c.args.viaOrganizer);

  const participants: Participant[] = mine(regs).map((r) => ({
    address: r.args.attendee,
    confirmed: confirmedBy.has(r.args.attendee.toLowerCase()),
    viaOrganizer: confirmedBy.get(r.args.attendee.toLowerCase()) ?? false,
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
