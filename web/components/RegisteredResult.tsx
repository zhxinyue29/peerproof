"use client";

import type { Hex } from "viem";
import { Button } from "@/components/ui";
import { explorerTxUrl } from "@/lib/chain";
import { countdown, mon } from "@/lib/format";

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
  return (
    <div className="space-y-4 rounded-2xl border border-line-2 bg-raised p-5 md:p-6">
      <span className="inline-flex rounded-full bg-ok/15 px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide text-ok">
        Registered
      </span>

      <div className="space-y-2">
        <h3 className="text-[24px] font-medium leading-[1.2] tracking-tight md:text-[28px]">
          {mon(deposit)} is now in the contract
        </h3>
        <p className="text-[15px] leading-relaxed text-dim">
          Not in the organizer&apos;s wallet. Your deposit comes back when the room proves you were
          there — along with a share of what the no-shows leave behind.
        </p>
      </div>

      <p className="rounded-xl border border-ok/30 bg-ok/10 p-3.5 text-[14px] leading-relaxed text-dim">
        <span className="font-medium text-fg">Next:</span>{" "}
        {opensIn > 0
          ? `check-in opens in ${countdown(opensIn)}`
          : "check-in is open now"}
        , and you need {vouchesNeeded} {vouchesNeeded === 1 ? "person" : "people"} to vouch for you.
      </p>

      <Button onClick={onContinue} className="w-full">
        Open my attendance code
      </Button>

      {explorerTxUrl(hash) && (
        <a
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[14px] text-accent-2"
        >
          View registration transaction ↗
        </a>
      )}
    </div>
  );
}
