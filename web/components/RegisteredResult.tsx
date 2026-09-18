"use client";

import type { Hex } from "viem";
import { Button } from "@/components/ui";
import { explorerTxUrl } from "@/lib/chain";
import { countdown, mon, sentenceGap } from "@/lib/format";
import { useT } from "@/lib/i18n";

/// The moment the deposit leaves.
///
/// It used to be nothing: the button swapped to "Go to the floor" and the money was simply gone
/// from the wallet with no account of where. On a product whose entire claim is that the organizer
/// never holds the money, the instant somebody parts with it is the strongest place to say so —
/// and it was the one place saying nothing.
///
/// No celebration. The feeling this product trades on is "you can check", and confetti argues the
/// opposite. The transaction link is the emotional content.
export default function RegisteredResult({
  deposit,
  hash,
  opensIn,
  vouchesNeeded,
  onContinue,
}: {
  deposit: bigint;
  hash: Hex;
  /// Seconds until check-in opens; zero or less when it already has.
  opensIn: number;
  vouchesNeeded: number;
  onContinue: () => void;
}) {
  const t = useT();
  // Bound rather than called inline: sentenceGap has to read the very string it follows.
  const next = t("registered.next");

  return (
    <div className="space-y-4 rounded-2xl border border-line-2 bg-raised p-5 md:p-6">
      <span className="inline-flex rounded-full bg-ok/15 px-2.5 py-1 text-[14px] font-semibold uppercase tracking-wide text-ok">
        {t("organizer.registered")}
      </span>

      <div className="space-y-2">
        <h3 className="text-[24px] font-medium leading-[1.2] tracking-tight md:text-[28px]">
          {t("registered.inContract", { amount: mon(deposit) })}
        </h3>
        <p className="text-[16px] leading-relaxed text-dim">{t("registered.body")}</p>
      </div>

      <p className="rounded-xl border border-ok/30 bg-ok/10 p-3.5 text-[15px] leading-relaxed text-dim">
        <span className="font-medium text-fg">{next}</span>
        {sentenceGap(next)}
        {opensIn > 0
          ? t("registered.opensIn", { t: countdown(opensIn) })
          : t("registered.openNow")}
        {/* One person and several are separate strings rather than a count plus a noun: the
            plural rule is English's, and Chinese has no equivalent to apply. */}
        {vouchesNeeded === 1
          ? t("registered.andNeedOne")
          : t("registered.andNeed", { n: vouchesNeeded })}
      </p>

      <Button onClick={onContinue} className="w-full">
        {t("event.openMyCode")}
      </Button>

      {explorerTxUrl(hash) && (
        <a
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[15px] text-accent-2"
        >
          {t("registered.viewTx")}
        </a>
      )}
    </div>
  );
}
