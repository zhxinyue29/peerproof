"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/ui";
import { basePath } from "@/lib/chain";

/// The door.
///
/// This used to be the event page, and the two roles ran through the same screens: an organizer who
/// pressed back arrived in the participants' listing — everybody's events, none of them theirs —
/// and a participant who wandered into the organizer view found a dashboard for an event they had
/// merely signed up to. The same account can be both, on the same day; what it cannot be is both at
/// once, without the screens saying which.
///
/// So: what this is, and then which of the two you are right now.
export default function HomePage() {
  // Links of the form /?event=12 were handed out before the event page moved, and somebody's phone
  // still has one. Sending them on is cheaper than breaking them, and it happens before paint.
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    if (!id || !/^\d+$/.test(id)) return;
    // The query string does not exist during the static export, so this cannot be a lazy state
    // initialiser — and the navigation that follows makes the render it triggers the last one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRedirecting(true);
    window.location.replace(`${basePath}/event/?event=${id}`);
  }, []);

  if (redirecting) {
    return (
      <Shell>
        <p className="text-sm text-dim">Taking you to the event…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-3 pt-6 md:pt-14">
        <p className="text-[13px] uppercase tracking-[0.18em] text-faint">PeerProof</p>
        <h1 className="text-[30px] font-medium leading-[1.12] tracking-tight md:text-[46px] md:leading-[1.05]">
          Attendance you don&apos;t have to trust the organizer for.
        </h1>
        <p className="max-w-[54ch] text-[15px] leading-relaxed text-dim md:text-[17px]">
          People put a deposit down to hold a place. At the venue they scan each other, and the
          contract settles on its own: everyone confirmed present takes their deposit back, plus a
          share of what the no-shows left behind.
        </p>
        <p className="max-w-[54ch] text-[13px] leading-relaxed text-faint md:text-[15px]">
          Whoever created the event has no function that releases, withholds, or receives a single
          wei. That is not a promise — it is the absence of a door.
        </p>
      </div>

      <div className="grid gap-3 pt-2 md:grid-cols-2">
        <Door
          href="/events"
          eyebrow="I'm going to something"
          title="Find an event"
          body="Browse what's on, put a deposit down, and check in when you get there."
        />
        <Door
          href="/organizer"
          eyebrow="I'm running something"
          title="Host an event"
          body="Set the deposit and the rules, then watch it settle. You never hold the money and you cannot decide who was present."
        />
      </div>

      <p className="pt-2 text-[11px] leading-relaxed text-faint md:max-w-[70ch]">
        The same account can do both — these are two ways in, not two kinds of person. Anyone can
        host; there is no approval step.{" "}
        <Link href="/verify" className="underline decoration-line-2">
          The public record
        </Link>{" "}
        is readable by anyone, including people who have never used this.
      </p>
    </Shell>
  );
}

function Door({
  href,
  eyebrow,
  title,
  body,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/50 md:p-6"
    >
      <p className="text-[11px] uppercase tracking-wider text-faint">{eyebrow}</p>
      <p className="mt-2 text-[21px] font-medium tracking-tight">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-dim">{body}</p>
      <p className="mt-4 text-[13px] text-accent-2">Go →</p>
    </Link>
  );
}
