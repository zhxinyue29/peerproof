"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { monadTestnet } from "viem/chains";
import { chain } from "@/lib/chain";

/// A gate, not a provider. Privy is 2.1MB of JavaScript — it bundles Solana, a Stripe fiat
/// on-ramp and a shelf of wallet connectors, none of which this app touches — and mounting it in
/// the root layout meant every page paid for it. That included /floor, which is fifty phones
/// opening the same link on venue wifi at the same moment, and /venue, which never logs anyone in
/// at all.
///
/// So it loads when someone chooses it and not before. The choice is remembered for the session,
/// because the signer has to survive the walk from the landing page to the floor: someone who
/// logged in with email on / must not be asked again on /floor.
///
/// Everything about this is invisible to users who never take the Privy path. They download none
/// of it.
const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const SESSION_KEY = "peerproof.privy.chosen";

/// One-shot: "somebody just pressed sign in". Consumed by PrivyBridge the moment it mounts.
///
/// It has to live in storage rather than in React state, because enabling Privy swaps `children`
/// from a bare position into `<LazyPrivy>` — a different element type at the same position, which
/// unmounts and remounts the entire app beneath it. Every counter, ref and piece of state in
/// IdentityProvider is destroyed by the very act of turning Privy on, so a press cannot be
/// remembered in any of them.
///
/// That remount is also why the dialog used to reopen on every page load. The bridge could not
/// tell "the user just asked" from "a previous session was restored" — both look like a fresh
/// mount — so it opened for both. This key is the difference, and being one-shot is what keeps a
/// reload from inheriting the intent.
export const ASK_KEY = "peerproof.privy.ask";

/// True when Privy was already chosen *before this page load* — i.e. this mount is a restored
/// session rather than something the reader just did.
///
/// Module-level and written once, at the only moment the answer is knowable: the gate's first
/// mount, before any press can have run `enable`. The bridge uses it as a floor, so that a missing
/// or unreadable ask-flag degrades to "open the dialog" rather than to "the sign-in button does
/// nothing" — the second is the worse failure by a distance, and is what shipped on 2026-09-20.
let restoredOnLoad = false;
export function privyRestoredOnLoad() {
  return restoredOnLoad;
}

export const hasPrivy = APP_ID.length > 0;

/// Privy only knows the chains it was configured with, so on the local anvil fixture it is mounted
/// but unable to transact. Offering a login that cannot sign is worse than not offering one.
export const privyUsable = hasPrivy && chain.id === monadTestnet.id;

const LazyPrivy = dynamic(() => import("./PrivyInner"), {
  // No server to render on — this is a static export — and Privy is browser-only regardless.
  ssr: false,
});

const LazyPrivyLogout = dynamic(() => import("./PrivyLogout"), { ssr: false });

type GateCtx = {
  enabled: boolean;
  /// `ask` distinguishes the button from the restore path. Without it, restoring an email session
  /// on page load is indistinguishable from pressing sign in.
  enable: (opts?: { ask?: boolean }) => void;
  disable: () => void;
};
const PrivyGateContext = createContext<GateCtx>({
  enabled: false,
  enable: () => {},
  disable: () => {},
});

export function usePrivyGate(): GateCtx {
  return useContext(PrivyGateContext);
}

export default function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  // Unmounting Privy does not end its session — that lives in browser storage, and a remount picks
  // it straight back up. So disabling has two steps: keep the provider mounted long enough for a
  // logout to run inside it, then take it down. Without the first step "use a different account"
  // silently returned the same account.
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    // sessionStorage does not exist during the static export, so this cannot be a lazy initialiser.
    //
    // The removal sits above the `privyUsable` guard: a stale flag should not survive because
    // Privy happens to be unusable on this chain.
    //
    // Any ask-flag surviving a page load is stale: the only thing that sets it is the sign-in
    // button, and that runs after this effect. It survives when somebody presses sign in and
    // navigates away before Privy finishes mounting — the flag then had the dialog open itself on
    // the next page they visited, which is the same nag in a narrower form.
    sessionStorage.removeItem(ASK_KEY);
    if (!privyUsable) return;
    const already = sessionStorage.getItem(SESSION_KEY) === "1";
    // Written before the setState, and read by PrivyBridge on a later mount — so the ordering the
    // lint rule cares about does not apply to it.
    restoredOnLoad = already;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(already);
  }, []);

  const enable = useCallback((opts?: { ask?: boolean }) => {
    if (!privyUsable) return;
    if (opts?.ask) sessionStorage.setItem(ASK_KEY, "1");
    sessionStorage.setItem(SESSION_KEY, "1");
    setLoggingOut(false);
    setEnabled(true);
  }, []);

  // Set unconditionally, without consulting `enabled`: this callback is handed out through context
  // and has to stay stable, and the flag is harmless when Privy was never mounted — the provider
  // does not render, so nothing observes it, and `enable` clears it on the way back in.
  const disable = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setLoggingOut(true);
  }, []);

  const finishLogout = useCallback(() => {
    setLoggingOut(false);
    setEnabled(false);
  }, []);

  const gate = { enabled: enabled && privyUsable && !loggingOut, enable, disable };

  return (
    <PrivyGateContext.Provider value={gate}>
      {enabled && privyUsable ? (
        <LazyPrivy>
          {loggingOut && <LazyPrivyLogout onDone={finishLogout} />}
          {children}
        </LazyPrivy>
      ) : (
        children
      )}
    </PrivyGateContext.Provider>
  );
}
