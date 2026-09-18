"use client";

import { explorerTxUrl } from "@/lib/chain";
import { mon } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { BigNumber } from "@/components/ui";

/// The moment the whole product exists for.
///
/// Everything before this is a promise: stake, scan, wait. This is where the promise pays out —
/// and where the difference between this and every other RSVP tool becomes a number rather than a
/// claim. Someone who showed up gets back more than they put in, and the extra came from people
/// who did not, not from a sponsor and not from the organizer.
///
/// It used to be a disabled button reading "Claimed".
export default function PayoutResult({
  deposit,
  total,
  hash,
}: {
  deposit: bigint;
  total: bigint;
  hash?: string | null;
}) {
  const t = useT();
  const extra = total - deposit;
  const link = hash ? explorerTxUrl(hash) : "";

  return (
    <div className="space-y-4 rounded-2xl border border-ok/30 bg-ok/5 p-5 text-center">
      <p className="text-[15px] font-medium uppercase tracking-[0.15em] text-ok">
        {t("payout.paidOut")}
      </p>

      <BigNumber value={mon(total)} />

      {extra > 0n ? (
        // Two halves so the surplus keeps its own colour — it is the number the whole product
        // exists to produce, and a sentence in one flat grey would bury it.
        <p className="text-[16px] leading-relaxed text-dim">
          {t("payout.extraPre", { amount: mon(deposit) })}{" "}
          <span className="font-medium text-ok">{mon(extra)}</span> {t("payout.extraPost")}
        </p>
      ) : (
        <p className="text-[16px] leading-relaxed text-dim">
          {t("payout.noExtra", { amount: mon(deposit) })}
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-faint">{t("payout.noApproval")}</p>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[15px] text-dim underline decoration-line-2"
        >
          {t("payout.seeTx")}
        </a>
      )}
    </div>
  );
}
