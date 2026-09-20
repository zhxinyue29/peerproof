"use client";

import { SectionTitle } from "@/components/SectionTitle";
import { Skeleton } from "@/components/ui";
import { mon } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import type { EventSummary } from "@/lib/events";

/// "我的收益", the left card of the sheet's first row.
///
/// The sheet shows 1,280 MON earned and a bar chart of the last six months. There is no reward
/// pool in this product, so "earned" has one honest meaning: the deposits this account has put up,
/// and the months it put them up in. A deposit comes back when the room vouches for you, with a
/// share of what the no-shows left — so the figure is what is riding on turning up, which is the
/// number this page is actually about.
///
/// The bars are months with events, counted from the chain. Not a trend line: six equal columns of
/// a value that only moves when somebody joins something would imply a rate of change that does
/// not exist.
const MONTHS = 6;

export default function EarnedRewards({
  rows,
  loading,
}: {
  rows: { event: EventSummary; confirmed: boolean }[] | null;
  loading: boolean;
}) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "en-GB";

  const now = new Date();
  const buckets: { label: string; total: bigint }[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ label: d.toLocaleDateString(locale, { month: "short" }), total: 0n });
  }
  for (const r of rows ?? []) {
    const d = new Date(Number(r.event.attestOpen) * 1000);
    const back = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (back >= 0 && back < MONTHS) buckets[MONTHS - 1 - back].total += r.event.deposit;
  }
  const staked = (rows ?? []).reduce((n, r) => n + r.event.deposit, 0n);
  const peak = buckets.reduce((m, b) => (b.total > m ? b.total : m), 0n);

  return (
    <section className="flex h-full min-w-0 flex-col">
      <SectionTitle zh={t("me.earned")} en="At stake" />
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums md:text-[32px]">
        {loading ? <Skeleton className="h-8 w-28 align-middle" /> : mon(staked)}
      </p>
      {/* The sheet has ≈ $3,820 USD under the figure. There is no price feed, so the line is kept
          and the number is a dash — it will be a number when there is one to read. */}
      <p className="mt-1.5 text-[14px] text-faint">{t("me.approxUsd", { amount: "—" })}</p>

      <div className="mt-auto flex h-[110px] items-end gap-2 pt-5">
        {buckets.map((b, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end gap-1.5">
            <div
              className={`w-full rounded-t-md ${b.total > 0n ? "bg-gradient-to-t from-accent to-accent-2" : "bg-line"}`}
              style={{
                height:
                  peak > 0n && b.total > 0n
                    ? `${Math.max(10, Number((b.total * 100n) / peak))}%`
                    : "3px",
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 text-center">
        {buckets.map((b, i) => (
          <span key={i} className="flex-1 text-[12.5px] text-faint">
            {b.label}
          </span>
        ))}
      </div>
    </section>
  );
}
