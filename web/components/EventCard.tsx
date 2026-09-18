"use client";

import Link from "next/link";
import { useLang, useT, type TFn } from "@/lib/i18n";
import EventCover from "@/components/EventCover";
import { both, countdown, shortAddress } from "@/lib/format";
import { chainNowMs } from "@/lib/chain";
import { stillJoinable, type EventSummary, type Phase } from "@/lib/events";

/// One event, as a card in the directory grid.
///
/// The V3 render (`01-events-desktop.png`) puts a category pill on the cover and a place under the
/// time — "Meetup", "Singapore". Neither exists: the escrow stores money and timestamps, the
/// directory stores a title, a blurb and a url, and nothing anywhere stores a city. Inventing them
/// would cost this product the only thing it is selling, so the pill carries the phase (which is
/// derived from on-chain timestamps) and the second line carries the event id and its host, which
/// are facts. Everything else about the shape follows the render.
///
/// Wall-clock, not a countdown: the design's first meta line answers "when is this", and "in 6h"
/// is not something you can put in a calendar. The window shown is the check-in window, because
/// that is the part of an event this app can prove — registration opening earlier is paperwork.
function whenLine(locale: string, openSec: bigint, closeSec: bigint): string {
  const start = new Date(Number(openSec) * 1000);
  const end = new Date(Number(closeSec) * 1000);
  const time = (d: Date) =>
    // 24h everywhere, including English. The design shows `18:00–22:00`, and at a door in a
    // second language "6:00 PM" is one more thing to decode.
    d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });

  const day = (d: Date) => {
    // Calendar days apart, not 24-hour blocks: an event at 23:00 tonight is "today", not "in 0.9
    // days", and one at 01:00 is "tomorrow" even though it is four hours away.
    const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((midnight(d) - midnight(new Date(chainNowMs()))) / 86_400_000);
    if (Math.abs(diff) <= 1) {
      // Gives "today"/"tomorrow" in English and "今天"/"明天" in Chinese without a dictionary key —
      // the browser already knows how to say this in every locale we could ever ship.
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day");
    }
    if (diff > 1 && diff < 7) return d.toLocaleDateString(locale, { weekday: "short" });
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  };

  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${day(start)} · ${time(start)}–${time(end)}`
    : // An overnight event is rare and reads as a typo if the end date is dropped.
      `${day(start)} ${time(start)} → ${day(end)} ${time(end)}`;
}

const PHASE_TONE: Record<Phase, string> = {
  // Never green. Green in this product means "objectively verified", and an event being open is a
  // schedule, not a proof of anything.
  registering: "text-accent-2",
  waiting: "text-accent-2",
  live: "text-accent-2",
  closed: "text-dim",
  cancelled: "text-dim",
  settled: "text-dim",
};

export default function EventCard({ event: e }: { event: EventSummary }) {
  const t = useT();
  const { lang } = useLang();
  const locale = lang === "zh" ? "zh-Hans" : "en";
  const now = Math.floor(chainNowMs() / 1000);

  const phaseLabel =
    e.phase === "live"
      ? t("events.openNow")
      : e.phase === "registering" || e.phase === "waiting"
        ? t("events.upcoming")
        : e.phase === "cancelled"
          ? t("events.cancelled")
          : e.phase === "settled"
            ? t("events.settled")
            : t("events.finished");

  // A live event that still takes walk-ins is the one thing a listing can tell somebody that they
  // could not guess from a poster, so the deadline outranks the host line when both could show.
  const joinable = stillJoinable(now, e.registerDeadline, e.registered, e.capacity, e.status);
  const tail = joinable
    ? t("events.closesIn", { t: countdown(Number(e.registerDeadline) - now) })
    : e.phase === "live"
      ? t("events.endsIn", { t: countdown(Number(e.attestClose) - now) })
      : shortAddress(e.organizer);

  return (
    // The whole card is the link and "View" is a span inside it. Two nested controls pointing at
    // the same page would be two tab stops and two announcements for one destination; a card you
    // can only enter through a 70px button is worse on a phone.
    <Link
      href={`/event?event=${e.id}`}
      aria-label={e.listing.title || t("common.eventNumber", { id: e.id.toString() })}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative h-[112px] md:h-[128px]">
        <EventCover id={e.id} className="absolute inset-0" />
        <span
          className={`absolute left-3 top-3 rounded-full bg-ink/60 px-2.5 py-1 text-[14px] font-medium backdrop-blur-sm ${PHASE_TONE[e.phase]}`}
        >
          {phaseLabel}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:p-5">
        {/* Two lines, then ellipsis. One line cuts real event names mid-word at this width; three
            would let one card push every other card in the row taller. */}
        <h3 className="line-clamp-2 text-[18px] font-semibold leading-snug">
          {e.listing.title || t("common.eventNumber", { id: e.id.toString() })}
        </h3>

        {/* 14px `dim`, not `faint`: the spec reserves muted grey for optional metadata, and when
            an event happens is the second thing anyone reads. */}
        <div className="min-w-0 space-y-1.5 text-[14px] text-dim">
          <p className="flex items-center gap-2">
            <ClockIcon />
            <span className="truncate first-letter:uppercase">
              {whenLine(locale, e.attestOpen, e.attestClose)}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <TagIcon />
            <span className="truncate tabular-nums">
              #{e.id.toString()} · {tail}
            </span>
          </p>
        </div>

        {/* `mt-auto` so the footers of a row line up no matter how long the titles are. */}
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[16px] font-semibold leading-none">{both(e.deposit)}</p>
            <Vouches k={e.k} t={t} />
            <p className="text-[14px] text-dim">
              <span className="tabular-nums">
                {e.registered}/{e.capacity}
              </span>{" "}
              {t("events.registered")}
            </p>
          </div>
          <span className="flex min-h-[44px] shrink-0 items-center rounded-xl bg-accent px-4 text-[15px] font-medium text-white transition-colors group-hover:bg-accent-2">
            {t("common.view")}
          </span>
        </div>
      </div>
    </Link>
  );
}

/// The dot row from the render. It is `k` — how many people have to vouch for you before the
/// contract counts you as present — because that is the one number that makes this event different
/// from a ticket, and it is a small fixed count that a row of dots can actually show. A capacity
/// bar would have been the obvious reading of three dots, but 128 of 200 is not three of anything.
function Vouches({ k, t }: { k: number; t: TFn }) {
  const label = t("events.vouchesNeeded", { k });
  return (
    <span className="flex gap-1" role="img" aria-label={label} title={label}>
      {Array.from({ length: Math.min(k, 8) }, (_, i) => (
        <span key={i} className="h-2 w-2 rounded-full bg-line-2" />
      ))}
    </span>
  );
}

/* Inline rather than added to NavIcons: those are nav glyphs at a nav's weight, and these two sit
   at 14px beside body text. */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-faint">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-faint">
      <path
        d="M4 10h16M4 14h16M10 4l-2 16M16 4l-2 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
