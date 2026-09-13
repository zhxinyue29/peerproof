"use client";

import { useEffect, useRef } from "react";
import { getEmbeddedConnectedWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { monadTestnet } from "viem/chains";
import type { Address } from "viem";
import { deriveFromWallet, type Eip1193 } from "@/lib/wallet";
import { walletSigner, type Signer } from "@/lib/signer";
import { ESCROW_ADDRESS, resolveEventId } from "@/lib/chain";
import { shortenError } from "@/lib/format";

/// Turns a Privy session into the same Signer the wallet path produces. Rendered only once the
/// gate has mounted Privy, and imported dynamically, so nothing here reaches a page that never
/// asks for it.
///
/// The point of this path: passkeys need WebAuthn PRF, which desktop Chrome and most in-app
/// browsers do not have, and the browser-wallet fallback needs an extension the person may not
/// have either. Someone with neither could not take part at all. An email login can be taken by
/// anyone, in any browser, with nothing installed — which is the difference between a judge
/// opening the link and seeing the product, or seeing a dead end.
export default function PrivyBridge({
  onSigner,
  onError,
  onBusy,
}: {
  onSigner: (s: Signer) => void;
  onError: (msg: string) => void;
  onBusy: (msg: string | null) => void;
}) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  // Privy re-renders on every state change and each phase here must run exactly once: `login()`
  // opens a modal, and the derivation asks for a signature. Firing either twice is a second
  // dialog on top of the first.
  const askedToLogIn = useRef(false);
  const derived = useRef(false);

  useEffect(() => {
    if (!ready || authenticated || askedToLogIn.current) return;
    askedToLogIn.current = true;
    onBusy("Opening sign-in…");
    login();
  }, [ready, authenticated, login, onBusy]);

  useEffect(() => {
    if (!authenticated || !walletsReady || derived.current) return;

    const wallet = getEmbeddedConnectedWallet(wallets) ?? wallets[0];
    if (!wallet) return; // createOnLogin provisions one; this fires again when it lands.

    derived.current = true;
    void (async () => {
      onBusy("Setting up your key…");
      try {
        // switchChain first: the provider caches the chain it was created with, and Privy's own
        // docs say an existing provider is not updated by a later switch.
        if (wallet.chainId !== `eip155:${monadTestnet.id}`) {
          await wallet.switchChain(monadTestnet.id);
        }
        const provider = (await wallet.getEthereumProvider()) as unknown as Eip1193;
        // The derived key is bound to the event id, so deriving before the id is known produces a
        // key for the wrong event — and every code it signs is then rejected. Resolving here is
        // cheap and idempotent; not resolving showed up as a signature prompt naming event 2 on a
        // page pointing at event 3.
        const id = await resolveEventId();
        const { account } = await deriveFromWallet(ESCROW_ADDRESS, id, provider);
        onSigner(
          walletSigner(wallet.address as Address, account, { provider, kind: "privy" }),
        );
      } catch (e) {
        derived.current = false;
        onError(shortenError(e));
      } finally {
        onBusy(null);
      }
    })();
  }, [authenticated, walletsReady, wallets, onSigner, onError, onBusy]);

  return null;
}
