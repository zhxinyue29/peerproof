"use client";

import Link from "next/link";
import { chainNowMs } from "@/lib/chain";
import { coverFor } from "@/lib/cover";
import { useLang, type TFn } from "@/lib/i18n";
import { Skeleton } from "@/components/ui";
import type { EventSummary, Phase } from "@/lib/events";

/// The organizer's own events, as the V3 render draws them: a swatch, a title with a date under
/// it, a status pill, a people count and one action per row.
///
/// Not a `<table>`. The same five facts have to fit a 1280px dashboard and a 390px phone, and a
/// table can only do that by squeezing columns until the title is three characters wide — which is
/// what `04-organizer-dashboard-mobile.png` shows happening to the header row. Below `md` the row
/// re-flows into two stacked lines; above it, `display: contents` drops the second line's children
/// straight into the grid so the columns line up with the header.

export default function EventsTable({
  events,
  selectedId,
  onSelect,
}: {
  /// `null` while the first read is in flight — distinct from an organizer with no events.
  events: EventSummary[] | null;
  /// Which row the operational panels below the table are describing.
  selectedId: bigint | null;
  onSelect: (id: bigint) => void;
}) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "en-GB";

  return (
    <section className="rounded-2xl border border-line bg-panel p-5 md:p-[22px]">
      <h2 className="text-[22px] font-medium tracking-[-0.01em]">{t("organizer.yourEvents")}</h2>

      {!events ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-[52px] w-full" />
        </div>
      ) : events.length === 0 ? (
        <Empty />
      ) : (
        <>
          {/* Column labels are desktop-only. On a phone each row is self-describing — a pill says
              what the status is, and "12 / 40" next to a person glyph needs no heading — so the
              header would cost three lines of wrapped text for nothing. */}
          <div className={`${GRID} mt-5 hidden border-b border-line pb-2.5 text-[14px] text-faint md:grid`}>
            <span aria-hidden="true" />
            <span>{t("organizer.event")}</span>
            <span>{t("organizer.status")}</span>
            <span>{t("organizer.people")}</span>
            <span aria-hidden="true" />
          </div>

          <ul>
            {events.map((e) => (
              <Row
                key={e.id.toString()}
                event={e}
                selected={e.id === selectedId}
                onSelect={onSelect}
                t={t}
                locale={locale}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/// Shared by the header and every row so the two cannot drift. Fixed widths on the trailing
/// columns rather than `auto`: a status pill that changes from "Upcoming" to "Checking in" would
/// otherwise re-lay out the whole table under an organizer who is watching one number.
const GRID = "grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 md:grid-cols-[2.5rem_minmax(0,1fr)_8.5rem_5rem_5.5rem]";

function Row({
  event: e,
  selected,
  onSelect,
  t,
  locale,
}: {
  event: EventSummary;
  selected: boolean;
  onSelect: (id: bigint) => void;
  t: TFn;
  locale: string;
}) {
  const title = e.listing.title || t("common.eventNumber", { id: e.id.toString() });
  // Settled and cancelled events have nothing left to operate, so their action is the evidence
  // rather than the controls.
  const done = e.phase === "settled" || e.phase === "cancelled";

  return (
    <li className="border-b border-line last:border-b-0">
      <div className={`${GRID} py-3.5`}>
        <Swatch id={e.id} selected={selected} />

        <div className="min-w-0">
          <p className="truncate text-[16px] font-medium">{title}</p>
          <p className="mt-0.5 truncate text-[14px] text-faint">{whenLine(e, t, locale)}</p>
        </div>

        {/* `md:contents` dissolves this wrapper on desktop so the pill, the count and the action
            become grid cells 3, 4 and 5. Below `md` it stays a real box and wraps onto its own
            line under the title, which is the stacked shape the mobile render asks for. */}
        <div className="col-span-2 flex flex-wrap items-center gap-3 md:col-span-1 md:contents">
          <StatusPill phase={e.phase} t={t} />

          <span className="text-[15px] tabular-nums text-dim">
            {e.registered} / {e.capacity}
          </span>

          <span className="ml-auto md:ml-0">
            {done ? (
              <Link
                href={`/verify?event=${e.id}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] text-dim underline decoration-line-2 underline-offset-4 hover:text-fg md:min-h-0"
              >
                {t("organizer.record")} <span aria-hidden="true">↗</span>
              </Link>
            ) : (
              <Link
                href={`/organizer?event=${e.id}`}
                // The dashboard is already mounted, so a soft navigation would change the query
                // string without anything re-reading it — the event id is resolved once, in an
                // effect. Selecting in place and letting the page rewrite the URL keeps the two in
                // step, while the href keeps the row openable in a new tab.
                onClick={(ev) => {
                  ev.preventDefault();
                  onSelect(e.id);
                }}
                aria-current={selected ? "true" : undefined}
                className={`inline-flex min-h-[44px] items-center gap-1.5 text-[15px] underline decoration-line-2 underline-offset-4 hover:text-fg md:min-h-0 ${
                  selected ? "text-accent-2" : "text-dim"
                }`}
              >
                {selected ? t("organizer.showing") : t("common.view")}{" "}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}

/// Stands in for the event imagery the render shows — and it is the same band `lib/cover.ts` puts
/// on the participant's event card, not a second decorative scheme. An organizer who gave somebody
/// a link is looking at the same colour that person is.
function Swatch({ id, selected }: { id: bigint; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-10 w-10 rounded-lg border ${selected ? "border-accent-2" : "border-line-2"}`}
      style={{ background: coverFor(id) }}
    />
  );
}

/// Three pills in the render; six phases in the contract. The extra ones are not folded into the
/// nearest neighbour — an event whose check-in window has closed but which nobody has settled yet
/// is a state the organizer can act on, and calling it "Settled" would be a lie on the one screen
/// that promises not to tell any.
function StatusPill({ phase, t }: { phase: Phase; t: TFn }) {
  const { label, tone, dot } = {
    live: { label: t("organizer.checkingIn"), tone: "border-ok/35 bg-ok/12 text-ok", dot: true },
    registering: { label: t("organizer.upcoming"), tone: "border-accent/40 bg-accent/15 text-accent-2", dot: false },
    waiting: { label: t("organizer.upcoming"), tone: "border-accent/40 bg-accent/15 text-accent-2", dot: false },
    closed: {
      label: t("organizer.awaitingSettlement"),
      tone: "border-warn/35 bg-warn/12 text-warn",
      dot: false,
    },
    settled: { label: t("organizer.settled"), tone: "border-line-2 bg-raised text-dim", dot: false },
    cancelled: { label: t("events.cancelled"), tone: "border-bad/35 bg-bad/12 text-bad", dot: false },
  }[phase];

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[14px] ${tone}`}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/// "Today · 18:00", the way the render writes it. Anchored on the doors opening rather than on the
/// registration deadline: an organizer reading a list of their own events is looking for the one
/// that is on tonight.
function whenLine(e: EventSummary, t: TFn, locale: string): string {
  const doors = new Date(Number(e.attestOpen) * 1000);
  const now = new Date(chainNowMs());
  const days = Math.round(
    (Date.UTC(doors.getFullYear(), doors.getMonth(), doors.getDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86_400_000,
  );
  const time = doors.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  if (days === 0) return `${t("event.today")} · ${time}`;
  if (days === 1) return `${t("event.tomorrow")} · ${time}`;
  if (days === -1) return `${t("event.yesterday")} · ${time}`;

  const date = doors.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    // A year only when it is not this one. "Sep 4" is how anybody would say it out loud.
    year: doors.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  // Past events lose the time: nobody needs the minute an event three weeks ago opened its doors,
  // and the render shows "Sep 4" alone.
  return days < 0 ? date : `${date} · ${time}`;
}

function Empty() {
  const { t } = useLang();
  return (
    <div className="mt-5 rounded-xl border border-line-2 bg-raised p-5">
      <p className="text-[16px] font-medium">{t("organizer.yourEventsEmpty")}</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-dim">
        {t("organizer.nothingHostedBody")}
      </p>
    </div>
  );
}
