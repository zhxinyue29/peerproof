"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui";

/// Gets the beacon key from the organizer's screen onto the device at the door.
///
/// The key is 66 characters. Pasting it needs a shared clipboard, which two devices in a venue do
/// not have, and typing it is not something anybody is going to do — so "save this key and load it
/// on the display" was an instruction with no way to carry it out. Scanning is.
///
/// The key rides in the URL fragment. Fragments are never sent to a server, so it does not reach
/// the host's logs or any referrer; the venue page stores it and strips it from the address bar on
/// arrival, so it is not left sitting in the open on a screen propped up in a room.
export default function VenueHandoff({ beaconPk }: { beaconPk: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/venue/#k=${encodeURIComponent(beaconPk)}`;

  useEffect(() => {
    if (!url) return;
    let live = true;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 520,
      color: { dark: "#0a0713", light: "#ffffff" },
    })
      .then((u) => live && setQr(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <div className="space-y-3 rounded-xl border border-line-2 bg-ink/40 p-4">
      <div>
        <p className="text-[15px] font-medium">Set up the display at the door</p>
        <p className="mt-1 text-[13px] leading-relaxed text-dim">
          Scan this from the device that will sit at the entrance — a spare phone, a tablet, a
          laptop. It opens the venue display with this key already loaded.
        </p>
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Venue display setup code" className="h-[164px] w-[164px] rounded-lg" />
        ) : (
          <div className="h-[164px] w-[164px] shrink-0 rounded-lg bg-raised" />
        )}
        <div className="flex-1 space-y-2">
          <p className="text-[11px] leading-relaxed text-faint">
            Already on the right device? Open it here instead — no scanning needed.
          </p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="ghost" className="w-full">
              Open the venue display
            </Button>
          </a>
          <p className="text-[11px] leading-relaxed text-faint">
            The code carries the key. Treat it like the key itself: it signs venue codes for this
            event and nothing else, and it stops meaning anything once check-in closes.
          </p>
        </div>
      </div>
    </div>
  );
}
