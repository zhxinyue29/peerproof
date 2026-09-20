"use client";

import { useLang } from "@/lib/i18n";

/// A section heading the way the dashboard sheet sets them: the label, then the English beside it
/// at half the weight — 我的活动 My Events, 活动管理 Event Management, 数据分析与结算 Analytics.
///
/// The English companion is the sheet's typographic signature in the Chinese UI. In English it is
/// hidden rather than repeating the same heading twice with slightly different wording.
export function SectionTitle({ zh, en }: { zh: string; en: string }) {
  const { lang } = useLang();
  return (
    <h2 className="flex flex-wrap items-baseline gap-x-2.5 text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
      {zh}
      {lang === "zh" && <span className="text-[15px] font-medium text-faint md:text-[16px]">{en}</span>}
    </h2>
  );
}
