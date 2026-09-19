"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { hasDeployment } from "@/lib/chain";
import { readAllEvents } from "@/lib/events";
import { useMotionPrefs } from "@/lib/motion";
import { useT } from "@/lib/i18n";

/// What is actually going on here: events, people confirmed present, and the size of the pot.
///
/// This replaced a panel of Monad's throughput figures. Those said something true about the chain
/// and nothing about the product — somebody deciding whether to open an event does not need to know
/// the block time, they need to know whether anybody is here. The chain facts moved into the "how
/// does this work" dialog, which is where somebody who wants them will look.
///
/// Every figure is read from the escrow rather than written down:
///
///   events    — how many the contract has opened
///   present   — `confirmed` summed across them, so it counts people the room vouched for rather
///               than people who signed up
///   pool      — deposit × registered summed, which is what the contract is actually holding
///
/// An empty contract shows zeros. Not placeholders, not the design's figures with a caveat — a
/// headcount is a claim about the platform rather than a mockup of one, and the number that is true
/// on the day somebody opens this is nought. It stops being nought the moment an event exists,
/// because it is read rather than written.

type Stats = { events: number; present: number; poolMon: number };

const EMPTY: Stats = { events: 0, present: 0, poolMon: 0 };

/// Counts to a figure once, when it comes into view. Not a ticker: a number that keeps moving reads
/// as a live feed, and this is a total, not a feed.
function CountUp({ to, format }: { to: number; format: (n: number) => string }) {
  const { reduced } = useMotionPrefs();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(reduced ? to : 0);

  useEffect(() => {
    if (reduced || !inView) {
      setShown(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const DURATION = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      // Ease out — the last third of a count-up is the part people read, so it should settle rather
      // than arrive at speed.
      setShown(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, inView, reduced]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(shown)}
    </span>
  );
}

export default function LiveStats() {
  const t = useT();
  const { reduced } = useMotionPrefs();
  const [stats, setStats] = useState<Stats | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    if (!hasDeployment || loading.current) return;
    loading.current = true;
    void readAllEvents()
      .then((all) => {
        setStats({
          events: all.length,
          present: all.reduce((n, e) => n + e.confirmed, 0),
          poolMon: Math.round(
            all.reduce((n, e) => n + Number(e.deposit) / 1e18 * e.registered, 0),
          ),
        });
      })
      .catch(() => setStats({ events: 0, present: 0, poolMon: 0 }));
  }, []);

  // Before the read lands, zeros — which is also what the read returns on an empty contract, so
  // the panel never changes shape and never flashes a different number on its way to the real one.
  const shown = stats ?? EMPTY;

  const int = (n: number) => n.toLocaleString("en-US");
  const cells = [
    { value: shown.events, format: int, label: "live.events" },
    { value: shown.present, format: int, label: "live.present" },
    { value: shown.poolMon, format: (n: number) => `${int(n)} MON`, label: "live.pool" },
  ];

  return (
    <div className="rounded-[18px] border border-line-2 bg-[#0f1729]/88 p-4 backdrop-blur-sm md:p-5">
      <p className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
        {/* A dot rather than a lightning bolt. The bolt belonged to a claim about the chain's
            speed; this panel is about a room filling up. */}
        {/* A live indicator that is actually live. The ring expands and fades once a second — the
            conventional signal for "this figure is current", small enough to sit beside a heading
            and the only thing on the page that moves without being asked. Off under reduced
            motion, where the dot alone carries it. */}
        <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="pp-live-ring absolute inset-0 rounded-full bg-ok" />
          <span className="absolute inset-0 rounded-full bg-ok" />
        </span>
        {t("live.title")}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-0 divide-x divide-line">
        {cells.map(({ value, format, label }, i) => (
          <div key={label} className={`min-w-0 ${i === 0 ? "pr-3" : i === 1 ? "px-3" : "pl-3"}`}>
            <dt className="whitespace-nowrap text-[24px] font-semibold leading-none tracking-[-0.025em] text-accent-2 md:text-[28px]">
              <CountUp to={value} format={format} />
            </dt>
            <dd className="mt-1.5 text-[13px] text-dim">{t(label)}</dd>
          </div>
        ))}
      </dl>

    </div>
  );
}
