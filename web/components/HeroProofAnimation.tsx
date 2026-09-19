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

const A = { x: 62, y: 128 };
const B = { x: 196, y: 58 };
const C = { x: 292, y: 140 };
const PATH = `M ${A.x} ${A.y} Q ${(A.x + B.x) / 2 - 6} ${A.y - 62}, ${B.x} ${B.y}`;

/// Where the travelling dot is at a given fraction of the path. Evaluating the quadratic directly
/// beats `offsetPath`, which Safari still disagrees with about units.
function pointAt(t: number) {
  const cx = (A.x + B.x) / 2 - 6;
  const cy = A.y - 62;
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
}: {
  className?: string;
  /// Described by the caller, which is the component that has `t`.
  label: string;
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
    timers.push(setTimeout(run, 1400));
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
      <svg viewBox="0 0 360 200" className="h-full w-full" role="img" aria-label={label}>
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
          strokeWidth="1.6"
          strokeDasharray="5 7"
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
                r="13"
                fill="url(#hp-node)"
                animate={{
                  opacity: reduced ? 0.55 : (isA && sending) || (isB && arrived) ? 0.9 : 0.5,
                  scale: reduced ? 1 : (isA && sending) || (isB && arrived) ? 1.22 : 1,
                }}
                transition={{ duration: 0.34, ease: "easeOut" }}
                style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
              />
              <circle cx={p.x} cy={p.y} r="5" fill="#ffffff" fillOpacity="0.95" />
            </motion.g>
          );
        })}

        {/* The signal. Present only while it is travelling, so there is nothing parked on the path
            between cycles. */}
        {!reduced && sending && (
          <motion.circle
            r="3.6"
            fill="#ffffff"
            initial={{ cx: A.x, cy: A.y, opacity: 0 }}
            animate={{
              cx: [A.x, pointAt(0.5).x, B.x],
              cy: [A.y, pointAt(0.5).y, B.y],
              opacity: [0, 1, 1],
            }}
            transition={{ duration: 0.82, ease: "easeInOut", times: [0, 0.5, 1] }}
          />
        )}
      </svg>

      </div>
    </div>
  );
}
