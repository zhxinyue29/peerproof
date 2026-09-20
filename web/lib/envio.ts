import type { Address, Hex } from "viem";
import { DEPLOY_BLOCK } from "@/lib/chain";
import type { EventHistory, Participant, Vouch } from "@/lib/logs";

/// Reads the attestation graph from an Envio HyperIndex deployment.
///
/// This exists because Monad's public endpoints cap `eth_getLogs` at 100 blocks per request, so
/// rebuilding the graph over a real event's block span costs twenty-odd round trips. One indexed
/// query replaces all of them.
///
/// It is deliberately allowed to fail. `readHistory` in lib/logs.ts calls this first and falls
/// back to reading logs directly, because Envio's free tier removes inactive deployments after 30
/// days and the judging window outlasts that. So every failure path here throws rather than
/// returning something partial — a half-built graph rendered as fact would be worse than a slower
/// page.
const ENVIO_URL = process.env.NEXT_PUBLIC_ENVIO_URL ?? "";

export const hasEnvio = ENVIO_URL.length > 0;

/// Long enough for a cold Hasura container to answer, short enough that nobody watches a spinner
/// while the fallback waits its turn.
const TIMEOUT_MS = 6_000;

const QUERY = `
  query PeerProofHistory($eventId: String!) {
    chain_metadata {
      start_block
      latest_processed_block
    }
    Event(where: { id: { _eq: $eventId } }) {
      sharePerAttendee
      noShows
      confirmedCount
      settledTxHash
    }
    Participant(where: { event_id: { _eq: $eventId } }, order_by: { registeredAt: asc }) {
      address
      confirmed
      confirmedViaOrganizer
    }
    Vouch(where: { event_id: { _eq: $eventId } }, order_by: { blockNumber: asc }) {
      attester
      subject
      txHash
      blockNumber
    }
  }
`;

type RawEvent = {
  sharePerAttendee: string | null;
  noShows: number | null;
  confirmedCount: number;
  settledTxHash: string | null;
};
type RawParticipant = { address: string; confirmed: boolean; confirmedViaOrganizer: boolean };
type RawVouch = { attester: string; subject: string; txHash: string; blockNumber: number };
type RawMeta = { start_block: number; latest_processed_block: number };

/// A stalled indexer answers 200 with empty arrays, which is a *successful* response — so the
/// caller's try/catch never fires and /verify renders "nobody registered" for an event that is
/// full. That is worse than an error, because it is indistinguishable from the truth.
///
/// This was not hypothetical: the first deployment sat at latest_processed_block = -1 for half an
/// hour, having silently chosen plain RPC over HyperSync, and served exactly that empty response.
///
/// So read the indexer's own progress and refuse to answer until it has passed the block the
/// contract was deployed in. Throwing sends the caller to the direct-RPC reader.
function assertSynced(meta: RawMeta[]): void {
  const chain = meta[0];
  if (!chain) throw new Error("Envio: no chain metadata — indexer has not started");
  if (chain.latest_processed_block < chain.start_block) {
    throw new Error(
      `Envio: still syncing (${chain.latest_processed_block} < ${chain.start_block})`,
    );
  }
}

/// Hasura answers 200 with an `errors` array rather than an HTTP error code, and a misconfigured
/// deployment answers with `data: null`. Both have to be caught explicitly or they surface as
/// "cannot read property of undefined" three frames away.
function unwrap(body: unknown): {
  chain_metadata: RawMeta[];
  Event: RawEvent[];
  Participant: RawParticipant[];
  Vouch: RawVouch[];
} {
  if (typeof body !== "object" || body === null) throw new Error("Envio: response was not an object");
  const b = body as { data?: unknown; errors?: Array<{ message?: string }> };
  if (b.errors?.length) throw new Error(`Envio: ${b.errors[0]?.message ?? "GraphQL error"}`);
  const d = b.data as Record<string, unknown> | null | undefined;
  if (!d) throw new Error("Envio: response had no data");
  for (const k of ["chain_metadata", "Event", "Participant", "Vouch"]) {
    if (!Array.isArray(d[k])) {
      throw new Error(`Envio: schema does not match — is the deployment on this contract? (${k})`);
    }
  }
  return d as unknown as {
    chain_metadata: RawMeta[];
    Event: RawEvent[];
    Participant: RawParticipant[];
    Vouch: RawVouch[];
  };
}

export async function readHistoryFromEnvio(eventId: bigint): Promise<EventHistory> {
  if (!hasEnvio) throw new Error("Envio: no endpoint configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await fetch(ENVIO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { eventId: eventId.toString() } }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Envio: HTTP ${res.status}`);
    body = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const {
    chain_metadata: meta,
    Event: events,
    Participant: rawParticipants,
    Vouch: rawVouches,
  } = unwrap(body);

  // Before trusting empty arrays, check they mean "nothing happened" and not "nothing read yet".
  assertSynced(meta);

  const participants: Participant[] = rawParticipants.map((p) => ({
    address: p.address as Address,
    confirmed: p.confirmed,
    viaOrganizer: p.confirmedViaOrganizer,
    // The indexer's Participant entity has no registration block. `null` rather than 0n, so a
    // chart can tell "we do not know when" from "at the very start" — the second would draw every
    // registration as having happened before the event opened.
    block: null,
  }));

  const vouches: Vouch[] = rawVouches.map((v) => ({
    from: v.attester as Address,
    to: v.subject as Address,
    hash: v.txHash as Hex,
    block: BigInt(v.blockNumber),
  }));

  // An unsettled event has no share and no hash. Treating a partially-populated row as a
  // settlement would print an arithmetic panel for money that has not moved.
  const ev = events[0];
  const settled =
    ev && ev.settledTxHash && ev.sharePerAttendee !== null
      ? {
          confirmed: ev.confirmedCount,
          noShows: ev.noShows ?? 0,
          sharePerAttendee: BigInt(ev.sharePerAttendee),
          hash: ev.settledTxHash as Hex,
        }
      : null;

  // The index does not track a scan range — it has no gaps to disclose. Report the span the data
  // actually covers rather than inventing a window that was never scanned.
  const highest = vouches.reduce((m, v) => (v.block > m ? v.block : m), DEPLOY_BLOCK);

  return {
    participants,
    vouches,
    settlement: settled,
    fromBlock: DEPLOY_BLOCK,
    toBlock: highest,
    source: "envio",
  };
}
