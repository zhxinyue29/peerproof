"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[236px] w-full rounded-2xl" />
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
        <div className="flex flex-wrap gap-2">
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
              className={`min-h-[44px] rounded-full border px-4 text-[14px] transition-colors ${
                filter === key
                  ? "border-accent bg-accent/15 text-fg"
                  : "border-line-2 text-dim hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel p-6 text-[16px] text-dim">
          {events.length === 0 ? t("organizer.yourEventsEmpty") : t("events.noMatchBody")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => {
            const chosen = selectedId === e.id;
            const when = new Date(Number(e.attestOpen) * 1000);
            return (
              <div
                key={e.id.toString()}
                className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-panel transition-colors ${
                  chosen ? "border-accent" : "border-line hover:border-line-2"
                }`}
              >
                <div className="relative h-[96px]">
                  <CoverImage id={e.id} src={e.listing.cover} nodes={7} className="absolute inset-0 h-full w-full" />
                  <span
                    // Solid colour, as the sheet draws them — 进行中 reads as a state the room is
                    // in, and a translucent grey pill over a photograph reads as a caption.
                    className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[13px] font-medium ${
                      e.phase === "live"
                        ? "bg-ok text-[#06251a]"
                        : e.phase === "settled"
                          ? "bg-[#2b3350] text-dim"
                          : "bg-accent text-white"
                    }`}
                  >
                    {t(`events.${e.phase === "live" ? "openNow" : e.phase === "settled" ? "settled" : "upcoming"}`)}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                  <p className="truncate text-[16px] font-medium">
                    {e.listing.title || t("common.eventNumber", { id: e.id.toString() })}
                  </p>
                  {/* Two lines with icons, as the sheet draws them. One line held both, and a
                      venue of any length pushed the date past the truncation — so the card showed
                      a place and no date, which is the half an organizer needs least. */}
                  <p className="flex items-center gap-1.5 text-[14px] text-dim">
                    <Glyph kind="clock" />
                    <span className="truncate">
                      {when.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </p>
                  {e.listing.venue && (
                    <p className="flex items-center gap-1.5 text-[14px] text-dim">
                      <Glyph kind="pin" />
                      <span className="truncate">{e.listing.venue}</span>
                    </p>
                  )}

                  <div className="mt-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-medium tabular-nums">
                        {e.registered} / {e.capacity || "∞"}
                        <span className="ml-1.5 text-[13px] font-normal text-faint">
                          {t("organizer.registeredShort")}
                        </span>
                      </span>
                      {/* The percentage, right-aligned above the bar, as the sheet sets it. A bar
                          on its own is a shape; the number is what somebody reads out loud when
                          they are deciding whether to worry. */}
                      <span className="text-[13px] tabular-nums text-faint">
                        {Math.round(pct(e.registered, e.capacity))}%
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line"
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
                    {e.confirmed > 0 && (
                      <p className="mt-1.5 text-[13px] text-ok">
                        {e.confirmed} {t("event.confirmedPresentShort")}
                      </p>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onSelect(e.id)}
                      className="min-h-[44px] flex-1 rounded-xl bg-accent px-4 text-[15px] font-medium text-white transition-transform duration-100 active:scale-[0.985]"
                    >
                      {t("organizer.manage")}
                    </button>
                    <Link
                      href={`/event?event=${e.id}`}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-line-2 px-4 text-[15px] text-dim transition-colors hover:border-accent hover:text-fg"
                    >
                      {t("common.view")}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
