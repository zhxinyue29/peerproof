"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "viem/chains";

/// Split out so that importing it is a deliberate act. `next/dynamic` can only split a chunk at a
/// module boundary, and this module is the boundary: nothing else in the app imports
/// `@privy-io/react-auth`, so nothing else drags 2.1MB of Solana, Stripe and wallet connectors in
/// with it.
const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function PrivyInner({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        // Someone arriving by email has no wallet. Without this they authenticate and then have
        // nothing to register with.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        // viem ships monadTestnet (10143); @privy-io/chains ships only Monad mainnet, so this is
        // the one that has to come from viem.
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        appearance: { theme: "dark", accentColor: "#6e54ff" },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
