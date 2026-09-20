"use client";

import { useState } from "react";
import { basePath } from "@/lib/chain";
import { useT } from "@/lib/i18n";

/// "Share my page", from the profile sheet.
///
/// The link carries the address, and `/me?a=0x…` renders that account's page for anyone who opens
/// it. This is the block that makes the on-chain profile mean something: the reason it costs gas
/// rather than sitting in localStorage was that a profile only its owner can see is decoration, and
/// until this button existed that was still true in practice.
///
/// Nothing private is in the link. The address is already on every event this account touched, and
/// the profile behind it was written to a public contract on purpose.
///
/// Prefers the share sheet on a phone — that is where somebody actually wants to send this, and a
/// clipboard copy on mobile leaves them to find a messaging app themselves. Falls back to copying,
/// and then to selecting, because `navigator.clipboard` rejects on a non-secure origin.
export default function ShareProfile({ address }: { address: string }) {
  const t = useT();
  const [done, setDone] = useState(false);

  const href = `${window.location.origin}${basePath}/me/?a=${address}`;

  return (
    <button
      type="button"
      onClick={() => {
        const flash = () => {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        };
        if (navigator.share) {
          void navigator
            .share({ title: "PeerProof", url: href })
            // A cancelled share sheet rejects. That is somebody changing their mind, not a
            // failure, and it must not fall through to a "copied" that did not happen.
            .catch(() => {});
          return;
        }
        void Promise.resolve(navigator.clipboard?.writeText(href))
          .then(flash)
          .catch(() => window.prompt(t("me.shareCopy"), href));
      }}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent px-4 text-[15px] font-medium text-white transition-transform duration-100 active:scale-[0.985]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3v13M12 3 8 7m4-4 4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {done ? t("common.copied") : t("me.share")}
    </button>
  );
}
