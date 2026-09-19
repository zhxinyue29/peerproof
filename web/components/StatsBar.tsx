"use client";

import { useT } from "@/lib/i18n";

/// Three figures, sitting over the artwork at the bottom of the hero.
///
/// The design asked for "0.4s average finality" and "$0.01 typical cost". Neither survived being
/// checked, and this is the one page whose whole argument is that you can check things — so putting
/// a number on it that does not hold would cost more than the number is worth.
///
///   Finality. Monad's own figure is 600ms: 300ms blocks, deterministic in two slots. 0.4s is not a
///   number Monad publishes anywhere.
///
///   Cost. A dollar price needs a MON price, which nobody here knows. What is knowable is the gas:
///   `attest` measured at 240,991 and pinned at a 250,000 limit, and Monad bills the limit. At the
///   102 gwei the testnet endpoint quoted on 19 Sep 2026 that is 0.0255 MON, which rounds to the
///   figure below. Re-derive it rather than trusting it: `cast gas-price` × `GAS_LIMITS.attest`.
///
/// The third is not a measurement and does not pretend to be one.
export default function StatsBar() {
  const t = useT();
  const cells = [
    { value: "stats.finality", label: "stats.finalityLabel" },
    { value: "stats.cost", label: "stats.costLabel" },
    { value: "stats.onchain", label: "stats.onchainLabel" },
  ];

  return (
    <div className="rounded-[18px] border border-line-2 bg-[#0f1729]/80 p-5 backdrop-blur-sm md:p-6">
      <p className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.01em]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M13.4 2.8 5.6 13.4h5.3l-.9 7.8 8-10.8h-5.4l.8-7.6Z" />
          </svg>
        </span>
        {t("stats.title")}
      </p>

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line">
        {cells.map(({ value, label }, i) => (
          <div key={value} className={`min-w-0 ${i === 0 ? "sm:pr-5" : i === 1 ? "sm:px-5" : "sm:pl-5"}`}>
            <dt className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-accent-2 md:text-[30px]">
              {t(value)}
            </dt>
            <dd className="mt-2 text-[15px] leading-snug text-dim">{t(label)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
