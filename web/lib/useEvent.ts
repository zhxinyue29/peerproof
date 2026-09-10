"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import {
  ESCROW_ADDRESS,
  EVENT_ID,
  chainNowMs,
  hasDeployment,
  publicClient,
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
};

/// Projected payout if the current no-show rate holds. Deliberately labelled as an estimate in
/// the UI: the divisor is not fixed until settlement.
export function projectedPayout(ev: EventInfo): bigint {
  const noShows = BigInt(Math.max(0, ev.registered - ev.confirmed));
  const winners = BigInt(Math.max(1, ev.confirmed || 1));
  return ev.deposit + (ev.deposit * noShows) / winners;
}

export function phaseOf(ev: EventInfo | null): "loading" | "registering" | "waiting" | "open" | "closed" {
  if (!ev) return "loading";
  const now = Math.floor(chainNowMs() / 1000);
  if (now < Number(ev.registerDeadline)) return "registering";
  if (now < Number(ev.attestOpen)) return "waiting";
  if (now < Number(ev.attestClose)) return "open";
  return "closed";
}

export function useEvent(address: Address | null, pollMs = 2000) {
  const [ev, setEv] = useState<EventInfo | null>(null);
  const [me, setMe] = useState<MyState | null>(null);

  const refresh = useCallback(async () => {
    if (!hasDeployment) return;
    const e = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi,
      functionName: "getEvent",
      args: [EVENT_ID],
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
    const args = [EVENT_ID, address] as const;
    const [registered, received, given, confirmed, claimed, balance] = await Promise.all([
      publicClient.readContract({ ...base, functionName: "isRegistered", args }),
      publicClient.readContract({ ...base, functionName: "attestCount", args }),
      publicClient.readContract({ ...base, functionName: "gaveCount", args }),
      publicClient.readContract({ ...base, functionName: "isConfirmed", args }),
      publicClient.readContract({ ...base, functionName: "hasClaimed", args }),
      publicClient.getBalance({ address }),
    ]);
    setMe({
      registered,
      received: Number(received),
      given: Number(given),
      confirmed,
      claimed,
      balance,
    });
  }, [address]);

  useEffect(() => {
    if (!hasDeployment) return;
    void syncChainClock().then(refresh);
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { ev, me, refresh };
}
