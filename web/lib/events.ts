import { attendanceEscrowAbi as abi } from "@/lib/abi";
import { ESCROW_ADDRESS, chainNowMs, hasDeployment, publicClient } from "@/lib/chain";
import { readListings, type Listing } from "@/lib/directory";

/// Everything the directory page shows about one event, joined from the two contracts: the escrow
/// decides the numbers, the directory supplies the words.
export type EventSummary = {
  id: bigint;
  organizer: `0x${string}`;
  deposit: bigint;
  capacity: number;
  minQuorum: number;
  k: number;
  registered: number;
  confirmed: number;
  registerDeadline: bigint;
  attestOpen: bigint;
  attestClose: bigint;
  status: number;
  listing: Listing;
  phase: Phase;
};

export type Phase = "registering" | "waiting" | "live" | "closed" | "cancelled" | "settled";

export function phaseOfRaw(
  now: number,
  registerDeadline: bigint,
  attestOpen: bigint,
  attestClose: bigint,
  status: number,
): Phase {
  if (status === 1) return "cancelled";
  if (status === 2) return "settled";
  if (now < Number(registerDeadline)) return "registering";
  if (now < Number(attestOpen)) return "waiting";
  if (now < Number(attestClose)) return "live";
  return "closed";
}

/// Reads every event. One `getEvent` per event, because the escrow has no batch read — it was
/// written before there was a directory page, and adding one would mean redeploying the contract
/// that holds deposits. Descriptions do come back in a single call.
///
/// Newest first: an event someone can still join is more use than one that finished last month.
export async function readAllEvents(): Promise<EventSummary[]> {
  if (!hasDeployment) return [];

  const next = (await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi,
    functionName: "nextEventId",
  })) as bigint;
  if (next <= 1n) return [];

  const ids = Array.from({ length: Number(next - 1n) }, (_, i) => BigInt(i + 1));

  const [raws, listings] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        publicClient.readContract({
          address: ESCROW_ADDRESS,
          abi,
          functionName: "getEvent",
          args: [id],
        }),
      ),
    ),
    readListings(1n, next),
  ]);

  const now = Math.floor(chainNowMs() / 1000);

  return ids
    .map((id, i) => {
      const r = raws[i] as {
        organizer: `0x${string}`;
        deposit: bigint;
        capacity: number;
        minQuorum: number;
        k: number;
        registered: number;
        peerConfirmed: number;
        orgConfirmed: number;
        registerDeadline: bigint;
        attestOpen: bigint;
        attestClose: bigint;
        status: number;
      };
      return {
        id,
        organizer: r.organizer,
        deposit: r.deposit,
        capacity: Number(r.capacity),
        minQuorum: Number(r.minQuorum),
        k: Number(r.k),
        registered: Number(r.registered),
        confirmed: Number(r.peerConfirmed) + Number(r.orgConfirmed),
        registerDeadline: r.registerDeadline,
        attestOpen: r.attestOpen,
        attestClose: r.attestClose,
        status: Number(r.status),
        listing: listings[i] ?? { title: "", blurb: "", url: "", updatedAt: 0n },
        phase: phaseOfRaw(now, r.registerDeadline, r.attestOpen, r.attestClose, Number(r.status)),
      };
    })
    .reverse();
}

/// Finished events are kept rather than dropped — the public record is the product's argument, and
/// hiding settled events would hide the evidence. They are separated so that what someone can act
/// on is never below what they cannot.
export function splitByActionable(events: EventSummary[]): {
  open: EventSummary[];
  past: EventSummary[];
} {
  const open = events.filter((e) => e.phase === "registering" || e.phase === "waiting" || e.phase === "live");
  const past = events.filter((e) => !open.includes(e));
  return { open, past };
}
