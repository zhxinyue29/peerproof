"use client";

import { useState } from "react";
import { useAddFunds } from "@privy-io/react-auth";
import type { Address } from "viem";
import { Button, Notice } from "@/components/ui";
import { chain } from "@/lib/chain";
import { shortenError } from "@/lib/format";

/// The top-up entry, wired to Privy's funding flow.
///
/// This was a grey box reading "not yet available", which is accurate and useless: somebody with an
/// empty wallet cannot act on it. It is now a button that opens Privy's own funding modal — card,
/// bank transfer, or a transfer from another wallet, whichever that account has enabled.
///
/// It may well not complete. No provider sells native MON into a wallet today: MoonPay has built it
/// on chain 143 and has it suspended, and Stripe's destination list does not include Monad. So the
/// honest shape is a real entry point that opens a real flow and, when the flow has nothing to
/// offer, says exactly why rather than pretending the button was never there. That reason does not
/// change anything else on this screen; when a provider lists MON, this starts completing.
///
/// Nothing here handles card details. Privy's modal collects them inside its own flow; this app
/// never sees them, and never asks for them.
export default function TopUp({ address }: { address: Address }) {
  const { addFunds } = useAddFunds();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function open() {
    setBusy(true);
    setNote(null);
    setDone(false);
    try {
      const result = await addFunds({
        destination: {
          address,
          // CAIP-2. Privy wants the chain named this way rather than as a number.
          chain: `eip155:${chain.id}`,
          // Native MON, not a token on top of it.
          asset: "native",
        },
        fiat: { defaultAmount: "20" },
      });
      setDone(result.status !== "submitted");
      if (result.status === "submitted") {
        setNote("Submitted. Funds can take a few minutes to arrive — this page updates on its own.");
      }
    } catch (e) {
      const why = shortenError(e);
      setNote(
        /reject|denied|exit|cancel/i.test(why)
          ? "Closed without topping up."
          : `${why} — no provider sells MON into a wallet yet. MoonPay has built it on Monad and has it suspended; Stripe does not list Monad as a destination. Sending MON to the address above works today.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => void open()} disabled={busy} variant="ghost" className="w-full">
        {busy ? "Opening…" : "Top up with a card or bank transfer"}
      </Button>
      {done && <Notice tone="ok">Topped up. Your balance updates here shortly.</Notice>}
      {note && <p className="text-[11px] leading-relaxed text-faint">{note}</p>}
      {!note && !done && (
        <p className="text-[11px] leading-relaxed text-faint">
          Opens Privy&apos;s funding flow. Card availability depends on the network — see what it
          offers; sending MON to the address above always works.
        </p>
      )}
    </div>
  );
}
