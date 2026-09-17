"use client";

import { explorerTxUrl } from "@/lib/chain";
import { mon } from "@/lib/format";
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
  const extra = total - deposit;
  const link = hash ? explorerTxUrl(hash) : "";

  return (
    <div className="space-y-4 rounded-2xl border border-ok/30 bg-ok/5 p-5 text-center">
      <p className="text-[15px] font-medium uppercase tracking-[0.15em] text-ok">Paid out</p>

      <BigNumber value={mon(total)} />

      {extra > 0n ? (
        <p className="text-[16px] leading-relaxed text-dim">
          Your {mon(deposit)} deposit back, plus{" "}
          <span className="font-medium text-ok">{mon(extra)}</span> from the people who didn&apos;t
          show up.
        </p>
      ) : (
        <p className="text-[16px] leading-relaxed text-dim">
          Your {mon(deposit)} deposit back. Everyone who registered turned up, so there was nothing
          forfeited to share.
        </p>
      )}

      <p className="text-[13px] leading-relaxed text-faint">
        Nobody approved this. The split was fixed when the window closed, by who vouched for whom.
      </p>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[15px] text-dim underline decoration-line-2"
        >
          see the transaction ↗
        </a>
      )}
    </div>
  );
}
