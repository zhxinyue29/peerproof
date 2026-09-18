"use client";

import Link from "next/link";
import { useIdentity } from "@/components/IdentityProvider";
import { shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { NavIcon, PeerProofMark, type NavIconName } from "@/components/NavIcons";

/// The application chrome — one sidebar, one page heading, one identity corner, for every route.
///
/// V3 splits the app into two audiences that never see each other's screens: somebody attending an
/// event, and somebody running one. They get different nav sets, not different layouts, because the
/// same person is frequently both and the chrome moving under them would read as a different
/// product.
///
/// The desktop sidebar is persistent and the mobile header is not a collapsed copy of it — see
/// `MobileHeader` for why.

type NavKind = "participant" | "organizer";

type NavItem = {
  key: string;
  /// A dictionary key, not the words. The sidebar is on every screen, so it is the first thing
  /// somebody notices is still in a language they do not read.
  label: string;
  href: string;
  icon: NavIconName;
};

/// Labels and order come straight from the V3 renders (`01-events-desktop.png`,
/// `04-organizer-dashboard-desktop.png`). Do not "improve" the wording here — the screenshots are
/// the spec, and "Create event" reading as a nav destination rather than a button is deliberate:
/// the organizer flow is two steps long and people leave it halfway.
const NAV: Record<NavKind, NavItem[]> = {
  participant: [
    { key: "home", label: "nav.home", href: "/", icon: "home" },
    { key: "events", label: "nav.events", href: "/events", icon: "events" },
    { key: "verify", label: "nav.verify", href: "/verify", icon: "verify" },
  ],
  organizer: [
    { key: "overview", label: "nav.overview", href: "/organizer", icon: "overview" },
    // The organizer page carries its create flow as an in-page tab. The query string is the handoff:
    // a nav item that only works after you are already on the page is not a nav item.
    { key: "create", label: "nav.createEvent", href: "/organizer?tab=create", icon: "create" },
    // My events and Payouts have no route of their own yet — both are sections of the dashboard.
    // They point at the dashboard rather than `#` so that a mis-tap costs a scroll instead of a
    // dead link, and so the demo never shows a URL ending in a hash nobody can explain.
    { key: "my-events", label: "nav.myEvents", href: "/organizer", icon: "events" },
    { key: "payouts", label: "nav.payouts", href: "/organizer", icon: "payouts" },
  ],
};

export default function AppShell({
  children,
  nav,
  active,
  title,
  subtitle,
  action,
  aside,
  langSwitcher,
}: {
  children: React.ReactNode;
  /// Which audience this route belongs to. Participant screens never show organizer nav, because an
  /// attendee seeing "Payouts" would reasonably expect it to be about their own money.
  nav: NavKind;
  /// The `key` of the current item. A plain string rather than a union so a page can pass a value
  /// that matches nothing — a sub-screen like `/event` belongs to the participant chrome but is not
  /// itself a nav destination, and highlighting the nearest item would lie about where you are.
  active: string;
  title?: string;
  subtitle?: string;
  /// The single primary action for the page, top-right on desktop and full-width on mobile.
  action?: React.ReactNode;
  /// Optional right-hand column — the organizer dashboard's "Live pulse" panel lives here. It sits
  /// beside the whole of `children`, so a page that needs a full-width band above the split should
  /// compose that split itself rather than reach for this.
  aside?: React.ReactNode;
  /// Owned by another component entirely; this just decides where it lands. Rendered in the sidebar
  /// footer on desktop and in the mobile header, which are the two places a language control can sit
  /// without competing with the page's primary action.
  langSwitcher?: React.ReactNode;
}) {
  const items = NAV[nav];

  return (
    // `overflow-x-hidden` is a floor, not a layout tool. Every column below is `min-w-0` so nothing
    // should overflow — but a long unbroken transaction hash pasted into a card on a 320px phone
    // would otherwise take the whole page sideways, and a page that scrolls horizontally on the
    // floor of a venue is unusable one-handed.
    <div className="min-h-dvh overflow-x-hidden">
      {/* 1280px is the width the V3 desktop renders were drawn at, so capping here means the
          shipped layout and the screenshots describe the same thing. The horizontal gutter lives on
          this wrapper at `md` and up but not below it — on a phone the header's hairline has to run
          edge to edge, and a gutter here would inset it. */}
      <div className="mx-auto flex w-full max-w-[1280px] items-start md:px-8">
        <Sidebar items={items} active={active} langSwitcher={langSwitcher} />

        <main className="min-w-0 flex-1">
          <MobileHeader items={items} active={active} langSwitcher={langSwitcher} />

          <div
            className="flex min-w-0 flex-col gap-6 px-4 sm:px-6 md:gap-7 md:px-0 md:py-9 md:pl-7"
            style={{
              // Phones only. On desktop the padding above is already generous and the sidebar owns
              // the left edge, so the inset would add a second, uneven gutter.
              paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
            }}
          >
            {(title || action) && (
              <header className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between md:pt-0">
                <div className="min-w-0 space-y-2">
                  {title && (
                    // 28/34px, from the V3 type scale. Tighter tracking at the larger size only,
                    // because the same negative tracking that makes a 34px headline cohere makes a
                    // 28px one look cramped on a phone.
                    <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[34px] md:tracking-[-0.03em]">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-[16px] leading-relaxed text-dim md:max-w-[58ch]">
                      {subtitle}
                    </p>
                  )}
                </div>
                {/* Column direction so the action stretches edge to edge on a phone — which is what
                    `04-organizer-dashboard-mobile.png` shows — and collapses to its own width once
                    the parent turns into a row. */}
                {action && <div className="flex shrink-0 flex-col sm:items-start">{action}</div>}
              </header>
            )}

            {aside ? (
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start lg:gap-6">
                <div className="min-w-0">{children}</div>
                {/* Sticky on wide screens only: below `lg` this is stacked underneath the main
                    column, and a sticky element in a single-column flow pins itself over the
                    content it was meant to annotate. */}
                <div className="min-w-0 lg:sticky lg:top-9">{aside}</div>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                              Desktop                               */
/* ------------------------------------------------------------------ */

/// Full-height, sticky, and present on every desktop route.
///
/// It is `h-dvh` rather than `h-full` so the identity line can be pinned to the bottom of the
/// viewport the way the renders show it, regardless of how long the page it sits beside happens to
/// be. A sidebar that ends where a short page ends leaves the address floating in the middle of the
/// screen on `/verify` and at the very bottom on `/events`, which reads as two different layouts.
function Sidebar({
  items,
  active,
  langSwitcher,
}: {
  items: NavItem[];
  active: string;
  langSwitcher?: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col py-9 md:flex">
      <Link
        href="/"
        className="mb-7 flex items-center gap-2.5 rounded-xl px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <PeerProofMark />
        <span className="text-[16px] font-semibold tracking-[-0.01em]">PeerProof</span>
      </Link>

      <nav aria-label="Main">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <NavLink item={item} current={item.key === active} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3 px-3">
        {langSwitcher}
        <Identity />
      </div>
    </aside>
  );
}

function NavLink({ item, current }: { item: NavItem; current: boolean }) {
  const t = useT();
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      // The transparent border on the inactive state is load-bearing: without it the active item's
      // 1px border grows the row and every item below it shifts down by a pixel as you navigate.
      className={`flex min-h-[44px] items-center gap-3 rounded-xl border px-3 text-[16px] transition-colors ${
        current
          ? "border-line-2 bg-raised font-medium text-fg"
          : "border-transparent text-dim hover:bg-panel hover:text-fg"
      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <NavIcon name={item.icon} />
      <span className="truncate">{t(item.label)}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*                               Mobile                               */
/* ------------------------------------------------------------------ */

/// What the phone gets instead of the sidebar.
///
/// The V3 mobile renders show exactly one piece of chrome — `00-home-mobile.png`: the mark and
/// wordmark on the left, a round identity token on the right, a hairline underneath. The inner
/// screens (`01-events-mobile.png`, `04-organizer-dashboard-mobile.png`) render with no chrome at
/// all, which is a prototype shortcut rather than a decision: shipping it would leave a phone with
/// no way to reach `/verify` except the URL bar.
///
/// So the nav appears as a scrollable pill row under the header. That treatment is not invented —
/// it is the filter row from `01-events-mobile.png` ("Open now / Upcoming / This week"), the same
/// rounded-full chip with the same accent-bordered active state. Reusing a shape the design already
/// establishes costs the user nothing to learn, which is the point of having a design language.
function MobileHeader({
  items,
  active,
  langSwitcher,
}: {
  items: NavItem[];
  active: string;
  langSwitcher?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div
      className="border-b border-line md:hidden"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-3 px-4 pb-3">
        <Link href="/" className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5">
          <PeerProofMark />
          <span className="truncate text-[16px] font-semibold tracking-[-0.01em]">PeerProof</span>
        </Link>
        {langSwitcher}
        <IdentityToken />
      </div>

      {/* Edge-to-edge scroll with the padding on the row itself, so the first and last pill can
          scroll fully into view instead of being clipped by a container gutter. */}
      <nav aria-label="Main" className="overflow-x-auto">
        <ul className="flex w-max gap-2 px-4 pb-3">
          {items.map((item) => {
            const current = item.key === active;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[15px] ${
                    current
                      ? "border-accent bg-accent/15 font-medium text-fg"
                      : "border-line-2 bg-panel text-dim"
                  }`}
                >
                  <NavIcon name={item.icon} className="h-4 w-4" />
                  {t(item.label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                              Identity                              */
/* ------------------------------------------------------------------ */

/// Prefer the label over the address. Somebody who signed in with an email has no idea which `0x…`
/// is theirs, so showing them one is showing them nothing they can check against anything they know.
function useIdentityLine(): string | null {
  const { signer } = useIdentity();
  if (!signer) return null;
  return signer.label ?? shortAddress(signer.address);
}

/// The address pinned bottom-left on desktop. `faint` is correct here and nowhere else in the
/// sidebar: the spec reserves muted grey for truly optional metadata, and this is the one line on
/// the screen nobody needs to read to do anything.
function Identity() {
  const line = useIdentityLine();
  if (!line) return null;
  return (
    <p className="truncate text-[14px] text-faint" title={line}>
      {line}
    </p>
  );
}

/// The round token from `00-home-mobile.png`. A phone header has no room for an address beside a
/// wordmark and a language control, and truncating it further than `0x8a31…2e1c` would leave
/// characters too few to identify anything.
///
/// Its colour is derived from the account so it is a weak identity check rather than decoration —
/// the same account is the same colour on every screen, and a wrong account is visibly a different
/// one before you read a single character.
function IdentityToken() {
  const { signer } = useIdentity();
  const line = useIdentityLine();
  if (!signer || !line) return null;

  const hue = Number.parseInt(signer.address.slice(2, 6), 16) % 360;
  return (
    <span
      role="img"
      aria-label={`Signed in as ${line}`}
      title={line}
      className="h-8 w-8 shrink-0 rounded-full border border-line-2"
      // Generated per account, so it cannot come from the token palette.
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 58% 64%), hsl(${(hue + 45) % 360} 52% 44%))`,
      }}
    />
  );
}
