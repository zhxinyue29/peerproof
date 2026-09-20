import type { Metadata, Viewport } from "next";
import { IdentityProvider } from "@/components/IdentityProvider";
import NavTracker from "@/components/NavTracker";
import MobileTabBar from "@/components/MobileTabBar";
import { LanguageProvider } from "@/lib/i18n";
import PrivyClientProvider from "@/components/PrivyClientProvider";
// Montserrat for the Latin UI and display weights. CJK falls through to the local system face.
//
// The design's headline is a geometric grotesque — double-storey `a`, straight-legged `R` — and the
// system stack is a different animal at any weight; matching the measured 800 weight got the
// heaviness right and left the letterforms visibly apart. Montserrat is the closest free face to
// what the design used, and SIL OFL, so it can be self-hosted rather than fetched: the CSP blocks
// font CDNs, and a landing page whose only outbound request is a font is a landing page that has a
// blank headline when that host is slow.
//
// Self-hosted Latin subsets keep the interface stable without a font-CDN request. No CJK:
// Montserrat has none, so Chinese falls through to the system CJK face.
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/montserrat/latin-800.css";
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
    // `en` is baked in because this is a static export with no server to negotiate a language;
    // LanguageProvider corrects the attribute on the client once it knows which one is wanted.
    <html lang="en">
      <body className="bg-ink text-fg antialiased">
        {/* Privy outside IdentityProvider: IdentityProvider reads Privy's hooks to build a signer,
            so it has to sit inside the context, not beside it. Language wraps both, because the
            sign-in prompts are among the first words anybody reads. */}
        <LanguageProvider>
          <PrivyClientProvider>
            <IdentityProvider>
              <NavTracker />
              {children}
              <MobileTabBar />
            </IdentityProvider>
          </PrivyClientProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
