"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EventCover from "@/components/EventCover";
import { Skeleton } from "@/components/ui";
import { mon } from "@/lib/format";
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
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
          {t("organizer.yourEvents")}
        </h2>
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
              className={`min-h-[40px] rounded-full border px-4 text-[14px] transition-colors ${
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
                  <EventCover id={e.id} nodes={7} className="absolute inset-0 h-full w-full" />
                  <span
                    className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-medium backdrop-blur-sm ${
                      e.phase === "live"
                        ? "bg-ok/20 text-ok"
                        : e.phase === "settled"
                          ? "bg-[#0d1626]/85 text-faint"
                          : "bg-[#0d1626]/85 text-dim"
                    }`}
                  >
                    {t(`events.${e.phase === "live" ? "openNow" : e.phase === "settled" ? "settled" : "upcoming"}`)}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                  <p className="truncate text-[16px] font-medium">
                    {e.listing.title || t("common.eventNumber", { id: e.id.toString() })}
                  </p>
                  <p className="truncate text-[14px] text-dim">
                    {e.listing.venue ? `${e.listing.venue} · ` : ""}
                    {when.toLocaleDateString(locale)}
                  </p>

                  <div className="mt-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-medium tabular-nums">
                        {e.registered} / {e.capacity || "∞"}
                      </span>
                      <span className="text-[13px] text-faint">{mon(e.deposit)}</span>
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
