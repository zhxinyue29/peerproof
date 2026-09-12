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

export const hasPrivy = APP_ID.length > 0;

/// Privy only knows the chains it was configured with, so on the local anvil fixture it is mounted
/// but unable to transact. Offering a login that cannot sign is worse than not offering one.
export const privyUsable = hasPrivy && chain.id === monadTestnet.id;

const LazyPrivy = dynamic(() => import("./PrivyInner"), {
  // No server to render on — this is a static export — and Privy is browser-only regardless.
  ssr: false,
});

type GateCtx = { enabled: boolean; enable: () => void; disable: () => void };
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

  useEffect(() => {
    if (!privyUsable) return;
    // sessionStorage does not exist during the static export, so this cannot be a lazy initialiser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);

  const enable = useCallback(() => {
    if (!privyUsable) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setEnabled(true);
  }, []);

  const disable = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setEnabled(false);
  }, []);

  const gate = { enabled: enabled && privyUsable, enable, disable };

  return (
    <PrivyGateContext.Provider value={gate}>
      {gate.enabled ? <LazyPrivy>{children}</LazyPrivy> : children}
    </PrivyGateContext.Provider>
  );
}
