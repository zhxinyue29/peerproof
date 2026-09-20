"use client";

import { useState } from "react";
import EventCover from "@/components/EventCover";
import { basePath } from "@/lib/chain";

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
  // http(s) links and inlined images. `data:image/` is allowed and every other scheme is not —
  // a `javascript:` or `data:text/html` string in a src is not an image problem, and the contract
  // does not validate, so every render site has to. This rejected `data:` outright at first, which
  // meant a cover somebody had just paid gas to store on chain rendered as the fallback pattern.
  const ok = /^https?:\/\/\S+$/i.test(url) && !broken;

  // No cover set: one of the product's own pictures, chosen by event id so the same event always
  // looks the same. The constellation this used to draw was honest — nothing on chain is visual,
  // so it drew the mechanism instead — but beside a design whose cards are photographs it read as
  // a placeholder, and a placeholder on every card is what a product looks like before it has
  // anything in it. The constellation stays, faintly, over the picture: it is still the figure the
  // rest of the product argues with.
  if (!ok) {
    const n = Number(((id % 3n) + 3n) % 3n) + 1;
    return (
      <span className={`relative block overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${basePath}/cover-${n}.webp`}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <EventCover id={id} nodes={nodes} className="absolute inset-0 h-full w-full opacity-35" />
      </span>
    );
  }
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
