"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMotionPrefs } from "@/lib/motion";
import TopNav from "@/components/TopNav";
import HowItWorksModal from "@/components/HowItWorksModal";
import Link from "next/link";
import StepFigure from "@/components/StepFigure";
import HeroArt from "@/components/HeroArt";
import LiveStats from "@/components/LiveStats";
import IdentityChoiceCard from "@/components/IdentityChoiceCard";
import FeaturedEvents from "@/components/FeaturedEvents";
import ValueStrip from "@/components/ValueStrip";
import { LinkButton } from "@/components/ui";
import { ESCROW_ADDRESS, explorerAddressUrl } from "@/lib/chain";
import { PeerProofMark } from "@/components/NavIcons";
import { basePath } from "@/lib/chain";
import { useLang, useT } from "@/lib/i18n";

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
  const { lang } = useLang();
  const m = useMotionPrefs();
  const [howOpen, setHowOpen] = useState(false);

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
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav />

        <main>
          {/* `pt-0` on a phone. The section carried `pt-4` and the mobile band below it another `mt-8`,
              which stacked into about 140px of nothing between the bar and the picture — the first
              thing anybody sees on the screen this product is actually opened on. */}
          <section className="relative pb-10 pt-0 md:min-h-[540px] md:pb-16 md:pt-8">
            <HeroArt />

            {/* Arrival order is reading order: the badge that says what this is, the two lines of
                the claim, the line under them, the body, then the two things you can do about it.
                Nothing overshoots — a headline that bounces is a headline nobody reads twice. */}
            <motion.div
              className="relative space-y-3 md:max-w-[52%]"
              variants={m.container}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={m.item} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-semibold"
                  style={{ background: "linear-gradient(100deg, #2f2792 0%, #2a2480 100%)", color: "#c9c4f6" }}
                >
                  {/* The bolt is near-white in the design (#fcfaff), brighter than the words beside
                      it — it reads as lit rather than as another glyph in the same ink. */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fcfaff" aria-hidden>
                    <path d="M13.4 2.8 5.6 13.4h5.3l-.9 7.8 8-10.8h-5.4l.8-7.6Z" />
                  </svg>
                  {t("home.builtOn")}
                </span>
                {/* #7972a9, measured. `text-dim` is #cdd7e5 — a light blue-grey where the design has a
                    muted violet, which is the single largest colour error on this screen. */}
                {/* #7972a9, measured. `text-dim` is #cdd7e5 — a light blue-grey where the design
                    has a muted violet, which is the single largest colour error on this screen. */}
                <span className="text-[15px]" style={{ color: "#7972a9" }}>{t("home.fastFair")}</span>
              </motion.div>

              {/* Sized in vw, not in pixels.
                  74px was measured at a 1536 viewport and then stayed 74px everywhere, so on a
                  1280 laptop it needed more room than the column had. 4.82vw is the same 74px at
                  1536 and shrinks with everything else; the clamp stops it going below 44.
                  Weight and colour are measured off the design rather than picked.
                  Its headline strokes are 15–16px on a 60px cap height — a quarter of the cap, which
                  is 800-class, not the 600 this was. And the second line is not a flat purple: it
                  runs #cfc2fa at the top of the letters through #e0d5fc across the middle to #dbd0fb
                  at the foot, a highlight band that reads as light falling on the type. The flat
                  #9a88ff it had was both darker and deader than any point in that ramp. */}
              <h1
                className="text-[46px] font-extrabold leading-[0.98] tracking-[-0.035em] md:text-[clamp(44px,4.82vw,74px)] md:leading-[0.92]"
                style={{ fontFamily: '"Montserrat", var(--font-sans)' }}
              >
                <motion.span variants={m.item} className="block">
                  {t("home.headline1")}
                </motion.span>
                <motion.span
                  variants={m.item}
                  className="mt-1 block bg-clip-text text-transparent"
                  style={{
                    // Horizontal, not vertical. Sampled on a grid across the design's own letters:
                    // vertically it barely moves, but across the line it runs #c4b6fc at the left
                    // through a bright #e2d8fd band around 43%, dips, and lifts again at the end.
                    // A 180deg ramp — which is what this was — cannot produce that at all, which is
                    // why it read as a flat colour instead of light lying across the words.
                    backgroundImage:
                      "linear-gradient(97deg, #c4b6fc 0%, #d3c8fb 22%, #e2d8fd 43%, #d0c3fb 63%, #dccdfb 84%, #e3d8fc 100%)",
                  }}
                >
                  {t("home.headline2")}
                </motion.span>
              </h1>

              {/* English gets the design's own handwriting, lifted from the sheet with its
                  underline and cut to transparency. Chinese cannot: the image is English words, and
                  showing them on a Chinese page would be the same mistake as an untranslated string
                  — worse, because it looks deliberate. So Chinese gets the line as type, with the
                  same drawn underline, and the sentence is its own rather than a translation of the
                  English one. */}
              {lang === "zh" ? (
                <motion.p
                  variants={m.item}
                  className="relative inline-block pb-3 text-[19px] leading-snug md:text-[22px]"
                  style={{ color: "#b9a9f7" }}
                >
                  {t("home.script")}
                  <svg
                    aria-hidden
                    viewBox="0 0 300 12"
                    preserveAspectRatio="none"
                    className="absolute inset-x-0 bottom-0 h-[9px] w-full text-accent/70"
                  >
                    <path className="pp-underline" d="M2 8C58 3 121 2 176 5c40 2 78 4 121 1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </motion.p>
              ) : (
                <motion.img
                  variants={m.item}
                  src="script-peers.webp"
                  alt=""
                  aria-hidden
                  width={844}
                  height={116}
                  className="h-[42px] w-auto md:h-[58px]"
                />
              )}

              {/* Where the two lines of body copy were.
                  They restated the headline in longer words — a stake, proven by the people in the
                  room — and the headline had already said it. This is the thing somebody actually
                  wants at that point in the column, and as a button rather than a grey line it can
                  be found: the version tucked under the stats panel was a link nobody saw, which is
                  the only way a link can fail. */}
              <motion.button
                variants={m.item}
                type="button"
                onClick={() => setHowOpen(true)}
                // `flex w-fit`, not `inline-flex`. The line above it is an inline-block — it has to be, so the
                // underline SVG can size to the text — and an inline-flex button next to an inline-block
                // paragraph is simply the next word on the same line, which is where this landed.
                className="group flex w-fit min-h-[48px] items-center gap-2.5 rounded-xl border border-line-2 bg-panel/60 px-5 text-[16px] text-fg transition-colors hover:border-accent/70"
              >
                {t("home.howLink")}
                <span aria-hidden className="text-accent-2 transition-transform duration-200 motion-safe:group-hover:translate-x-1">
                  →
                </span>
              </motion.button>

              <motion.div variants={m.item} className="grid gap-4 pt-2 sm:grid-cols-2">
                <IdentityChoiceCard href="/events" title={t("home.joinTitle")} body={t("home.joinSub")} tone="join" />
                <IdentityChoiceCard href="/organizer" title={t("home.hostTitle")} body={t("home.hostSub")} tone="host" />
              </motion.div>

              {/* Under the two cards, not over the scene.
                  It sat on the lower left of the artwork, which is exactly where the clip's two
                  people stand and where the point of light leaves the phone — the one moment the
                  whole animation exists to show, covered by a panel of zeros. Down here it reads
                  in the same column as everything else it belongs with, and the scene is whole.
                  The handwriting comes with it: it was cut from the sheet as this panel's caption
                  and following it keeps the pair together. */}
              <motion.div variants={m.item} className="flex flex-wrap items-end gap-4 pt-1">
                <div className="min-w-0 flex-1">
                  <LiveStats />
                </div>
                <img
                  src="script-showup.webp"
                  alt=""
                  aria-hidden
                  width={344}
                  height={324}
                  className="pointer-events-none hidden h-[104px] w-auto lg:block"
                />
              </motion.div>
            </motion.div>

            {/* The four-beat sequence used to live here. It is gone with the still it was drawn
                against: its card, its arcs and its closing line were pinned to that picture's ring
                and phone coordinates, and the scene behind them is a different room now. The clip
                tells the same story — a proof leaving one phone and landing on other people — from
                inside the room rather than on top of it. */}

          </section>
        </main>
      </div>

      <div className="mx-auto w-full max-w-[1380px] px-4 pt-12 sm:px-6 md:px-[17px] md:pt-16">
        <FeaturedEvents />
      </div>

      {/* Under the listing, not above it.
          It was moved above on the reading that the sheet puts these four directly beneath the
          hero — but the sheet's homepage ends at the hero and has no listing at all, so there was
          nothing in the drawing that said what comes between them. Inferring an order from a
          picture that does not contain one of the two things is not reading the design, it is
          guessing and calling it the design.
          Below is also the better place: somebody who has scrolled past the events is asking "can
          I trust this", and these four are the answer. Above, they interrupt the one thing the
          page exists to show. */}
      <ValueStrip />

      <SiteFooter />

      <HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
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

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// The last thing on the page, and the only one that is an address rather than a claim.
///
/// The design lists Docs, GitHub, Discord and X. Two of those do not exist — there is no Discord
/// and no account on X — and a footer link that goes nowhere is the cheapest possible way to look
/// unfinished. What is here is what there is.
function SiteFooter() {
  const t = useT();
  return (
    <footer className="mt-16 border-t border-line md:mt-24">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between md:px-[17px]">
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
