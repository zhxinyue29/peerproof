"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  checkPrfSupport,
  createAttestIdentity,
  createDevIdentity,
  PrfUnavailableError,
  unlockAttestIdentity,
  type PrfSupport,
} from "@/lib/passkey";
import { deriveFromWallet, hasInjectedWallet, NoWalletError } from "@/lib/wallet";
import { passkeySigner, walletSigner, type Signer } from "@/lib/signer";
import { ESCROW_ADDRESS, EVENT_ID, isLocalChain } from "@/lib/chain";
import { shortenError } from "@/lib/format";

type Ctx = {
  signer: Signer | null;
  prf: PrfSupport | null;
  walletAvailable: boolean;
  devMode: boolean;
  busy: string | null;
  error: string | null;
  setUpPasskey: (mode: "create" | "unlock") => Promise<void>;
  setUpWallet: () => Promise<void>;
  useDevKey: () => void;
  clearError: () => void;
};

const IdentityContext = createContext<Ctx | null>(null);

/// Lives above the routes so the derived key survives client-side navigation. It has to: the key
/// exists only in a signing session in memory, and re-deriving it costs the user another prompt.
/// Landing page → floor must not ask twice.
export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [signer, setSigner] = useState<Signer | null>(null);
  const [prf, setPrf] = useState<PrfSupport | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The query string and the injected provider do not exist during the static export, so these
    // cannot be lazy useState initialisers — reading them during render would throw at build time.
    // Mount is the earliest point they are knowable, which is what this rule does not cover.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDevMode(new URLSearchParams(window.location.search).get("dev") === "1" || isLocalChain);
    setWalletAvailable(hasInjectedWallet());
    checkPrfSupport().then(setPrf);
  }, []);

  const setUpPasskey = useCallback(async (mode: "create" | "unlock") => {
    setBusy(mode === "create" ? "Creating your key…" : "Unlocking…");
    setError(null);
    try {
      const id =
        mode === "create"
          ? await createAttestIdentity("PeerProof attendee")
          : await unlockAttestIdentity();
      setSigner(passkeySigner(id.account));
    } catch (e) {
      if (e instanceof PrfUnavailableError) setPrf({ available: false, reason: "prf-unavailable" });
      else setError(shortenError(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const setUpWallet = useCallback(async () => {
    setBusy("Waiting for your wallet…");
    setError(null);
    try {
      const { account, owner } = await deriveFromWallet(ESCROW_ADDRESS, EVENT_ID);
      setSigner(walletSigner(owner, account));
    } catch (e) {
      setError(e instanceof NoWalletError ? "No browser wallet found." : shortenError(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const useDevKey = useCallback(() => {
    try {
      setSigner(passkeySigner(createDevIdentity().account));
    } catch (e) {
      setError(shortenError(e));
    }
  }, []);

  return (
    <IdentityContext.Provider
      value={{
        signer,
        prf,
        walletAvailable,
        devMode,
        busy,
        error,
        setUpPasskey,
        setUpWallet,
        useDevKey,
        clearError: () => setError(null),
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): Ctx {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity outside IdentityProvider");
  return ctx;
}
