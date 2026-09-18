"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CopyableCode, Notice } from "@/components/ui";
import dynamic from "next/dynamic";
import { useIdentity } from "@/components/IdentityProvider";
import { usePrivyGate } from "@/components/PrivyClientProvider";
import type { Address } from "viem";
import { chain, isLocalChain } from "@/lib/chain";
import { mon } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { monadTestnet } from "viem/chains";

/// Shown when somebody has signed in and cannot afford what the screen is asking of them.
///
/// This is the gap an email login leaves behind. Privy removes the need for a wallet; it does not
/// put anything in it. Someone arriving with no crypto now gets an account in one tap and then a
/// button that fails — which reads as a broken product rather than an empty wallet.
///
/// The screen is arranged around the one method that works on every network today: send MON to
/// this address.
///
/// It used to lead with a faucet link, which is a thing only we do — nobody attending a reading
/// group is going to claim test tokens, so that described our test setup rather than their
/// situation. Demoting it to a small row at the bottom was not enough either: it still read as a
/// faucet page. It is now behind `?dev=1` with the rest of the scaffolding, and the instruction for
/// people trying this on a testnet lives in the README, where instructions to testers belong.
///
/// Topping up is a button on the email path, not a grey "not yet available" box — the box was
/// accurate and useless, since somebody with an empty wallet cannot act on a sentence. Pressing it
/// explains where card payment stands and why; it does not open a payment flow that cannot
/// complete. See TopUp.tsx for what that cost us to learn.
const FAUCETS: Record<number, { label: string; url: string }[]> = {
  [monadTestnet.id]: [
    { label: "Official faucet", url: "https://faucet.monad.xyz" },
    { label: "via Discord", url: "https://discord.gg/monad" },
  ],
};

/// Privy's hooks only work under its provider, which is mounted only for people who chose the
/// email path. Loaded separately so nobody else downloads it.
const LazyTopUp = dynamic(() => import("./TopUp"), { ssr: false });

function AddressQR({ address }: { address: Address }) {
  const t = useT();
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
      alt={t("funding.qrAlt")}
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
  const { devMode } = useIdentity();
  const privyGate = usePrivyGate();
  const t = useT();

  if (have >= need) return null;

  const faucets = FAUCETS[chain.id] ?? [];
  const short = need - have;

  return (
    <div className="space-y-4 rounded-xl border border-warn/30 bg-warn/10 p-4">
      <div className="space-y-1.5">
        <p className="text-[16px] font-medium text-warn">{t("funding.addMon", { what })}</p>
        <p className="text-[15px] leading-relaxed text-warn/90">
          {t("funding.short", { have: mon(have), need: mon(need), short: mon(short) })}
        </p>
      </div>

      {/* Receiving is the method that works on every network, so it is the one with the space. */}
      <div className="space-y-2.5 rounded-lg border border-warn/25 bg-ink/40 p-3">
        <p className="text-[15px] font-medium text-fg">{t("funding.sendTitle")}</p>
        <div className="flex items-start gap-3">
          <AddressQR address={address} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <CopyableCode value={address} />
            <p className="text-[13px] leading-relaxed text-faint">
              {t("funding.sendBody", { chain: chain.name })}
            </p>
          </div>
        </div>
      </div>

      {/* Top up. On the email path it is a button that answers where card payment stands; with a
          browser wallet it is a sentence, because buying MON into somebody's own MetaMask is not
          ours to drive. */}
      <div className="space-y-2 rounded-lg border border-dashed border-warn/25 p-3">
        <p className="text-[15px] font-medium text-fg">{t("funding.topUp")}</p>
        {privyGate.enabled ? (
          <LazyTopUp address={address} />
        ) : (
          <p className="text-[13px] leading-relaxed text-faint">{t("funding.topUpWalletNote")}</p>
        )}
      </div>

      {isLocalChain ? (
        <p className="text-[13px] text-warn/70">
          {t("funding.localFund")} <code>cast send</code>
          {t("funding.localFundEnd")}
        </p>
      ) : devMode && faucets.length > 0 ? (
        // Behind ?dev=1, like every other affordance that exists for us rather than for the person
        // using this. Claiming test tokens is not something somebody attending a reading group will
        // ever do, and leaving it on the screen — even small, even at the bottom — kept this reading
        // as a faucet page after the rest of it had been rewritten around receiving money.
        //
        // The cost is real: this build runs on a testnet, so somebody opening the link to try the
        // product has no other way to obtain MON. That is answered in the README and the submission
        // notes, which is where an instruction to testers belongs.
        <div className="space-y-1.5 border-t border-line pt-2.5">
          <p className="text-[13px] text-faint">Dev · testnet faucets</p>
          <div className="flex flex-wrap gap-2">
            {faucets.map((f) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-line-2 px-2.5 py-1.5 text-[13px] text-dim"
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
