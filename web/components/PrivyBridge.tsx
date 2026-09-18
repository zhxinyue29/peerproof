"use client";

import { useEffect, useRef } from "react";
import { getEmbeddedConnectedWallet, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { monadTestnet } from "viem/chains";
import type { Address } from "viem";
import { deriveFromWallet, type Eip1193 } from "@/lib/wallet";
import { walletSigner, type Signer } from "@/lib/signer";
import { ESCROW_ADDRESS, resolveEventId } from "@/lib/chain";
import { shortenError } from "@/lib/format";
import { saveSession } from "@/lib/session";
import { useT } from "@/lib/i18n";

/// Turns a Privy session into the same Signer the wallet path produces. Rendered only once the
/// gate has mounted Privy, and imported dynamically, so nothing here reaches a page that never
/// asks for it.
///
/// The point of this path: passkeys need WebAuthn PRF, which desktop Chrome and most in-app
/// browsers do not have, and the browser-wallet fallback needs an extension the person may not
/// have either. Someone with neither could not take part at all. An email login can be taken by
/// anyone, in any browser, with nothing installed — which is the difference between a judge
/// opening the link and seeing the product, or seeing a dead end.
/// Privy reports the identifier under whichever method was used, not in one place.
function privyLabel(user: unknown): string | undefined {
  const u = user as
    | { email?: { address?: string }; google?: { email?: string }; phone?: { number?: string } }
    | null
    | undefined;
  return u?.email?.address ?? u?.google?.email ?? u?.phone?.number ?? undefined;
}

export default function PrivyBridge({
  onSigner,
  onError,
  onBusy,
}: {
  onSigner: (s: Signer) => void;
  onError: (msg: string) => void;
  onBusy: (msg: string | null) => void;
}) {
  const t = useT();
  const { ready, authenticated, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  // Privy re-renders on every state change and each phase here must run exactly once: `login()`
  // opens a modal, and the derivation asks for a signature. Firing either twice is a second
  // dialog on top of the first.
  const askedToLogIn = useRef(false);
  const derived = useRef(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Closing the modal is a normal thing to do and it used to be a dead end. `login()` only opens
  // the dialog; it reports nothing when somebody dismisses it. The button stayed on "Opening
  // sign-in…", disabled, with askedToLogIn already spent — so the screen sat there offering no way
  // back in, which reads as the button being broken rather than as the dialog having been closed.
  const { login } = useLogin({
    onComplete: () => onBusy(null),
    onError: () => {
      askedToLogIn.current = false;
      onBusy(null);
    },
  });

  useEffect(() => {
    if (!ready || authenticated || askedToLogIn.current) return;
    askedToLogIn.current = true;
    onBusy(t("identity.openingSignIn"));
    // Email only. The dashboard config lists wallet as well, and the shared modal offered both —
    // so pressing "Continue with email" produced a wallet chooser, next to a button on our own page
    // that already does wallets. Narrowing here, not in the config, keeps the wallet route
    // available to anything that wants it.
    login({ loginMethods: ["email"] });

    // "Opening sign-in…" describes opening the dialog, which takes a moment; it does not describe
    // the dialog being open, and the app has no business being frozen behind somebody else's modal.
    // So it expires, and the one-shot guard expires with it.
    //
    // Deliberately not driven off the dialog's presence in the DOM: #privy-dialog is a
    // zero-height shell that stays mounted whether or not anything is shown, so watching for it to
    // disappear was watching for something that never happens. Anything reading Privy's internals
    // here can be wrong in a way that leaves the only way in disabled — which is exactly the
    // failure being fixed.
    //
    // Held in a ref rather than cleaned up by this effect. `login` is a new function on every
    // render, so the effect reruns constantly; each rerun hit the guard above and returned early,
    // while the cleanup from the previous run had already cancelled the timer. It was scheduled and
    // killed, over and over, and the button stayed disabled.
    expiry.current = setTimeout(() => {
      askedToLogIn.current = false;
      // Not if a key is being derived — that has its own message and finishes on its own.
      if (!derived.current) onBusy(null);
    }, 4000);
  }, [ready, authenticated, login, onBusy]);

  // The one place cancelling it is right: going away entirely.
  useEffect(() => () => clearTimeout(expiry.current), []);

  useEffect(() => {
    if (!authenticated || !walletsReady || derived.current) return;

    const wallet = getEmbeddedConnectedWallet(wallets) ?? wallets[0];
    if (!wallet) return; // createOnLogin provisions one; this fires again when it lands.

    derived.current = true;
    void (async () => {
      onBusy(t("bridge.settingUpKey"));
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
        const { account, attestPk } = await deriveFromWallet(ESCROW_ADDRESS, id, provider);
        saveSession(id, "privy", attestPk, wallet.address as Address, privyLabel(user));
        onSigner(
          walletSigner(wallet.address as Address, account, {
            provider,
            kind: "privy",
            // Whichever identifier they actually signed in with. `user.email` is only populated
            // for the email method; a Google login puts it under google, a phone under phone. An
            // account shown back as a bare 0x… is the failure this is here to prevent, so take
            // anything human before falling through to nothing.
            label: privyLabel(user),
          }),
        );
      } catch (e) {
        derived.current = false;
        onError(shortenError(e, t));
      } finally {
        onBusy(null);
      }
    })();
  }, [authenticated, walletsReady, wallets, user, onSigner, onError, onBusy]);

  return null;
}
