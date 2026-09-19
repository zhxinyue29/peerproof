"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";

/// One attestation crossing the room, on the ring the artwork already draws.
///
/// The version before this drew its own three nodes and a dashed triangle between them. The
/// triangle did not line up with the three people in the picture, so it read as an unrelated shape
/// laid over a scene that was already busy — noise rather than meaning, which is what you said and
/// what it was.
///
/// The artwork's light ring passes through all three phones. That was worth solving rather than
/// eyeballing: the circle through the three phone positions comes out at centre (525, 470), radius
/// 224 in the picture's own 1460×838 space, and overlaying it lands on the painted ring. So there
/// is nothing here to re-draw. The still image already has the room, the ring, the glow at each
/// phone and the three verdicts; the one thing it cannot have is something moving along the ring.
/// That is all this is now — a single point travelling one leg, from one person's phone to the
/// next. A leg every 2.6s, so the ring is rarely empty — but each pass is still one attestation
/// arriving rather than a light that is permanently on, which is the difference between a
/// demonstration and a screensaver.
///
/// Sized in the picture's coordinates, which is not the same as sized on screen. The viewBox is
/// 1460 wide and the box it renders into is about 680, so r=13 came out as a 12px dot on a
/// 1440×810 page — present in the DOM, cycling correctly, and far too small to notice. r=26 is
/// what 0.466 scale asks for.
///
/// Deliberately not: static nodes (the picture has them, lit better than I can), a drawn path (it
/// has that too), a continuous orbit (motion with no event behind it is decoration), and no badge
/// (three are painted into the scene already).

const CX = 525;
const CY = 470;
const R = 224;

/// Where each phone sits on the ring, as an angle — derived from the phone positions rather than
/// picked: left boy (358, 620), top girl (502, 246), right girl (717, 586).
const PHONES = [
  Math.atan2(620 - CY, 358 - CX),
  Math.atan2(246 - CY, 502 - CX),
  Math.atan2(586 - CY, 717 - CX),
];

/// Always the short way round, so the signal never takes the long arc behind somebody's back.
function shortestDelta(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const SAMPLES = 24;

export default function HeroProofAnimation({
  className = "",
  label,
}: {
  className?: string;
  label: string;
}) {
  const { reduced } = useMotionPrefs();
  const [leg, setLeg] = useState(-1);

  useEffect(() => {
    if (reduced) return;
    // A chain per cycle rather than an interval: a tab backgrounded mid-flight comes back to a
    // clean rest instead of to a queue of half-finished legs.
    let timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const run = () => {
      setLeg(i % PHONES.length);
      i += 1;
      timers.push(setTimeout(() => setLeg(-1), 1450));
      timers.push(setTimeout(run, 2600));
    };
    timers.push(setTimeout(run, 400));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  // The leg in flight, sampled along the ring so Motion can tween through the points.
  const path = (() => {
    if (leg < 0) return null;
    const from = PHONES[leg];
    const delta = shortestDelta(from, PHONES[(leg + 1) % PHONES.length]);
    const cx: number[] = [];
    const cy: number[] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const a = from + (delta * s) / SAMPLES;
      cx.push(CX + R * Math.cos(a));
      cy.push(CY + R * Math.sin(a));
    }
    return { cx, cy };
  })();

  return (
    // The caller owns the position; this only owns the stacking context. Two position utilities on
    // one element are settled by stylesheet order rather than by the order they were written, which
    // has already put this component in the wrong corner once.
    <div className={className}>
      <div className="relative h-full w-full">
        <svg viewBox="0 0 1460 838" className="h-full w-full" role="img" aria-label={label}>
          {path && (
            <motion.circle
              r="26"
              fill="#ffffff"
              style={{ filter: "drop-shadow(0 0 46px rgba(200,186,255,1))" }}
              initial={{ cx: path.cx[0], cy: path.cy[0], opacity: 0 }}
              animate={{
                cx: path.cx,
                cy: path.cy,
                // Fades in as it leaves and out as it lands, so it reads as a signal passing rather
                // than a bead that pops into existence and disappears.
                opacity: [0, 1, 1, 1, 0],
              }}
              transition={{ duration: 1.35, ease: "easeInOut" }}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
