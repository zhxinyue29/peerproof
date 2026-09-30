"use client";

import { Card, Eyebrow } from "@/components/ui";
import { eligibility, type OutcomeState, type Phase } from "@/lib/eligibility";
import { useT } from "@/lib/i18n";
import type { EventInfo, MyState } from "@/lib/useEvent";

type Tone = "done" | "todo" | "wait";

const OUTCOME: Record<OutcomeState, { key: string; tone: Tone }> = {
  openConfirmed: { key: "floor.outcomeOpenConfirmed", tone: "done" },
  openNotConfirmed: { key: "floor.outcomeOpenNotConfirmed", tone: "wait" },
  openBelowQuorum: { key: "floor.outcomeBelowQuorum", tone: "wait" },
  settledReady: { key: "floor.outcomeReady", tone: "done" },
  settledClaimed: { key: "floor.outcomeClaimed", tone: "done" },
  settledNone: { key: "floor.outcomeNone", tone: "wait" },
  cancelledRefundable: { key: "floor.outcomeRefundable", tone: "done" },
  cancelledRefunded: { key: "floor.outcomeRefunded", tone: "done" },
};

/// The attendee's standing, one condition per row, read at arm's length in a dark room.
///
/// This replaced a single "vouched for you" counter, which was the half of the rule that is easy to
/// see: it could read 1/1 on somebody the contract would never confirm, because they had been
/// scanned but had not scanned anybody. The rows are the contract's conditions in the order you
/// meet them, then what the contract will do with the deposit in the event's current state.
///
/// Amber is spent only on something the attendee can do right now; everything else not yet done is
/// left grey, because a row you cannot act on is not a warning. Mint is spent only on done.
export default function AttendanceStatus({
  ev,
  me,
  phase,
  nowSec,
}: {
  ev: EventInfo;
  me: MyState;
  phase: Phase;
  nowSec: number;
}) {
  const t = useT();
  const s = eligibility(ev, me, phase, nowSec);
  const time =
    me.checkedInAt > 0
      ? new Date(me.checkedInAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

  const rows: Array<{ id: string; label: string; text: string; tone: Tone }> = [
    {
      id: "checkIn",
      label: t("floor.rowCheckIn"),
      tone: s.checkIn === "done" ? "done" : s.checkIn === "todo" ? "todo" : "wait",
      text:
        s.checkIn === "done"
          ? t("floor.checkInDone", { time })
          : s.checkIn === "todo"
            ? t("floor.checkInTodo")
            : s.checkIn === "notOpen"
              ? t("floor.checkInNotOpen")
              : t("floor.checkInMissed"),
    },
    {
      id: "initiated",
      label: t("floor.rowInitiated"),
      tone: s.initiated === "done" ? "done" : s.initiated === "todo" ? "todo" : "wait",
      text:
        s.initiated === "done"
          ? t("floor.initiatedDone", { n: me.given })
          : s.initiated === "todo"
            ? t("floor.initiatedTodo")
            : s.initiated === "blocked"
              ? t("floor.initiatedBlocked")
              : t("floor.initiatedMissed"),
    },
    {
      id: "received",
      label: t("floor.rowReceived"),
      // Amber only while the attendee can add to it themselves — every scan they make counts for
      // them too — which needs the window open and their own check-in done.
      tone:
        s.received === "done" ? "done" : phase === "open" && !s.final && s.checkIn === "done" ? "todo" : "wait",
      // No shortfall once the event is final: "2 more" on a settled room is a count nobody can add to.
      text:
        s.received === "done"
          ? `${me.received}/${ev.k} · ${t("floor.receivedDone")}`
          : s.final
            ? `${me.received}/${ev.k}`
            : `${me.received}/${ev.k} · ${t("floor.needMore", { n: s.missing })}`,
    },
    {
      id: "outcome",
      label: t("floor.rowOutcome"),
      tone: OUTCOME[s.outcome].tone,
      text: t(OUTCOME[s.outcome].key),
    },
  ];

  return (
    <Card className="!p-4">
      <Eyebrow>{t("floor.statusTitle")}</Eyebrow>
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
            <Mark tone={r.tone} />
            {/* Label and state share a line while they fit and wrap under each other when they do
                not, so a long state on a phone never squeezes the label or runs off the card. */}
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-[15px] text-fg">{r.label}</span>
              <span
                className={`min-w-0 text-[15px] leading-snug tabular-nums ${
                  r.tone === "done" ? "text-ok" : r.tone === "todo" ? "text-warn" : "text-faint"
                }`}
              >
                {r.text}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {s.viaFallback && <p className="mt-2 text-[14px] leading-relaxed text-dim">{t("floor.viaFallback")}</p>}
      <p className="mt-2 border-t border-line pt-3 text-[14px] leading-relaxed text-faint">{t("floor.statusRule")}</p>
    </Card>
  );
}

function Mark({ tone }: { tone: Tone }) {
  // Fixed box and a nudge down, so the mark sits on the first line of its row whether or not the
  // state wraps under the label.
  return (
    <span aria-hidden="true" className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      {tone === "done" ? (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="8" className="stroke-ok" strokeWidth="1.5" />
          <path d="m5.5 9.2 2.3 2.3 4.7-4.9" className="stroke-ok" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span
          className={`h-[14px] w-[14px] rounded-full border-[1.5px] ${
            tone === "todo" ? "border-warn/80" : "border-line-2"
          }`}
        />
      )}
    </span>
  );
}
