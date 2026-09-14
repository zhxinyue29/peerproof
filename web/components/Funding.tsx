"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
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
/// The screen is arranged around the one method that works on every network today: send MON to
/// this address. It used to lead with a faucet link, which is a thing only we do — nobody attending
/// a reading group is going to claim test tokens, and putting that first described our test setup
/// rather than their situation. The faucet is still here on testnet, at the bottom, labelled as
/// what it is.
///
/// Buying with a card is the entry that is deliberately inert. MoonPay has built native MON on
/// chain 143 and has it suspended; Stripe's destination list does not include Monad at all. A
/// button that opens a provider with nothing to sell is worse than a line saying so — and when one
/// of them does list MON, this becomes a link and nothing else here changes.
const FAUCETS: Record<number, { label: string; url: string }[]> = {
  [monadTestnet.id]: [
    { label: "Official faucet", url: "https://faucet.monad.xyz" },
    { label: "via Discord", url: "https://discord.gg/monad" },
  ],
};

function AddressQR({ address }: { address: Address }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // An `ethereum:` URI rather than the bare address: wallet apps read it as "send to", which
    // removes the step where somebody pastes 42 characters into a phone by hand.
    QRCode.toDataURL(`ethereum:${address}@${chain.id}`, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 420,
      color: { dark: "#0a0713", light: "#ffffff" },
    })
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

  if (!url) return <div className="h-[132px] w-[132px] shrink-0 rounded-lg bg-raised" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Your address as a QR code"
      className="h-[132px] w-[132px] shrink-0 rounded-lg"
    />
  );
}

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
  /// Where to send it. Shown in full, copyable, and as a QR — an address you cannot copy is an
  /// address nobody can fund, and on a phone a QR is the only way to get it into another wallet.
  address: Address;
}) {
  if (have >= need) return null;

  const faucets = FAUCETS[chain.id] ?? [];
  const short = need - have;

  return (
    <div className="space-y-4 rounded-xl border border-warn/30 bg-warn/10 p-4">
      <div className="space-y-1.5">
        <p className="text-[15px] font-medium text-warn">Add MON to {what}</p>
        <p className="text-[13px] leading-relaxed text-warn/90">
          You have {mon(have)} and need about {mon(need)} — {mon(short)} short. The deposit is your
          own money going into the contract, so it cannot be covered for you; that is the part that
          makes a no-show cost something.
        </p>
      </div>

      {/* Receiving is the method that works on every network, so it is the one with the space. */}
      <div className="space-y-2.5 rounded-lg border border-warn/25 bg-ink/40 p-3">
        <p className="text-[13px] font-medium text-fg">Send MON to your address</p>
        <div className="flex items-start gap-3">
          <AddressQR address={address} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <CopyableCode value={address} />
            <p className="text-[11px] leading-relaxed text-faint">
              Scan this from another wallet, or copy the address. Anything that can send on{" "}
              {chain.name} will do — an exchange withdrawal, a friend, your own other wallet.
            </p>
          </div>
        </div>
      </div>

      {/* The reserved entry. Inert on purpose, and honest about why. */}
      <div className="space-y-1 rounded-lg border border-dashed border-warn/25 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-dim">Buy with a card</p>
          <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11px] text-faint">
            not yet available
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-faint">
          No provider sells MON into a wallet yet — MoonPay has built it and has it suspended, and
          Stripe does not list Monad as a destination. This opens up as the chain matures; nothing
          else on this screen changes when it does.
        </p>
      </div>

      {isLocalChain ? (
        <p className="text-[11px] text-warn/70">
          Local chain — fund this address with <code>cast send</code>.
        </p>
      ) : faucets.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-faint">
            Testing on {chain.name}? These hand out test MON, which is worth nothing anywhere.
          </p>
          <div className="flex flex-wrap gap-2">
            {faucets.map((f) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-line-2 px-2.5 py-1.5 text-[12px] text-dim"
              >
                {f.label} ↗
              </a>
            ))}
          </div>
        </div>
      ) : null}
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
