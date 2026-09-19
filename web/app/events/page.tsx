"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import HowItWorksModal from "@/components/HowItWorksModal";
import EventCard from "@/components/EventCard";
import GateIntro from "@/components/GateIntro";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useIdentity } from "@/components/IdentityProvider";
import { Notice, Skeleton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import {
  ESCROW_ADDRESS,
  basePath,
  chainNowMs,
  hasDeployment,
  isLocalChain,
  publicClient,
  syncChainClock,
} from "@/lib/chain";
import { readAllEvents, type EventSummary } from "@/lib/events";
import { sampleEvents } from "@/lib/sampleEvents";
import { shortenError } from "@/lib/format";
import { useVisiblePoll } from "@/lib/poll";

/// The directory. Every event the contract knows about, newest first.
///
/// This is the screen the app was missing: it showed one event, fixed at build time, so nobody
/// could browse and nobody could join anything but the newest. An attendance product where you
/// cannot see what is on is a demo, not a product.
///
/// Rebuilt to the V3 render (`01-events-desktop.png`, `01-events-mobile.png`): a promo band for
/// what is happening right now, filter chips, then a grid of visual cards. The two places the
/// render shows data we do not have — a cover photograph and a city — are answered in lib/cover.ts
/// and components/EventCard.tsx rather than invented here.

type Filter = "open" | "upcoming" | "week" | "mine";

/// `null` means the user has not touched the chips; `"all"` means they cleared them. The
/// difference decides what an untouched page shows — see `active` below.
type Choice = Filter | "all" | null;

const WEEK_SECONDS = 7 * 24 * 60 * 60;

export default function EventsPage() {
  const t = useT();
  const { signer } = useIdentity();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>(null);
  const [query, setQuery] = useState("");
  const [howOpen, setHowOpen] = useState(false);

  // Same trick `useEvent` uses. `t` is a new function on every language switch, so naming it as a
  // dependency below would re-read the whole chain when somebody presses 中文 — and leaving it out
  // captures whichever language was current when the effect first ran. A ref is neither: the effect
  // stays keyed to nothing, and the message resolves in the language on screen at the moment it
  // fails.
  const tRef = useRef(t);
  tRef.current = t;

  // `?q=` from the landing page's search box. Read on mount rather than during render: the query
  // string does not exist during the static export, so a lazy initialiser would make the client's
  // first render disagree with the prerendered HTML — the same reason `resolveEventId` reads it in
  // an effect. Without this the box on the home page would take a query and drop it, which is a
  // worse control than no control.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    if (!hasDeployment) return;
    const load = async () => {
      try {
        await syncChainClock();
        setEvents(await readAllEvents());
        setError(null);
      } catch (e) {
        setError(shortenError(e, tRef.current));
      }
    };
    void load();
  }, []);

  // 12s, and only while somebody is looking. Each pass is one read per event against an endpoint
  // that allows fifteen a second; a listing page does not need to be fresher than that, and a
  // backgrounded tab does not need to be fresh at all.
  useVisiblePoll(() => {
    if (!hasDeployment) return;
    void readAllEvents().then(setEvents).catch(() => {});
  }, 12000);

  const now = Math.floor(chainNowMs() / 1000);
  const anyOpen = !!events?.some((e) => e.phase === "live");

  /// Which chip is really applied. The render shows "Open now" selected on arrival, and that is
  /// right on a busy weekend — but a chain with one event next Tuesday would then open on an empty
  /// grid, which reads as a broken page rather than as a filter doing its job. So the default is
  /// only taken when it has something to show. Derived at render rather than written into state in
  /// an effect: state that mirrors other state goes stale, and this one would go stale exactly when
  /// an event goes live under somebody's cursor.
  const active: Filter | null =
    choice === null ? (anyOpen ? "open" : null) : choice === "all" ? null : choice;

  const mine = useMyRegistrations(events, active === "mine" ? signer?.address ?? null : null);

  const q = query.trim().toLowerCase();
  const visible = (events ?? []).filter((e) => {
    if (q) {
      const hay = `${e.listing.title} ${e.listing.blurb} #${e.id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    switch (active) {
      case "open":
        return e.phase === "live";
      case "upcoming":
        return e.phase === "registering" || e.phase === "waiting";
      case "week":
        // Anything whose doors open inside the week, including the ones that already opened: an
        // event running right now is unambiguously this week.
        return (
          (e.phase === "registering" || e.phase === "waiting" || e.phase === "live") &&
          Number(e.attestOpen) < now + WEEK_SECONDS
        );
      case "mine":
        return !!mine?.has(e.id.toString());
      default:
        return true;
    }
  });

  return (
    // The participant side wears the top bar, not the sidebar.
    //
    // The sidebar came from V3, where every screen was an app screen. The design for this side puts
    // the same bar across discovery, event detail and profile, and keeps a rail only for the
    // organiser — so walking from the landing page into here no longer swaps the chrome, drops the
    // sign-in button and moves the language switch into a corner.
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav />

        <main className="pb-16">
          {/* The page's own headline, set like the landing page's rather than like a document
              title: same face, same weight, same light across the letters. */}
          <section className="relative pb-8 pt-6 md:pb-10 md:pt-10">
            <div className="relative md:max-w-[56%]">
              <h1
                className="bg-clip-text pb-[0.12em] text-[36px] font-extrabold leading-[1.04] tracking-[-0.035em] text-transparent md:text-[clamp(38px,3.6vw,56px)] md:leading-[1]"
                style={{
                  fontFamily: '"Montserrat", var(--font-sans)',
                  backgroundImage:
                    "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
                }}
              >
                {t("events.title")}
              </h1>
              <p className="mt-3 max-w-[46ch] text-[16px] leading-relaxed text-dim md:text-[17px]">
                {t("events.subtitle")}
              </p>

              {/* The round arrow from the design. It opens the four-step explainer rather than
                  scrolling somewhere — the sheet marks it as the way into "how this works", and the
                  landing page already proved a button gets found where a grey link did not. */}
              <button
                type="button"
                onClick={() => setHowOpen(true)}
                aria-label={t("home.howItWorks")}
                className="group mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white transition-transform duration-150 hover:scale-105 active:scale-95"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* The scene, bleeding off the right edge exactly as it does on the landing page. */}
            <div
              aria-hidden
              className="pointer-events-none absolute right-[calc(50%-50vw)] top-0 hidden w-[calc(44%+50vw-50%)] bg-cover bg-center lg:block"
              style={{
                aspectRatio: "1460 / 838",
                // Absolute, via basePath. `url(hero.webp)` is relative to the *document*, so on
                // "/" it resolves to /hero.webp and on "/events/" it resolves to
                // /events/hero.webp — which does not exist, and a background that fails to load
                // fails silently. HeroArt has always got away with the relative form because it
                // only ever rendered on the root route.
                backgroundImage: `url(${basePath}/hero.webp)`,
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, #000 34%), linear-gradient(to bottom, #000 58%, transparent 100%)",
                maskImage:
                  "linear-gradient(to right, transparent 0%, #000 34%), linear-gradient(to bottom, #000 58%, transparent 100%)",
                WebkitMaskComposite: "source-in",
                maskComposite: "intersect",
              }}
            />
          </section>

          {/* Search sits above the chips and spans the column, which is where the sheet puts it —
              and unlike the old one it is here whether or not the contract has events, because on
              this design it is part of the page's shape rather than a control bolted to a list. */}
          <label className="relative mb-4 flex max-w-[560px] items-center">
            <span aria-hidden className="pointer-events-none absolute left-4 text-faint">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.8" />
                <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder={t("events.search")}
              aria-label={t("events.search")}
              className="h-12 w-full min-w-0 rounded-full border border-line-2 bg-panel/70 pl-12 pr-4 text-[15px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70"
            />
          </label>

      <div className="flex min-w-0 flex-col gap-5 md:gap-6">
        {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}
        {!hasDeployment && <Notice>{t("common.noContract")}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}

        {/* The band only appears when the claim on it is true. "Walk in, join" over a list where
            the next event is on Thursday is the kind of small lie this product cannot afford. */}
        {/* Always present, because it is this page's face — but its words follow the truth.
            "Walk in, join" over a list whose next event is Thursday is the kind of small lie this
            product cannot afford, so when nothing is live it says what is actually on offer. An
            empty listing under no header at all is how a working deployment looks broken. */}
        {/* The flat purple band is gone.
            It was this page's face when the page had no other face — no headline treatment, no
            scene, nothing above it but a document title. Now the headline and the artwork do that
            job, and a second promo block under them is the page saying the same thing twice in a
            weaker voice. What the band carried that was load-bearing — "nothing is running right
            now, anyone can host one" — moves onto the sample row, which is where somebody looking
            at an empty listing actually is. */}

        <Chips
          active={active}
          onPick={(f) => setChoice(active === f ? "all" : f)}
          labels={{
            open: t("events.openNow"),
            upcoming: t("events.upcoming"),
            week: t("events.thisWeek"),
            mine: t("events.myRegistrations"),
          }}
        />

        {/* The row's own heading, from the sheet. "See all" is a filter reset rather than another
            route: there is one listing and this is it, so a link to a second page would be a lie
            about how much there is. It only appears when a filter is actually narrowing something,
            because a "see all" over an unfiltered list does nothing and says nothing. */}
        <div className="flex items-end justify-between gap-4 pt-2">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] md:text-[26px]">
            {t("events.featured")}
          </h2>
          {active && (
            <button
              type="button"
              onClick={() => setChoice("all")}
              className="group flex min-h-[44px] items-center gap-1.5 text-[15px] text-accent-2 transition-colors hover:text-fg"
            >
              {t("events.seeAll")}
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </button>
          )}
        </div>

        {/* On its own, replacing the grid rather than sitting above an empty one: "nothing matches"
            under "sign in first" is two explanations for one situation, and the second one is
            wrong. */}
        {/* Nothing below this is knowable without a contract, and skeletons that never resolve are
            how a misconfigured build looks exactly like a slow network. */}
        {!hasDeployment ? null : active === "mine" && !signer ? (
          <Notice>{t("events.signInForMine")}</Notice>
        ) : !events || (active === "mine" && !mine) ? (
          <Grid>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[300px] w-full rounded-2xl" />
            ))}
          </Grid>
        ) : events.length === 0 ? (
          /* The listing, as a listing, with nothing real in it yet.
             The design render for this page is three event cards — that grid *is* the page, and
             replacing it with a block of prose when the contract is empty means the one screen a
             visitor judges the product by has never been seen doing its job. So the row renders
             through the same `EventCard` on the same code path, filled from `sampleEvents()`, and
             every card says "sample" on its face. The day a real event exists these vanish and
             nothing else about this branch changes.
             The three steps that used to fill this slot stay underneath rather than instead: "what
             happens when I turn up" is still the next question somebody with an empty list has, it
             just is not more important than showing them what an event looks like. */
          <>
            <p className="text-[15px] text-dim">{t("events.sampleNote")}</p>
            <Grid>
              {sampleEvents().map((e) => (
                <EventCard key={e.id.toString()} event={e} sample />
              ))}
            </Grid>
            <GateIntro kind="floor" />
          </>
        ) : visible.length === 0 ? (
          <Empty title={t("events.noMatchTitle")}>
            <p className="text-[15px] leading-relaxed text-dim">{t("events.noMatchBody")}</p>
            <button
              onClick={() => {
                setChoice("all");
                setQuery("");
              }}
              className="text-[15px] text-accent-2 underline"
            >
              {t("events.showAll")}
            </button>
          </Empty>
        ) : (
          <Grid>
            {visible.map((e) => (
              <EventCard key={e.id.toString()} event={e} />
            ))}
          </Grid>
        )}

        <p className="text-[14px] leading-relaxed text-faint md:max-w-[70ch]">
          {t("events.sourceNote")}
        </p>
      </div>
        </main>
      </div>
      <HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// `auto-fill` rather than fixed column counts. It lands on the render's three columns at desktop
/// width and one on a phone, and it also gets the in-between widths right on its own — with the
/// sidebar taking 232px, a hard `md:grid-cols-3` would put three 150px cards on a small laptop.
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4 md:gap-5">
      {children}
    </div>
  );
}

const ORDER: Filter[] = ["open", "upcoming", "week", "mine"];

/// Wrapping, not a horizontal scroller. There are four of them and they fit two-and-two on a
/// 390px phone, which is what `01-events-mobile.png` shows — and a filter you have to discover by
/// swiping is a filter nobody uses.
function Chips({
  active,
  onPick,
  labels,
}: {
  active: Filter | null;
  onPick: (f: Filter) => void;
  labels: Record<Filter, string>;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {ORDER.map((f) => {
        const on = active === f;
        return (
          <button
            key={f}
            onClick={() => onPick(f)}
            // A toggle, not a tab: pressing the selected chip clears it and shows everything.
            aria-pressed={on}
            className={`flex min-h-[44px] items-center rounded-full border px-4 text-[15px] transition-colors ${
              on
                ? "border-accent bg-accent/15 font-medium text-fg"
                : "border-line-2 bg-panel text-dim hover:text-fg"
            }`}
          >
            {labels[f]}
          </button>
        );
      })}
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // Sized so a list that goes empty does not make the page jump — it occupies roughly the row of
    // cards it replaces.
    <div className="flex min-h-[220px] flex-col items-start justify-center gap-2 rounded-2xl border border-dashed border-line-2 bg-panel/40 p-6 md:p-8">
      <p className="text-[18px] font-medium">{title}</p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                          My registrations                          */
/* ------------------------------------------------------------------ */

/// Which of these events this account has put a deposit down for.
///
/// One `isRegistered` call per event, because the escrow has no batch read and no per-account
/// index — it was written before there was a directory page, and adding one would mean redeploying
/// the contract that holds deposits.
///
/// So it is read lazily: `address` is passed as null until the chip is actually pressed, and most
/// visits never press it. It is also not polled. Registration only changes when this person
/// registers, which happens on the event page, and that page reloads this one on the way back.
function useMyRegistrations(
  events: EventSummary[] | null,
  address: `0x${string}` | null,
): Set<string> | null {
  const [state, setState] = useState<{ key: string; ids: Set<string> } | null>(null);

  // The event list is a fresh array every poll, so the identity of `events` cannot decide whether
  // to re-read. The account and the number of events can: a new event is the only way this answer
  // can change while the page is open.
  const key = address && events ? `${address}:${events.length}` : null;

  useEffect(() => {
    if (!key || !address || !events || !hasDeployment) return;
    if (state?.key === key) return;

    let dropped = false;
    void Promise.all(
      events.map((e) =>
        publicClient.readContract({
          address: ESCROW_ADDRESS,
          abi,
          functionName: "isRegistered",
          args: [e.id, address],
        }),
      ),
    )
      .then((flags) => {
        if (dropped) return;
        setState({
          key,
          ids: new Set(events.filter((_, i) => flags[i]).map((e) => e.id.toString())),
        });
      })
      // Silent: the grid keeps showing the last answer, and the poll above is what tells somebody
      // the chain is unreachable. One failed read should not empty the screen.
      .catch(() => {});

    return () => {
      dropped = true;
    };
  }, [key, address, events, state]);

  return state?.key === key ? state.ids : null;
}
