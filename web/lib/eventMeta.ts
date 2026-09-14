"use client";

import { useEffect, useState } from "react";
import { readListing } from "@/lib/directory";

/// Where an event's words come from.
///
/// They used to come from a hardcoded map in this file, which meant only somebody editing the
/// repository could name an event — every event an organizer actually created showed up as
/// "PeerProof event". They now come from EventDirectory, a contract that holds no money and cannot
/// affect who gets paid.
///
/// The escrow still stores none of this. A title has no bearing on settlement, so it has no
/// business in the contract that decides settlement.
export type EventMeta = {
  title: string;
  blurb: string;
  url: string;
};

export const fallbackMeta: EventMeta = {
  title: "PeerProof event",
  blurb: "",
  url: "",
};

/// Returns the fallback until the read lands, so a screen never blocks on a description. The
/// numbers are what matter; the words are decoration that arrives a moment later.
export function useEventMeta(eventId: bigint): EventMeta {
  const [meta, setMeta] = useState<EventMeta>(fallbackMeta);

  useEffect(() => {
    let live = true;
    // Retried, because one read is one chance. A single failed request left the event titled
    // "PeerProof event" for as long as the page stayed open, with the real title on chain and
    // nothing going back for it. Stops as soon as words arrive; a genuinely undescribed event
    // costs four cheap reads and then sits quiet.
    let tries = 0;
    const attempt = () => {
      void readListing(eventId)
        .then((l) => {
          if (!live) return;
          if (l.title || l.blurb || l.url) {
            setMeta({ title: l.title || fallbackMeta.title, blurb: l.blurb, url: l.url });
            return;
          }
          if (++tries < 4) setTimeout(attempt, 1500 * tries);
        })
        .catch(() => {
          if (live && ++tries < 4) setTimeout(attempt, 1500 * tries);
        });
    };
    attempt();
    return () => {
      live = false;
    };
  }, [eventId]);

  return meta;
}
