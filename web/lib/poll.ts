"use client";

import { useEffect, useRef } from "react";

/// setInterval that stops while the tab is hidden, and runs once on the way back.
///
/// Monad's public RPC allows 15 eth_call per second. Every screen here polls, each poll is several
/// reads, and a browser will happily keep four background tabs doing that — which is how a laptop
/// with a few tabs open started getting "requests limited to 15/sec" on every read at once: titles
/// fell back to "PeerProof event", balances stopped updating, and the failures looked like
/// unrelated bugs in four different places.
///
/// A hidden tab has nobody looking at it. It has no business spending the budget that the visible
/// one needs.
export function useVisiblePoll(fn: () => void, ms: number) {
  // Kept in a ref so the interval is not torn down and rebuilt every render — callers pass an
  // inline closure, and a fresh identity each time would restart the timer forever, which is the
  // opposite of polling less. Written in an effect rather than during render: a ref assignment in
  // the render body is a side effect, and React may render without committing.
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (id !== undefined) return;
      id = setInterval(() => saved.current(), ms);
    };
    const stop = () => {
      if (id === undefined) return;
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately: coming back to a stale screen is worse than one extra read.
        saved.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);
}
