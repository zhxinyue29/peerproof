"use client";

import { useEffect, useRef, useState } from "react";
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
/// No nav links, on either side. The bar is the logo, the search, the language and the account —
/// nothing else.
///
/// The organizer dashboard sheet draws six tabs up here, and they were built to it. The user asked
/// for them gone — twice — and that outranks the drawing: the destinations they named all exist as
/// buttons on the page itself (the header's "+ 创建活动", the banner's two, the cards' "管理活动"),
/// so the tabs were a second way to reach things already in front of you.
///
/// It briefly carried five destinations, and every one of them duplicated a route the page already
/// offered better: the two entry cards on the landing page are the way to the listing and to the
/// organiser side, and they say what each side is for, which a one-word tab cannot. Proof and the
/// public record belong inside the account page, because that is what somebody is looking at when
/// they want them.
///
/// A menu bar is what an application wears once you are inside it. This product's first real use is
/// a link opened at a venue door by somebody who has not agreed to be inside anything yet, and five
/// tabs across the top is the page asking them to navigate before it has told them what it is.

export default function TopNav({ page, compact = false }: { page?: string; compact?: boolean }) {
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
      className={`sticky top-0 z-40 -mx-4 flex items-center gap-3 px-4 py-4 transition-[background-color,border-color,backdrop-filter] duration-[220ms] sm:-mx-6 sm:px-6 md:-mx-[17px] md:gap-5 md:px-[17px] ${compact ? "md:py-1.5" : "md:py-5"} ${
        scrolled ? "border-b border-line bg-ink/85 backdrop-blur-md" : "border-b border-white/[0.04]"
      }`}
    >
      {/* The mark goes home from anywhere; the page's own name sits beside it so the top-left
          corner always answers both "where am I" and "how do I get out". The name is not a link —
          it is a label for the screen you are on, and a link to the page you are already on is the
          kind of control that teaches people the chrome is decorative. */}
      <Link href="/" className="flex min-h-[44px] shrink-0 items-center gap-2.5">
        <PeerProofMark />
        <span className="text-[19px] font-semibold tracking-[-0.015em]">PeerProof</span>
      </Link>
      {page && (
        <>
          <span aria-hidden className="hidden text-[18px] text-line-2 sm:inline">
            /
          </span>
          <span className="hidden min-w-0 truncate text-[16px] text-dim sm:inline">{page}</span>
        </>
      )}


      <form onSubmit={onSearch} className={`ml-auto hidden min-w-0 flex-1 md:block ${compact ? "md:max-w-[440px]" : "md:max-w-[340px]"}`}>
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
          // Visible on a phone too. It was `sm:inline-flex`, so below 640px the bar had no way to
          // sign in at all — on the screen this product is actually opened on, at a venue door.
          // Narrower padding and a shorter label there rather than hiding it: a control that only
          // exists on desktop is a control that does not exist.
          className="inline-flex h-11 shrink-0 items-center rounded-full bg-white px-3.5 text-[14px] font-medium text-[#1b1436] transition-transform duration-100 active:scale-[0.985] disabled:opacity-60 sm:px-5 sm:text-[15px]"
        >
          <span className="sm:hidden">{busy ? t("common.loading") : t("common.signIn")}</span>
          <span className="hidden sm:inline">{busy ? t("common.loading") : t("home.signIn")}</span>
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
  const t = useT();
  const { signer, signOut } = useIdentity();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  if (!signer) return null;

  const label = signer.label ?? shortAddress(signer.address);
  const hue = Number.parseInt(signer.address.slice(2, 6), 16) % 360;
  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("nav.accountMenu")}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-[44px] items-center gap-2.5 rounded-full border px-1.5 transition-colors sm:pr-3 ${
          open ? "border-line-2 bg-panel/70" : "border-transparent hover:border-line-2 hover:bg-panel/45"
        }`}
      >
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full border border-line-2"
          // Generated per account, so it cannot come from the token palette.
          style={{
            background: `linear-gradient(145deg, hsl(${hue} 58% 64%), hsl(${(hue + 45) % 360} 52% 44%))`,
          }}
        />
        {/* The design puts a name beside the avatar. There is no name in this system, so show the
            identifier the person actually used: email for Privy, short address for a wallet. */}
        <span className="hidden max-w-[140px] truncate text-[15px] text-dim sm:block">{label}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`hidden h-4 w-4 text-faint transition-transform duration-150 sm:block ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>

      <div
        className={`absolute right-0 top-full z-50 w-[220px] origin-top-right pt-2 transition duration-150 ${
          open
            ? "visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-1 opacity-0"
        }`}
      >
        <div className="overflow-hidden rounded-xl border border-line-2 bg-raised p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.38)]">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-[14px] font-medium text-fg" title={label}>
              {label}
            </p>
            <p className="mt-0.5 truncate font-mono text-[12px] text-faint" title={signer.address}>
              {shortAddress(signer.address)}
            </p>
          </div>

          <Link
            href="/me"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-[14px] text-dim transition-colors hover:bg-panel hover:text-fg focus-visible:bg-panel focus-visible:text-fg focus-visible:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="3.25" />
              <path d="M5.5 20c.55-3.55 2.72-5.35 6.5-5.35s5.95 1.8 6.5 5.35" />
            </svg>
            {t("nav.viewProfile")}
          </Link>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] text-[#ff8f9b] transition-colors hover:bg-[#ff5d6c]/10 hover:text-[#ffb2ba] focus-visible:bg-[#ff5d6c]/10 focus-visible:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 5H5.75A1.75 1.75 0 0 0 4 6.75v10.5C4 18.22 4.78 19 5.75 19H10" />
              <path d="M14 8.25 17.75 12 14 15.75" />
              <path d="M8.5 12h9" />
            </svg>
            {t("common.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
