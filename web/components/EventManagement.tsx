"use client";

import Link from "next/link";
import EventCover from "@/components/EventCover";
import { Skeleton } from "@/components/ui";
import { useLang } from "@/lib/i18n";
import type { EventSummary } from "@/lib/events";

/// "Event management", panel 05 of the organizer sheet: one event, its cover, and the room broken
/// into the states a person can be in.
///
/// The sheet's four figures are 报名人数 / 已验证 / 待验证 / 未通过. Three of them are real:
///
///   registered  — paid the deposit
///   confirmed   — the room vouched for them, `k` times over
///   pending     — registered and not yet confirmed, while the doors are still open
///
/// The fourth is not. "未通过" implies a review that rejected somebody, and there is no reviewer in
/// this contract — nobody is failed, they are simply never vouched for. After settlement that same
/// group has a true name, 未到场, and before settlement it does not exist yet: those people are
/// standing in the room collecting vouches. So the fourth tile changes with the phase rather than
/// inventing a verdict.
export default function EventManagement({
  event,
  loading,
}: {
  event: EventSummary | null;
  loading: boolean;
}) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "en-GB";

  if (loading) return <Skeleton className="h-[168px] w-full rounded-2xl" />;
  if (!event) return null;

  const pending = Math.max(0, event.registered - event.confirmed);
  const settled = event.phase === "settled";
  const when = new Date(Number(event.attestOpen) * 1000);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t("organizer.management")}</h2>
        <Link
          href={`/event?event=${event.id}`}
          className="inline-flex min-h-[44px] items-center text-[15px] text-accent-2 transition-colors hover:text-fg"
        >
          {t("common.view")} <span aria-hidden>&nbsp;→</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="relative h-[72px] w-[112px] shrink-0 overflow-hidden rounded-xl">
          <EventCover id={event.id} nodes={6} className="absolute inset-0 h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[13px] font-medium ${
                event.phase === "live" ? "bg-ok/20 text-ok" : "bg-[#0d1626]/85 text-dim"
              }`}
            >
              {t(
                event.phase === "live"
                  ? "events.openNow"
                  : event.phase === "settled"
                    ? "events.settled"
                    : "events.upcoming",
              )}
            </span>
            <p className="min-w-0 truncate text-[17px] font-medium">
              {event.listing.title || t("common.eventNumber", { id: event.id.toString() })}
            </p>
          </div>
          <p className="mt-1 truncate text-[14px] text-dim">
            {when.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
            {event.listing.venue ? ` · ${event.listing.venue}` : ""}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        <Cell value={event.registered} label={t("organizer.registered")} />
        <Cell value={event.confirmed} label={t("organizer.confirmedPresent")} tone="ok" />
        <Cell
          value={pending}
          label={t(settled ? "organizer.noShows" : "organizer.awaitingVouches")}
          tone={settled ? "dim" : "warn"}
        />
        <Cell value={event.capacity} label={t("organizer.capacity")} />
      </dl>
    </section>
  );
}

function Cell({
  value,
  label,
  tone = "dim",
}: {
  value: number;
  label: string;
  tone?: "dim" | "ok" | "warn";
}) {
  return (
    <div className="bg-panel px-5 py-4">
      <dd
        className={`text-[26px] font-semibold tabular-nums leading-none tracking-[-0.02em] ${
          tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-fg"
        }`}
      >
        {value}
      </dd>
      <dt className="mt-1.5 text-[13px] text-faint">{label}</dt>
    </div>
  );
}
