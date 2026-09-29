/// The walkthrough's one event, for a judge — or anybody — with no wallet, no second account and no
/// room to stand in.
///
/// Illustrative, and labelled as such everywhere it is shown. But built to be *possible*: five
/// people register, four turn up and vouch in a ring — A scans B, B scans C, C scans D, D scans A —
/// and one never arrives. Everything below is derived the way the escrow derives it rather than
/// typed in, so the walkthrough cannot drift into a result the contract could not produce.
///
/// The first brief asked for three people and two confirmed. The contract cannot get there: a pair
/// may attest only once (`pairUsed` is order-blind), and confirmation also needs the person to have
/// vouched for somebody (`gaveCount`), so in a room of two only the one who scanned is confirmed and
/// the other is left to the organizer fallback — the very thing this demo exists to argue against.
///
/// No addresses, hashes, block numbers or explorer links in this file, and none rendered from it:
/// the people are letters, so nothing here can be mistaken for something that happened on a chain.

export type DemoId = "A" | "B" | "C" | "D" | "E";

/// 0.0100 MON, in wei — formatted through the same `mon()` the live pages use.
export const DEMO_DEPOSIT = 10_000_000_000_000_000n;

/// Vouches needed, the escrow's `k`. One, which the contract accepts (`k > 0`, `minQuorum > k`).
export const DEMO_K = 1;

/// Arrival times are wall-clock labels for the story, not chain timestamps.
export const DEMO_PEOPLE: ReadonlyArray<{ id: DemoId; arrived: string | null }> = [
  { id: "A", arrived: "19:02" },
  { id: "B", arrived: "19:05" },
  { id: "C", arrived: "19:11" },
  { id: "D", arrived: "19:14" },
  { id: "E", arrived: null },
];

/// Who scanned whom, in order. Every pair once — the contract refuses a second scan between the
/// same two people in either direction — and every person in the room scans exactly one other.
export const DEMO_SCANS: ReadonlyArray<{ from: DemoId; to: DemoId }> = [
  { from: "A", to: "B" },
  { from: "B", to: "C" },
  { from: "C", to: "D" },
  { from: "D", to: "A" },
];

/// `_maybeConfirm`, restated: vouched for at least `k` times — every scan counts for both people —
/// and having vouched for somebody at least once.
function confirmedIds(): Set<DemoId> {
  const received = new Map<DemoId, number>();
  const gave = new Map<DemoId, number>();
  for (const { from, to } of DEMO_SCANS) {
    received.set(to, (received.get(to) ?? 0) + 1);
    received.set(from, (received.get(from) ?? 0) + 1);
    gave.set(from, (gave.get(from) ?? 0) + 1);
  }
  return new Set(
    DEMO_PEOPLE.map((p) => p.id).filter((id) => (received.get(id) ?? 0) >= DEMO_K && (gave.get(id) ?? 0) > 0),
  );
}

export const DEMO_CONFIRMED = confirmedIds();

/// `settle`, restated: the no-shows' deposits split evenly among the confirmed, on top of their own.
export function demoSettlement() {
  const registered = DEMO_PEOPLE.length;
  const confirmed = DEMO_CONFIRMED.size;
  const unconfirmed = registered - confirmed;
  const total = DEMO_DEPOSIT * BigInt(registered);
  const forfeited = DEMO_DEPOSIT * BigInt(unconfirmed);
  const share = DEMO_DEPOSIT + forfeited / BigInt(confirmed);
  return { registered, confirmed, unconfirmed, total, forfeited, share };
}
