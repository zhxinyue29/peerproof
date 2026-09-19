"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useIdentity } from "@/components/IdentityProvider";
import { PeerProofMark } from "@/components/NavIcons";
import { shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";

/// The bar across the top of every participant screen.
///
/// Lifted out of the landing page, where it was a local function, because the design for the
/// participant side puts this same bar on every screen — discovery, event detail, profile — and a
/// sidebar only on the organiser's side. Walking from the landing page into a sidebar was the
/// moment the product stopped looking like one product.
///
/// The nav lists only destinations that exist. The design sheet shows 社区 and 奖励 beside them;
/// there is no community feature and no rewards feature, and a nav item that goes nowhere is worse
/// than a missing one — it is a promise the product breaks on click.
///
/// `active` marks where "here" is. Everything else in this bar is a way out, and without the mark
/// the bar gives no sign of which page you are on.
export type NavKey = "home" | "events" | "me" | "verify" | "organizer";

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "home", label: "nav.home", href: "/" },
  { key: "events", label: "nav.events", href: "/events" },
  { key: "me", label: "nav.myProof", href: "/me" },
  { key: "verify", label: "nav.verify", href: "/verify" },
  { key: "organizer", label: "nav.forOrganizers", href: "/organizer" },
];

export default function TopNav({ active }: { active: NavKey }) {
  const t = useT();
  const router = useRouter();
  const { signer, setUpPrivy, busy } = useIdentity();

  // Transparent over the artwork, solid once the artwork has scrolled away. Watched with a
  // passive listener and a boolean rather than a scroll-linked value: this needs to change twice,
  // not sixty times a second, and a state update per frame is how a header makes a phone stutter.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The search belongs to the listing, which already has one. Rather than build a second index
  // here, this hands the query over: /events reads `?q=` on arrival and applies it as its filter.
  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    router.push(typeof q === "string" && q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : "/events");
  };

  return (
    <header
      // The negative margin has to match the padding exactly — it exists only to let the bar's
      // background bleed to the container's edges while its contents stay on the same left edge as
      // everything below. They were -32 against +17 after the column padding changed, which pulled
      // the whole header 15px left of the cards under it.
      className={`sticky top-0 z-40 -mx-4 flex items-center gap-3 px-4 py-4 transition-[background-color,border-color,backdrop-filter] duration-[220ms] sm:-mx-6 sm:px-6 md:-mx-[17px] md:gap-5 md:px-[17px] md:py-5 ${
        scrolled ? "border-b border-line bg-ink/85 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <Link href="/" className="flex min-h-[44px] min-w-0 items-center gap-2.5">
        <PeerProofMark />
        <span className="truncate text-[19px] font-semibold tracking-[-0.015em]">PeerProof</span>
      </Link>

      <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label="Main">
        {/* The current page is marked, not merely reachable. Everything else in this bar is a way
            out of here, and without this the bar gives no sign of where "here" is. */}
        {NAV.map((item) =>
          item.key === active ? (
            <span
              key={item.key}
              aria-current="page"
              className="relative flex min-h-[44px] items-center px-3 text-[16px] font-medium text-fg"
            >
              {t(item.label)}
              <span aria-hidden className="absolute inset-x-3 bottom-2 h-[2px] rounded-full bg-accent" />
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="flex min-h-[44px] items-center rounded-xl px-3 text-[16px] text-dim transition-colors hover:text-fg"
            >
              {t(item.label)}
            </Link>
          ),
        )}
      </nav>

      <form onSubmit={onSearch} className="ml-auto hidden min-w-0 flex-1 md:block md:max-w-[340px]">
        <label className="relative flex items-center">
          <span aria-hidden className="pointer-events-none absolute left-3.5 text-faint">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <input
            name="q"
            type="search"
            placeholder={t("home.searchPlaceholder")}
            aria-label={t("home.searchPlaceholder")}
            className="h-11 w-full min-w-0 rounded-full border border-line-2 bg-panel/70 pl-11 pr-4 text-[15px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70"
          />
        </label>
      </form>

      <span className="ml-auto md:ml-0" />
      <LanguageSwitcher />
      <IdentityToken />

      {/* Only when there is nobody signed in. With a session the token to its left is the account,
          and a button inviting you to sign in next to it is a screen arguing with itself. */}
      {/* This signs you in. It used to be `<Link href="/events">` — a signpost wearing the word
          "Sign in", which on the landing page at least moved you somewhere and on /events linked to
          the page you were already standing on, so pressing it did nothing at all. A control that
          names an action and does not perform it is worse than no control; it is the product
          telling you it is broken.
          `setUpPrivy` is the same call the identity sheet makes when you join an event, so this is
          not a second sign-in path — it is the existing one, reachable before you have picked an
          event. */}
      {!signer && (
        <button
          type="button"
          onClick={setUpPrivy}
          disabled={!!busy}
          className="hidden h-11 shrink-0 items-center rounded-full bg-white px-5 text-[15px] font-medium text-[#1b1436] transition-transform duration-100 active:scale-[0.985] disabled:opacity-60 sm:inline-flex"
        >
          {busy ? t("common.loading") : t("home.signIn")}
        </button>
      )}
    </header>
  );
}

/// The round token from `00-home-desktop.png`, and the landing page's only sign of a session.
///
/// Its colour is derived from the account rather than picked, so it is a weak identity check rather
/// than decoration: the same account is the same colour on every screen, and a wrong account is
/// visibly a different one before you read a single character. The app chrome draws the same token
/// for the same reason — this page has no app chrome, so it draws its own.
function IdentityToken() {
  const { signer } = useIdentity();
  if (!signer) return null;

  const label = signer.label ?? shortAddress(signer.address);
  const hue = Number.parseInt(signer.address.slice(2, 6), 16) % 360;
  return (
    // A link, not an ornament. The design reaches the profile by tapping the avatar in the corner,
    // which is where everybody looks for their own account — and this token had been sitting there
    // looking exactly like that control while doing nothing when pressed. The nav item stays: one
    // of them is a habit and the other is a signpost, and the page is reachable signed out, which
    // an avatar cannot be.
    <Link
      href="/me"
      aria-label={label}
      title={label}
      className="flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-full border border-transparent px-1.5 transition-colors hover:border-line-2 sm:pr-3"
    >
      <span
        aria-hidden
        className="h-8 w-8 shrink-0 rounded-full border border-line-2"
        // Generated per account, so it cannot come from the token palette.
        style={{
          background: `linear-gradient(145deg, hsl(${hue} 58% 64%), hsl(${(hue + 45) % 360} 52% 44%))`,
        }}
      />
      {/* The design puts a name beside the avatar. There is no name in this system — no profiles,
          no display names, nothing to edit — so what sits here is whatever identified this account
          at sign-in: the email for an email login, the short address for a wallet. Inventing an
          "Alice" would be a lie about what the product knows.
          Hidden on a phone, where the bar is already carrying a logo, a language switch and a menu,
          and the avatar alone is the control people reach for anyway. */}
      <span className="hidden max-w-[140px] truncate text-[15px] text-dim sm:block">{label}</span>
    </Link>
  );
}
