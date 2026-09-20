"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

/// The bottom bar from the mobile panel of the design sheet.
///
/// Phones only. The top bar stays what it is — logo, search, language, account — because the sheet
/// puts navigation at the bottom on a handset and nowhere at all on a desktop, and because the
/// product's first real use is a link opened at a venue door where the thumb is at the bottom of
/// the screen and the top of it is out of reach.
///
/// Five destinations, all of which exist. The sheet's are 发现活动 / 我的证明 / 社区 / 奖励 / 我的 —
/// two of those are sections this product does not have, and a tab that leads to an explanation of
/// its own absence is worse than four tabs.
///
/// `/floor` and `/venue` are deliberately absent. Both are held up in a room with a camera open,
/// and a bar of five tabs across the bottom of a scanner is five ways to lose the scan.
const TABS = [
  { href: "/", label: "nav.home", icon: "home" },
  { href: "/events", label: "nav.events", icon: "events" },
  { href: "/organizer", label: "nav.host", icon: "flag" },
  { href: "/verify", label: "nav.verify", icon: "verify" },
  { href: "/me", label: "nav.mine", icon: "person" },
] as const;

const PATHS: Record<string, string> = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z",
  events:
    "M4 9V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 6v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-6ZM12 7v10",
  flag: "M6 21V4m0 0h10l-2 3 2 3H6",
  verify: "m9 12 2 2 4-4M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z",
  person: "M16 19v-1a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
};

export default function MobileTabBar() {
  const t = useT();
  const pathname = usePathname() ?? "/";
  // The scanner and the venue display run full-bleed and are used one-handed with a camera open.
  if (pathname.startsWith("/floor") || pathname.startsWith("/venue")) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/92 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex max-w-[560px]">
        {TABS.map((tab) => {
          // `/` only matches exactly; every other tab matches its subtree, so `/event?event=1`
          // lights "Events" rather than nothing — a bar with nothing lit on a screen you reached by
          // tapping it reads as having fallen out of the app.
          const on = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 ${
                  on ? "text-accent-2" : "text-faint"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d={PATHS[tab.icon]}
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {/* 13px, the same floor as every other piece of text in the product. A tab bar is
                    the one place a designer reaches for 10px, and this one is read at a venue door
                    in bad light. Two characters per label is what makes it fit. */}
                <span className="w-full truncate text-center text-[13px]">{t(tab.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
