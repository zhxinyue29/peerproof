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
      listing: { title: "Monad Builders Meetup", blurb: "", url: "", updatedAt: 0n },
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
      listing: { title: "DeFi x AI Workshop", blurb: "", url: "", updatedAt: 0n },
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
      listing: { title: "RWA & Onchain Finance", blurb: "", url: "", updatedAt: 0n },
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
      listing: { title: "ZK Proofs 101", blurb: "", url: "", updatedAt: 0n },
      phase: "registering",
    },
  ];
}
