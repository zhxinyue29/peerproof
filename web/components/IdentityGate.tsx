"use client";

import { useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";
import { relyingPartyId } from "@/lib/passkey";
import { shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";
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
  const t = useT();
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
        <p className="text-center text-[14px] text-faint">
          {t("identity.signedInAs")}{" "}
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
              {copied ? t("common.copied") : shortAddress(signer.address)}
            </button>
          )}
          {" · "}
          <button onClick={signOut} className="underline decoration-line-2">
            {t("event.useDifferentAccount")}
          </button>
        </p>
        {signer.label && (
          <p className="text-center text-[14px] text-faint">
            {t("identity.wallet")}{" "}
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(signer.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="font-mono underline decoration-line-2"
              title={signer.address}
            >
              {copied ? t("common.copied") : shortAddress(signer.address)}
            </button>
          </p>
        )}
      </>
    );
  }
  if (prf === null) return <p className="text-sm text-dim">{t("identity.checking")}</p>;

  if (!prf.available) {
    return (
      <div className="space-y-3">
        <Notice tone="warn">
          {t("identity.noPrf")}{" "}
          {privyAvailable
            ? t("identity.noPrfEmail")
            : walletAvailable
              ? t("identity.noPrfWallet")
              : t("identity.noPrfNeither")}
        </Notice>

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="flex flex-col gap-2">
          {/* Email first when it is available: it is the only route that asks for nothing the
              person does not already have. A wallet is a better answer for people who have one,
              and a dead end for everyone else. */}
          {privyAvailable && (
            <Button onClick={setUpPrivy} disabled={!!busy} className="w-full">
              {busy ?? t("identity.continueEmail")}
            </Button>
          )}
          {walletAvailable && (
            <Button
              onClick={() => void setUpWallet()}
              disabled={!!busy}
              variant={privyAvailable ? "ghost" : undefined}
              className="w-full"
            >
              {privyAvailable
                ? t("identity.useBrowserWallet")
                : (busy ?? t("identity.continueWallet"))}
            </Button>
          )}
          {devMode && (
            <Button onClick={useDevKey} variant="ghost" className="w-full">
              Throwaway local key (dev)
            </Button>
          )}
        </div>

        <details className="text-xs text-faint">
          <summary className="cursor-pointer">{t("identity.why")}</summary>
          <p className="mt-2 leading-relaxed">{t("identity.whyBody1")}</p>
          <p className="mt-2 leading-relaxed">{t("identity.whyBody2")}</p>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[16px] font-medium">{t("identity.setUpTitle")}</p>
        <p className="mt-1 text-sm leading-relaxed text-dim">{t("identity.setUpBody")}</p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <Button onClick={() => void setUpPasskey("create")} disabled={!!busy} className="w-full">
        {busy ?? t("identity.createKey")}
      </Button>

      <div className="flex gap-2">
        <Button
          onClick={() => void setUpPasskey("unlock")}
          disabled={!!busy}
          variant="ghost"
          className="flex-1"
        >
          {t("identity.haveOne")}
        </Button>
        {walletAvailable ? (
          <Button onClick={() => void setUpWallet()} disabled={!!busy} variant="ghost" className="flex-1">
            {t("identity.useWallet")}
          </Button>
        ) : privyAvailable ? (
          <Button onClick={setUpPrivy} disabled={!!busy} variant="ghost" className="flex-1">
            {t("identity.useEmail")}
          </Button>
        ) : null}
      </div>

      <p className="text-center text-[14px] text-faint">
        {t("identity.boundTo")} <code>{relyingPartyId()}</code>
      </p>
    </div>
  );
}
