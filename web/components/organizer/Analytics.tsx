"use client";

import { SectionTitle } from "@/components/SectionTitle";
import { Skeleton } from "@/components/ui";
import { mon } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import type { EventSummary } from "@/lib/events";

/// Panel 06 of the organizer sheet: 数据分析与结算.
///
/// On the dashboard by default, not behind a selection. An organizer opening this page wants the
/// shape of everything they are running; picking an event first is a step between them and the
/// only question they came with.
///
/// The sheet draws two blocks:
///
///   参与人数趋势   two lines over dates — registrations and confirmations
///   奖励发放状态   a donut at 85%, 425/500 MON 已发放, and a checklist
///
/// Both are here, and both read off the events themselves rather than off logs: every event
/// carries `registered` and `confirmed`, and the escrow holds `deposit × registered` until it
/// settles. That makes this cheap enough to render on arrival, which is the whole point of moving
/// it out from behind a click.
///
/// The trend is across events in date order, not across days. A daily series would need a log read
/// per event and would be mostly flat — events are lumpy, and what an organizer is actually
/// comparing is one evening against the last one.
export default function Analytics({ events }: { events: EventSummary[] | null }) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "en-GB";

  if (!events) return <Skeleton className="h-[320px] w-full rounded-xl" />;

  const ordered = [...events].sort((a, b) => Number(a.attestOpen - b.attestOpen)).slice(-8);
  const settled = events.filter((e) => e.phase === "settled");

  // What the contract is holding, and what it has already let go of. "Paid out" is the deposits of
  // events that have settled — the contract pays the attendees directly, so once an event settles
  // its escrow is gone from here by definition.
  const held = events
    .filter((e) => e.phase !== "settled")
    .reduce((n, e) => n + e.deposit * BigInt(e.registered), 0n);
  const releasedTotal = settled.reduce((n, e) => n + e.deposit * BigInt(e.registered), 0n);
  const total = held + releasedTotal;
  const pct = total > 0n ? Number((releasedTotal * 100n) / total) : 0;

  const peak = Math.max(1, ...ordered.map((e) => Math.max(e.registered, e.capacity ? 0 : 0)));

  return (
    // Charts do not need a panel; they need a baseline and something to say. The border and the
    // fill went with the rest of the dashboard's boxes — what separates this from the list above
    // is a rule and a screenful of air.
    <section className="border-t border-line pt-8">
      <SectionTitle zh={t("organizer.analytics")} en="Analytics & Payout" />

      <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ── 参与人数趋势 ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] font-medium">{t("organizer.trend")}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-faint">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-[2px] w-4 rounded-full bg-accent-2" />
                {t("organizer.seriesRegistered")}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-[2px] w-4 rounded-full bg-ok" />
                {t("organizer.seriesConfirmed")}
              </span>
            </p>
          </div>

          {ordered.length === 0 ? (
            <p className="mt-6 text-[15px] text-faint">{t("organizer.trendEmpty")}</p>
          ) : (
            <>
              <Lines
                registered={ordered.map((e) => e.registered)}
                confirmed={ordered.map((e) => e.confirmed)}
                peak={peak}
              />
              <div className="mt-2 flex gap-2">
                {ordered.map((e) => (
                  <span key={e.id.toString()} className="flex-1 truncate text-center text-[12px] text-faint">
                    {new Date(Number(e.attestOpen) * 1000).toLocaleDateString(locale, {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── 奖励发放状态 ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          <p className="text-[15px] font-medium">{t("organizer.payoutState")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <Donut pct={pct} />
            <div className="min-w-0">
              <p className="text-[22px] font-semibold leading-none tabular-nums">
                {total === 0n ? "0 MON" : `${mon(releasedTotal)}`}
              </p>
              <p className="mt-1.5 text-[13.5px] text-faint">
                {t("organizer.releasedOf", { total: total === 0n ? "0 MON" : mon(total) })}
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2 text-[14px]">
            <Check done={settled.length > 0} label={t("organizer.stepSettled", { n: settled.length })} />
            <Check done={releasedTotal > 0n} label={t("organizer.stepReleased", { amount: mon(releasedTotal) })} />
            <Check done={false} label={t("organizer.stepHeld", { amount: mon(held) })} />
          </ul>
        </div>
      </div>
    </section>
  );
}

/// Two polylines on one vertical scale. Separate scales would put both at the top of the box and
/// make "28 of 40 confirmed" look the same as "40 of 40".
function Lines({
  registered,
  confirmed,
  peak,
}: {
  registered: number[];
  confirmed: number[];
  peak: number;
}) {
  const W = 100;
  const H = 40;
  const path = (series: number[]) =>
    series
      .map((n, i) => {
        const x = series.length === 1 ? W / 2 : (i / (series.length - 1)) * W;
        return `${i ? "L" : "M"}${x.toFixed(2)} ${(H - (n / peak) * H).toFixed(2)}`;
      })
      .join(" ");

  return (
    <div className="mt-4 h-[150px]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-line"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={path(registered)}
          fill="none"
          stroke="var(--color-accent-2)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(confirmed)}
          fill="none"
          stroke="var(--color-ok)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/// The sheet's ring. Drawn with a dash offset rather than an arc path so a value of 0 and a value
/// of 100 are the same shape with different numbers, instead of two different bits of geometry.
function Donut({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-[92px] w-[92px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-line" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute text-[17px] font-semibold tabular-nums">{pct}%</span>
    </span>
  );
}

function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
          done ? "bg-ok/20 text-ok" : "bg-line text-faint"
        }`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={done ? "text-fg" : "text-faint"}>{label}</span>
    </li>
  );
}
