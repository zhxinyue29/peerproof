"use client";

import { useCallback, useEffect, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex, LocalAccount } from "viem";
import RotatingCode from "@/components/RotatingCode";
import {
  BEACON_EPOCH,
  ESCROW_ADDRESS,
  EVENT_ID,
  chainNowMs,
  currentBeaconEpoch,
  hasDeployment,
  isLocalChain,
  syncChainClock,
} from "@/lib/chain";
import { makeBeaconCode } from "@/lib/codes";
import { metaFor } from "@/lib/eventMeta";
import { Button, Notice, Shell } from "@/components/ui";

/// The venue display. Put this on a laptop or spare phone at the door: it is what makes an
/// attestation mean "was in this room". Every attestation must carry a signature from this key,
/// and the code rotates, so a screenshot texted to someone elsewhere goes stale.
///
/// The key is pasted in on the device and kept in that browser's localStorage — never in the
/// bundle. `NEXT_PUBLIC_*` values are inlined into public JavaScript at build time, so shipping
/// the beacon key as configuration would publish it to everyone who loads the page.
const STORAGE_KEY = "peerproof.beacon.pk";

export default function VenuePage() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Number(BEACON_EPOCH));
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const meta = metaFor(EVENT_ID);

  const load = useCallback((pk: string): boolean => {
    const trimmed = pk.trim();
    const hex = (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
      setError("That doesn't look like a private key (64 hex characters).");
      return false;
    }
    try {
      setAccount(privateKeyToAccount(hex));
      setError(null);
      return true;
    } catch {
      setError("That key isn't valid.");
      return false;
    }
  }, []);

  useEffect(() => {
    void syncChainClock();
    const saved = localStorage.getItem(STORAGE_KEY);
    // Dev fixtures put a throwaway key in the environment; production never does.
    const fromEnv = isLocalChain ? process.env.NEXT_PUBLIC_DEV_BEACON_PK : undefined;
    if (saved) load(saved);
    else if (fromEnv) load(fromEnv);
  }, [load]);

  useEffect(() => {
    if (!account || !hasDeployment) return;
    let shown = -1n;
    const tick = async () => {
      const s = Math.floor(chainNowMs() / 1000);
      setSecondsLeft(Number(BEACON_EPOCH) - (s % Number(BEACON_EPOCH)));
      const e = currentBeaconEpoch();
      if (e !== shown) {
        shown = e;
        setPayload(await makeBeaconCode(account, ESCROW_ADDRESS, EVENT_ID, e));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 500);
    return () => clearInterval(id);
  }, [account]);

  if (!hasDeployment) {
    return (
      <Shell handheld center>
        <Notice>No contract configured for this build.</Notice>
      </Shell>
    );
  }

  if (!account) {
    return (
      <Shell handheld center>
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-[26px] font-medium tracking-tight">Venue display</h1>
          <p className="text-sm leading-relaxed text-dim">
            Paste the beacon key you were given when the event was created. It signs the rotating
            code that proves an attestation happened in this room.
          </p>
          <p className="text-xs leading-relaxed text-faint">
            It holds no funds and can never move money — it only signs. Stored in this browser
            only; it is never sent anywhere.
          </p>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-xl border border-line-2 bg-panel px-3.5 py-3.5 font-mono text-xs text-fg"
          />
          {error && <Notice tone="bad">{error}</Notice>}
          <Button
            onClick={() => {
              if (load(input)) localStorage.setItem(STORAGE_KEY, input.trim());
            }}
            className="w-full"
          >
            Start the display
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell handheld center>
      <div className="text-center">
        <h1 className="text-[30px] font-medium tracking-tight">Scan me to check in</h1>
        <p className="mt-1.5 text-[15px] text-dim">
          Then scan the people around you. Both are required.
        </p>
      </div>

      <RotatingCode
        payload={payload}
        secondsLeft={secondsLeft}
        totalSeconds={Number(BEACON_EPOCH)}
      />

      <div className="text-center text-xs text-faint">
        <p>
          {meta.title} · event {EVENT_ID.toString()}
        </p>
        <p className="mt-1 font-mono">beacon {account.address.slice(0, 10)}…</p>
        <button
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setAccount(null);
            setInput("");
          }}
          className="mt-3 underline decoration-line-2"
        >
          forget this key
        </button>
      </div>
    </Shell>
  );
}


