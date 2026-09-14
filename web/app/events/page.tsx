"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader, Card, Notice, Shell, Skeleton } from "@/components/ui";
import { both, countdown } from "@/lib/format";
import { chainNowMs, hasDeployment, isLocalChain, syncChainClock } from "@/lib/chain";
import { readAllEvents, splitByActionable, stillJoinable, type EventSummary, type Phase } from "@/lib/events";
import { useVisiblePoll } from "@/lib/poll";

/// The directory. Every event the contract knows about, newest first.
///
/// This is the screen the app was missing: it showed one event, fixed at build time, so nobody
/// could browse and nobody could join anything but the newest. An attendance product where you
/// cannot see what is on is a demo, not a product.
export default function EventsPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasDeployment) return;
    const load = async () => {
      try {
        await syncChainClock();
        setEvents(await readAllEvents());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read the events.");
      }
    };
    void load();
  }, []);

  // 12s, and only while somebody is looking. Each pass is one read per event against an endpoint
  // that allows fifteen a second; a listing page does not need to be fresher than that, and a
  // backgrounded tab does not need to be fresh at all.
  useVisiblePoll(() => {
    if (!hasDeployment) return;
    void readAllEvents().then(setEvents).catch(() => {});
  }, 12000);

  if (!hasDeployment) {
    return (
      <Shell>
        <Notice>No contract configured.</Notice>
      </Shell>
    );
  }

  const split = events ? splitByActionable(events) : null;

  return (
    <Shell>
      {isLocalChain && <Notice tone="warn">Local chain — real transactions, fake money.</Notice>}

      <AppHeader
        title="Events"
        right={
          <Link href="/organizer" className="text-[13px] text-faint underline decoration-line-2">
            host one
          </Link>
        }
      />

      {error && <Notice tone="bad">{error}</Notice>}

      {!events ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : events.length === 0 ? (
        <Card className="space-y-2">
          <p className="text-[15px] font-medium">Nothing scheduled yet</p>
          <p className="text-sm leading-relaxed text-dim">
            Anyone can host — there is no approval step, and the host never touches the deposits.
          </p>
          <Link href="/organizer" className="inline-block text-sm text-accent-2 underline">
            Create the first event
          </Link>
        </Card>
      ) : (
        <>
          <Section
            title="Open now"
            empty="Nothing open at the moment."
            events={split!.open}
          />
          {split!.past.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none py-2 text-[13px] text-faint">
                <span className="underline decoration-line-2">
                  {split!.past.length} finished {split!.past.length === 1 ? "event" : "events"}
                </span>
              </summary>
              <div className="mt-2 space-y-3">
                {split!.past.map((e) => (
                  <EventRow key={e.id.toString()} event={e} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <p className="text-[11px] leading-relaxed text-faint md:max-w-[70ch]">
        Titles come from a contract that holds no money and cannot affect who gets paid. Everything
        that decides a payout — deposits, attestations, settlement — is read from the escrow.
      </p>
    </Shell>
  );
}

function Section({
  title,
  events,
  empty,
}: {
  title: string;
  events: EventSummary[];
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[13px] uppercase tracking-wide text-faint">{title}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-dim">{empty}</p>
      ) : (
        events.map((e) => <EventRow key={e.id.toString()} event={e} />)
      )}
    </section>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  registering: "Registering",
  waiting: "Starts soon",
  live: "Checking in now",
  closed: "Finished",
  cancelled: "Cancelled — refunded",
  settled: "Settled",
};

const PHASE_TONE: Record<Phase, string> = {
  registering: "bg-accent/15 text-accent-2",
  waiting: "bg-raised text-dim",
  live: "bg-ok/15 text-ok",
  closed: "bg-raised text-faint",
  cancelled: "bg-raised text-faint",
  settled: "bg-raised text-faint",
};

function EventRow({ event: e }: { event: EventSummary }) {
  const now = Math.floor(chainNowMs() / 1000);
  // A live event can still be taking walk-ins, which is the case worth surfacing here: somebody
  // scrolling this list is exactly the person that setting exists for.
  const joinable = stillJoinable(now, e.registerDeadline, e.registered, e.capacity, e.status);

  const when =
    e.phase === "registering"
      ? `closes in ${countdown(Number(e.registerDeadline) - now)}`
      : e.phase === "waiting"
        ? `check-in opens in ${countdown(Number(e.attestOpen) - now)}`
        : e.phase === "live"
          ? `ends in ${countdown(Number(e.attestClose) - now)}`
          : "";

  return (
    <Link
      href={`/?event=${e.id}`}
      className="block rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-line-2 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-medium">
            {e.listing.title || `Event #${e.id.toString()}`}
          </p>
          {e.listing.blurb && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-dim">{e.listing.blurb}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${PHASE_TONE[e.phase]}`}
        >
          {PHASE_LABEL[e.phase]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-faint">
        <span>
          <span className="text-dim">{both(e.deposit)}</span> to join
        </span>
        <span>
          {e.registered}/{e.capacity} registered
        </span>
        <span>{e.k} vouches to count as present</span>
        {when && <span className="tabular-nums">{when}</span>}
      </div>

      {/* An event that is already running but still open is the one thing a list like this can tell
          somebody that they could not guess. Say it plainly where the badge cannot. */}
      {joinable && e.phase === "live" && (
        <p className="mt-2 text-[11px] text-ok">Check-in has started — you can still join.</p>
      )}
      {e.phase === "registering" && e.registered < e.minQuorum && (
        <p className="mt-2 text-[11px] text-faint">
          Needs {e.minQuorum - e.registered} more to run — everyone is refunded otherwise.
        </p>
      )}
    </Link>
  );
}
