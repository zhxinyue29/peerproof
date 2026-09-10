/// Display-only event metadata.
///
/// The contract deliberately stores none of this — it holds only the fields that decide where
/// money goes. Titles and venue names have no bearing on settlement, so putting them on chain
/// would be paying gas for decoration and giving the organizer another parameter to fiddle with.
///
/// Editable at any time. Nothing here can change a payout.
export type EventMeta = {
  title: string;
  /// Free-form, e.g. "Sat 21 Sep · 19:00 · Some café". Authoritative timing lives on chain; this
  /// is the human-readable line shown before anyone connects. Omit rather than fill with
  /// placeholder text — it renders in production.
  when?: string;
};

export const eventMeta: Record<string, EventMeta> = {
  // Keyed by event id, as a string.
  "1": {
    title: "Monad meetup — attendance-backed RSVP",
  },
};

export const fallbackMeta: EventMeta = {
  title: "PeerProof event",
};

export function metaFor(eventId: bigint): EventMeta {
  return eventMeta[eventId.toString()] ?? fallbackMeta;
}
