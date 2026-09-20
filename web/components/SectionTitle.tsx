"use client";

/// A section heading the way the dashboard sheet sets them: the label, then the English beside it
/// at half the weight — 我的活动 My Events, 活动管理 Event Management, 数据分析与结算 Analytics.
///
/// Not a translation for readers who need one; the page already has a language switch and this
/// second line does not change with it. It is the sheet's typographic signature, and a page that
/// drops it reads as a different design however faithfully the blocks underneath are built.
export function SectionTitle({ zh, en }: { zh: string; en: string }) {
  return (
    <h2 className="flex flex-wrap items-baseline gap-x-2.5 text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
      {zh}
      <span className="text-[15px] font-medium text-faint md:text-[16px]">{en}</span>
    </h2>
  );
}
