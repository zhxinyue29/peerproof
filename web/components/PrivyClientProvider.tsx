"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "viem/chains";
import { chain } from "@/lib/chain";

/// Privy's own wrapper, because the SDK does not ship the `"use client"` directive itself — their
/// docs are explicit that you must author this file rather than putting `PrivyProvider` straight
/// into a layout.
///
/// Why Privy at all, when passkeys are the primary account path: WebAuthn PRF does not exist in
/// desktop Chrome's built-in authenticator, so some people cannot take that path at all. The
/// fallback for them used to be a browser wallet — which means an extension, a seed phrase, and a
/// prompt per attestation. That excludes exactly the people the passkey flow was built for. An
/// email login that produces a wallet is a fallback someone can actually use.
///
/// Mounting is conditional: with no app id configured the tree renders untouched, so a build
/// without Privy behaves exactly as it did before. That is also what keeps the local anvil
/// fixtures working, since Privy has no idea what chain 31337 is.
const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export const hasPrivy = APP_ID.length > 0;

export default function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  if (!hasPrivy) return <>{children}</>;

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        // Someone arriving by email has no wallet. Without this they authenticate and then have
        // nothing to register with.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        // viem ships monadTestnet (10143) already; @privy-io/chains ships only mainnet, so this is
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

/// Privy only knows the chains it was configured with. On the local fixture chain the provider is
/// mounted but useless, and silently offering a login that cannot transact is worse than not
/// offering it — so callers check this rather than `hasPrivy` alone.
export const privyUsable = hasPrivy && chain.id === monadTestnet.id;
