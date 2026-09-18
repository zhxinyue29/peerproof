"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { explorerTxUrl } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";

/// The moment a vouch lands.
///
/// This was a toast: a line of text, 2.6 seconds, gone. It is the only place the product's central
/// claim about Monad is visible — two phones, one scan, both counters moving, confirmed on chain
/// before anybody has lowered their arm — and it had no weight at all.
///
/// The latency is the hero because it is the evidence. Everything else here is there to make that
/// number mean something: who it was with, that a single scan counted for both people, and how
/// much further there is to go.
///
/// It leaves on its own, because the code above it rotates every fifteen seconds and the person is
/// about to scan somebody else. Nothing to dismiss, nothing in the way.
export default function VouchResult({
  who,
  latencyMs,
  hash,
  mine,
  theirs,
  needed,
  onDone,
}: {
  who: Address;
  latencyMs: number;
  hash: Hex;
  /// Counter before this vouch; it renders as `before → before + 1`.
  mine: number;
  theirs: number;
  needed: number;
  onDone: () => void;
}) {
  const t = useT();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Long enough to read three numbers, short enough to be gone before the next code.
    const out = setTimeout(() => setLeaving(true), 9000);
    const done = setTimeout(onDone, 9400);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [onDone]);

  const nowMine = mine + 1;
  const present = nowMine >= needed;

  return (
    <div
      className={`fixed inset-x-3 bottom-4 z-50 mx-auto max-w-[358px] rounded-2xl border border-line-2 bg-raised p-[18px] shadow-[0_24px_70px_rgba(0,0,0,.48)] transition-all duration-400 ${
        leaving ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <p className="text-[15px] uppercase tracking-[0.09em] text-dim">{t("vouch.landedIn")}</p>
      {/* Tabular so the digits do not reflow while it animates in — this number is the evidence,
          and jitter reads as a graphic rather than a measurement. */}
      <p className="mb-2.5 mt-0.5 text-[48px] font-black leading-none tracking-[-0.05em] tabular-nums">
        {(latencyMs / 1000).toFixed(2)}s
      </p>

      <Row label={t("vouch.you")} from={mine} to={nowMine} />
      <Row label={shortAddress(who)} from={theirs} to={theirs + 1} mono />

      {present && (
        <p className="mt-2.5 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2.5 text-[15px] text-ok">
          {t("floor.countsPresent")}
        </p>
      )}

      {explorerTxUrl(hash) && (
        <a
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-block text-[15px] text-accent-2"
        >
          {t("common.viewTx")}
        </a>
      )}
    </div>
  );
}

/// One scan increments both people. That is in the contract, and saying it here is the difference
/// between "I got a point" and "we proved each other".
function Row({
  label,
  from,
  to,
  mono,
}: {
  label: string;
  from: number;
  to: number;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-line py-2.5">
      <span className={`text-dim ${mono ? "font-mono text-[15px]" : "text-[15px]"}`}>{label}</span>
      <span className="text-[18px] font-medium tabular-nums">
        <span className="text-faint">{from}</span>
        <span className="mx-1.5 text-faint">→</span>
        <span>{to}</span>
      </span>
    </div>
  );
}
