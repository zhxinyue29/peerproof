import type { EventSummary } from "@/lib/events";

/// Four events that do not exist, for the row that has nothing real in it yet.
///
/// The listing row is part of the product and has to be designable before anybody has opened an
/// event on this contract — waiting for real data to build the thing that displays real data is
/// backwards. So this fills it, and every card built from it is marked on its face as a sample.
///
/// The marking is the whole reason this is acceptable. An unlabelled invented event on the page
/// that argues nothing here is invented would be the worst single thing in this codebase; a
/// labelled one is a mockup, which is what every empty state in every product is.
///
/// Built from the same `EventSummary` the chain produces, not a parallel shape, so the row renders
/// through exactly the same component and the same code path. The day a real event appears these
/// disappear and nothing else changes — which is also what stops this from rotting: a field added
/// to `EventSummary` breaks this file at compile time rather than quietly skipping it.
///
/// Ids are negative. Nothing on chain can collide with them, and anything that does reach a lookup
/// with one is visibly wrong rather than subtly pointing at event 1.
function at(hoursFromNow: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + Math.round(hoursFromNow * 3600));
}

export function sampleEvents(): EventSummary[] {
  const base = {
    organizer: "0x0000000000000000000000000000000000000000" as const,
    status: 0,
    confirmed: 0,
    minQuorum: 5,
    k: 3,
  };

  // `tags: ""` throughout. These four are placeholders shown before a chain answers, and nothing
  // on any screen renders a tag — giving them English tag strings put untranslatable prose into
  // the bundle to satisfy a type. The field exists; the sample does not need to fill it.
  return [
    {
      ...base,
      id: -1n,
      deposit: 10_000000000000000000n,
      capacity: 200,
      registered: 128,
      registerDeadline: at(30),
      attestOpen: at(30),
      attestClose: at(34),
      listing: { title: "Monad Builders Meetup", blurb: "", url: "", tags: "", cover: "", venue: "Tokyo, Japan", updatedAt: 0n },
      phase: "registering",
    },
    {
      ...base,
      id: -2n,
      deposit: 5_000000000000000000n,
      capacity: 120,
      registered: 85,
      registerDeadline: at(74),
      attestOpen: at(74),
      attestClose: at(77),
      listing: { title: "DeFi x AI Workshop", blurb: "", url: "", tags: "", cover: "", venue: "Singapore", updatedAt: 0n },
      phase: "registering",
    },
    {
      ...base,
      id: -3n,
      deposit: 8_000000000000000000n,
      capacity: 90,
      registered: 64,
      registerDeadline: at(122),
      attestOpen: at(122),
      attestClose: at(125),
      listing: { title: "RWA & Onchain Finance", blurb: "", url: "", tags: "", cover: "", venue: "Seoul, Korea", updatedAt: 0n },
      phase: "registering",
    },
    {
      ...base,
      id: -4n,
      deposit: 7_000000000000000000n,
      capacity: 150,
      registered: 120,
      registerDeadline: at(170),
      attestOpen: at(170),
      attestClose: at(172),
      listing: { title: "ZK Proofs 101", blurb: "", url: "", tags: "", cover: "", venue: "Online", updatedAt: 0n },
      phase: "registering",
    },
  ];
}

/// The same four events, in the shape the detail page reads.
///
/// `/events` could show samples and `/event` could not, so the listing was designable and the screen
/// it leads to was a permanent "no such event" — which is the screen somebody spends the most time
/// on and the one carrying the deposit, the rules and the join button. Designing the cards while
/// their destination stayed unbuildable is backwards for the same reason the row itself was.
///
/// Reached only by a negative id, which nothing on chain can produce, and the page it feeds says
/// "sample" across the top. A real event is a different id and takes a different path through
/// `useEvent` entirely — so the day one exists, none of this is in the way.
export function sampleEventInfo(id: bigint) {
  const e = sampleEvents().find((s) => s.id === id);
  if (!e) return null;
  return {
    organizer: e.organizer,
    k: e.k,
    deposit: e.deposit,
    capacity: e.capacity,
    minQuorum: e.minQuorum,
    registerDeadline: e.registerDeadline,
    attestOpen: e.attestOpen,
    attestClose: e.attestClose,
    registered: e.registered,
    confirmed: e.confirmed,
    peerConfirmed: e.confirmed,
    status: e.status,
    // Nothing has settled, so the per-head share of the forfeited pot is not a number yet. Zero is
    // the truth here rather than a placeholder — the same value a real open event reports.
    sharePerAttendee: 0n,
  };
}

/// Sample ids are negative; the escrow's are 1 and up.
export function isSampleId(id: bigint) {
  return id < 0n;
}

export function sampleListing(id: bigint) {
  return sampleEvents().find((s) => s.id === id)?.listing ?? null;
}
