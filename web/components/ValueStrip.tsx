"use client";

import { useT } from "@/lib/i18n";

/// The band under the hero: four claims, each an icon, a line, and a line under it.
///
/// It replaces three pills that sat directly beneath the two entry cards, where they read as
/// leftovers from the buttons above them. On its own band, divided, it reads as the summary it is —
/// and the fourth claim (that confirmation lands in seconds) is the one thing about this product
/// that is a property of Monad rather than of the design, so it was worth the room.

const ShieldIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 3 4.8 5.8v5.4c0 4.2 3 7.6 7.2 9 4.2-1.4 7.2-4.8 7.2-9V5.8L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="m9.2 12 2 2 3.6-3.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PeersIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="8.6" cy="8.4" r="3.1" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3.4 19a5.2 5.2 0 0 1 10.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="16.8" cy="9.4" r="2.4" stroke="currentColor" strokeWidth="1.5" opacity="0.72" />
    <path d="M14.8 18.6a4.5 4.5 0 0 1 5.8-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.72" />
  </svg>
);

const RecordIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M6 3.6h7.6L18.4 8v12.4H6V3.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M13.4 3.6V8h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="m9 14.4 1.9 1.9 3.6-3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BoltIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M13.4 2.8 5.6 13.4h5.3l-.9 7.8 8-10.8h-5.4l.8-7.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

export default function ValueStrip() {
  const t = useT();
  const items = [
    { icon: ShieldIcon, title: "strip.custodyTitle", body: "strip.custodyBody" },
    { icon: PeersIcon, title: "strip.peerTitle", body: "strip.peerBody" },
    { icon: RecordIcon, title: "strip.publicTitle", body: "strip.publicBody" },
    { icon: BoltIcon, title: "strip.fastTitle", body: "strip.fastBody" },
  ];

  return (
    <section className="border-y border-line bg-panel/45">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-8">
        {/* `divide-x` rather than a border on each item: a trailing rule on the last column is the
            kind of thing that only shows up once it is on a projector. */}
        <ul className="grid gap-y-7 py-8 sm:grid-cols-2 md:grid-cols-4 md:gap-y-0 md:divide-x md:divide-line">
          {items.map(({ icon, title, body }) => (
            <li key={title} className="flex min-w-0 items-start gap-3.5 md:px-6 md:first:pl-0 md:last:pr-0">
              <span className="mt-0.5 shrink-0 text-accent-2">{icon}</span>
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold tracking-[-0.005em] text-fg">
                  {t(title)}
                </span>
                <span className="mt-1 block text-[15px] leading-relaxed text-dim">{t(body)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
