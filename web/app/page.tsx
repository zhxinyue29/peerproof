"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import StepFigure from "@/components/StepFigure";
import HeroScene from "@/components/HeroScene";
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

        <main>
          <section className="relative grid items-center gap-10 pb-10 pt-8 md:grid-cols-[1.02fr_0.98fr] md:gap-10 md:pt-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -z-10 -left-[15%] -right-[15%] -top-[22%] h-[150%]"
              style={{
                background:
                  "radial-gradient(52rem 32rem at 76% 46%, rgba(118,91,255,0.30), transparent 66%)," +
                  "radial-gradient(34rem 24rem at 10% 12%, rgba(77,183,255,0.12), transparent 62%)",
              }}
            />

            <div className="relative min-w-0 space-y-6">
              <p className="text-[15px] font-medium tracking-[0.02em] text-accent-2">
                {t("home.eyebrow")}
              </p>

              {/* The accent lands on the object of the sentence — the thing you would otherwise have
                  to take somebody's word for. Three keys rather than one string with markup in it,
                  because where the emphasis falls is a decision each language makes for itself. */}
              <h1 className="max-w-[16ch] text-[40px] font-semibold leading-[1.1] tracking-[-0.035em] md:text-[58px]">
                {t("home.headlineLead")}
                <span className="text-accent-2">{t("home.headlineAccent")}</span>
                {t("home.headlineTail")}
              </h1>

              <p className="max-w-[44ch] text-[17px] leading-relaxed text-dim md:text-[18px]">
                {t("home.sub")}
              </p>

              <div className="grid gap-4 pt-1 sm:grid-cols-2">
                <Door
                  href="/events"
                  title={t("home.joinTitle")}
                  body={t("home.joinBody")}
                  tone="join"
                />
                <Door
                  href="/organizer"
                  title={t("home.hostTitle")}
                  body={t("home.hostBody")}
                  tone="host"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-1">
                <a
                  href="#how-it-works"
                  className="flex min-h-[44px] items-center gap-2.5 text-[15px] text-dim transition-colors hover:text-fg"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/60 text-accent-2">
                    <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden>
                      <path d="M0 0v10l9-5z" fill="currentColor" />
                    </svg>
                  </span>
                  {t("home.watchMinute")}
                </a>
                <a
                  href="#how-it-works"
                  className="flex min-h-[44px] items-center gap-2 text-[15px] text-dim transition-colors hover:text-fg"
                >
                  {t("home.howLink")}
                  <span aria-hidden>→</span>
                </a>
              </div>
            </div>

            <HeroScene />
          </section>
        </main>
      </div>

      <ValueStrip />

      <div
        className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 md:px-8"
        style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
      >
        <HowItWorks />
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
  const t = useT();
  const router = useRouter();
  const { signer } = useIdentity();

  // The search belongs to the listing, which already has one. Rather than build a second index
  // here, this hands the query over: /events reads `?q=` on arrival and applies it as its filter.
  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    router.push(typeof q === "string" && q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : "/events");
  };

  return (
    <header className="flex items-center gap-3 py-4 md:gap-5 md:py-5">
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
          {t("nav.about")}
        </a>
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
/// Icon, what you are here for, a line of what happens next, and a round arrow that is the button.
/// The pair used to be a label and a link with the whole card as the target, which said which door
/// this was and nothing about what was behind it — so the choice had to be made on two words.
///
/// Tinted to their own colour: violet for joining, green for hosting. Same two hues the rest of the
/// app uses for the same two roles, so the association is already learned by the time anybody gets
/// to a floor screen.
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
  return (
    <Link
      href={href}
      className={`group relative flex min-h-[188px] flex-col justify-between overflow-hidden rounded-[18px] border p-5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 md:p-6 ${
        join ? "border-accent/30 hover:border-accent/70" : "border-ok/30 hover:border-ok/60"
      }`}
      style={{
        background: join
          ? "linear-gradient(158deg, rgba(118,91,255,0.17) 0%, rgba(20,28,48,0.72) 62%)"
          : "linear-gradient(158deg, rgba(34,197,94,0.15) 0%, rgba(18,32,36,0.72) 62%)",
      }}
    >
      <span className={join ? "text-accent-2" : "text-ok"}>
        {join ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="9" cy="8.2" r="3.2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3.3 19.2a5.7 5.7 0 0 1 11.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="17.2" cy="9.3" r="2.5" stroke="currentColor" strokeWidth="1.5" opacity="0.72" />
            <path d="M15.1 18.7a4.7 4.7 0 0 1 5.9-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.72" />
          </svg>
        ) : (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="3" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3.4 9.6h17.2M8 3.4v3.6M16 3.4v3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M12 12.6v4.6M9.7 14.9h4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        )}
      </span>

      <span className="mt-auto flex items-end justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-[19px] font-semibold tracking-[-0.015em] md:text-[20px]">
            {title}
          </span>
          <span className="mt-1.5 block max-w-[24ch] text-[15px] leading-relaxed text-dim">
            {body}
          </span>
        </span>
        <span
          aria-hidden
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[18px] transition-transform duration-200 group-hover:translate-x-0.5 ${
            join ? "bg-accent text-white" : "bg-ok text-[#08261a]"
          }`}
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
