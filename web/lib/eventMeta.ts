"use client";

import { useEffect, useState } from "react";
import { sampleListing } from "@/lib/sampleEvents";
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
  /// Where it happens. Empty for every listing described before the field existed.
  venue: string;

  /// Comma separated, as the organizer typed them.
  tags: string;
};

export const fallbackMeta: EventMeta = {
  title: "PeerProof event",
  blurb: "",
  url: "",
  venue: "",
  tags: "",
};

/// Returns the fallback until the read lands, so a screen never blocks on a description. The
/// numbers are what matter; the words are decoration that arrives a moment later.
export function useEventMeta(eventId: bigint): EventMeta {
  const [meta, setMeta] = useState<EventMeta>(fallbackMeta);

  useEffect(() => {
    // A sample's words come from the literal, not from a contract that has never heard of it.
    // Without this the page would spend four retries asking about an event with a negative id and
    // then settle on the generic fallback title.
    const fromSample = sampleListing(eventId);
    if (fromSample) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMeta({ title: fromSample.title, blurb: fromSample.blurb, url: fromSample.url, venue: fromSample.venue, tags: fromSample.tags });
      return;
    }
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
            setMeta({ title: l.title || fallbackMeta.title, blurb: l.blurb, url: l.url, venue: l.venue, tags: l.tags });
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
