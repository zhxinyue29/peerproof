"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import HeroProofAnimation from "@/components/HeroProofAnimation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import StepFigure from "@/components/StepFigure";
import HeroArt from "@/components/HeroArt";
import StatsBar from "@/components/StatsBar";
import FeaturedEvents from "@/components/FeaturedEvents";
import ValueStrip from "@/components/ValueStrip";
import { LinkButton } from "@/components/ui";
import { ESCROW_ADDRESS, explorerAddressUrl } from "@/lib/chain";
import { PeerProofMark } from "@/components/NavIcons";
import { useIdentity } from "@/components/IdentityProvider";
import { shortAddress } from "@/lib/format";
import { basePath } from "@/lib/chain";
import { useT } from "@/lib/i18n";

/// The door.
///
/// This used to be the event page, and the two roles ran through the same screens: an organizer who
/// pressed back arrived in the participants' listing — everybody's events, none of them theirs —
/// and a participant who wandered into the organizer view found a dashboard for an event they had
/// merely signed up to. The same account can be both, on the same day; what it cannot be is both at
/// once, without the screens saying which.
///
/// So: what this is, and then which of the two you are right now.
///
/// It keeps its own chrome rather than the app sidebar. `00-home-desktop.png` has no nav rail, and
/// that is the point of a landing page — somebody arriving from a QR code at a venue has not yet
/// agreed to be in an application. The two doors are the navigation.
export default function HomePage() {
  const t = useT();
  const m = useMotionPrefs();

  // Links of the form /?event=12 were handed out before the event page moved, and somebody's phone
  // still has one. Sending them on is cheaper than breaking them, and it happens before paint.
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    if (!id || !/^\d+$/.test(id)) return;
    // The query string does not exist during the static export, so this cannot be a lazy state
    // initialiser — and the navigation that follows makes the render it triggers the last one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRedirecting(true);
    window.location.replace(`${basePath}/event/?event=${id}`);
  }, []);

  if (redirecting) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-5">
        <p className="text-[16px] text-dim">{t("home.redirecting")}</p>
      </main>
    );
  }

  return (
    // `overflow-x-hidden` is a floor, not a layout tool — the headline is set large enough that one
    // long word in a language we have not seen yet must not be able to take the page sideways.
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[26px]">
        <TopBar />

        <main>
          <section className="relative pb-10 pt-4 md:min-h-[540px] md:pb-16 md:pt-8">
            <HeroArt />

            {/* Arrival order is reading order: the badge that says what this is, the two lines of
                the claim, the line under them, the body, then the two things you can do about it.
                Nothing overshoots — a headline that bounces is a headline nobody reads twice. */}
            <motion.div
              className="relative max-w-[790px] space-y-3"
              variants={m.container}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={m.item} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-semibold" style={{ background: "linear-gradient(100deg, #2f2792 0%, #2a2480 100%)", color: "#dcd8fc" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M13.4 2.8 5.6 13.4h5.3l-.9 7.8 8-10.8h-5.4l.8-7.6Z" />
                  </svg>
                  {t("home.builtOn")}
                </span>
                <span className="text-[15px] text-dim">{t("home.fastFair")}</span>
              </motion.div>

              {/* Weight and colour are measured off the design rather than picked.
                  Its headline strokes are 15–16px on a 60px cap height — a quarter of the cap, which
                  is 800-class, not the 600 this was. And the second line is not a flat purple: it
                  runs #cfc2fa at the top of the letters through #e0d5fc across the middle to #dbd0fb
                  at the foot, a highlight band that reads as light falling on the type. The flat
                  #9a88ff it had was both darker and deader than any point in that ramp. */}
              <h1
                className="text-[46px] font-extrabold leading-[0.98] tracking-[-0.035em] md:text-[74px] md:leading-[0.92]"
                style={{ fontFamily: '"Montserrat", var(--font-sans)' }}
              >
                <motion.span variants={m.item} className="block">
                  {t("home.headline1")}
                </motion.span>
                <motion.span
                  variants={m.item}
                  className="mt-1 block bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, #cfc2fa 0%, #e2d9fd 46%, #d6cbfb 78%, #c9bcf8 100%)",
                  }}
                >
                  {t("home.headline2")}
                </motion.span>
              </h1>

              {/* The design sets this line as handwriting with a drawn underline. There is no
                  handwritten face to load — the CSP blocks font CDNs and a webfont would be the
                  page's only outbound request — so it is italic with the stroke drawn in SVG, which
                  keeps the gesture and keeps the line translatable. */}
              <motion.p variants={m.item} className="relative inline-block pb-3 text-[19px] italic leading-snug text-accent-2 md:text-[22px]">
                {t("home.script")}
                <svg
                  aria-hidden
                  viewBox="0 0 300 12"
                  preserveAspectRatio="none"
                  className="absolute inset-x-0 bottom-0 h-[10px] w-full text-accent/70"
                >
                  <path
                    d="M2 8C58 3 121 2 176 5c40 2 78 4 121 1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </motion.p>

              <motion.div variants={m.item} className="max-w-[600px] space-y-1 text-[17px] leading-relaxed text-dim md:text-[18px]">
                <p>{t("home.subA")}</p>
                <p>{t("home.subB")}</p>
              </motion.div>

              <motion.div variants={m.item} className="grid max-w-[700px] gap-4 pt-2 sm:grid-cols-2">
                <Door href="/events" title={t("home.joinTitle")} body={t("home.joinSub")} tone="join" />
                <Door href="/organizer" title={t("home.hostTitle")} body={t("home.hostSub")} tone="host" />
              </motion.div>
            </motion.div>

            {/* The proof itself, playing over the scene. */}
            {/* Low and left of the figures, in the darkest part of the scene — over their faces it
                competed with the artwork, and over the painted badge it repeated it. */}
            <HeroProofAnimation
              label={t("proof.label")}
              className="pointer-events-none absolute bottom-[6%] left-[52%] hidden h-[150px] w-[270px] lg:block"
            />

            {/* Under the words on a phone, over the artwork on a desktop — where the design puts it,
                and where it reads as a caption on the scene rather than a fourth thing in the column. */}
            <div className="relative mt-8 md:absolute md:-bottom-2 md:right-0 md:mt-0 md:w-[min(28rem,40%)]">
              <StatsBar />
            </div>
          </section>
        </main>
      </div>

      <div className="mx-auto w-full max-w-[1380px] px-4 pt-12 sm:px-6 md:px-8 md:pt-16">
        <FeaturedEvents />
      </div>

      <ValueStrip />

      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-8">
        <HowItWorks />
      </div>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                              Chrome                                */
/* ------------------------------------------------------------------ */

/// Logo left, the two things a returning visitor came back for right.
///
/// The text links drop below `sm` — `00-home-mobile.png` carries only the mark and the identity
/// token — but the language control does not. Somebody who cannot read "Verify" cannot read their
/// way to a control that is hidden behind a width.
function TopBar() {
  const t = useT();
  const router = useRouter();
  const { signer } = useIdentity();

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
      className={`sticky top-0 z-40 -mx-4 flex items-center gap-3 px-4 py-4 transition-[background-color,border-color,backdrop-filter] duration-[220ms] sm:-mx-6 sm:px-6 md:-mx-8 md:gap-5 md:px-8 md:py-5 ${
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
        <span className="relative flex min-h-[44px] items-center px-3 text-[16px] font-medium text-fg">
          {t("nav.home")}
          <span aria-hidden className="absolute inset-x-3 bottom-2 h-[2px] rounded-full bg-accent" />
        </span>
        <Link
          href="/events"
          className="flex min-h-[44px] items-center rounded-xl px-3 text-[16px] text-dim transition-colors hover:text-fg"
        >
          {t("nav.events")}
        </Link>
        <a
          href="#how-it-works"
          className="flex min-h-[44px] items-center rounded-xl px-3 text-[16px] text-dim transition-colors hover:text-fg"
        >
          {t("home.howItWorks")}
        </a>
        <Link
          href="/organizer"
          className="flex min-h-[44px] items-center rounded-xl px-3 text-[16px] text-dim transition-colors hover:text-fg"
        >
          {t("nav.forOrganizers")}
        </Link>
        <Link
          href="/verify"
          className="flex min-h-[44px] items-center rounded-xl px-3 text-[16px] text-dim transition-colors hover:text-fg"
        >
          {t("nav.verify")}
        </Link>
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
      {!signer && (
        <Link
          href="/events"
          className="hidden h-11 shrink-0 items-center rounded-full bg-white px-5 text-[15px] font-medium text-[#1b1436] transition-transform duration-100 active:scale-[0.985] sm:inline-flex"
        >
          {t("home.signIn")}
        </Link>
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
    <span
      role="img"
      aria-label={label}
      title={label}
      className="h-8 w-8 shrink-0 rounded-full border border-line-2"
      // Generated per account, so it cannot come from the token palette.
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 58% 64%), hsl(${(hue + 45) % 360} 52% 44%))`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// One of the two ways in.
///
/// A picture of a person, then what you are here for, then the arrow. The figures are cropped from
/// the design and carry its own lighting, so the card's tint is set to meet them rather than to a
/// palette value — the seam between a lit render and a flat gradient is the thing that gives a
/// pasted-in asset away.
///
/// The image is masked out on its right rather than ending at an edge, so the character stands in
/// the card instead of sitting in a rectangle inside it.
function Door({
  href,
  title,
  body,
  tone,
}: {
  href: string;
  title: string;
  body: string;
  tone: "join" | "host";
}) {
  const join = tone === "join";
  const m = useMotionPrefs();
  return (
    /* Transform and opacity only, and the height never changes — the card must not be able to push
       anything below it, on a page whose first screen is what somebody is reading while it settles.
       `whileTap` is here because a phone has no hover: without it the two controls that matter most
       would give no feedback at all on the device this product is used on. */
    <motion.div
      whileHover={m.reduced ? undefined : { y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
    <Link
      href={href}
      className={`group relative flex min-h-[132px] items-center gap-3 overflow-hidden rounded-[18px] border pr-4 transition-colors duration-200 ${
        join ? "border-accent/30 hover:border-accent/70" : "border-ok/30 hover:border-ok/60"
      }`}
      style={{
        background: join
          ? "linear-gradient(105deg, rgba(41,38,92,0.95) 0%, rgba(20,28,48,0.92) 58%)"
          : "linear-gradient(105deg, rgba(16,48,40,0.95) 0%, rgba(16,30,34,0.92) 58%)",
      }}
    >
      <span
        aria-hidden
        className="h-[132px] w-[104px] shrink-0 self-end bg-cover bg-bottom transition-transform duration-200 group-hover:translate-x-[3px]"
        style={{
          backgroundImage: `url(${join ? "door-join.webp" : "door-host.webp"})`,
          WebkitMaskImage: "linear-gradient(to right, #000 62%, transparent 100%)",
          maskImage: "linear-gradient(to right, #000 62%, transparent 100%)",
        }}
      />

      <span className="min-w-0 flex-1 py-4">
        <span className={`block text-[19px] font-semibold leading-tight tracking-[-0.015em] ${join ? "text-accent-2" : "text-fg"}`}>
          {title}
        </span>
        <span className="mt-1.5 block text-[15px] text-dim">{body}</span>
      </span>

      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[17px] transition-transform duration-200 group-hover:translate-x-0.5 ${
          join ? "bg-accent text-white" : "bg-ok text-[#08261a]"
        }`}
      >
        →
      </span>
    </Link>
    </motion.div>
  );
}

/// The last thing on the page, and the only one that is an address rather than a claim.
///
/// The design lists Docs, GitHub, Discord and X. Two of those do not exist — there is no Discord
/// and no account on X — and a footer link that goes nowhere is the cheapest possible way to look
/// unfinished. What is here is what there is.
function SiteFooter() {
  const t = useT();
  return (
    <footer className="mt-16 border-t border-line md:mt-24">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <PeerProofMark />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">PeerProof</span>
          <span className="hidden text-[15px] text-dim sm:inline">{t("footer.tagline")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
          <a
            href="https://github.com/zhxinyue29/peerproof"
            className="min-h-[44px] items-center text-dim transition-colors hover:text-fg"
          >
            {t("footer.source")}
          </a>
          {explorerAddressUrl(ESCROW_ADDRESS) && (
            <a
              href={explorerAddressUrl(ESCROW_ADDRESS)}
              className="min-h-[44px] items-center text-dim transition-colors hover:text-fg"
            >
              {t("footer.contract")}
            </a>
          )}
          <Link href="/verify" className="min-h-[44px] items-center text-dim transition-colors hover:text-fg">
            {t("nav.verify")}
          </Link>
        </div>
      </div>
    </footer>
  );
}

/// Everything the first viewport deliberately leaves out.
///
/// V3 keeps mechanism off the hero, which is right — but "How it works" in the top bar has to land
/// somewhere, and a nav link that scrolls to nothing is worse than no nav link. So the explanation
/// that used to crowd the headline lives here, one anchor down, in the order it actually happens.
function HowItWorks() {
  const t = useT();
  const steps = [
    { title: t("home.step1Title"), body: t("home.step1Body") },
    { title: t("home.step2Title"), body: t("home.step2Body") },
    { title: t("home.step3Title"), body: t("home.step3Body") },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-8 space-y-6 pb-4 pt-14 md:pt-20">
      <div className="space-y-2">
        <h2 className="text-[28px] font-semibold tracking-[-0.025em] md:text-[34px]">
          {t("home.howItWorks")}
        </h2>
        <p className="max-w-[60ch] text-[16px] leading-relaxed text-dim md:text-[17px]">
          {t("home.howItWorksSub")}
        </p>
      </div>

      <ol className="grid gap-4 md:grid-cols-3 md:gap-5">
        {steps.map((s, i) => (
          /* The picture is the decoration now, and it is also the explanation. The three cards
             share one drawing and differ only in its state, so reading across them is the
             mechanism: deposits go down into the contract, the room draws lines across itself,
             the contract pays back along them — and the fourth person, who never got a line, is
             the reason any of it is worth doing. The large ghost numeral this replaces gave the
             panels a reading order and nothing else. */
          <li
            key={s.title}
            className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-2 md:p-6"
          >
            <div className="rounded-xl border border-line bg-ink/40 px-3 py-4">
              <StepFigure step={(i + 1) as 1 | 2 | 3} />
            </div>
            <span className="mt-4 block text-[14px] font-medium tabular-nums text-accent-2">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.01em]">{s.title}</h3>
            <p className="mt-2 text-[16px] leading-relaxed text-dim">{s.body}</p>
          </li>
        ))}
      </ol>

      {/* Two claims, not two paragraphs.
          These were a pair of loose grey blocks under a rule, which is how a footnote looks — and
          the first of them is the strongest thing on the page: there is no function that can pay
          the organizer. A claim that carries the whole product should not be set like an aside. */}
      <div className="grid gap-4 border-t border-line pt-6 md:grid-cols-2 md:gap-5">
        {[
          { key: "home.custodyNote", tone: "ok" as const },
          { key: "home.bothRoles", tone: "accent" as const },
        ].map(({ key, tone }) => (
          <div
            key={key}
            className="relative overflow-hidden rounded-xl border border-line bg-panel/60 p-5"
          >
            {/* A rule down the left edge rather than an icon: it marks the block as a statement
                without adding a symbol somebody has to decode. */}
            <span
              aria-hidden
              className={`absolute inset-y-4 left-0 w-[3px] rounded-r-full ${
                tone === "ok" ? "bg-ok/60" : "bg-accent/60"
              }`}
            />
            <p className="pl-3 text-[16px] leading-relaxed text-dim">{t(key)}</p>
          </div>
        ))}
      </div>

      {/* The close.
          The page used to end on two grey paragraphs and an underlined link, which is how a
          document ends, not a product. And the strongest thing this project can say last is not a
          slogan — it is an address. Everything above is a claim; this is the thing a sceptic can
          go and check, so it gets the weight. */}
      <section className="relative overflow-hidden rounded-2xl border border-line-2 bg-panel p-6 md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(38rem 20rem at 88% -6rem, rgba(118,91,255,0.16), transparent 62%)",
          }}
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-2">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] md:text-[26px]">
              {t("home.closeTitle")}
            </h2>
            <p className="max-w-[54ch] text-[16px] leading-relaxed text-dim">{t("home.closeBody")}</p>
            <p className="break-all pt-1 font-mono text-[14px] text-faint">{ESCROW_ADDRESS}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <LinkButton href="/verify">{t("home.readPublicRecord")}</LinkButton>
            {explorerAddressUrl(ESCROW_ADDRESS) && (
              <a
                href={explorerAddressUrl(ESCROW_ADDRESS)}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-line-2 px-4 text-[16px] text-dim transition-colors hover:border-accent hover:text-fg"
              >
                {t("verify.openOnExplorer")} ↗
              </a>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
