"use client";

import { useCallback, useEffect, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex, LocalAccount } from "viem";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RotatingCode from "@/components/RotatingCode";
import { PeerProofMark } from "@/components/NavIcons";
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
import { Button, Notice } from "@/components/ui";
import { useT } from "@/lib/i18n";

/// The venue display. Put this on a laptop or spare phone at the door: it is what makes an
/// attestation mean "was in this room". Every attestation must carry a signature from this key,
/// and the code rotates, so a screenshot texted to someone elsewhere goes stale.
///
/// The key is pasted in on the device and kept in that browser's localStorage — never in the
/// bundle. `NEXT_PUBLIC_*` values are inlined into public JavaScript at build time, so shipping
/// the beacon key as configuration would publish it to everyone who loads the page.
const STORAGE_KEY = "peerproof.beacon.pk";

export default function VenuePage() {
  const t = useT();
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Number(BEACON_EPOCH));
  const [input, setInput] = useState("");
  /// A dictionary key, not a sentence. `load` is the one callback the mount effect below depends
  /// on, so it must not close over `t` — a new `t` on every language switch would give `load` a new
  /// identity, re-run that effect, and re-do the URL-fragment pickup mid-event. The message is
  /// resolved at render instead, where changing language is free.
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const meta = useEventMeta(eventId());

  const load = useCallback((pk: string): boolean => {
    const trimmed = pk.trim();
    const hex = (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
      setErrorKey("venue.notAKey");
      return false;
    }
    try {
      setAccount(privateKeyToAccount(hex));
      setErrorKey(null);
      return true;
    } catch {
      setErrorKey("venue.invalidKey");
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
      <Stage right={t("venue.setupTitle")}>
        <div className="flex flex-1 items-center py-10">
          <Notice>{t("common.noContract")}</Notice>
        </div>
      </Stage>
    );
  }

  if (!account) {
    return (
      <Stage right={t("venue.setupTitle")}>
        {/* Measure, not a centred card. This is a form somebody fills in once, on whatever machine
            is at the door, and a 440px column stranded in the middle of a projector reads as a
            page that failed to load. */}
        <div className="w-full max-w-[680px] space-y-5 py-10 md:py-14">
          <p className="text-[14px] font-medium uppercase tracking-[0.16em] text-accent-2">
            {t("venue.setupEyebrow")}
          </p>
          <h1 className="text-[28px] font-semibold leading-[1.06] tracking-[-0.03em] md:text-[44px]">
            {t("venue.setupHeadline")}
          </h1>
          <p className="text-[16px] leading-relaxed text-dim md:text-[17px]">
            {t("venue.setupBody")}
          </p>

          {/* Amber, not red: pasting a key here is the correct next step, and the warning is about
              what the key *is*, not about anything having gone wrong. */}
          <Notice tone="warn">{t("venue.credentialNote")}</Notice>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            aria-label={t("venue.setupHeadline")}
            className="min-h-[52px] w-full rounded-xl border border-line-2 bg-panel px-4 font-mono text-[14px] text-fg outline-none focus:border-accent"
          />
          {errorKey && <Notice tone="bad">{t(errorKey)}</Notice>}

          <Button
            onClick={() => {
              if (load(input)) localStorage.setItem(STORAGE_KEY, input.trim());
            }}
            className="w-full sm:w-auto sm:min-w-[260px]"
          >
            {t("venue.start")}
          </Button>

          <p className="text-[14px] leading-relaxed text-faint">{t("venue.keyHoldsNoFunds")}</p>
        </div>
      </Stage>
    );
  }

  // Side by side rather than stacked, because the code's size is the whole constraint. Stacked
  // under a heading it can only be as wide as the column; beside the words it takes the height of
  // the viewport, and height is what decides whether somebody three metres back can scan it. On a
  // phone it falls back to one column, where width is the limit anyway.
  return (
    <Stage right={meta.title}>
      <div className="grid w-full flex-1 items-center gap-8 py-6 md:grid-cols-[minmax(0,58vh)_minmax(300px,1fr)] md:gap-14">
        <div className="mx-auto w-full max-w-[min(74vw,58vh)] min-w-0">
          <RotatingCode
            payload={payload}
            secondsLeft={secondsLeft}
            totalSeconds={Number(BEACON_EPOCH)}
            size="xl"
            // This page has its own countdown, set large enough to read from the back of a room.
            caption={false}
          />
        </div>

        <div className="min-w-0 text-center md:text-left">
          <p className="text-[14px] font-medium uppercase tracking-[0.16em] text-accent-2">
            {t("venue.eyebrow")}
          </p>
          <h1 className="mt-2.5 text-[34px] font-semibold leading-[1.04] tracking-[-0.035em] md:text-[52px]">
            {t("venue.title")}
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-dim md:text-[20px]">
            {t("venue.subtitle")}
          </p>

          <div className="mt-6 rounded-[18px] border border-line-2 bg-panel/70 p-5 md:mt-7 md:p-[22px]">
            <p className="text-[16px] text-dim">{t("venue.refreshesIn")}</p>
            {/* Seconds, not m:ss. The beacon rotates every 30s now, and "0:27" on a timer that
                never reaches a minute reads as a clock that is broken. */}
            <p className="mt-1.5 text-[46px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[56px]">
              {secondsLeft}s
            </p>
            <p className="mt-2.5 text-[15px] text-dim">
              {t("common.eventNumber", { id: eventId().toString() })}
            </p>
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line py-4 text-[14px] text-faint">
        <span className="min-w-0 truncate font-mono">
          {t("venue.beacon", { address: `${account.address.slice(0, 10)}…` })}
        </span>
        <button
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setAccount(null);
            setInput("");
          }}
          className="shrink-0 underline decoration-line-2"
        >
          {t("venue.forgetKey")}
        </button>
      </footer>
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/*                              Chrome                                */
/* ------------------------------------------------------------------ */

/// No sidebar, no nav, no identity — this screen is furniture in a room, not a page somebody is
/// browsing. It grows from a phone propped against a laptop to a projector rather than sitting in a
/// fixed card, because how far back the QR can be scanned from is the only thing that matters here.
///
/// The language control is in the bar rather than anywhere prominent: the organizer setting this up
/// may not read English, and after that nobody touches this screen again all evening.
function Stage({ right, children }: { right: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div
        className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 sm:px-8"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <header className="flex items-center gap-3 py-3">
          <span className="flex min-h-[44px] shrink-0 items-center gap-2.5">
            <PeerProofMark />
            <span className="hidden text-[17px] font-semibold tracking-[-0.01em] sm:inline">
              PeerProof
            </span>
          </span>
          <span className="flex-1" />
          <LanguageSwitcher />
          <span className="min-w-0 truncate text-[16px] text-dim md:text-[18px]">{right}</span>
        </header>

        {children}
      </div>
    </div>
  );
}
