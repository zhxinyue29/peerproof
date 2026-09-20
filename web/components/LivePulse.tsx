"use client";

import { useCallback, useEffect, useState } from "react";
import { chainNowMs, hasDeployment, publicClient } from "@/lib/chain";
import { countdown } from "@/lib/format";
import { useT, type TFn } from "@/lib/i18n";
import { readHistory } from "@/lib/logs";
import { useVisiblePoll } from "@/lib/poll";
import { Skeleton } from "@/components/ui";

/// The right-hand panel of the organizer dashboard: vouches arriving, as a shape.
///
/// Every bar is an `Attested` log. There is no sample data and no idle animation, because the only
/// claim this product makes is that what is on the screen came off the chain — a decorative chart
/// on the dashboard would cost more credibility than an empty panel ever could. A room where
/// nobody has scanned anybody yet gets told exactly that.
///
/// The V3 render (`04-organizer-dashboard-desktop.png`) shows eight bars with no axis, so the
/// buckets are relative rather than absolute: the window runs from the first vouch to the head of
/// the chain and is sliced into eight. That is the shape of the evening so far, which is what an
/// organizer standing in the room is actually reading it for.

const BARS = 8;

type Pulse = {
  /// Vouch count per bucket, oldest first. Empty when nothing has happened yet.
  bars: number[];
  /// Cumulative vouches at the end of each bucket — the same data read as a curve rather than as
  /// a histogram, which is what panel 06 of the organizer sheet draws.
  ///
  /// The sheet has two series: 报名人数 and 已验证人数. Only one of them can be drawn honestly
  /// here: `Registered` logs are read without their block numbers, so the registration series has
  /// no time axis to sit on. One true line, labelled as one line — rather than two, with the
  /// second interpolated from a total.
  cumulative: number[];
  total: number;
  /// How long the window covers, in seconds, or null if the boundary block could not be read.
  spanSeconds: number | null;
};

async function readPulse(id: bigint): Promise<Pulse> {
  const history = await readHistory(id);
  if (history.vouches.length === 0) return { bars: [], cumulative: [], total: 0, spanSeconds: null };

  let first = history.vouches[0].block;
  for (const v of history.vouches) if (v.block < first) first = v.block;
  const last = history.toBlock > first ? history.toBlock : first;
  const span = last - first + 1n;

  const bars = new Array<number>(BARS).fill(0);
  for (const v of history.vouches) {
    const i = Number(((v.block - first) * BigInt(BARS)) / span);
    bars[Math.min(BARS - 1, Math.max(0, i))] += 1;
  }

  // Blocks are not a unit anybody in the room thinks in, so the window is labelled with a real
  // duration. Measured from the boundary block's own timestamp rather than multiplied out from a
  // nominal block time — a number derived from an assumed 400ms block would be a guess presented
  // in the same typeface as the counts, which is the one thing this panel must not do.
  let spanSeconds: number | null = null;
  try {
    const block = await publicClient.getBlock({ blockNumber: first });
    spanSeconds = Math.max(0, Math.floor(chainNowMs() / 1000) - Number(block.timestamp));
  } catch {
    // An archive node that has pruned the block, or a rate limit. The bars are still true.
  }
  let running = 0;
  const cumulative = bars.map((n) => (running += n));

  return { bars, cumulative, total: history.vouches.length, spanSeconds };
}

export default function LivePulse({ eventId, live }: { eventId: bigint | null; live: boolean }) {
  const t = useT();
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!hasDeployment || eventId === null) return;
    void readPulse(eventId)
      .then((p) => {
        setPulse(p);
        setFailed(false);
      })
      // Log reads go through one endpoint with a 100-block cap and a rate limit, so a miss here is
      // ordinary. Keep the last good shape on screen and say the panel is stale, rather than
      // blanking a chart somebody is watching.
      .catch(() => setFailed(true));
  }, [eventId]);

  useEffect(load, [load]);

  // Only while the doors are open. Rebuilding the graph is the most expensive read on the page —
  // a span of blocks fetched 100 at a time — and an event that has not started cannot have vouches
  // while one that has finished cannot gain any. Re-reading either on a timer would spend the
  // endpoint's whole budget confirming a number that cannot move.
  useVisiblePoll(() => {
    if (live) load();
  }, 15000);

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-5 md:p-[22px]">
      <h2 className="text-[22px] font-medium tracking-[-0.01em]">{t("organizer.livePulse")}</h2>

      {/* Nothing selected is not the same as nothing loaded. A skeleton says "wait", and it was
          saying it forever on a dashboard whose first event has not been created yet — the panel
          sat there pulsing at somebody who had nothing to select. Say what the panel is for. */}
      {eventId === null ? (
        <p className="text-[15px] leading-relaxed text-dim">{t("organizer.pulseNoPick")}</p>
      ) : !pulse && !failed ? (
        <Skeleton className="h-[120px] w-full" />
      ) : pulse && pulse.total > 0 ? (
        // The render's caption is present tense, and it is only true while the doors are open. A
        // panel that says vouches are arriving from a room that emptied on Tuesday is the kind of
        // small lie that makes somebody doubt the numbers next to it.
        <Bars
          pulse={pulse}
          caption={live ? t("organizer.pulseCaption") : t("organizer.pulsePast")}
          t={t}
        />
      ) : (
        <Empty stale={failed} />
      )}

      <PayoutsNote />
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Bars({ pulse, caption, t }: { pulse: Pulse; caption: string; t: TFn }) {
  // A cumulative line, as the sheet draws it, over the per-bucket bars it replaces. The bars said
  // "how busy was each stretch"; the line says "how far has the room got", which is the question
  // somebody standing in it is actually asking.
  const peak = Math.max(1, pulse.cumulative[pulse.cumulative.length - 1] ?? 1);
  const W = 100;
  const H = 40;
  const pts = pulse.cumulative.map((n, i) => {
    const x = pulse.cumulative.length === 1 ? W : (i / (pulse.cumulative.length - 1)) * W;
    return [x, H - (n / peak) * H] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={t("organizer.pulseAria", { n: pulse.total, bars: pulse.cumulative.join(", ") })}
        className="relative h-[120px]"
      >
        {/* `preserveAspectRatio="none"` so the curve fills whatever width the panel has — the shape
            is the data, and the aspect ratio of the box it sits in carries no information. */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="pulse-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-accent)" />
              <stop offset="100%" stopColor="var(--color-ok)" />
            </linearGradient>
            <linearGradient id="pulse-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#pulse-fill)" />
          <path
            d={line}
            fill="none"
            stroke="url(#pulse-line)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {pts.slice(-1).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.4" fill="var(--color-ok)" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>

      <p className="text-[14px] leading-relaxed text-dim">{caption}</p>

      {/* Two events on a testnet is what this will show on the night, so the panel states its own
          scale rather than letting eight bars imply a busier room than there is. */}
      <p className="text-[14px] text-faint">
        {pulse.total === 1 ? t("organizer.vouchOne") : t("organizer.vouchMany", { n: pulse.total })}
        {pulse.spanSeconds !== null && pulse.spanSeconds > 0
          ? t("organizer.overTheLast", { t: countdown(pulse.spanSeconds) })
          : ""}
      </p>
    </div>
  );
}

function Empty({ stale }: { stale: boolean }) {
  const t = useT();
  return (
    <div className="space-y-2.5">
      {/* The baseline, drawn flat. It holds the panel's height steady so the card does not jump
          when the first vouch lands, and it says "nothing yet" in the same shape that will say
          "here is what happened". */}
      <div className="flex h-[120px] items-end gap-1.5" aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <div key={i} className="h-[3px] flex-1 rounded-full bg-line" />
        ))}
      </div>
      <p className="text-[14px] leading-relaxed text-dim">
        {stale ? t("organizer.logsUnavailable") : t("organizer.noVouchesYet")}
      </p>
    </div>
  );
}

/// The point of the whole product, rendered as an absence — and the render puts it here, under the
/// chart, in a dashed box. Judges look for the button that is missing.
function PayoutsNote() {
  const t = useT();
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-line-2 p-4">
      <p className="text-[16px] font-medium">{t("organizer.payoutsAutomatic")}</p>
      <p className="text-[14px] leading-relaxed text-dim">{t("organizer.payoutsBody")}</p>
      <p className="text-[14px] leading-relaxed text-faint">{t("organizer.payoutsDetail")}</p>
    </div>
  );
}
