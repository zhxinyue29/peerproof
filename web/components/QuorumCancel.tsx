"use client";

import { Button } from "@/components/ui";
import { explorerTxUrl } from "@/lib/chain";
import { useT } from "@/lib/i18n";

/// The cancellation offered when registration closed below the event's minimum.
///
/// Only the explanation and the button: whether to show it is `canCancelForQuorum` in
/// lib/eligibility.ts, and sending it is the page's, which owns the signer and the busy state.
/// Anyone may cancel — the copy says so — and cancelling only makes deposits refundable; each
/// person still claims their own refund afterwards, through the ordinary claim.
export default function QuorumCancel({
  registered,
  minQuorum,
  busy,
  hash,
  onCancel,
}: {
  registered: number;
  minQuorum: number;
  /// The page's in-flight label, shown on the button while any write is running.
  busy: string | null;
  /// The cancellation this screen sent, once there is one.
  hash: string | null;
  onCancel: () => void;
}) {
  const t = useT();
  const url = hash ? explorerTxUrl(hash) : "";
  return (
    <>
      <p className="text-[15px] leading-relaxed text-dim">
        {t("floor.quorumBody", { registered, min: minQuorum })}
      </p>
      <Button onClick={onCancel} disabled={!!busy} className="w-full">
        {busy ?? t("floor.cancelForQuorum")}
      </Button>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block text-[15px] text-accent-2">
          {t("common.viewTx")}
        </a>
      )}
    </>
  );
}
