"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

/// The event's picture, as a link, with a preview at the size the cards use.
///
/// This briefly accepted a file: the browser shrank it and the bytes went on chain as a `data:`
/// URI. It worked, and it had to be taken out — the field it writes into is capped at 300
/// characters, and raising that cap changes the directory's bytecode, which changes the address it
/// is deployed at, which orphans every listing already written. One organizer had already deployed
/// and titled an event by the time that was noticed.
///
/// Uploads come back when covers get their own contract, which can be deployed and changed without
/// moving the directory. Until then a picker would be a button that can only fail, so there is not
/// one.
export default function CoverField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  const show = value.trim();
  // http(s) only. A `javascript:` or `data:text/html` string in a src is not an image problem, and
  // the contract does not validate, so the render site has to.
  const ok = /^https?:\/\/\S+$/i.test(show);

  return (
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
        placeholder={t("listing.coverUrlPlaceholder")}
        className="min-h-[46px] w-full rounded-xl border border-line-2 bg-ink px-3.5 text-[16px] text-fg outline-none placeholder:text-faint focus:border-accent"
      />

      {show !== "" &&
        (ok && !broken ? (
          <span className="mt-2 block overflow-hidden rounded-xl border border-line-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={show}
              alt=""
              onError={() => setBroken(true)}
              // Whoever hosts the picture does not get to learn which page each attendee was on.
              referrerPolicy="no-referrer"
              className="h-[150px] w-full object-cover"
            />
          </span>
        ) : (
          <span className="mt-2 block rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3 text-[14px] text-warn">
            {t(ok ? "listing.coverBroken" : "listing.coverNotUrl")}
          </span>
        ))}
    </label>
  );
}
