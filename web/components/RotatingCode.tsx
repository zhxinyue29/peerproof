"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n";

const RING = 2 * Math.PI * 10;

/// The attendee's own code: the QR stays on a white plate because scanners need the contrast, and
/// a ring drains beside it so people understand the code is alive and there is no point
/// screenshotting it.
export default function RotatingCode({
  payload,
  secondsLeft,
  totalSeconds,
  size = "lg",
  caption = true,
}: {
  payload: string | null;
  secondsLeft: number;
  totalSeconds: number;
  size?: "lg" | "xl";
  /// The little ring-and-countdown under the code.
  ///
  /// Right on the attendee's own screen, wrong on the venue display — that page renders its own
  /// countdown, large enough to read from across a room, so the pair sat on one screen saying the
  /// same number twice about forty centimetres apart.
  caption?: boolean;
}) {
  const t = useT();
  /// The rendered code is stored together with the payload it was rendered from, and the render
  /// below only trusts it while the two still agree. Keeping a bare URL in state meant that for
  /// the few milliseconds between a rotation and the next encode finishing, the screen showed the
  /// *previous* epoch's code — scan it in that window and the attestation reverts.
  const [rendered, setRendered] = useState<{ payload: string; url: string } | null>(null);

  useEffect(() => {
    if (!payload) return;
    let live = true;
    QRCode.toDataURL(payload, {
      // M, not L. The payload moved to base64url and got 60 characters shorter, which bought back
      // exactly enough room to raise error correction without the code getting any denser: 49×49
      // either way. These are read off one phone screen by another phone's camera, through glare
      // and moiré, and that redundancy is the difference between a scan and a shrug.
      errorCorrectionLevel: "M",
      margin: 1,
      width: 640,
      color: { dark: "#0a0713", light: "#ffffff" },
    })
      .then((url) => live && setRendered({ payload, url }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [payload]);

  const dataUrl = rendered?.payload === payload ? rendered.url : null;

  const frac = Math.max(0, Math.min(1, secondsLeft / totalSeconds));

  return (
    <div className="space-y-2.5">
      {/* The plate carries the size cap, not the image. Capping the image's height while its width
          is 100% squashes a square QR out of ratio, and a distorted code does not scan. The code is
          square, so capping width by viewport height bounds both sides and keeps the plate tight
          around it instead of stranding it on a white slab. */}
      <div
        className={`rounded-2xl bg-white p-2.5 ${
          size === "xl" ? "mx-auto w-full max-w-[70vh]" : ""
        }`}
      >
        {dataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={dataUrl}
            alt={t("floor.codeAlt")}
            className="w-full"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <div className="flex aspect-square items-center justify-center text-sm text-faint">
            {t("floor.codeGenerating")}
          </div>
        )}
      </div>

      {caption && (
      <div className="flex items-center justify-center gap-2 text-[15px] text-dim">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - frac)}
            transform="rotate(-90 12 12)"
            className="text-accent"
          />
        </svg>
        <span className="tabular-nums">{t("floor.refreshesIn", { n: secondsLeft })}</span>
      </div>
      )}
    </div>
  );
}
