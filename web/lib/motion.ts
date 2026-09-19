"use client";

import { useReducedMotion } from "motion/react";

/// One place that decides what motion is allowed, so every component asks the same question.
///
/// `prefers-reduced-motion` is not a preference about taste. It is set by people for whom movement
/// on a screen causes nausea or triggers migraine, and honouring it halfway — keeping the drift,
/// dropping the fade — is the same as not honouring it. So the reduced branch here removes
/// everything that moves and keeps only opacity, fast enough that nothing reads as animation.
///
/// Returned rather than branched at each call site, because the failure mode with motion is a
/// component that forgets to check and slips past review as "just a little one".
export function useMotionPrefs() {
  const reduced = useReducedMotion() ?? false;

  return {
    reduced,

    /// Entry for a stack of elements that should arrive in reading order.
    ///
    /// `delayChildren` and `staggerChildren` are how the spec's 70–90ms cascade is expressed; under
    /// reduced motion both go to zero so everything resolves at once.
    container: {
      hidden: {},
      show: {
        transition: reduced
          ? { staggerChildren: 0, delayChildren: 0 }
          : { staggerChildren: 0.08, delayChildren: 0.05 },
      },
    },

    /// One item in that stack. 12px is deliberately small: far enough to read as arrival, near
    /// enough that nothing moves through text somebody is already reading.
    item: reduced
      ? {
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { duration: 0.15 } },
        }
      : {
          hidden: { opacity: 0, y: 12 },
          show: {
            opacity: 1,
            y: 0,
            // Ease out, no overshoot. A spring here would bounce the headline, and a headline that
            // bounces is a headline nobody reads twice.
            transition: { duration: 0.42, ease: [0.22, 0.61, 0.36, 1] as const },
          },
        },

    /// For cards that arrive when scrolled to rather than on load.
    inView: reduced
      ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.15 } } }
      : {
          hidden: { opacity: 0, y: 16 },
          show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] as const },
          },
        },
  };
}
