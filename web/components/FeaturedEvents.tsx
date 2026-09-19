"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import Link from "next/link";
import EventCard from "@/components/EventCard";
import { hasDeployment } from "@/lib/chain";
import { readAllEvents, splitByActionable, type EventSummary } from "@/lib/events";
import { useT } from "@/lib/i18n";

/// The four cards under the hero, read from the chain.
///
/// The design fills this row with Monad Builders Meetup in San Francisco, 128 people joined, a
/// photograph on every card. None of that exists: the escrow stores numbers, the directory stores a
/// title, a blurb and a url, and there is no field for a place or a picture or a headcount of people
/// who "joined" as opposed to registered. Drawing those cards as pictured would mean inventing four
/// events on the one page that claims nothing here is invented, which is a worse failure than an
/// empty row.
///
/// So the row is the design's shape with the chain's contents, and when the chain has nothing it
/// says so. `EventCard` is the same component the listing uses, which also means a fix to a card is
/// a fix in both places.
export default function FeaturedEvents() {
  const t = useT();
  const m = useMotionPrefs();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    if (!hasDeployment || loading.current) return;
    loading.current = true;
    // Failure is indistinguishable from "nothing yet" here on purpose. This row is an invitation,
    // not a record; the page that has to be exact about what the chain said is /verify.
    void readAllEvents()
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  if (!hasDeployment) return null;

  const featured = events ? splitByActionable(events).open.slice(0, 4) : null;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-[26px] font-semibold tracking-[-0.025em] md:text-[30px]">
          {t("home.featured")}
        </h2>
        <Link
          href="/events"
          className="flex min-h-[44px] shrink-0 items-center gap-2 text-[16px] text-dim transition-colors hover:text-fg"
        >
          {t("home.viewAll")}
          <span aria-hidden>→</span>
        </Link>
      </div>

      {featured === null ? (
        /* Four placeholders at the height a card settles to, so the row does not collapse and then
           shove the footer down the page once the reads land. */
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-[330px] animate-pulse rounded-2xl border border-line bg-panel/60" />
          ))}
        </ul>
      ) : featured.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel/60 p-6 md:p-8">
          <p className="text-[18px] font-semibold">{t("home.noneYet")}</p>
          <p className="mt-2 max-w-[56ch] text-[16px] leading-relaxed text-dim">
            {t("home.noneYetBody")}
          </p>
          <Link
            href="/organizer"
            className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-accent px-5 text-[16px] font-medium text-white transition-transform duration-100 active:scale-[0.985]"
          >
            {t("events.createFirst")}
          </Link>
        </div>
      ) : (
        /* Arrive on the way past, once. `once` matters: a row that re-animates every time it
           scrolls back into view turns reading the page into watching it. */
        <motion.ul
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          variants={m.container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          {featured.map((e) => (
            <motion.li key={e.id.toString()} variants={m.inView} className="min-w-0">
              <EventCard event={e} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
