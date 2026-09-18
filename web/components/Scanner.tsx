"use client";

import { useEffect, useRef, useState } from "react";

/// Camera scanner. Loaded on demand because qr-scanner touches `navigator` and ships a worker.
export default function Scanner({
  onResult,
  onClose,
  notice,
  title = "Point at someone's code",
  hint,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
  /// The same camera reads two different things at two different moments in the evening, and the
  /// header is the only place that says which one is wanted now.
  title?: string;
  hint?: string;
  /// Shown over the camera. Everything that can go wrong during a scan — a code that is yours, a
  /// venue code you have not read yet, one that expired between the photograph and the chain — was
  /// being written to a notice on the page *underneath* this full-screen overlay. So every failure
  /// looked identical to the camera simply not working, which is what "nothing happens" meant.
  notice?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so starting the camera does not depend on it.
  //
  // It used to be an effect dependency, and the callback it receives is rebuilt whenever the event
  // data changes — which is every four seconds, because that screen polls. So the effect tore the
  // camera down and started it again on every poll: a black frame twice a second, and a decoder
  // that never had long enough to lock onto anything. On a phone at a venue it reads as the app
  // being broken, which is nearly what it was.
  const handler = useRef(onResult);
  useEffect(() => {
    handler.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let scanner: { stop: () => void; destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;

        const s = new QrScanner(
          videoRef.current,
          (res: { data: string }) => handler.current(res.data),
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            // Eight, not ten: each pass now decodes a larger image, and a slower loop that succeeds
            // beats a faster one that cannot see.
            maxScansPerSecond: 8,
            // The whole frame, at 1024 across.
            //
            // The default scans the middle two thirds and shrinks it to 400×400 before decoding. A
            // 49-module code filling a third of that region comes out at barely two pixels per
            // module — unreadable, silently, with the code sitting in plain view inside the
            // highlight box. Letterboxing the video made it worse by making the picture look
            // roomier, so codes got held further away.
            calculateScanRegion: (v: HTMLVideoElement) => ({
              x: 0,
              y: 0,
              width: v.videoWidth,
              height: v.videoHeight,
              downScaledWidth: Math.min(1024, v.videoWidth),
              downScaledHeight: Math.round(
                (Math.min(1024, v.videoWidth) * v.videoHeight) / v.videoWidth,
              ),
            }),
          },
        );
        scanner = s;
        await s.start();
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Camera permission denied."
              : "Could not start the camera.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
    };
    // Starts once. The result handler is read through a ref above.
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-5 py-4 text-fg">
        <span className="text-[15px]">{title}</span>
        <button
          onClick={onClose}
          className="min-h-[44px] rounded-lg border border-line-2 px-4 text-[15px] text-dim"
        >
          Close
        </button>
      </div>
      <div className="relative flex-1">
        {/* `contain`, not `cover`. The camera hands back a landscape frame and this box is portrait,
            so covering it scaled the picture about three times and cropped away both sides —
            everything looked enormous and you had to stand back to fit a code in. Letterboxed, what
            you see is what the camera sees, which is what every other scanner does. */}
        <video ref={videoRef} className="h-full w-full object-contain" playsInline muted />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-[15px] text-dim">
            {error}
          </div>
        )}
        {notice && !error && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-warn/40 bg-warn/15 px-4 py-3 text-center text-[15px] leading-relaxed text-warn backdrop-blur">
            {notice}
          </div>
        )}
      </div>
      <p className="px-5 pb-6 pt-3 text-center text-[14px] text-faint">
        {hint ??
          "Hold the other phone close, so the code fills most of the picture. Codes change every 15 seconds — if one expires mid-scan, the next is already on screen."}
      </p>
    </div>
  );
}
