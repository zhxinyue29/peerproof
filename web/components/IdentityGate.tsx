"use client";

import { useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";
import { relyingPartyId } from "@/lib/passkey";
import { shortAddress } from "@/lib/format";
import { Button, Notice } from "@/components/ui";

/// Renders key setup, or `children` once a signer exists.
///
/// The unsupported-device case is deliberately compact. It used to be four paragraphs, which made
/// an error state the tallest thing on the landing page — the deposit and the call to action were
/// below the fold on a phone. The explanation now lives behind a disclosure.
export default function IdentityGate({ children }: { children: React.ReactNode }) {
  // Tapping the truncated address copies it in full. Needed before it is possible to
  // send anything to a wallet the app just created for somebody.
  const [copied, setCopied] = useState(false);
  const {
    signer,
    prf,
    walletAvailable,
    privyAvailable,
    devMode,
    busy,
    error,
    setUpPasskey,
    setUpWallet,
    setUpPrivy,
    useDevKey,
    signOut,
  } = useIdentity();

  if (signer) {
    return (
      <>
        {children}
        {/* The way out. A remembered key is a convenience until somebody needs to be a different
            person on the same device — testing with two accounts, or handing a phone to a friend. */}
        {/* The email first when there is one. Somebody who signed in with an email cannot check
            "0x7497…a80d" against anything they know — it is a number the app made up on their
            behalf — and the whole point of that route is that they never had to think about
            wallets. The address stays underneath, because it is what you send MON to. */}
        <p className="text-center text-[13px] text-faint">
          signed in as{" "}
          {signer.label ? (
            <span className="text-dim">{signer.label}</span>
          ) : (
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(signer.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="font-mono underline decoration-line-2"
              title={signer.address}
            >
              {copied ? "copied" : shortAddress(signer.address)}
            </button>
          )}
          {" · "}
          <button onClick={signOut} className="underline decoration-line-2">
            use a different account
          </button>
        </p>
        {signer.label && (
          <p className="text-center text-[13px] text-faint">
            wallet{" "}
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(signer.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="font-mono underline decoration-line-2"
              title={signer.address}
            >
              {copied ? "copied" : shortAddress(signer.address)}
            </button>
          </p>
        )}
      </>
    );
  }
  if (prf === null) return <p className="text-sm text-dim">Checking this device…</p>;

  if (!prf.available) {
    return (
      <div className="space-y-3">
        <Notice tone="warn">
          This device can&apos;t hold a passkey key.{" "}
          {privyAvailable
            ? "Sign in with your email instead — nothing to install."
            : walletAvailable
              ? "You can take part with a browser wallet instead."
              : "Open this on a phone, or install a browser wallet."}
        </Notice>

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="flex flex-col gap-2">
          {/* Email first when it is available: it is the only route that asks for nothing the
              person does not already have. A wallet is a better answer for people who have one,
              and a dead end for everyone else. */}
          {privyAvailable && (
            <Button onClick={setUpPrivy} disabled={!!busy} className="w-full">
              {busy ?? "Continue with email"}
            </Button>
          )}
          {walletAvailable && (
            <Button
              onClick={() => void setUpWallet()}
              disabled={!!busy}
              variant={privyAvailable ? "ghost" : undefined}
              className="w-full"
            >
              {privyAvailable ? "Use a browser wallet" : (busy ?? "Continue with my wallet")}
            </Button>
          )}
          {devMode && (
            <Button onClick={useDevKey} variant="ghost" className="w-full">
              Throwaway local key (dev)
            </Button>
          )}
        </div>

        <details className="text-xs text-faint">
          <summary className="cursor-pointer">why?</summary>
          <p className="mt-2 leading-relaxed">
            Your passkey provider doesn&apos;t support the WebAuthn PRF extension, which is what
            lets this app sign attendance codes without asking for your fingerprint every fifteen
            seconds. Chrome&apos;s built-in desktop passkeys are the usual culprit; iPhone with
            iCloud Keychain and Android with Google Password Manager both work.
          </p>
          <p className="mt-2 leading-relaxed">
            The wallet path derives the same kind of key from one signature — but then asks you to
            confirm every attestation, which is exactly the friction the passkey path removes.
          </p>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[16px] font-medium">Set up your attendance key</p>
        <p className="mt-1 text-sm leading-relaxed text-dim">
          One prompt, once. After that the app signs your codes silently — no fingerprint every
          fifteen seconds, no seed phrase, nothing to install.
        </p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <Button onClick={() => void setUpPasskey("create")} disabled={!!busy} className="w-full">
        {busy ?? "Create my key"}
      </Button>

      <div className="flex gap-2">
        <Button
          onClick={() => void setUpPasskey("unlock")}
          disabled={!!busy}
          variant="ghost"
          className="flex-1"
        >
          I already have one
        </Button>
        {walletAvailable ? (
          <Button onClick={() => void setUpWallet()} disabled={!!busy} variant="ghost" className="flex-1">
            Use a wallet
          </Button>
        ) : privyAvailable ? (
          <Button onClick={setUpPrivy} disabled={!!busy} variant="ghost" className="flex-1">
            Use email
          </Button>
        ) : null}
      </div>

      <p className="text-center text-[13px] text-faint">
        bound to <code>{relyingPartyId()}</code>
      </p>
    </div>
  );
}
