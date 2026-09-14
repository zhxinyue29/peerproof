"use client";

import { CopyableCode, Notice } from "@/components/ui";
import type { Address } from "viem";
import { chain, isLocalChain } from "@/lib/chain";
import { mon } from "@/lib/format";
import { monadTestnet } from "viem/chains";

/// Shown when somebody has signed in and cannot afford what the screen is asking of them.
///
/// This is the gap an email login leaves behind. Privy removes the need for a wallet; it does not
/// put anything in it. Someone arriving with no crypto now gets an account in one tap and then a
/// button that fails — which reads as a broken product rather than an empty wallet.
///
/// Faucet on testnet, because that is the honest answer there. On mainnet the honest answer is
/// that there is no card on-ramp to Monad yet: MoonPay has built native MON on chain 143 and has
/// it suspended, and Stripe's destination list does not include Monad at all. Saying so beats a
/// button that opens a provider with nothing to sell.
const FAUCETS: Record<number, { label: string; url: string }[]> = {
  [monadTestnet.id]: [
    { label: "Official faucet", url: "https://faucet.monad.xyz" },
    { label: "via Discord", url: "https://discord.gg/monad" },
  ],
};

export default function Funding({
  need,
  have,
  what,
  address,
}: {
  /// Total required, deposit plus room for gas.
  need: bigint;
  have: bigint;
  /// What the money is for, e.g. "register".
  what: string;
  /// Where to send it. Shown in full and copyable — an address you cannot copy is an address
  /// nobody can fund, and truncating it here was the one thing that made this screen useless.
  address: Address;
}) {
  if (have >= need) return null;

  const faucets = FAUCETS[chain.id] ?? [];
  const short = need - have;

  return (
    <div className="space-y-2.5 rounded-xl border border-warn/30 bg-warn/10 p-4">
      <p className="text-[13px] font-medium text-warn">
        Not enough MON to {what}
      </p>
      <p className="text-[13px] leading-relaxed text-warn/90">
        You have {mon(have)} and need about {mon(need)} — {mon(short)} short. The deposit is your
        own money going into the contract, so it cannot be covered for you; that is the part that
        makes a no-show cost something.
      </p>

      <div className="space-y-1.5 pt-0.5">
        <p className="text-[11px] uppercase tracking-wide text-warn/70">Your address</p>
        <CopyableCode value={address} />
      </div>

      {faucets.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {faucets.map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-warn/40 px-3 py-2 text-[13px] font-medium text-warn"
            >
              {f.label} ↗
            </a>
          ))}
        </div>
      ) : isLocalChain ? (
        <p className="text-[11px] text-warn/70">
          Local chain — fund this address with <code>cast send</code>.
        </p>
      ) : (
        <div className="space-y-1.5 pt-0.5">
          <p className="text-[13px] text-warn/90">
            Send MON to your address from an exchange or another wallet.
          </p>
          <p className="text-[11px] leading-relaxed text-warn/70">
            Card purchases into Monad are not available yet — MoonPay has built native MON and has
            it suspended, and Stripe does not list Monad as a destination. This will open up as the
            chain matures; nothing here needs to change when it does.
          </p>
        </div>
      )}
    </div>
  );
}

/// A deposit plus headroom for the transaction. Monad charges the gas limit rather than the amount
/// used, so the headroom is the limit — not an estimate that might be exceeded.
export function needFor(deposit: bigint, gasLimit: bigint, gasPrice = 150_000_000_000n): bigint {
  return deposit + gasLimit * gasPrice;
}

export function FundingNotice({ children }: { children: React.ReactNode }) {
  return <Notice tone="warn">{children}</Notice>;
}
