"use client";

import { useEffect, useRef, useState } from "react";

/// Camera scanner. Loaded on demand because qr-scanner touches `navigator` and ships a worker.
export default function Scanner({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let scanner: { stop: () => void; destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;

        const s = new QrScanner(
          videoRef.current,
          (res: { data: string }) => onResult(res.data),
          { preferredCamera: "environment", highlightScanRegion: true, maxScansPerSecond: 10 },
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
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="flex items-center justify-between px-5 py-4 text-fg">
        <span className="text-sm">Point at someone&apos;s code</span>
        <button onClick={onClose} className="rounded-lg border border-line-2 px-3 py-1.5 text-sm text-dim">
          Close
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-dim">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
