"use client";

import { useState } from "react";
import EventCover from "@/components/EventCover";

/// The event's picture if it has one, the generated pattern if it does not.
///
/// Wrapped rather than replaced: an organizer who never set a cover still gets a card that looks
/// like a card, and the generated pattern is derived from the event id so it is stable — the same
/// event is the same colour every time anybody loads the page.
///
/// A link that fails falls back to the pattern instead of leaving a broken-image box. The URL is
/// on chain and nothing keeps it alive; the host can go away long after the event is over, and a
/// listing from last year should still render.
export default function CoverImage({
  id,
  src,
  nodes = 7,
  className = "",
}: {
  id: bigint;
  /// Whatever the organizer typed, which may be empty or may not be a URL.
  src: string;
  nodes?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = src.trim();
  // http(s) only — see CoverField. The contract does not validate, so every render site has to.
  const ok = /^https?:\/\/\S+$/i.test(url) && !broken;

  if (!ok) return <EventCover id={id} nodes={nodes} className={className} />;
  return (
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      // The host the organizer chose does not get to learn which page each attendee was on.
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={`object-cover ${className}`}
    />
  );
}
