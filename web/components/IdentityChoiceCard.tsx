"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";

/// One of the two ways in: a picture of a person, what you are here for, and the arrow.
///
/// These are the only two controls on the first screen, so they are the two that have to answer
/// when touched. Desktop gets the lift; a phone has no hover at all, so it gets `whileTap` — without
/// it the pair would give no feedback whatsoever on the device this product is actually used at.
///
/// Nothing here changes the card's height. Transform and opacity only, and the hover lift is a
/// `translate` on a wrapper rather than a margin or a border width, so the row cannot reflow and
/// push the page around under somebody who is still reading it.
///
/// The figures are cropped from the design and carry its own lighting, so the tint behind them is
/// set to meet them rather than to a palette value — the seam between a lit render and a flat
/// gradient is what gives a pasted-in asset away. Each is masked out on its right so the character
/// stands in the card instead of sitting in a rectangle inside it.
export default function IdentityChoiceCard({
  href,
  title,
  body,
  tone,
}: {
  href: string;
  title: string;
  body: string;
  tone: "join" | "host";
}) {
  const join = tone === "join";
  const m = useMotionPrefs();

  return (
    <motion.div
      whileHover={m.reduced ? undefined : { y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <Link
        href={href}
        className={`group relative flex min-h-[132px] items-center gap-3 overflow-hidden rounded-[18px] border pr-4 transition-colors duration-200 ${
          join ? "border-accent/30 hover:border-accent/70" : "border-ok/30 hover:border-ok/60"
        }`}
        style={{
          background: join
            ? "linear-gradient(105deg, rgba(41,38,92,0.95) 0%, rgba(20,28,48,0.92) 58%)"
            : "linear-gradient(105deg, rgba(16,48,40,0.95) 0%, rgba(16,30,34,0.92) 58%)",
        }}
      >
        <span
          aria-hidden
          className="h-[132px] w-[104px] shrink-0 self-end bg-cover bg-bottom transition-transform duration-200 motion-safe:group-hover:translate-x-[3px]"
          style={{
            backgroundImage: `url(${join ? "door-join.webp" : "door-host.webp"})`,
            WebkitMaskImage: "linear-gradient(to right, #000 62%, transparent 100%)",
            maskImage: "linear-gradient(to right, #000 62%, transparent 100%)",
          }}
        />

        <span className="min-w-0 flex-1 py-4">
          <span
            className={`block text-[19px] font-semibold leading-tight tracking-[-0.015em] ${
              join ? "text-accent-2" : "text-fg"
            }`}
          >
            {title}
          </span>
          <span className="mt-1.5 block text-[15px] text-dim">{body}</span>
        </span>

        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[17px] transition-transform duration-200 motion-safe:group-hover:translate-x-1 ${
            join ? "bg-accent text-white" : "bg-ok text-[#08261a]"
          }`}
        >
          →
        </span>
      </Link>
    </motion.div>
  );
}
