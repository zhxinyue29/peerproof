"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { privyUsable, usePrivyGate } from "@/components/PrivyClientProvider";
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
import { ESCROW_ADDRESS, eventId, isLocalChain, resolveEventId } from "@/lib/chain";
import { clearSession, loadSession, saveSession } from "@/lib/session";
import { privateKeyToAccount } from "viem/accounts";
import { shortenError } from "@/lib/format";
import { useT } from "@/lib/i18n";

/// Loaded only when someone picks the email path, and only ever imported from here — that is what
/// keeps 2.1MB of Privy off the four screens that never sign anyone in.
const PrivyBridge = dynamic(() => import("@/components/PrivyBridge"), { ssr: false });

type Ctx = {
  signer: Signer | null;
  prf: PrfSupport | null;
  walletAvailable: boolean;
  /// Email sign-in, for people with neither a PRF-capable passkey nor a browser wallet.
  privyAvailable: boolean;
  devMode: boolean;
  busy: string | null;
  error: string | null;
  setUpPasskey: (mode: "create" | "unlock") => Promise<void>;
  setUpWallet: () => Promise<void>;
  setUpPrivy: () => void;
  useDevKey: () => void;
  /// Forgets the stored key. The wallet or passkey itself is untouched.
  signOut: () => void;
  clearError: () => void;
};

const IdentityContext = createContext<Ctx | null>(null);

/// Lives above the routes so the derived key survives client-side navigation. It has to: the key
/// exists only in a signing session in memory, and re-deriving it costs the user another prompt.
/// Landing page → floor must not ask twice.
export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [signer, setSigner] = useState<Signer | null>(null);
  const [prf, setPrf] = useState<PrfSupport | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const privyGate = usePrivyGate();
  // Incremented on every press of the sign-in button. The bridge opens the dialog once per
  // value — which is what makes pressing the button again work after somebody has closed it,
  // without the dialog reopening itself on a timer.
  const [openSignal, setOpenSignal] = useState(0);
  /// Set the first time PrivyBridge reports anything. See the timeout in setUpPrivy.
  const privyReported = useRef(false);

  useEffect(() => {
    // The query string and the injected provider do not exist during the static export, so these
    // cannot be lazy useState initialisers — reading them during render would throw at build time.
    // Mount is the earliest point they are knowable, which is what this rule does not cover.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDevMode(new URLSearchParams(window.location.search).get("dev") === "1" || isLocalChain);
    setWalletAvailable(hasInjectedWallet());
    checkPrfSupport().then(setPrf);

    // Bring back the key from last time rather than asking for another signature. Without this a
    // refresh costs a wallet prompt or a biometric, which during an event means interrupting
    // somebody mid-scan.
    void resolveEventId().then((id) => {
      const saved = loadSession(id);
      if (!saved) return;

      // An email session cannot be rebuilt from the stored key alone. The key signs attendance
      // codes; sending a transaction needs Privy's provider, which lives in memory and is gone
      // after a reload. Restoring a signer without one produced an account that looked ready,
      // showed "Stake and register", and then failed with "your wallet has not authorised this
      // site" — because the write had fallen through to a browser extension that was not there.
      //
      // So the gate is re-enabled instead, and PrivyBridge rebuilds the signer with a live
      // provider. Privy is already authenticated, and embedded wallets sign without prompting, so
      // this costs a chunk download and nothing the person has to do.
      if (saved.kind === "privy") {
        privyGate.enable();
        return;
      }

      const attest = privateKeyToAccount(saved.attestPk);
      setSigner(
        saved.kind === "passkey"
          ? passkeySigner(attest)
          : // A browser wallet is reachable again through window.ethereum, so this one does rebuild.
            walletSigner(saved.owner, attest, { kind: saved.kind, label: saved.label }),
      );
    });
    // privyGate.enable is stable — it is a useCallback with no dependencies in the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setUpPasskey = useCallback(async (mode: "create" | "unlock") => {
    setBusy(mode === "create" ? t("identity.creatingKey") : t("identity.unlocking"));
    setError(null);
    try {
      const id =
        mode === "create"
          ? await createAttestIdentity("PeerProof attendee")
          : await unlockAttestIdentity();
      setSigner(passkeySigner(id.account));
      saveSession(await resolveEventId(), "passkey", id.attestPk, id.account.address);
    } catch (e) {
      if (e instanceof PrfUnavailableError) setPrf({ available: false, reason: "prf-unavailable" });
      else setError(shortenError(e, t));
    } finally {
      setBusy(null);
    }
  }, []);

  const setUpWallet = useCallback(async () => {
    setBusy(t("identity.waitingWallet"));
    setError(null);
    try {
      // Same race as the Privy path: the derived key is bound to the event id, so it has
      // to be resolved before deriving rather than alongside.
      const id = await resolveEventId();
      const { account, owner, attestPk } = await deriveFromWallet(ESCROW_ADDRESS, id);
      setSigner(walletSigner(owner, account));
      saveSession(id, "wallet", attestPk, owner);
    } catch (e) {
      setError(e instanceof NoWalletError ? t("identity.noWallet") : shortenError(e, t));
    } finally {
      setBusy(null);
    }
  }, []);

  const useDevKey = useCallback(() => {
    try {
      setSigner(passkeySigner(createDevIdentity().account));
    } catch (e) {
      setError(shortenError(e, t));
    }
  }, []);

  // Mounting Privy is the whole action: PrivyBridge opens the sign-in as soon as it renders.
  const setUpPrivy = useCallback(() => {
    setError(null);
    setOpenSignal((n) => n + 1);
    // Feedback before anything else. This used to only flip the gate, and the gate's only visible
    // effect is 2.1MB of Privy beginning to download — so on a slow connection, or with an
    // extension blocking privy.io, pressing the button did nothing at all, for as long as you
    // cared to watch. "Nothing happened" is the one outcome a button must never produce.
    setBusy(t("identity.openingSignIn"));
    privyGate.enable();

    // The same import the gate performs, requested again so its failure is observable. `next/dynamic`
    // swallows a failed chunk load: it renders nothing and says nothing, which is why this was a
    // button that did nothing rather than a button that reported a problem. Module loads are cached
    // by the runtime, so asking twice costs one request and no extra bytes.
    void import("@/components/PrivyInner").catch((e: unknown) => {
      setBusy(null);
      setError(t("identity.signInFailedLoad", { why: shortenError(e, t) }));
    });

    // And if it neither loads nor fails — blocked at the network layer, or simply very slow — say
    // so rather than spinning forever.
    //
    // Whether the bridge got there first is a fact, so it is recorded as one. This used to compare
    // the busy message against the literal "Opening sign-in…" while the message itself came from
    // `t()` — so the moment the dictionary answered in Chinese the comparison could never match,
    // and the twenty-second safety net silently stopped existing for exactly the readers most
    // likely to need it. A sentinel that is also copy is not a sentinel.
    window.setTimeout(() => {
      if (privyReported.current) return;
      setBusy(null);
      setError(t("identity.signInBlocked"));
    }, 20_000);
  }, [privyGate]);

  return (
    <IdentityContext.Provider
      value={{
        signer,
        prf,
        walletAvailable,
        privyAvailable: privyUsable,
        devMode,
        busy,
        error,
        setUpPasskey,
        setUpWallet,
        setUpPrivy,
        useDevKey,
        signOut: () => {
      clearSession(eventId());
      privyGate.disable();
      setSigner(null);
    },
    clearError: () => setError(null),
      }}
    >
      {/* Inside Privy's context (the gate wraps this provider) and inside ours, which is the one
          place that can read Privy's hooks and hand the result back as a Signer. */}
      {privyGate.enabled && !signer && (
        <PrivyBridge
          openSignal={openSignal}
          onSigner={setSigner}
          onError={setError}
          // The bridge reporting anything at all is what "Privy arrived" means, so record it here
          // rather than inferring it from the message it happened to send.
          onBusy={(m) => {
            privyReported.current = true;
            setBusy(m);
          }}
        />
      )}
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): Ctx {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity outside IdentityProvider");
  return ctx;
}
