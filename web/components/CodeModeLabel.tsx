"use client";

import { useT } from "@/lib/i18n";

/// Which of the evening's two codes this is.
///
/// Both are rotating QR codes read by the same camera, and pilot participants mixed them up: the
/// venue display's code (checks you in, every 30 seconds) and another participant's phone (vouches
/// for them, every 15 seconds). So each carries a name and a glyph of its own wherever it appears —
/// the scanner, the attendee's own code, the venue display. Colour does the rest quietly: the venue
/// code takes `info`, the participant code the violet every vouch is drawn in. Neither takes mint,
/// which on these screens means "confirmed".
export default function CodeModeLabel({
  mode,
  sub,
  className = "",
}: {
  mode: "venue" | "peer";
  /// The line under the name: where this code is shown and how often it changes.
  sub?: string;
  className?: string;
}) {
  const t = useT();
  const venue = mode === "venue";
  return (
    <div className={`min-w-0 ${className}`}>
      <p
        className={`inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.1em] ${
          venue ? "text-info" : "text-accent-2"
        }`}
      >
        {venue ? <DisplayGlyph /> : <PhoneGlyph />}
        {t(venue ? "scan.modeVenue" : "scan.modePeer")}
      </p>
      {sub && <p className="mt-1 text-[14px] leading-snug text-dim">{sub}</p>}
    </div>
  );
}

function DisplayGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PhoneGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
