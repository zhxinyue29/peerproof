"use client";

import { useT } from "@/lib/i18n";

/// The sheet's tab strip: 概览 / 参加的活动 / 主办的活动 / 奖励记录 / 贡献与徽章 / 活动日历.
///
/// It selects the same sections the rail on the left does, which is what the sheet draws — the
/// rail is the destination list and the strip is where you are inside this page. Keeping both in
/// sync is the whole reason they share one `tab` value rather than each holding their own.
///
/// Scrolls sideways under `lg`. Six tabs do not fit on a 390px screen and wrapping them to a
/// second row turns a strip into a block.
export const TABS = [
  { key: "overview", label: "me.tabOverview" },
  { key: "joined", label: "me.tabJoined" },
  { key: "hosted", label: "me.tabHosted" },
  { key: "rewards", label: "me.tabRewards" },
  { key: "achievements", label: "me.achievements" },
  { key: "calendar", label: "me.calendar" },
] as const;

export type ProfileTab = (typeof TABS)[number]["key"] | "settings";

export default function ProfileTabs({
  tab,
  onPick,
  /// A visitor has no settings, and the strip never shows that one anyway — but it does decide
  /// whether the strip is worth rendering at all on a page with nothing in most of its sections.
  hidden,
}: {
  tab: ProfileTab;
  onPick: (t: ProfileTab) => void;
  hidden?: boolean;
}) {
  const t = useT();
  if (hidden) return null;
  return (
    <div className="-mx-4 overflow-x-auto border-b border-line px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
      <div className="flex min-w-max gap-1">
        {TABS.map(({ key, label }) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-current={on ? "page" : undefined}
              className={`relative flex min-h-[46px] items-center whitespace-nowrap px-3.5 text-[15px] transition-colors ${
                on ? "font-medium text-fg" : "text-dim hover:text-fg"
              }`}
            >
              {t(label)}
              {/* The underline is the sheet's marker for the active tab. `-bottom-px` so it sits on
                  the container's border rather than above it. */}
              {on && <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
