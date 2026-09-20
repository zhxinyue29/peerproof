"use client";

import { useMemo, useState } from "react";
import CoverImage from "@/components/CoverImage";
import { Skeleton } from "@/components/ui";
import { mon } from "@/lib/format";
import { SectionTitle } from "@/components/SectionTitle";
import { useLang } from "@/lib/i18n";
import type { EventSummary } from "@/lib/events";

/// The organizer's own events, as the dashboard sheet draws them: filter chips over a grid of
/// cards, each with a cover, a status pill, a date, a place and a fill bar.
///
/// This replaced a table. The table was not wrong — it fitted five facts per row and reflowed on a
/// phone — but the sheet wants the fill bar, and a bar is the one thing a row cannot carry without
/// becoming a chart in a cell. "128 / 200" is arithmetic; the bar is the same fact at a glance,
/// which is what somebody running four events at once is actually scanning for.
///
/// The bar has two segments and the brighter one is `confirmed`: people the room has vouched for.
/// It is the only figure here an organizer cannot influence, which is why it gets its own colour
/// rather than being folded into the total.
///
/// Chips filter on phase, which the contract decides. The sheet also shows counts beside each chip;
/// those are real — they are just the length of the filtered list.

type Filter = "all" | "live" | "upcoming" | "done";

function bucket(e: EventSummary): Filter {
  if (e.phase === "live") return "live";
  if (e.phase === "registering" || e.phase === "waiting") return "upcoming";
  return "done";
}

function pct(n: number, of: number) {
  if (!of) return 0;
  return Math.max(0, Math.min(100, (n / of) * 100));
}

/// The sheet puts a small outline glyph before the date and the place on every card.
function Glyph({ kind }: { kind: "clock" | "pin" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d={
          kind === "clock"
            ? "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"
            : "M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        }
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function OrganizerEventCards({
  events,
  selectedId,
  onSelect,
}: {
  /// `null` while the first read is in flight — distinct from an organizer with no events.
  events: EventSummary[] | null;
  selectedId: bigint | null;
  onSelect: (id: bigint) => void;
}) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "en-GB";
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: 0, live: 0, upcoming: 0, done: 0 };
    for (const e of events ?? []) {
      c.all += 1;
      c[bucket(e)] += 1;
    }
    return c;
  }, [events]);

  if (!events) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const shown = events.filter((e) => filter === "all" || bucket(e) === filter);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <SectionTitle zh={t("organizer.yourEvents")} en="My Events" />
          {/* The sheet's "查看全部 →". It clears the chip rather than going anywhere: there is one
              list and this is it, so a link to a second page would be a claim about how much there
              is that is not true. Only shown while a filter is hiding something. */}
          {filter !== "all" && counts.all > shown.length && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-[15px] text-accent-2 transition-colors hover:text-fg"
            >
              {t("events.seeAll")} <span aria-hidden>→</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-6 border-b border-line">
          {(
            [
              ["all", t("me.filterAllN", { n: counts.all })],
              ["live", t("organizer.chipLive", { n: counts.live })],
              ["upcoming", t("organizer.chipUpcoming", { n: counts.upcoming })],
              ["done", t("organizer.chipDone", { n: counts.done })],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              // Text, not pills. What is selected is said in colour and a rule under it — four
              // bordered capsules above a list of events is four more rectangles on a page whose
              // subject is the events.
              className={`relative min-h-[40px] px-1 text-[15px] transition-colors ${
                filter === key
                  ? "font-medium text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-accent"
                  : "text-dim hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="border-t border-line py-8 text-[16px] text-dim">
          {events.length === 0 ? t("organizer.yourEventsEmpty") : t("events.noMatchBody")}
        </p>
      ) : (
        <ul
          // Rows, not a grid of cards.
          // An organizer scanning for the room they are running tonight reads down one column of
          // titles; a three-across grid of bordered cards makes the same eight events into eight
          // rectangles the eye has to enter one at a time. Everything each card carried is still
          // here — cover, title, when, where, the two counts, the bar and the way in — laid along
          // a line instead of stacked inside a box.
          className="min-w-0"
        >
          {shown.map((e) => {
            const chosen = selectedId === e.id;
            const when = new Date(Number(e.attestOpen) * 1000);
            const phaseWord = t(
              `events.${e.phase === "live" ? "openNow" : e.phase === "settled" ? "settled" : "upcoming"}`,
            );
            return (
              <li
                key={e.id.toString()}
                className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 border-b py-4 transition-colors sm:flex-nowrap sm:gap-x-6 ${
                  chosen ? "border-accent/40 bg-white/[0.02]" : "border-line/70 hover:bg-white/[0.02]"
                }`}
              >
                <CoverImage
                  id={e.id}
                  src={e.listing.cover}
                  nodes={7}
                  className="h-[52px] w-[84px] shrink-0 rounded-lg"
                />

                <div className="min-w-0 flex-1 basis-[46%] sm:basis-auto">
                  <p className="text-[16px] font-medium leading-snug sm:truncate sm:text-[17px]">
                    {e.listing.title || t("common.eventNumber", { id: e.id.toString() })}
                  </p>
                  <p className="mt-1 truncate text-[14px] text-faint">
                    {when.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                    {e.listing.venue ? ` · ${e.listing.venue}` : ""}
                  </p>
                </div>

                {/* State in a word and a colour. Mint only where the chain has confirmed somebody;
                    a room that has not opened yet is not a state worth colouring. */}
                <span
                  className={`w-[4.5em] shrink-0 text-[14px] ${
                    e.phase === "live" ? "text-ok" : e.phase === "settled" ? "text-faint" : "text-dim"
                  }`}
                >
                  {phaseWord}
                </span>

                <div className="w-[128px] shrink-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] tabular-nums text-dim">
                      {e.registered}
                      <span className="text-faint">/{e.capacity || "∞"}</span>
                    </span>
                    <span className="text-[14px] tabular-nums text-ok">{e.confirmed || ""}</span>
                  </div>
                  <div
                    className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-line"
                    role="img"
                    aria-label={`${e.registered} / ${e.capacity}`}
                  >
                    <div className="flex h-full w-full">
                      <span className="h-full bg-ok" style={{ width: `${pct(e.confirmed, e.capacity)}%` }} />
                      <span
                        className="h-full bg-accent"
                        style={{ width: `${pct(e.registered - e.confirmed, e.capacity)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* The one control on the row, and the only thing here with a boundary. */}
                <button
                  type="button"
                  onClick={() => onSelect(e.id)}
                  className="min-h-[40px] shrink-0 rounded-lg border border-line-2 px-4 text-[14px] text-dim transition-colors hover:border-accent hover:text-fg"
                >
                  {t("organizer.manage")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
