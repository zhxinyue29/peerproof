import type { Metadata, Viewport } from "next";
import { IdentityProvider } from "@/components/IdentityProvider";
import PrivyClientProvider from "@/components/PrivyClientProvider";
import "./globals.css";

// The manifest is what makes "add to home screen" produce an icon and a standalone window rather
// than a bookmark. Worth the four files: attendees reach this from a link at the door, and an app
// store install is exactly the friction the passkey path exists to remove — but once they are here,
// the door screen should not look like a browser tab.
export const metadata: Metadata = {
  title: "PeerProof",
  description: "Attendance you don't have to trust the organizer for.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PeerProof", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
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
        {/* Privy outside IdentityProvider: IdentityProvider reads Privy's hooks to build a signer,
            so it has to sit inside the context, not beside it. */}
        <PrivyClientProvider>
          <IdentityProvider>{children}</IdentityProvider>
        </PrivyClientProvider>
      </body>
    </html>
  );
}
