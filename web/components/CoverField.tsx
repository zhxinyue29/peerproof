"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

/// The event's picture, as a link.
///
/// The sheet draws "upload or drag a file here". There is nowhere to upload to — this is a static
/// export with no server, and putting the bytes on chain would cost more than the event's deposit.
/// So the field asks for a link and shows what it resolves to, which is the part of an upload that
/// actually matters: seeing the picture before anybody else does.
///
/// The preview is deliberately the same shape the cards use, so what somebody approves here is
/// what a stranger sees on the events page.
export default function CoverField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  // Only http(s). A `javascript:` or `data:` string in an `<img src>` is not an image problem, and
  // the contract does not validate — so the one place that can refuse is the place that renders.
  const ok = /^https?:\/\/\S+$/i.test(value.trim());

  return (
    <div>
      {/* A real `<label>` wrapping the input, not a `<span>` above it. Without the association a
          screen reader announces an unlabelled text field, and the label is the only thing that
          says what kind of link belongs in it. */}
      <label className="block">
        <span className="mb-1.5 block text-[14px] uppercase tracking-wide text-faint">
          {t("listing.cover")}
        </span>
        <input
          value={value}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value);
          }}
          inputMode="url"
          spellCheck={false}
          placeholder="https://…"
          className="min-h-[46px] w-full rounded-xl border border-line-2 bg-ink px-3.5 text-[16px] text-fg outline-none placeholder:text-faint focus:border-accent"
        />
      </label>
      <p className="mt-1.5 text-[14px] text-faint">{t("listing.coverHint")}</p>

      {value.trim() !== "" && (
        <div className="mt-2.5">
          {ok && !broken ? (
            <img
              src={value.trim()}
              alt=""
              onError={() => setBroken(true)}
              // No referrer: whoever hosts the picture would otherwise learn which PeerProof page
              // every viewer was on. The organizer chose the host; the attendees did not.
              referrerPolicy="no-referrer"
              className="h-[120px] w-full rounded-xl border border-line-2 object-cover"
            />
          ) : (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3 text-[14px] text-warn">
              {t(ok ? "listing.coverBroken" : "listing.coverNotUrl")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
