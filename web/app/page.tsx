"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ProofArt from "@/components/ProofArt";
import { PeerProofMark } from "@/components/NavIcons";
import { useIdentity } from "@/components/IdentityProvider";
import { shortAddress } from "@/lib/format";
import { basePath } from "@/lib/chain";
import { useT, type TFn } from "@/lib/i18n";

/// The copy this screen introduced, in the language it was written in.
///
/// `t()` answers with the key itself when a dictionary has not caught up, which puts
/// "home.step1Title" on the landing page — the first thing anybody sees. Falling back to English
/// instead costs a Chinese reader their Chinese until these land in lib/dict; falling back to the
/// key costs every reader the sentence. This map is the list of what is owed.
const EN: Record<string, string> = {
  "home.redirecting": "Taking you to the event…",
  "home.howItWorksSub":
    "A deposit, a room, and a contract that settles from what the room proves about itself.",
  "home.step1Title": "Put a deposit down",
  "home.step1Body":
    "The deposit is what holds your place. The contract takes it — the organizer never does.",
  "home.step2Title": "Scan each other in the room",
  "home.step2Body":
    "Check in once at the door, then vouch for the people you actually meet. Every vouch is its own transaction.",
  "home.step3Title": "The contract settles itself",
  "home.step3Body":
    "Everyone confirmed present takes their deposit back, plus a share of what the no-shows left behind.",
  "home.custodyNote":
    "Whoever created the event has no function that releases, withholds, or receives a single wei. That is not a promise — it is the absence of a door.",
  "home.bothRoles":
    "The same account can do both — these are two ways in, not two kinds of person. Anyone can host; there is no approval step.",
  "home.readPublicRecord": "Read the public record",
};

function useCopy(): TFn {
  const t = useT();
  return (key, vars) => {
    const hit = t(key, vars);
    // `lookup` returns the key verbatim when nothing matched, and no key contains a placeholder,
    // so equality here is an exact test for "this string does not exist yet".
    if (hit !== key) return hit;
    const en = EN[key as string];
    if (!en) return hit;
    return vars
      ? en.replace(/\{(\w+)\}/g, (whole, name: string) =>
          name in vars ? String(vars[name]) : whole,
        )
      : en;
  };
}

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
  const t = useCopy();

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
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-8">
        <TopBar />

        <main
          className="flex flex-col gap-16 md:gap-24"
          style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
        >
          <section className="grid items-center gap-10 pt-10 md:grid-cols-[1.12fr_0.88fr] md:gap-14 md:pt-16">
            <div className="min-w-0 space-y-5">
              <p className="text-[14px] font-medium uppercase tracking-[0.16em] text-accent-2">
                {t("home.eyebrow")}
              </p>
              <h1 className="text-[38px] font-semibold leading-[1.04] tracking-[-0.035em] md:text-[54px]">
                {t("home.headline")}
              </h1>
              <p className="max-w-[46ch] text-[17px] leading-relaxed text-dim md:text-[18px]">
                {t("home.sub")}
              </p>

              {/* Equally weighted, side by side. Neither is the primary action: which one is right
                  depends entirely on who is reading, and a product that guesses puts the other half
                  of its audience through a screen built for somebody else. */}
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <Door href="/events" eyebrow={t("home.goingLabel")} cta={t("home.goingCta")} tone="join" />
                <Door href="/organizer" eyebrow={t("home.hostingLabel")} cta={t("home.hostingCta")} tone="host" />
              </div>

              {/* The claim in three words each, for somebody scanning rather than reading. Chips
                  rather than a row of bullets: three loose dots under two large cards read as
                  leftovers, and these are the three things the product is actually promising. */}
              <ul className="flex flex-wrap gap-2 pt-1">
                {[t("home.pillCustody"), t("home.pillPeer"), t("home.pillRecord")].map((label) => (
                  <li
                    key={label}
                    className="flex items-center gap-2 rounded-full border border-ok/25 bg-ok/[0.07] px-3.5 py-2 text-[15px] text-dim"
                  >
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-ok" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <ProofArt className="h-[220px] w-full md:h-[340px]" />
          </section>

          <HowItWorks />
        </main>
      </div>
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
  const t = useCopy();
  return (
    <header className="flex items-center gap-3 border-b border-line py-4 md:py-5">
      <Link href="/" className="flex min-h-[44px] min-w-0 items-center gap-2.5">
        <PeerProofMark />
        <span className="truncate text-[17px] font-semibold tracking-[-0.01em]">PeerProof</span>
      </Link>
      {/* A spacer rather than `flex-1` on the wordmark: this page *is* `/`, and a link stretched
          across the empty half of the bar is 800px of invisible target that reloads the screen. */}
      <span className="flex-1" />

      <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
        <Link
          href="/verify"
          className="flex min-h-[44px] items-center rounded-xl px-3 text-[16px] text-dim transition-colors hover:text-fg"
        >
          {t("nav.verify")}
        </Link>
        <a
          href="#how-it-works"
          className="flex min-h-[44px] items-center rounded-xl px-3 text-[16px] text-dim transition-colors hover:text-fg"
        >
          {t("home.howItWorks")}
        </a>
      </nav>

      <LanguageSwitcher />
      <IdentityToken />
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

/// One of the two ways in. The label above says who you are; the line below says where that goes.
///
/// These are the page's only real controls, and they were two grey rectangles the same colour as
/// every card beneath them — a primary action has to look like one. Each now carries its own light:
/// a tint that sits under the panel colour, a glow that lifts on hover, and a figure in the corner
/// that says which door this is before the words are read.
function Door({
  href,
  eyebrow,
  cta,
  tone,
}: {
  href: string;
  eyebrow: string;
  cta: string;
  tone: "join" | "host";
}) {
  const join = tone === "join";
  return (
    <Link
      href={href}
      className="group relative flex min-h-[148px] flex-col justify-between overflow-hidden rounded-2xl border border-line-2 p-5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent/70 md:min-h-[164px] md:p-6"
      style={{
        background: join
          ? "linear-gradient(150deg, rgba(118,91,255,0.20) 0%, rgba(22,35,60,0.9) 58%)"
          : "linear-gradient(150deg, rgba(57,217,138,0.16) 0%, rgba(22,35,60,0.9) 58%)",
      }}
    >
      {/* The mark, not an icon set. Two arcs for joining a room, three points for convening one —
          drawn rather than imported so the page still has no outbound request. */}
      <svg
        aria-hidden
        viewBox="0 0 64 64"
        className="pointer-events-none absolute -right-3 -top-3 h-[92px] w-[92px] opacity-[0.28] transition-opacity duration-200 group-hover:opacity-50"
      >
        {join ? (
          <g fill="none" stroke={join ? "#9a88ff" : "#39d98a"} strokeWidth="2.2" strokeLinecap="round">
            <path d="M20 42a14 14 0 1 1 24 0" />
            <path d="M12 50a22 22 0 0 1 40 0" opacity="0.55" />
          </g>
        ) : (
          <g>
            <g stroke="#39d98a" strokeWidth="1.8" opacity="0.6">
              <path d="M22 24 L42 24 M22 24 L32 44 M42 24 L32 44" />
            </g>
            {[[22, 24], [42, 24], [32, 44]].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.6" fill="#39d98a" />
            ))}
          </g>
        )}
      </svg>

      <span className="relative text-[15px] text-dim">{eyebrow}</span>
      <span className="relative flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.02em] md:text-[26px]">
        {cta}
        <span
          aria-hidden="true"
          className={`transition-transform duration-200 group-hover:translate-x-1 ${join ? "text-accent-2" : "text-ok"}`}
        >
          →
        </span>
      </span>
    </Link>
  );
}

/// Everything the first viewport deliberately leaves out.
///
/// V3 keeps mechanism off the hero, which is right — but "How it works" in the top bar has to land
/// somewhere, and a nav link that scrolls to nothing is worse than no nav link. So the explanation
/// that used to crowd the headline lives here, one anchor down, in the order it actually happens.
function HowItWorks() {
  const t = useCopy();
  const steps = [
    { title: t("home.step1Title"), body: t("home.step1Body") },
    { title: t("home.step2Title"), body: t("home.step2Body") },
    { title: t("home.step3Title"), body: t("home.step3Body") },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-8 space-y-6 pb-4">
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
          /* The numeral is the decoration. Set large and nearly transparent behind the text it
             belongs to, it gives three identical panels a reading order at a glance — which a
             14px accent-coloured digit in the corner never did. */
          <li
            key={s.title}
            className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-2 md:p-6"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-2 -top-6 select-none text-[112px] font-semibold leading-none text-white/[0.045]"
            >
              {i + 1}
            </span>
            <span className="relative text-[14px] font-medium tabular-nums text-accent-2">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="relative mt-2 text-[18px] font-semibold tracking-[-0.01em]">{s.title}</h3>
            <p className="relative mt-2 text-[16px] leading-relaxed text-dim">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="space-y-3 border-t border-line pt-6">
        <p className="max-w-[70ch] text-[16px] leading-relaxed text-dim">{t("home.custodyNote")}</p>
        <p className="max-w-[70ch] text-[16px] leading-relaxed text-dim">{t("home.bothRoles")}</p>
        <Link
          href="/verify"
          className="inline-flex min-h-[44px] items-center text-[16px] text-accent-2 underline decoration-line-2"
        >
          {t("home.readPublicRecord")} →
        </Link>
      </div>
    </section>
  );
}
