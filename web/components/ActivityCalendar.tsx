"use client";

import { useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import type { EventSummary } from "@/lib/events";

/// "Activity calendar" from the profile sheet: a month grid with the days this account did
/// something marked.
///
/// Every mark is an event's `attestOpen` — the moment its doors open, which is the only timestamp
/// the contract has that corresponds to a day somebody was somewhere. Nothing is inferred and
/// nothing is filled in: a month with no events is an empty grid, and it says so.
///
/// Two dot colours, matching the sheet: attended (this account was confirmed present) and hosted.
/// The sheet has a third for "rewards received", which this product has no concept of.
///
/// The month starts on Monday, which is what the sheet draws, and is also right for the two places
/// this product is being demonstrated.

type Mark = { day: number; attended: boolean; hosted: boolean };

export default function ActivityCalendar({
  joined,
  hosted,
}: {
  /// Events this account registered for, with whether the room confirmed them.
  joined: { event: EventSummary; confirmed: boolean }[];
  hosted: EventSummary[];
}) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "en-GB";
  // Anchored on today and moved by the arrows. Held as a year/month pair rather than a Date so
  // stepping past December cannot land on a day that does not exist in the next month.
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [year, month] = ym;

  const marks = useMemo(() => {
    const byDay = new Map<number, Mark>();
    const add = (seconds: bigint, kind: "attended" | "hosted") => {
      const d = new Date(Number(seconds) * 1000);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      const cur = byDay.get(day) ?? { day, attended: false, hosted: false };
      cur[kind] = true;
      byDay.set(day, cur);
    };
    for (const j of joined) if (j.confirmed) add(j.event.attestOpen, "attended");
    for (const e of hosted) add(e.attestOpen, "hosted");
    return byDay;
  }, [joined, hosted, year, month]);

  const first = new Date(year, month, 1);
  // Monday-first: getDay() is 0 for Sunday, so Sunday becomes the seventh column rather than the
  // first. Off by one here silently shifts every mark in the grid by a day.
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const label = first.toLocaleDateString(locale, { year: "numeric", month: "long" });

  const step = (by: number) => {
    const d = new Date(year, month + by, 1);
    setYm([d.getFullYear(), d.getMonth()]);
  };
  // Nothing is scheduled beyond the events already read, so walking forward for ever shows empty
  // grids. One month past today is enough to see an event that opens next week.
  const atEnd = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

  return (
    <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t("me.calendar")}</h2>
        <div className="flex items-center gap-1">
          <Arrow dir="prev" onClick={() => step(-1)} label={t("me.calPrev")} />
          <span className="min-w-[8.5ch] text-center text-[14px] text-dim">{label}</span>
          <Arrow dir="next" onClick={() => step(1)} label={t("me.calNext")} disabled={atEnd} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {weekdayInitials(locale).map((d, i) => (
          <span key={i} className="pb-1 text-[13px] text-faint">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const m = marks.get(day);
          const today =
            year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
          return (
            <span
              key={day}
              // A title rather than an aria-label: the cell is not interactive, and a grid of 31
              // labelled cells read out one by one is worse than the summary underneath.
              title={m ? t(m.hosted ? "me.calHosted" : "me.calAttended") : undefined}
              className={`flex aspect-square items-center justify-center rounded-md text-[13px] tabular-nums ${
                m
                  ? m.hosted
                    ? "bg-ok/25 font-medium text-fg"
                    : "bg-accent/30 font-medium text-fg"
                  : today
                    ? "border border-line-2 text-dim"
                    : "text-faint"
              }`}
            >
              {day}
            </span>
          );
        })}
      </div>

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px] bg-accent/30" /> {t("me.calAttended")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px] bg-ok/25" /> {t("me.calHosted")}
        </span>
        {marks.size === 0 && <span>{t("me.calEmpty")}</span>}
      </p>
    </section>
  );
}

/// Single letters, from the runtime rather than a hardcoded list — "一二三四五六日" and "MTWTFSS"
/// are different lengths and different orders, and the grid has to agree with the locale it is
/// labelled in.
function weekdayInitials(locale: string) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
}

function Arrow({
  dir,
  onClick,
  label,
  disabled,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-dim transition-colors hover:text-fg disabled:opacity-35"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d={dir === "prev" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
