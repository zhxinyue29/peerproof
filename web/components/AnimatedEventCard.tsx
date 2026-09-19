"use client";

import { motion } from "motion/react";
import EventCard from "@/components/EventCard";
import { useMotionPrefs } from "@/lib/motion";
import type { EventSummary } from "@/lib/events";

/// An event card that arrives when you scroll to it.
///
/// A wrapper rather than a fork of `EventCard`: the listing and the landing row have to stay the
/// same card, so a fix to one is a fix to both. All this adds is the entrance — and the cover's
/// hover scale lives inside `EventCard` because it belongs to the picture, not to the arrival.
///
/// `once` is the important flag. A row that re-animates every time it scrolls back into view turns
/// reading a page into watching one, and on a long page somebody scrolling up to re-read something
/// would set the whole grid off again behind them.
export default function AnimatedEventCard({
  event,
  sample = false,
}: {
  event: EventSummary;
  sample?: boolean;
}) {
  const m = useMotionPrefs();
  return (
    <motion.li variants={m.inView} className="min-w-0">
      <EventCard event={event} sample={sample} />
    </motion.li>
  );
}
