"use client";

import { DEMO_DEPOSIT, demoSettlement } from "@/lib/demo";
import { mon } from "@/lib/format";
import { useT } from "@/lib/i18n";

/// The payout, as the live Verify page sets it: one figure, then the three lines that get there.
///
/// Shared by the walkthrough's last step and the illustrative proof, so the two cannot show
/// different arithmetic. Typography and hairlines are the live page's; nothing here links anywhere,
/// because there is no transaction to link to.
export default function DemoSettlement({ size = "lg" }: { size?: "md" | "lg" }) {
  const t = useT();
  const s = demoSettlement();

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
      <div className="min-w-0">
        <p
          className={`font-semibold leading-none tracking-[-0.035em] text-ok tabular-nums ${
            size === "lg" ? "text-[46px] md:text-[62px]" : "text-[42px] md:text-[50px]"
          }`}
        >
          {mon(s.share)}
        </p>
        <p className="mt-4 text-[17px] leading-relaxed text-dim">{t("verify.eachReceives")}</p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-faint">
          {t("verify.depositPlusShare", { deposit: mon(DEMO_DEPOSIT), share: mon(s.share - DEMO_DEPOSIT) })}
        </p>
        <p className="mt-1 font-mono text-[14px] leading-relaxed text-faint">
          {t("demo.formula", {
            deposit: mon(DEMO_DEPOSIT),
            forfeited: mon(s.forfeited),
            n: s.confirmed,
            share: mon(s.share),
          })}
        </p>
      </div>

      <dl className="min-w-0 self-end">
        <Line
          term={t("demo.calcTotal", { n: s.registered, deposit: mon(DEMO_DEPOSIT) })}
          value={mon(s.total)}
        />
        <Line term={t("verify.confirmedPresent", { n: s.confirmed })} value={t("verify.getDepositBack")} />
        <Line
          term={t("verify.neverConfirmed", { n: s.unconfirmed })}
          value={t("verify.forfeit", { amount: mon(s.forfeited) })}
          last
        />
      </dl>
    </div>
  );
}

function Line({ term, value, last = false }: { term: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-6 py-3 text-[16px] ${
        last ? "" : "border-b border-line/70"
      }`}
    >
      <dt className="min-w-0 text-dim">{term}</dt>
      <dd className="shrink-0 tabular-nums text-fg">{value}</dd>
    </div>
  );
}
