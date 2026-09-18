"use client";

import EventCover from "@/components/EventCover";
import { useT } from "@/lib/i18n";

/// What is behind the sign-in wall, said before anybody signs in.
///
/// Two of the three gated screens were a single button on an otherwise empty page. Whatever else
/// that is, it is a bad trade to offer: hand over an identity first, find out what for afterwards.
/// And on a fresh deployment it was also most of what a visitor saw, so the app's first impression
/// was a login form floating in the dark.
///
/// Three steps, in the order they happen, with the numeral as the decoration — the same figure the
/// landing page uses, because this is the same argument told at a different moment.
export default function GateIntro({ kind }: { kind: "organizer" | "floor" }) {
  const t = useT();
  const steps =
    kind === "organizer"
      ? ([
          ["gate.org1Title", "gate.org1Body"],
          ["gate.org2Title", "gate.org2Body"],
          ["gate.org3Title", "gate.org3Body"],
        ] as const)
      : ([
          ["gate.floor1Title", "gate.floor1Body"],
          ["gate.floor2Title", "gate.floor2Body"],
          ["gate.floor3Title", "gate.floor3Body"],
        ] as const);

  // Container queries, not `md:`.
  //
  // This renders in two very different boxes: a full-width column on /events and /organizer, and
  // the phone-shaped ~380px column of /floor. `md:` asks the *viewport*, so on a desktop browser
  // the floor version was told it had room for three columns and squeezed them into 110px each —
  // Chinese wrapped to one or two characters a line, a wall of vertical text. It only broke on
  // desktop, because a real phone's viewport is below the breakpoint and gets one column by
  // accident. `@container` asks the box this actually sits in, which is the thing that decides.
  return (
    <section className="@container relative overflow-hidden rounded-2xl border border-line bg-panel p-5 @2xl:p-7">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-12 hidden h-[240px] w-[340px] opacity-[0.16] @2xl:block"
      >
        <EventCover id={kind === "organizer" ? 3n : 5n} nodes={8} bare className="h-full w-full" />
      </span>

      <div className="relative space-y-1.5">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em] @2xl:text-[20px]">
          {t(kind === "organizer" ? "gate.orgTitle" : "gate.floorTitle")}
        </h2>
        <p className="max-w-[52ch] text-[16px] leading-relaxed text-dim">
          {t(kind === "organizer" ? "gate.orgBody" : "gate.floorBody")}
        </p>
      </div>

      <ol className="relative mt-5 grid gap-3 @2xl:grid-cols-3 @2xl:gap-4">
        {steps.map(([title, body], i) => (
          <li
            key={title}
            className="relative min-w-0 overflow-hidden rounded-xl border border-line bg-raised/60 p-4"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-1 -top-4 select-none text-[72px] font-semibold leading-none text-white/[0.04]"
            >
              {i + 1}
            </span>
            <span className="relative text-[14px] font-medium tabular-nums text-accent-2">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="relative mt-1.5 text-[16px] font-semibold">{t(title)}</h3>
            <p className="relative mt-1.5 text-[15px] leading-relaxed text-dim">{t(body)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
