"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { readHistory } from "@/lib/logs";
import { useT } from "@/lib/i18n";

/// The row of faces on the sheet's 活动状态 card: five overlapping avatars and a "+116".
///
/// Two decisions in here are worth the words.
///
/// **The faces are real.** The sheet draws illustrated portraits; this draws a gradient per
/// address, which is what the rest of the product already does. Drawing five decorative circles
/// that correspond to nobody would be the same lie as a prize pool — it would say "these people
/// are coming" on a page whose entire claim is that you can check everything on it. Every circle
/// here is somebody who put a deposit down, and the count beside them is the rest of them.
///
/// **It loads after the page does.** Getting the list means scanning `Registered` logs from the
/// deploy block, which on testnet is a few hundred thousand blocks at 100 per request. Blocking
/// the event detail on that to draw five circles would be a bad trade, so the card renders without
/// this, and this appears when it arrives. If it never arrives, nothing is missing — the counts
/// above it came from the contract directly and were always the real answer.
export default function AttendeeRow({
  eventId,
  total,
  confirmedOnly,
  small,
}: {
  eventId: bigint;
  total: number;
  /// Only the people the room has vouched for. The sheet gives them their own row, smaller, beside
  /// the label — they are a different claim from "registered" and should not look like the same one.
  confirmedOnly?: boolean;
  small?: boolean;
}) {
  const t = useT();
  const [who, setWho] = useState<Address[] | null>(null);

  useEffect(() => {
    if (total === 0) return;
    let dropped = false;
    // Swallowed: this is decoration over numbers that are already on screen. A rate-limited log
    // read should leave the card as it is, not put an error into it.
    void readHistory(eventId)
      .then((h) => {
        if (!dropped) setWho(h.participants.filter((p) => !confirmedOnly || p.confirmed).map((p) => p.address));
      })
      .catch(() => {});
    return () => {
      dropped = true;
    };
  }, [eventId, total, confirmedOnly]);

  if (total === 0 || !who?.length) return null;

  const shown = who.slice(0, small ? 3 : 5);
  const rest = total - shown.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {shown.map((a, i) => (
          <span
            key={a}
            title={a}
            className={`${small ? "h-7 w-7" : "h-9 w-9"} rounded-full border-2 border-panel`}
            style={{ marginLeft: i === 0 ? 0 : small ? -8 : -10, background: gradientFor(a) }}
          />
        ))}
      </div>
      {rest > 0 && (
        <span className={`flex items-center rounded-full bg-raised px-2.5 font-medium tabular-nums text-dim ${small ? "h-7 text-[12.5px]" : "h-9 text-[13px]"}`}>
          +{rest}
        </span>
      )}
      <span className="sr-only">{t("event.verifiedLabel")}</span>
    </div>
  );
}

/// Same derivation the rest of the product uses for an account's colour: the address decides it,
/// so the same person is the same colour on every screen and across reloads.
function gradientFor(a: Address): string {
  const n = parseInt(a.slice(2, 8), 16);
  const h = n % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 58%), hsl(${(h + 48) % 360} 72% 44%))`;
}
