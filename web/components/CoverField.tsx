"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";

/// The event's picture. Choose a file, or paste a link.
///
/// A chosen file is shrunk in the browser and stored **on chain**, inline, as a `data:` URI. There
/// is no server — and that is not a reason to store only a link. An event whose deposits, rules and
/// attendance all live on chain should not have its picture disappear the day somebody's image host
/// does. The bytes go where everything else about the event goes.
///
/// The budget is the whole design. Every byte is paid for once, in gas, by the organizer, so the
/// encoder walks down through sizes and qualities until the base64 fits — rather than picking one
/// setting and either wasting money on a large file or refusing a picture that could have fitted.
const MAX_BASE64 = 5600;
const LADDER: Array<[number, number]> = [
  [480, 0.62],
  [400, 0.58],
  [320, 0.55],
  [256, 0.5],
  [192, 0.45],
  [160, 0.4],
];

async function shrink(file: File): Promise<{ url: string; bytes: number } | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  for (const [width, quality] of LADDER) {
    // 16:9, which is the shape every card and banner in this product crops to. Cropping here
    // rather than at render time means the bytes paid for are the bytes shown.
    const w = Math.min(width, bitmap.width);
    const h = Math.round((w * 9) / 16);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const srcH = Math.min(bitmap.height, (bitmap.width * 9) / 16);
    ctx.drawImage(bitmap, 0, (bitmap.height - srcH) / 2, bitmap.width, srcH, 0, 0, w, h);

    // WebP first; Safari before 14 gives back a PNG instead, which is why the result is measured
    // rather than assumed to have shrunk.
    const url = canvas.toDataURL("image/webp", quality);
    if (url.length <= MAX_BASE64) return { url, bytes: url.length };
  }
  return null;
}

export default function CoverField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tooBig, setTooBig] = useState(false);

  const show = value.trim();
  const ok = /^(https?:\/\/\S+|data:image\/)/i.test(show);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setTooBig(false);
    setBroken(false);
    const out = await shrink(file);
    setBusy(false);
    if (!out) {
      setTooBig(true);
      return;
    }
    onChange(out.url);
  };

  return (
    <div>
      <span className="mb-1.5 block text-[14px] uppercase tracking-wide text-faint">
        {t("listing.cover")}
      </span>

      {show && ok && !broken ? (
        <div className="relative overflow-hidden rounded-xl border border-line-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={show}
            alt=""
            onError={() => setBroken(true)}
            referrerPolicy="no-referrer"
            className="h-[150px] w-full object-cover"
          />
          <button
            type="button"
            onClick={() => {
              onChange("");
              setBroken(false);
            }}
            className="absolute right-2.5 top-2.5 inline-flex min-h-[36px] items-center rounded-lg bg-ink/80 px-3 text-[14px] text-fg backdrop-blur-sm"
          >
            {t("listing.coverChange")}
          </button>
        </div>
      ) : (
        <div
          // Dropping a file is how somebody with the picture already open expects this to work,
          // and it costs one handler to support.
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void take(e.dataTransfer.files?.[0]);
          }}
          className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-line-2 px-4 py-7 text-center"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden className="text-faint">
            <path
              d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white disabled:opacity-60"
          >
            {busy ? t("listing.coverWorking") : t("listing.coverPick")}
          </button>
          <p className="text-[14px] text-faint">{t("listing.coverOrDrop")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void take(e.target.files?.[0])}
          />
        </div>
      )}

      {tooBig && (
        <p className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3 text-[14px] text-warn">
          {t("listing.coverTooBig")}
        </p>
      )}
      {show && !ok && (
        <p className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3 text-[14px] text-warn">
          {t("listing.coverNotUrl")}
        </p>
      )}
      {show && ok && broken && (
        <p className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3 text-[14px] text-warn">
          {t("listing.coverBroken")}
        </p>
      )}

      {/* The link route stays, quietly, under the picker. Somebody who already has the image on a
          CDN should not be made to download it in order to upload it again. */}
      <label className="mt-2 block">
        <input
          value={show.startsWith("data:") ? "" : value}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value);
          }}
          inputMode="url"
          spellCheck={false}
          placeholder={t("listing.coverUrlPlaceholder")}
          className="min-h-[44px] w-full rounded-xl border border-line-2 bg-ink px-3.5 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent"
        />
      </label>
    </div>
  );
}
