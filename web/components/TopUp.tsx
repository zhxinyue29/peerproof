"use client";

import { useState } from "react";
import { useAddFunds } from "@privy-io/react-auth";
import type { Address } from "viem";
import { Button } from "@/components/ui";
import { chain } from "@/lib/chain";
import { shortenError } from "@/lib/format";

/// The top-up entry.
///
/// This has been three things. A grey "not yet available" label — accurate and useless, because
/// somebody reading it has an empty wallet and cannot act on a sentence. Then a live button wired
/// to Privy's funding flow, which turned out worse: the modal opens on a "Buy crypto" screen with
/// an amount in your own currency, then fails with "Something went wrong. Please try again." No
/// provider sells native MON into a wallet, so there are no quotes to fetch — but the person sees a
/// payment screen breaking, reads it as our product breaking, and is invited to keep retrying.
///
/// So the button stays and the dead flow does not. Pressing it answers the question it raises.
///
/// When a provider does list MON, set LIVE to true: the wiring below is real and already points at
/// the right chain and asset. Nothing else on this screen changes.
const LIVE = false;

export default function TopUp({ address }: { address: Address }) {
  const { addFunds } = useAddFunds();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function start() {
    if (!LIVE) {
      setOpen(true);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const result = await addFunds({
        destination: {
          address,
          // CAIP-2. Privy names chains this way rather than as a number.
          chain: `eip155:${chain.id}`,
          asset: "native",
        },
        fiat: { defaultAmount: "20" },
      });
      setNote(
        result.status === "submitted"
          ? "Submitted. Funds can take a few minutes to arrive — this page updates on its own."
          : "Topped up. Your balance updates here shortly.",
      );
    } catch (e) {
      const why = shortenError(e);
      setNote(/reject|denied|exit|cancel/i.test(why) ? "Closed without topping up." : why);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => void start()} disabled={busy} variant="ghost" className="w-full">
        {busy ? "Opening…" : "Top up with a card"}
      </Button>
      {note && <p className="text-[11px] leading-relaxed text-faint">{note}</p>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 md:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl border border-line-2 bg-panel p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[17px] font-medium">Card top-up is coming</p>
            <p className="text-[13px] leading-relaxed text-dim">
              This is where paying by card will go. It is not switched on yet, and the reason is not
              on our side: no provider sells MON into a wallet today. MoonPay has built it on Monad
              and has it suspended; Stripe does not list Monad as a destination.
            </p>
            <p className="text-[13px] leading-relaxed text-dim">
              Until one of them does, use the address above — from an exchange, another wallet, or
              someone sending it to you. That works right now.
            </p>
            <Button onClick={() => setOpen(false)} className="w-full">
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
