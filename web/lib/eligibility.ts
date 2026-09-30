import type { EventInfo, MyState } from "@/lib/useEvent";

/// Where one attendee stands against the contract's attendance rule, row by row.
///
/// The rule is two conditions, not one: `attestCount >= k` *and* `gaveCount > 0`. A scan credits
/// both people's count but only the scanner's `gaveCount`, so somebody can be scanned all evening,
/// reach the count, and still not be confirmed. That is exactly what happened to one of the two
/// people in the external pilot, and the old screen — one "vouched for you" counter — could not
/// have told them. Each condition gets its own row here, and the deposit row says what the contract
/// will actually do with the money in the event's current state, never more than that.
///
/// Kept free of React and i18n so every branch can be checked without a chain, a wallet or a
/// browser. The row that says "ready to claim" to somebody the contract would refuse is the one
/// bug this screen must not have.

export type Phase = "loading" | "registering" | "waiting" | "open" | "closed";

export type CheckInState = "done" | "todo" | "notOpen" | "missed";
export type InitiatedState = "done" | "todo" | "blocked" | "missed";
export type ReceivedState = "done" | "short";
export type OutcomeState =
  | "openConfirmed"
  | "openNotConfirmed"
  | "openBelowQuorum"
  | "settledReady"
  | "settledClaimed"
  | "settledNone"
  | "cancelledRefundable"
  | "cancelledRefunded";

export type Eligibility = {
  checkIn: CheckInState;
  initiated: InitiatedState;
  received: ReceivedState;
  outcome: OutcomeState;
  /// How many more counted confirmations reach `k`. Zero once reached.
  missing: number;
  /// Confirmed without meeting both peer conditions, which only `organizerCheckIn` can do.
  viaFallback: boolean;
  /// Nothing about this row can change any more: the window has shut or the event is final.
  final: boolean;
};

export function eligibility(
  ev: Pick<EventInfo, "k" | "status" | "registered" | "minQuorum" | "registerDeadline">,
  me: Pick<MyState, "checkedInAt" | "given" | "received" | "confirmed" | "claimed">,
  phase: Phase,
  nowSec: number,
): Eligibility {
  const settled = ev.status === 2;
  const cancelled = ev.status === 1;
  // Status first: a settled or cancelled event is final whatever the clock says.
  const final = settled || cancelled || phase === "closed";
  const open = !final && phase === "open";
  const checkedIn = me.checkedInAt > 0;

  const checkIn: CheckInState = checkedIn ? "done" : final ? "missed" : open ? "todo" : "notOpen";
  const initiated: InitiatedState =
    me.given > 0 ? "done" : final ? "missed" : open && checkedIn ? "todo" : "blocked";
  const received: ReceivedState = me.received >= ev.k ? "done" : "short";

  // Registration can no longer grow once its deadline passes, so a room still short of its
  // minimum then can never settle — `settle` reverts with QuorumNotMet — and the only way out is
  // `cancelForQuorum`, which refunds everybody. Before the deadline, walk-ins can still fix it.
  const belowQuorum = ev.registered < ev.minQuorum && nowSec >= Number(ev.registerDeadline);

  let outcome: OutcomeState;
  if (cancelled) outcome = me.claimed ? "cancelledRefunded" : "cancelledRefundable";
  else if (settled) outcome = me.confirmed ? (me.claimed ? "settledClaimed" : "settledReady") : "settledNone";
  else if (belowQuorum) outcome = "openBelowQuorum";
  else outcome = me.confirmed ? "openConfirmed" : "openNotConfirmed";

  return {
    checkIn,
    initiated,
    received,
    outcome,
    missing: Math.max(0, ev.k - me.received),
    viaFallback: me.confirmed && (me.given === 0 || me.received < ev.k),
    final,
  };
}
