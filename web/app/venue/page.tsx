"use client";

import { useCallback, useEffect, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex, LocalAccount } from "viem";
import RotatingCode from "@/components/RotatingCode";
import {
  BEACON_EPOCH,
  ESCROW_ADDRESS,
  eventId,
  chainNowMs,
  currentBeaconEpoch,
  hasDeployment,
  isLocalChain,
  resolveEventId,
  syncChainClock,
} from "@/lib/chain";
import { makeBeaconCode } from "@/lib/codes";
import { useEventMeta } from "@/lib/eventMeta";
import { Button, Eyebrow, Notice, Shell } from "@/components/ui";

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
  const meta = useEventMeta(eventId());

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
    void Promise.all([syncChainClock(), resolveEventId()]);

    // A key handed over in the URL fragment, which is how the QR on the organizer's screen gets a
    // 66-character key onto a tablet at the door. Nobody is typing that by hand, and pasting it
    // requires the two devices to share a clipboard, which at a venue they do not.
    //
    // The fragment, not the query: fragments are never sent to a server, so the key does not reach
    // GitHub Pages' logs or any referrer header. It is stripped from the address bar immediately
    // afterwards, so it does not sit in the open on a screen propped up in a room, and the entry
    // left in that browser's own history is the only copy — on the machine that is meant to hold it.
    const hash = window.location.hash;
    const fromLink = hash.startsWith("#k=") ? decodeURIComponent(hash.slice(3)) : null;
    const saved = localStorage.getItem(STORAGE_KEY);
    // Dev fixtures put a throwaway key in the environment; production never does.
    const fromEnv = isLocalChain ? process.env.NEXT_PUBLIC_DEV_BEACON_PK : undefined;
    // `load` sets state, and localStorage does not exist during the static export, so this cannot
    // move into a lazy initialiser. Restoring the key on mount is the whole point: reloading the
    // venue display mid-event must not make the organizer paste the beacon key again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromLink && load(fromLink)) {
      localStorage.setItem(STORAGE_KEY, fromLink.trim());
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } else if (saved) load(saved);
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
        setPayload(await makeBeaconCode(account, ESCROW_ADDRESS, eventId(), e));
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

  // `stage`, not `handheld`: this screen gets propped up at the door and scanned from a few metres
  // away, so it has to use whatever display it lands on.
  //
  // Side by side rather than stacked, because the code's size is the whole constraint. Stacked
  // under a heading it can only be as wide as the column; beside the words it takes the height of
  // the viewport, and height is what decides whether somebody three metres back can scan it. On a
  // phone it falls back to one column, where width is the limit anyway.
  return (
    <Shell stage center>
      <div className="grid w-full items-center gap-8 md:grid-cols-[minmax(0,58vh)_minmax(260px,400px)] md:gap-14">
        <div className="mx-auto w-full max-w-[min(74vw,58vh)]">
          <RotatingCode
            payload={payload}
            secondsLeft={secondsLeft}
            totalSeconds={Number(BEACON_EPOCH)}
            size="xl"
          />
        </div>

        <div className="text-center md:text-left">
          <Eyebrow>Venue beacon</Eyebrow>
          <h1 className="mt-2 text-[34px] font-medium leading-[1.06] tracking-[-0.04em] md:text-[52px]">
            Scan to prove you&apos;re here.
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-dim md:text-[20px]">
            Everyone in the room reads the same rotating beacon. Then scan the people around you —
            both are required.
          </p>

          <div className="mt-6 rounded-[18px] border border-line-2 bg-panel/70 p-5 md:mt-7 md:p-[22px]">
            <p className="text-[15px] text-dim">Refreshes in</p>
            <p className="mt-1 text-[42px] font-medium leading-none tabular-nums md:text-[52px]">
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </p>
            <p className="mt-2 text-[15px] text-dim">
              {meta.title} · event {eventId().toString()}
            </p>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-4 text-[15px] text-faint">
        <span className="font-mono">beacon {account.address.slice(0, 10)}…</span>
        <button
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setAccount(null);
            setInput("");
          }}
          className="underline decoration-line-2"
        >
          forget this key
        </button>
      </div>
    </Shell>
  );
}


