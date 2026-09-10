import type { Metadata, Viewport } from "next";
import { IdentityProvider } from "@/components/IdentityProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeerProof",
  description: "Attendance you don't have to trust the organizer for.",
};

// Used standing up in a crowded room, one-handed, with the camera open. Without an explicit
// viewport the QR renders at desktop scale on a phone and is unreadable at arm's length;
// `maximumScale` stops iOS zooming the page when the scanner button takes focus.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0713",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-fg antialiased">
        <IdentityProvider>{children}</IdentityProvider>
      </body>
    </html>
  );
}
