"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVisiblePoll } from "@/lib/poll";
import type { Address } from "viem";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import { shortenError } from "@/lib/format";
import { useT } from "@/lib/i18n";
import {
  ESCROW_ADDRESS,
  eventId,
  chainNowMs,
  hasDeployment,
  publicClient,
  resolveEventId,
  syncChainClock,
} from "@/lib/chain";

export type EventInfo = {
  organizer: Address;
  k: number;
  deposit: bigint;
  capacity: number;
  minQuorum: number;
  registerDeadline: bigint;
  attestOpen: bigint;
  attestClose: bigint;
  registered: number;
  confirmed: number;
  /// Confirmed by peers alone. The contract gates settlement on this, not on the total.
  peerConfirmed: number;
  status: number; // 0 Open, 1 Cancelled, 2 Settled
  sharePerAttendee: bigint;
};

export type MyState = {
  registered: boolean;
  received: number;
  given: number;
  confirmed: boolean;
  claimed: boolean;
  balance: bigint;
  /// Unix seconds at which this account proved it was at the venue, or 0. Read from chain rather
  /// than remembered locally: arrival is a fact the contract owns, and a phone that reloads mid-
  /// event must not ask somebody to walk back to the door.
  checkedInAt: number;
};

/// Projected payout if the current no-show rate holds. Deliberately labelled as an estimate in
/// the UI: the divisor is not fixed until settlement.
export function projectedPayout(ev: EventInfo): bigint {
  const noShows = BigInt(Math.max(0, ev.registered - ev.confirmed));
  const winners = BigInt(Math.max(1, ev.confirmed || 1));
  return ev.deposit + (ev.deposit * noShows) / winners;
}

/// Where the event is in its own life. This says nothing about whether registration is still open:
/// ask `canRegister` for that.
///
/// The two used to be one ladder — registering, then waiting, then open — because registration had
/// to finish before check-in could start. Walk-ins removed that, and the ladder kept answering
/// "registering" for the entire event, so the check-in screen never unlocked and the scan buttons
/// were never rendered at all. Check-in is now decided by the check-in window and nothing else.
export function phaseOf(ev: EventInfo | null): "loading" | "registering" | "waiting" | "open" | "closed" {
  if (!ev) return "loading";
  const now = Math.floor(chainNowMs() / 1000);
  if (now >= Number(ev.attestClose)) return "closed";
  if (now >= Number(ev.attestOpen)) return "open";
  // Before the doors. "registering" and "waiting" differ only in whether anyone can still join.
  return now < Number(ev.registerDeadline) ? "registering" : "waiting";
}

/// Whether somebody can still put a deposit down. With walk-ins this stays true after the doors
/// open — that is the whole point of the setting.
export function canRegister(ev: EventInfo | null): boolean {
  if (!ev) return false;
  if (ev.status !== 0) return false;
  if (ev.registered >= ev.capacity) return false;
  return Math.floor(chainNowMs() / 1000) < Number(ev.registerDeadline);
}

/// 4s, not 2s. Each refresh is seven reads — the event, five per-address views, and a balance —
/// against an endpoint that allows fifteen calls a second. Two seconds was three and a half calls
/// per second from a single open tab, before retries, and the app is not a trading screen: a
/// registration count that is four seconds old has never misled anyone.
export function useEvent(address: Address | null, pollMs = 4000) {
  // Held in a ref, not read directly: `refresh` is an effect dependency, and a `t` that changes
  // identity on every language switch would tear down the poll and re-read the chain for a change
  // that only affects the wording of an error nobody may be looking at.
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const [ev, setEv] = useState<EventInfo | null>(null);
  const [me, setMe] = useState<MyState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    if (!hasDeployment) return;
    const e = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi,
      functionName: "getEvent",
      args: [eventId()],
    });
    setEv({
      organizer: e.organizer,
      k: Number(e.k),
      deposit: e.deposit,
      capacity: Number(e.capacity),
      minQuorum: Number(e.minQuorum),
      registerDeadline: e.registerDeadline,
      attestOpen: e.attestOpen,
      attestClose: e.attestClose,
      registered: Number(e.registered),
      confirmed: Number(e.peerConfirmed) + Number(e.orgConfirmed),
      peerConfirmed: Number(e.peerConfirmed),
      status: Number(e.status),
      sharePerAttendee: e.sharePerAttendee,
    });

    if (!address) {
      setMe(null);
      return;
    }
    const base = { address: ESCROW_ADDRESS, abi } as const;
    const args = [eventId(), address] as const;
    const [registered, received, given, confirmed, claimed, checkedInAt, balance] = await Promise.all([
      publicClient.readContract({ ...base, functionName: "isRegistered", args }),
      publicClient.readContract({ ...base, functionName: "attestCount", args }),
      publicClient.readContract({ ...base, functionName: "gaveCount", args }),
      publicClient.readContract({ ...base, functionName: "isConfirmed", args }),
      publicClient.readContract({ ...base, functionName: "hasClaimed", args }),
      publicClient.readContract({ ...base, functionName: "checkedInAt", args }),
      publicClient.getBalance({ address }),
    ]);
    setMe({
      registered,
      received: Number(received),
      given: Number(given),
      confirmed,
      claimed,
      balance,
      checkedInAt: Number(checkedInAt),
    });
  }, [address]);

  /// Never rejects. This polls every few seconds, so anything that throws here throws again on the
  /// next tick and the one after — and an escrow missing a function the app has learned to call
  /// turned that into an unhandled rejection twice a second, which took the RPC past its 15/sec
  /// limit and made every *other* read fail too. One broken read should not become an outage.
  ///
  /// The last good values are kept rather than cleared: stale numbers on screen beat a page that
  /// empties itself because one request timed out. The error is returned rather than swallowed,
  /// because a caller that shows nothing and says nothing is how a misconfigured address looks
  /// exactly like an event nobody has joined.
  const refresh = useCallback(async () => {
    try {
      await read();
      setError(null);
    } catch (e) {
      setError(shortenError(e, tRef.current));
    }
  }, [read]);

  useEffect(() => {
    if (!hasDeployment) return;
    // Resolve which event before the first read, or the page renders event 1 for a moment and
    // then swaps — which on a screen showing a deposit is not a flicker anyone should have to
    // interpret.
    void Promise.all([syncChainClock(), resolveEventId()])
      .then(refresh)
      .catch((e) => setError(shortenError(e, tRef.current)));
  }, [refresh]);

  useVisiblePoll(() => {
    if (hasDeployment) void refresh();
  }, pollMs);

  return { ev, me, refresh, error };
}
