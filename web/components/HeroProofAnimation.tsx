"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";

/// One attestation, acted out, every seven seconds.
///
/// The product's claim is a sequence — somebody scans somebody else, the chain accepts it, and the
/// second person is now confirmed present — and a still picture can only assert that. This runs it:
/// A pulses, a dot travels A→B, B pulses when it arrives, a badge resolves. Then it stops. The
/// whole proof takes under a second and a half and the page is still for the rest of the cycle,
/// which is the difference between a demonstration and a screensaver.
///
/// Deliberately not: a particle field, a looping glow, anything that moves while nothing is
/// happening. Continuous motion on a landing page reads as decoration and costs battery on the one
/// device this product is actually used on.
///
/// And deliberately no badge. The first build ended the cycle with its own "Verified" chip, which
/// landed directly on top of the one painted into the artwork — the same statement made twice,
/// forty pixels apart. What the still picture cannot do is show the signal crossing between two
/// people, so that is the only thing left here.

/// Positioned on the artwork, not beside it.
///
/// The first version was a 270×150 panel tucked below-left of the picture, with 13px translucent
/// nodes — on top of a rendered 3D scene that already contains a glowing proof circle and three
/// "Verified" cards. It was competing with a photograph of the same idea and losing: instrumented,
/// it animated; looked at, nothing moved. So the viewBox now matches the artwork's own 1460×838 and
/// the three nodes sit where the three phones are, which means the signal travels between the
/// people rather than in a box next to them.
const A = { x: 430, y: 560 };   // left figure's phone
const B = { x: 655, y: 235 };   // top figure's phone
const C = { x: 950, y: 545 };   // right figure's phone
const PATH = `M ${A.x} ${A.y} Q ${(A.x + B.x) / 2 - 40} ${A.y - 230}, ${B.x} ${B.y}`;

/// Where the travelling dot is at a given fraction of the path. Evaluating the quadratic directly
/// beats `offsetPath`, which Safari still disagrees with about units.
function pointAt(t: number) {
  const cx = (A.x + B.x) / 2 - 40;
  const cy = A.y - 230;
  const u = 1 - t;
  return {
    x: u * u * A.x + 2 * u * t * cx + t * t * B.x,
    y: u * u * A.y + 2 * u * t * cy + t * t * B.y,
  };
}

type Phase = "idle" | "sending" | "arrived";

export default function HeroProofAnimation({
  className = "",
  label,
  verifiedLabel,
}: {
  className?: string;
  /// Described by the caller, which is the component that has `t`.
  label: string;
  /// The word on the badge that closes each cycle.
  verifiedLabel: string;
}) {
  const { reduced } = useMotionPrefs();
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (reduced) return;
    // One chain of timers per cycle rather than an interval, so a tab that was backgrounded
    // mid-proof resumes at a clean idle instead of catching up on a queue of half-finished steps.
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setPhase("sending");
      timers.push(setTimeout(() => setPhase("arrived"), 900));
      timers.push(setTimeout(() => setPhase("idle"), 2200));
      timers.push(setTimeout(run, 7000));
    };
    // 400ms, not 1400. The whole argument of this page is a thing that happens between two people,
    // and the first thing somebody should see is it happening. A second and a half of stillness on
    // arrival is a second and a half of a page that looks like a picture.
    timers.push(setTimeout(run, 400));
    return () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
  }, [reduced]);

  const sending = phase === "sending";
  const arrived = phase === "arrived";

  // The caller owns where this sits, including how it is positioned.
  //
  // This shipped for one build as `relative ${className}` with `absolute right-[2%] top-[14%]`
  // coming in from the page — and two position utilities on one element are settled by stylesheet
  // order, not by the order they were written, so `relative` won and the animation rendered in
  // normal flow at the bottom-left instead of over the artwork. The identical mistake emptied every
  // event card's cover band a few days ago; the fix there was the same one as here, and I made it
  // again anyway. Position outside, stacking context inside, and it cannot be overridden by
  // accident.
  return (
    <div className={className}>
      <div className="relative h-full w-full">
      <svg viewBox="0 0 1460 838" className="h-full w-full" role="img" aria-label={label}>
        <defs>
          <radialGradient id="hp-node">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#c8bcff" />
            <stop offset="100%" stopColor="#6d55ff" />
          </radialGradient>
        </defs>

        {/* The relationship, always present and always quiet. It brightens only while something is
            travelling along it. */}
        <motion.path
          d={PATH}
          fill="none"
          stroke="#9a88ff"
          strokeWidth="3.5"
          strokeDasharray="12 16"
          animate={{ strokeOpacity: reduced ? 0.4 : sending ? 0.85 : 0.32 }}
          transition={{ duration: 0.3 }}
        />

        {[A, B, C].map((p, i) => {
          const isA = i === 0;
          const isB = i === 1;
          return (
            <motion.g
              key={i}
              // Breathing, and only breathing — 2.5% over five seconds is below the threshold where
              // the eye tracks it as movement, which is the point: the picture is alive, not busy.
              animate={reduced ? {} : { scale: [1, 1.025, 1] }}
              transition={
                reduced
                  ? {}
                  : { duration: 5, repeat: Infinity, ease: "easeInOut", delay: i * 0.9 }
              }
              style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
            >
              <motion.circle
                cx={p.x}
                cy={p.y}
                r="34"
                fill="url(#hp-node)"
                animate={{
                  opacity: reduced ? 0.55 : (isA && sending) || (isB && arrived) ? 0.9 : 0.5,
                  scale: reduced ? 1 : (isA && sending) || (isB && arrived) ? 1.22 : 1,
                }}
                transition={{ duration: 0.34, ease: "easeOut" }}
                style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
              />
              <circle cx={p.x} cy={p.y} r="9" fill="#ffffff" fillOpacity="0.98" />
            </motion.g>
          );
        })}

        {/* The signal. Present only while it is travelling, so there is nothing parked on the path
            between cycles. */}
        {!reduced && sending && (
          <motion.circle
            r="11"
            fill="#ffffff"
            style={{ filter: "drop-shadow(0 0 14px rgba(200,188,255,0.95))" }}
            initial={{ cx: A.x, cy: A.y, opacity: 0 }}
            animate={{
              cx: [A.x, pointAt(0.5).x, B.x],
              cy: [A.y, pointAt(0.5).y, B.y],
              opacity: [0, 1, 1],
            }}
            transition={{ duration: 1.1, ease: "easeInOut", times: [0, 0.5, 1] }}
          />
        )}
      </svg>

      {/* The verdict, at the end of the cycle. HTML rather than SVG text so it wraps and takes the
          app's font. Bottom-left of the frame — the one part of the scene the artwork leaves empty;
          an earlier build put it top-centre, directly over one of the three "You were here" cards
          painted into the picture, which said the same thing twice forty pixels apart. */}
      <motion.span
        className="pointer-events-none absolute bottom-0 left-0 inline-flex items-center gap-1.5 rounded-xl border border-ok/35 bg-[#0f2620]/90 px-3 py-2 text-[13px] font-medium text-ok backdrop-blur-sm"
        initial={false}
        animate={arrived ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 6 }}
        transition={{ duration: reduced ? 0.15 : 0.3, ease: "easeOut" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {verifiedLabel}
      </motion.span>
      </div>
    </div>
  );
}
