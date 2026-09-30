// Unit tests for lib/eligibility.ts: what /floor tells an attendee about their standing, and when it
// offers the permissionless quorum cancellation.
//
//   npm test            # from web/
//
// Pure functions, no chain and no browser. Node strips the TypeScript types on import (Node 24+);
// the one import in eligibility.ts is type-only, so it is erased rather than resolved.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canCancelForQuorum, eligibility } from "../lib/eligibility.ts";

const NOW = 1_800_000_000;
const ev = (over = {}) => ({
  k: 2,
  status: 0,
  registered: 5,
  minQuorum: 3,
  registerDeadline: BigInt(NOW - 60),
  ...over,
});
const me = (over = {}) => ({ checkedInAt: 0, given: 0, received: 0, confirmed: false, claimed: false, ...over });

describe("canCancelForQuorum — the three conditions the contract checks", () => {
  test("offered: open, registration closed, below the minimum", () => {
    assert.equal(canCancelForQuorum(ev({ registered: 2, minQuorum: 3 }), NOW), true);
  });
  test("offered from the deadline itself: the contract only refuses before it", () => {
    assert.equal(canCancelForQuorum(ev({ registered: 1, registerDeadline: BigInt(NOW) }), NOW), true);
  });
  test("not before the registration deadline — walk-ins can still reach the minimum", () => {
    assert.equal(canCancelForQuorum(ev({ registered: 1, registerDeadline: BigInt(NOW + 1) }), NOW), false);
  });
  test("not once the minimum is met", () => {
    assert.equal(canCancelForQuorum(ev({ registered: 3, minQuorum: 3 }), NOW), false);
    assert.equal(canCancelForQuorum(ev({ registered: 4, minQuorum: 3 }), NOW), false);
  });
  test("not once the event is cancelled or settled", () => {
    assert.equal(canCancelForQuorum(ev({ registered: 1, status: 1 }), NOW), false);
    assert.equal(canCancelForQuorum(ev({ registered: 1, status: 2 }), NOW), false);
  });
});

describe("the state a quorum cancellation moves through", () => {
  const short = { registered: 2, minQuorum: 3 };
  test("before the deadline: an ordinary open event, nothing to cancel", () => {
    const e = ev({ ...short, registerDeadline: BigInt(NOW + 600) });
    assert.equal(canCancelForQuorum(e, NOW), false);
    assert.equal(eligibility(e, me(), "open", NOW).outcome, "openNotConfirmed");
  });
  test("after the deadline: cancellable, and the deposit row says a full refund follows", () => {
    const e = ev(short);
    assert.equal(canCancelForQuorum(e, NOW), true);
    assert.equal(eligibility(e, me({ checkedInAt: 1 }), "open", NOW).outcome, "openBelowQuorum");
  });
  test("even a confirmed attendee is told refund, not payout, since settle would revert", () => {
    const e = ev(short);
    const s = eligibility(e, me({ checkedInAt: 1, given: 1, received: 2, confirmed: true }), "closed", NOW);
    assert.equal(s.outcome, "openBelowQuorum");
  });
  test("after cancelForQuorum: no longer cancellable, full deposit refundable", () => {
    const e = ev({ ...short, status: 1 });
    assert.equal(canCancelForQuorum(e, NOW), false);
    assert.equal(eligibility(e, me(), "open", NOW).outcome, "cancelledRefundable");
  });
  test("after that attendee's claim: refunded", () => {
    const e = ev({ ...short, status: 1 });
    assert.equal(eligibility(e, me({ claimed: true }), "closed", NOW).outcome, "cancelledRefunded");
  });
});

describe("eligibility rows", () => {
  const cases = [
    ["not checked in, window open", ev(), me(), "open", { checkIn: "todo", initiated: "blocked", received: "short", outcome: "openNotConfirmed", missing: 2 }],
    ["checked in and scanned by k people, but never scanned anyone", ev(), me({ checkedInAt: NOW - 600, received: 2 }), "open", { checkIn: "done", initiated: "todo", received: "done", outcome: "openNotConfirmed" }],
    ["initiated one scan, count still below k", ev(), me({ checkedInAt: NOW - 600, given: 1, received: 1 }), "open", { initiated: "done", received: "short", missing: 1 }],
    ["both conditions met", ev(), me({ checkedInAt: NOW - 600, given: 1, received: 2, confirmed: true }), "open", { outcome: "openConfirmed", viaFallback: false }],
    ["settled, confirmed, not claimed", ev({ status: 2 }), me({ checkedInAt: 1, given: 1, received: 2, confirmed: true }), "closed", { outcome: "settledReady", final: true }],
    ["settled, confirmed, claimed", ev({ status: 2 }), me({ checkedInAt: 1, given: 1, received: 2, confirmed: true, claimed: true }), "closed", { outcome: "settledClaimed" }],
    ["settled, not confirmed (scanned once, never scanned anyone)", ev({ status: 2 }), me({ checkedInAt: 1, received: 1 }), "closed", { initiated: "missed", outcome: "settledNone" }],
    ["before the doors", ev(), me(), "waiting", { checkIn: "notOpen", initiated: "blocked", final: false }],
    ["window closed, not yet settled, confirmed", ev(), me({ checkedInAt: 1, given: 1, received: 2, confirmed: true }), "closed", { outcome: "openConfirmed", final: true }],
    ["confirmed by the organizer fallback", ev({ status: 2 }), me({ checkedInAt: 1, received: 1, confirmed: true }), "closed", { outcome: "settledReady", viaFallback: true }],
  ];
  for (const [name, e, m, phase, want] of cases) {
    test(name, () => {
      const got = eligibility(e, m, phase, NOW);
      for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `${k}`);
    });
  }
});
