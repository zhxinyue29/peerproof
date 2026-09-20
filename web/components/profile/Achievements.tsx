"use client";

import { SectionTitle } from "@/components/SectionTitle";
import { useT } from "@/lib/i18n";
import { basePath } from "@/lib/chain";

/// "贡献与徽章", the third card of the sheet's second row.
///
/// Four badges, and every one of them is a statement the chain can settle. The sheet's are titles
/// somebody was awarded; these are thresholds anybody can recompute from the same address — which
/// is the only kind of badge this product is allowed to show. An unearned badge stays on screen,
/// greyed, with what it takes underneath: a row that only ever shows what you already have tells
/// you nothing about what the product values.
const BADGES = [
  { key: "early", need: (s: Stats) => s.joined >= 1, label: "me.badgeEarly", hint: "me.badgeEarlyHint" },
  { key: "active", need: (s: Stats) => s.confirmed >= 3, label: "me.badgeActive", hint: "me.badgeActiveHint" },
  { key: "organizer", need: (s: Stats) => s.hosted >= 1, label: "me.badgeOrganizer", hint: "me.badgeOrganizerHint" },
  { key: "leader", need: (s: Stats) => s.reach >= 25, label: "me.badgeLeader", hint: "me.badgeLeaderHint" },
] as const;

type Stats = { joined: number; confirmed: number; hosted: number; reach: number };

export default function Achievements({ stats, loading }: { stats: Stats; loading: boolean }) {
  const t = useT();
  return (
    <section className="flex h-full min-w-0 flex-col">
      <SectionTitle zh={t("me.achievements")} en="Achievements" />
      <ul className="mt-4 grid grid-cols-4 gap-2">
        {BADGES.map((b) => {
          const earned = !loading && b.need(stats);
          return (
            <li key={b.key} className="flex flex-col items-center gap-2 text-center">
              <span
                aria-hidden
                className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                  earned ? "border-accent/45 bg-accent/15 text-accent-2" : "border-line bg-ink text-line-2"
                }`}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
                  <path
                    d="m9 12 2 2 4-4M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className={`text-[13px] leading-tight ${earned ? "font-medium text-fg" : "text-faint"}`}>
                {t(b.label)}
              </span>
              <span className="text-[12px] leading-snug text-faint">{t(b.hint)}</span>
            </li>
          );
        })}
      </ul>
      <p className="pt-4 text-[13px] leading-relaxed text-faint">{t("me.badgeNote")}</p>
      {/* The sheet closes this card with a quote over a piece of the artwork — the one place on the
          page where the product says what it is for rather than what it counted. Under the note,
          not over it: the note explains the badges above and has to stay attached to them. */}
      <div
        className="mt-auto flex min-h-[86px] items-end rounded-xl border border-line bg-cover bg-center p-4"
        style={{ backgroundImage: `url(${basePath}/rail-card.webp)` }}
      >
        <p className="max-w-[22ch] text-[13.5px] font-medium leading-snug text-fg">
          {t("me.badgeQuote")}
        </p>
      </div>
    </section>
  );
}
