"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIdentity } from "@/components/IdentityProvider";
import { Card, Eyebrow, Skeleton } from "@/components/ui";
import { chainNowMs, eventId, hasDeployment } from "@/lib/chain";
import { both, countdown } from "@/lib/format";
import { readAllEvents, type EventSummary } from "@/lib/events";
import { useVisiblePoll } from "@/lib/poll";

/// The organizer's own events, and only theirs.
///
/// The listing at /events is the participants' one — everything that is on, mostly other people's.
/// An organizer pressing back landed there, in a room full of events they had nothing to do with,
/// with no way to reach the ones they were running. Two roles, two lists.
export default function MyEvents() {
  const { signer } = useIdentity();
  const [all, setAll] = useState<EventSummary[] | null>(null);

  useEffect(() => {
    if (!hasDeployment) return;
    void readAllEvents().then(setAll).catch(() => {});
  }, []);

  useVisiblePoll(() => {
    if (!hasDeployment) return;
    void readAllEvents().then(setAll).catch(() => {});
  }, 15000);

  if (!signer) return null;

  const mine = all?.filter((e) => e.organizer.toLowerCase() === signer.address.toLowerCase());
  const now = Math.floor(chainNowMs() / 1000);
  const current = eventId();

  return (
    <section className="space-y-3">
      <Eyebrow>your events</Eyebrow>

      {!all ? (
        <Skeleton className="h-20" />
      ) : !mine || mine.length === 0 ? (
        <Card className="space-y-1.5">
          <p className="text-[16px] font-medium">You haven&apos;t hosted anything yet</p>
          <p className="text-sm leading-relaxed text-dim">
            Use the New Event tab. There is no approval step and no listing fee — the deposits go to
            the contract, and you never hold them.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {mine.map((e) => (
            <Link
              key={e.id.toString()}
              href={`/organizer?event=${e.id}`}
              className={`block rounded-xl border p-3.5 transition-colors ${
                e.id === current
                  ? "border-accent/50 bg-accent/5"
                  : "border-line bg-panel hover:border-line-2"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-[16px] font-medium">
                  {e.listing.title || `Event #${e.id.toString()}`}
                </p>
                {e.id === current && (
                  <span className="shrink-0 text-[13px] text-accent-2">showing</span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-faint">
                {e.registered}/{e.capacity} registered · {both(e.deposit)} each
                {e.phase === "live" && ` · ends in ${countdown(Number(e.attestClose) - now)}`}
                {e.phase === "registering" &&
                  ` · closes in ${countdown(Number(e.registerDeadline) - now)}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
