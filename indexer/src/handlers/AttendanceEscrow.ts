import { indexer } from "envio";

/// Handlers mirror the contract's events one-for-one. Nothing here re-derives a verdict: presence
/// is whatever `Confirmed` said, so the index can never disagree with the chain.
///
/// API note: this is the current `indexer.onEvent` form. Blog posts still showing
/// `Contract.Event.handler(...)` predate it.

const pid = (eventId: bigint, address: string) => `${eventId}-${address.toLowerCase()}`;

indexer.onEvent(
  { contract: "AttendanceEscrow", event: "EventCreated" },
  async ({ event, context }) => {
    context.Event.set({
      id: event.params.eventId.toString(),
      organizer: event.params.organizer.toLowerCase(),
      deposit: event.params.deposit,
      capacity: Number(event.params.capacity),
      minQuorum: Number(event.params.minQuorum),
      k: Number(event.params.k),
      registerDeadline: event.params.registerDeadline,
      attestOpen: event.params.attestOpen,
      attestClose: event.params.attestClose,
      registeredCount: 0,
      confirmedCount: 0,
      status: 0,
      sharePerAttendee: undefined,
      noShows: undefined,
      settledTxHash: undefined,
    });
  },
);

indexer.onEvent({ contract: "AttendanceEscrow", event: "Registered" }, async ({ event, context }) => {
  const id = event.params.eventId.toString();
  const ev = await context.Event.get(id);
  if (ev) context.Event.set({ ...ev, registeredCount: ev.registeredCount + 1 });

  context.Participant.set({
    id: pid(event.params.eventId, event.params.attendee),
    event_id: id,
    address: event.params.attendee.toLowerCase(),
    attestKey: event.params.attestKey.toLowerCase(),
    vouchesReceived: 0,
    vouchesGiven: 0,
    confirmed: false,
    confirmedViaOrganizer: false,
    claimed: false,
    claimedAmount: undefined,
    registeredAt: BigInt(event.block.timestamp),
    registeredTxHash: event.transaction.hash,
    checkedInAt: undefined,
    checkedInTxHash: undefined,
  });
});

indexer.onEvent({ contract: "AttendanceEscrow", event: "CheckedIn" }, async ({ event, context }) => {
  const p = await context.Participant.get(pid(event.params.eventId, event.params.attendee));
  // The contract refuses check-in from an unregistered address, so a missing participant here
  // would mean the index had fallen behind its own ordering rather than a real gap.
  if (!p) return;
  context.Participant.set({
    ...p,
    checkedInAt: BigInt(event.block.timestamp),
    checkedInTxHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "AttendanceEscrow", event: "Attested" }, async ({ event, context }) => {
  const { eventId, attester, subject, epoch } = event.params;

  context.Vouch.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    event_id: eventId.toString(),
    attester: attester.toLowerCase(),
    subject: subject.toLowerCase(),
    epoch,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  // One scan credits both parties — the same rule the contract applies.
  const subj = await context.Participant.get(pid(eventId, subject));
  if (subj) {
    context.Participant.set({ ...subj, vouchesReceived: subj.vouchesReceived + 1 });
  }
  const att = await context.Participant.get(pid(eventId, attester));
  if (att) {
    context.Participant.set({
      ...att,
      vouchesReceived: att.vouchesReceived + 1,
      vouchesGiven: att.vouchesGiven + 1,
    });
  }
});

indexer.onEvent({ contract: "AttendanceEscrow", event: "Confirmed" }, async ({ event, context }) => {
  const p = await context.Participant.get(pid(event.params.eventId, event.params.attendee));
  if (p) {
    context.Participant.set({
      ...p,
      confirmed: true,
      confirmedViaOrganizer: event.params.viaOrganizer,
    });
  }
  const ev = await context.Event.get(event.params.eventId.toString());
  if (ev) context.Event.set({ ...ev, confirmedCount: ev.confirmedCount + 1 });
});

indexer.onEvent(
  { contract: "AttendanceEscrow", event: "EventCancelled" },
  async ({ event, context }) => {
    const ev = await context.Event.get(event.params.eventId.toString());
    if (ev) context.Event.set({ ...ev, status: 1 });
  },
);

indexer.onEvent({ contract: "AttendanceEscrow", event: "Settled" }, async ({ event, context }) => {
  const ev = await context.Event.get(event.params.eventId.toString());
  if (ev) {
    context.Event.set({
      ...ev,
      status: 2,
      sharePerAttendee: event.params.sharePerAttendee,
      noShows: Number(event.params.noShows),
      settledTxHash: event.transaction.hash,
    });
  }
});

indexer.onEvent({ contract: "AttendanceEscrow", event: "Claimed" }, async ({ event, context }) => {
  const p = await context.Participant.get(pid(event.params.eventId, event.params.attendee));
  if (p) context.Participant.set({ ...p, claimed: true, claimedAmount: event.params.amount });
});
