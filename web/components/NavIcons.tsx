/// The navigation glyph set, drawn inline.
///
/// No icon library. This app is a static export served off a hackathon box behind a tunnel, and six
/// glyphs are not worth a package that ships a thousand — every byte an icon set adds sits between a
/// judge opening the link and the demo appearing. Inline SVG also inherits `currentColor`, which is
/// what lets one nav item change colour on hover without the icon needing its own rule.
///
/// Everything here is stroked on a 24-unit grid at 1.75 weight, so the glyphs sit at the same
/// optical weight as the 16px labels beside them. A filled icon next to a stroked one reads as an
/// error, not a style.

export type NavIconName = "home" | "events" | "verify" | "overview" | "create" | "payouts";

type IconProps = { className?: string };

/// 18px is the default because that is the size the sidebar uses. Callers that want another size
/// pass their own height/width — the viewBox does the rest.
function Glyph({
  className = "h-[18px] w-[18px]",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M3.5 10.6 12 3.75l8.5 6.85" />
      <path d="M5.8 9.6V19.5a.75.75 0 0 0 .75.75h10.9a.75.75 0 0 0 .75-.75V9.6" />
    </Glyph>
  );
}

/// An event is a room you are admitted to, so the glyph is a ticket stub rather than a calendar
/// grid. A calendar would say "dates", and dates are the one thing the events list is not sorted by
/// in the user's head — they think in "which room, when does it open".
export function EventsIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M9 5v14" />
    </Glyph>
  );
}

export function VerifyIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M4 12.6 9.4 18 20 6.6" />
    </Glyph>
  );
}

export function OverviewIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <rect x="3.25" y="3.25" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.25" y="3.25" width="7.5" height="7.5" rx="1.6" />
      <rect x="3.25" y="13.25" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.25" y="13.25" width="7.5" height="7.5" rx="1.6" />
    </Glyph>
  );
}

export function CreateIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Glyph>
  );
}

/// Money leaving the escrow, not a wallet or a coin. The product's whole claim is that the organizer
/// never holds the funds, so a purse icon beside "Payouts" would illustrate the thing that does not
/// happen here.
export function PayoutsIcon(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M7 17 17 7" />
      <path d="M8.75 7H17v8.25" />
    </Glyph>
  );
}

const ICONS: Record<NavIconName, (p: IconProps) => React.ReactElement> = {
  home: HomeIcon,
  events: EventsIcon,
  verify: VerifyIcon,
  overview: OverviewIcon,
  create: CreateIcon,
  payouts: PayoutsIcon,
};

/// Lookup by name so the nav can stay a plain data table instead of a switch over components.
export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}

/// The brand mark: two peers and the line of proof between them.
///
/// One node is filled and one is hollow because that is the actual asymmetry of a vouch — somebody
/// confirmed, somebody still only registered. It is the same distinction the proof graph on
/// `/verify` draws, at 28px.
export function PeerProofMark({ className = "h-7 w-7" }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={`shrink-0 text-accent ${className}`}>
      <rect width="28" height="28" rx="9" fill="currentColor" />
      {/* Literal white, not a token. This is the counter-shape cut out of the accent fill, so it is
          defined by that fill rather than by the page's text colour — if --color-accent is ever
          retuned, this still has to be the lightest thing in the mark. */}
      <g stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M10 18 18 10" />
        <circle cx="18" cy="10" r="2.6" />
      </g>
      <circle cx="10" cy="18" r="2.6" fill="#ffffff" />
    </svg>
  );
}
