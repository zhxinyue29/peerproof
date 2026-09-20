"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import TopNav from "@/components/TopNav";
import { SectionTitle } from "@/components/SectionTitle";
import IdentityGate from "@/components/IdentityGate";
import GateIntro from "@/components/GateIntro";
import { Button, Card, CopyableCode, Field, Notice, Sheet, Skeleton } from "@/components/ui";
import { useIdentity } from "@/components/IdentityProvider";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import {
  ESCROW_ADDRESS,
  basePath,
  eventId,
  GAS_LIMITS,
  chainNowMs,
  hasDeployment,
  isLocalChain,
  publicClient,
  resolveEventId,
} from "@/lib/chain";
import { both, countdown, fiat, fiatAvailable, shortAddress, shortenError } from "@/lib/format";
import { useLang, useT, type TFn } from "@/lib/i18n";
import { canRegister, phaseOf, useEvent, type EventInfo } from "@/lib/useEvent";
import { readAllEvents, type EventSummary } from "@/lib/events";
import { useVisiblePoll } from "@/lib/poll";
import {
  checkDirectory,
  deployDirectory,
  directoryAddress,
  estimatedGas,
  offlineDescribeGas,
} from "@/lib/directory";
import { eventDirectoryAbi } from "@/lib/directoryArtifact";
import DeployDirectory from "@/components/DeployDirectory";
import EditListing from "@/components/EditListing";
import OrganizerEventCards from "@/components/OrganizerEventCards";
import EventManagement from "@/components/EventManagement";
import Analytics from "@/components/organizer/Analytics";
import EventTimeline from "@/components/EventTimeline";
import TagInput from "@/components/TagInput";
import CoverField from "@/components/CoverField";
import LivePulse from "@/components/LivePulse";
import VenueHandoff from "@/components/VenueHandoff";
import organizerStyles from "@/components/organizer/organizer.module.css";

/// The organizer's screen, rebuilt to `04-organizer-dashboard-*.png`.
///
/// Two things about it are load-bearing rather than decorative. It reads *every* event this address
/// created, not the one the build points at — an organizer who ran three nights had no way to see
/// the first two. And the payouts panel is still an absence: a dashed note saying the contract
/// settles itself, sitting where a product with an escape hatch would put the button.
/// Morning, afternoon or evening, by the organizer's own clock.
///
/// The banner said "good morning" at every hour of the day. A greeting is the one line on a
/// dashboard that claims to know something about the person reading it, and getting it wrong at
/// 9pm is worse than not greeting them at all — it tells them the screen is a template.
///
/// The device clock, deliberately, not the chain's: this is about where the reader is standing.
function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return "organizer.greeting.morning";
  if (h < 18) return "organizer.greeting.afternoon";
  return "organizer.greeting.evening";
}

export default function OrganizerPage() {
  const t = useT();
  const { signer } = useIdentity();
  const { ev, refresh } = useEvent(signer?.address ?? null);
  const [tab, goTo] = useUrlTab();
  const [all, setAll] = useState<EventSummary[] | null>(null);
  /// Which event's management sheet is open. `null` is the dashboard.
  const [managing, setManaging] = useState<bigint | null>(null);
  const [manageTab, setManageTab] = useState<"data" | "edit">("data");

  const loadAll = useCallback(() => {
    if (!hasDeployment) return;
    // Swallowed rather than surfaced: this is the second reader on the page, and a rate-limited
    // read should leave the last good list on screen, not replace the dashboard with an error.
    void readAllEvents().then(setAll).catch(() => {});
  }, []);

  useEffect(loadAll, [loadAll]);
  useVisiblePoll(loadAll, 15000);

  // Derived, not stored. `eventId()` is module state that useEvent's startup effect resolves once,
  // so the first moment it can be trusted is the first moment `ev` exists — and past that point it
  // only changes through `select` below, which re-reads the event and therefore re-renders this.
  // Mirroring it into state would mean two sources for one fact and an effect to keep them equal.
  const selectedId = ev ? eventId() : null;

  /// Switching rows without leaving the page.
  ///
  /// The event id is resolved from `?event=` exactly once, in an effect that does not depend on the
  /// query string — so a soft navigation to `/organizer?event=3` would rewrite the address bar and
  /// change nothing else. Rewriting the URL first and then re-resolving keeps the two in step, and
  /// leaves a reloadable link behind.
  const select = useCallback(
    (id: bigint) => {
      // Keep the rest of the query. This wrote `?event=N` over the whole string, which erased
      // `?tab=create` — so an organizer who already had an event could not reach the create form
      // at all: the auto-select effect fired on arrival, rewrote the URL, and the page re-read the
      // tab as absent and rendered the dashboard instead.
      const params = new URLSearchParams(window.location.search);
      params.set("event", id.toString());
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
      void resolveEventId().then(refresh);
    },
    [refresh],
  );

  const mine = useMemo(
    () =>
      all && signer
        ? all.filter((e) => e.organizer.toLowerCase() === signer.address.toLowerCase())
        : null,
    [all, signer],
  );

  const creating = tab === "create";
  const selected = mine?.find((e) => e.id === selectedId);

  /// Land on one of your own events rather than on whatever the build was pinned to.
  ///
  /// `selectedId` comes from `?event=`, which falls back to the build's `NEXT_PUBLIC_EVENT_ID` —
  /// somebody else's event, on a dashboard headed "your events". What it produced was a read-only
  /// warning and an event detail panel about a stranger's evening, sitting underneath three cards
  /// that were actually theirs. Only when nothing is selected that belongs to them, and only once,
  /// so it never fights a click.
  const nudged = useRef(false);
  useEffect(() => {
    if (nudged.current || !mine?.length || selectedId === null) return;
    if (mine.some((e) => e.id === selectedId)) return;
    nudged.current = true;
    // Newest first: the one somebody just created is the one they came back to look at.
    select(mine.reduce((a, b) => (b.id > a.id ? b : a)).id);
  }, [mine, selectedId, select]);

  if (!hasDeployment) {
    return (
      <Frame title={t("organizer.title")}>
        <Notice>{t("common.noContract")}</Notice>
      </Frame>
    );
  }

  return (
    <Frame
      title={creating ? t("nav.createEvent") : t("organizer.title")}
      titleEn={creating ? "Create Event" : "Organiser Dashboard"}
      subtitle={creating ? t("create.subtitle") : t("organizer.subtitle")}
      showHeading={creating}
      action={
        creating ? (
          <Button onClick={() => goTo("dashboard")} variant="ghost" className="w-full sm:w-auto">
            ← {t("organizer.yourEvents")}
          </Button>
        ) : (
          <Button onClick={() => goTo("create")} className="w-full sm:w-auto">
            + {t("nav.createEvent")}
          </Button>
        )
      }
    >
      {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}

      {/* Signed out, the page still shows what it is. It used to be replaced entirely by a warning
          and an email field — so anybody opening the organizer link, including somebody being shown
          the product, saw none of it. The shape is the same shape, the figures are zeros because
          there is nothing to count yet, and the sign-in sits where the events would be. */}
      {!signer && !creating && (
        <div className="space-y-6">
          <GreetingBanner who={null} onCreate={() => goTo("create")} />
          <Kpis events={[]} t={t} />
          <section className="space-y-4">
            <SectionTitle zh={t("organizer.yourEvents")} en="My Events" />
            <div className={`${organizerStyles.identityGate} py-5 md:py-6`}>
              <IdentityGate intro={<GateIntro kind="organizer" />}>{null}</IdentityGate>
            </div>
          </section>
        </div>
      )}

      {/* Skipped entirely in the case above, which already renders one. Two gates on one screen
          would offer the same email field twice. */}
      {(signer || creating) && (
      <IdentityGate intro={<GateIntro kind="organizer" />}>
        {creating ? (
          <CreateForm
            onCreated={async () => {
              await refresh();
              loadAll();
            }}
            onDone={() => goTo("dashboard")}
          />
        ) : (
          <div className="space-y-6">
            <GreetingBanner who={signer?.label ?? (signer ? shortAddress(signer.address) : null)} onCreate={() => goTo("create")} />

            <Kpis events={mine} t={t} />

            {/* The split is composed here rather than handed to AppShell's `aside`, which spans the
                whole of `children` — that would push the KPI band into the narrow column and leave
                each card about 140px wide at the width the renders were drawn at. The band is
                full-bleed in `04-organizer-dashboard-desktop.png`, above both columns. */}
            {/* One column, not a main-plus-rail split. The sheet's panel 06 (数据分析与结算) is a
                block of the page like the ones above it — putting it in a 320px rail beside the
                cards made a chart 320px wide and pushed the event management panel into a column
                half the width the drawing gives it. */}
            <div className="grid min-w-0 gap-5">
              <div className="min-w-0 space-y-5">
                {/* The events first, the analysis after. An organizer opening this page is
                    looking for a room they are running tonight, not for a trend line — and the
                    trend was above the list, so the first thing on the page was the one thing
                    nobody comes here to do. */}
                <OrganizerEventCards
                  events={mine}
                  selectedId={selectedId}
                  // Two things, deliberately separate. The auto-select effect below calls `select`
                  // alone — folding the sheet into it meant landing on the dashboard popped a
                  // modal nobody asked for.
                  onSelect={(id) => {
                    select(id);
                    setManageTab("data");
                    setManaging(id);
                  }}
                />

                <Analytics events={mine} />
              </div>
            </div>

            {/* "管理活动" opens this rather than appending four panels to the dashboard.
                Everything about one event was stacked under the grid, so the page grew a second
                page's worth of content that only made sense after a click — and the click that
                produced it was two screens above what it produced. A sheet keeps the dashboard
                about all the events and this about one. */}
            {managing && (
              <Sheet
                title={selected?.listing.title || t("common.eventNumber", { id: managing.toString() })}
                sub={t("organizer.manageSub")}
                onClose={() => setManaging(null)}
                wide
              >
                <div className="space-y-4">
                  <div className="flex gap-1 border-b border-line">
                    {(
                      [
                        ["data", "organizer.manageData"],
                        ["edit", "organizer.manageEdit"],
                      ] as const
                    ).map(([key, label]) => {
                      const on = manageTab === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setManageTab(key)}
                          aria-current={on ? "page" : undefined}
                          className={`relative flex min-h-[46px] items-center px-3.5 text-[15px] transition-colors ${
                            on ? "font-medium text-fg" : "text-dim hover:text-fg"
                          }`}
                        >
                          {t(label)}
                          {on && (
                            <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-accent" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {manageTab === "data" ? (
                    <div className="space-y-4">
                      <EventManagement
                        event={mine?.find((e) => e.id === managing) ?? null}
                        loading={!mine}
                      />
                      <LivePulse eventId={managing} live={selected?.phase === "live"} />
                    </div>
                  ) : (
                    <SelectedEvent
                      ev={ev}
                      refresh={refresh}
                      selectedId={managing}
                      title={selected?.listing.title}
                    />
                  )}
                </div>
              </Sheet>
            )}
          </div>
        )}

        {/* Creating an event deploys this on demand, so most organizers never meet it — "deploy a
            contract" is our infrastructure problem, not something to put in front of somebody who
            wanted to invite people to a reading group.
            But it is no longer only about listings: the profile form writes to this contract too,
            and somebody who wants a profile before they want an event had no way to get one. The
            component already renders nothing unless the directory is genuinely missing, so the
            `devMode` gate around it was redundant — and it was what kept the button off production
            entirely, which is why this had been stuck. */}
        <DeployDirectory />
      </IdentityGate>
      )}

      <p className="text-[14px] leading-relaxed text-faint md:max-w-[70ch]">
        {t("organizer.footNote")}
      </p>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*                          Which half is showing                     */
/* ------------------------------------------------------------------ */

/// `?tab=create`, both ways.
///
/// The sidebar hands the create flow over through the query string — see the NAV table in
/// AppShell — and by the time somebody clicks it this page is already mounted, so the soft
/// navigation changes the URL and nothing re-reads it. `useSearchParams` would notice, but under
/// `output: export` it forces a Suspense boundary around the page, which trades a working nav item
/// for a skeleton in the prerendered HTML on every load. Watching the string directly is cheaper
/// than one render and costs the build nothing.
///
/// Starts as `null` so the first client render matches the export, which has no query string at
/// all; the caller treats that as the dashboard.
function useUrlTab(): ["dashboard" | "create", (to: "dashboard" | "create") => void] {
  const [tab, setTab] = useState<"dashboard" | "create" | null>(null);

  useEffect(() => {
    const read = () =>
      setTab(
        new URLSearchParams(window.location.search).get("tab") === "create" ? "create" : "dashboard",
      );
    // Mount is the earliest point `window.location` is knowable.
    read();
    // Covers the browser's own back button. The interval covers next/link, which pushes state
    // without firing an event anybody outside the router can hear.
    window.addEventListener("popstate", read);
    const id = setInterval(read, 300);
    return () => {
      window.removeEventListener("popstate", read);
      clearInterval(id);
    };
  }, []);

  const goTo = useCallback((to: "dashboard" | "create") => {
    // `push`, not `replace`: leaving the create form should be one Back press, not a trip off the
    // page — somebody halfway through the rules step who taps back means "show me the list again".
    // Edited rather than rebuilt, so `?event=` survives a trip through the create form and back.
    const params = new URLSearchParams(window.location.search);
    if (to === "create") params.set("tab", "create");
    else params.delete("tab");
    const qs = params.toString();
    window.history.pushState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    setTab(to);
  }, []);

  return [tab ?? "dashboard", goTo];
}

/* ------------------------------------------------------------------ */
/*                                KPIs                                */
/* ------------------------------------------------------------------ */

/// The four numbers across the top, aggregated over every event this address created.
///
/// The V3 render fills them with 482 registrations and 4,820 MON. The testnet has one event and a
/// couple of people in it, so the cards are built to look composed at single digits: one column
/// width, one type size, and a caption line that is always there — a card whose caption vanishes
/// when the count is zero is what makes a quiet dashboard look broken rather than early.
/// The organizer chrome: the sheet's horizontal bar across the top, and the page under it.
///
/// This replaced a left sidebar. The sidebar was not wrong on its own, but the dashboard sheet
/// draws a top bar — and the participant screens already wear one, so the sidebar was also the
/// moment the product stopped looking like one product. It is the single largest difference
/// between the sheet and what shipped, and补块 was never going to close it: it is the skeleton,
/// not a block.
///
/// `titleEn` is the sheet's companion label in the Chinese UI. The English UI hides it rather than
/// repeating the same title twice with slightly different spelling.
function Frame({
  title,
  titleEn,
  subtitle,
  action,
  showHeading = true,
  children,
}: {
  title: string;
  titleEn?: string;
  subtitle?: string;
  action?: React.ReactNode;
  showHeading?: boolean;
  children: React.ReactNode;
}) {
  const { lang } = useLang();
  return (
    <div className={`${organizerStyles.shell} min-h-dvh overflow-x-hidden`}>
      <div className="mx-auto w-full max-w-[1540px] px-4 sm:px-6 md:px-[17px]">
        <TopNav page={showHeading ? title : undefined} compact />
        <main className={`flex min-w-0 flex-col gap-5 pb-16 pt-5 md:gap-6 ${showHeading ? "md:pt-7" : "md:pt-4"}`}>
          {showHeading && (
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h1
                  className="bg-clip-text pb-[0.1em] text-[29px] font-extrabold leading-[1.05] text-transparent md:text-[34px]"
                  style={{
                    fontFamily: '"Montserrat", var(--font-sans)',
                    backgroundImage:
                      "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
                  }}
                >
                  {title}
                </h1>
                {titleEn && lang === "zh" && (
                  <span className="text-[16px] font-medium text-faint md:text-[18px]">
                    {titleEn}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-[15px] leading-relaxed text-dim md:max-w-[58ch]">{subtitle}</p>
              )}
            </div>
            {action && <div className="flex shrink-0 flex-col sm:items-start">{action}</div>}
          </header>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

/// The greeting band from the dashboard sheet.
///
/// Its artwork is the same clip the landing page runs, held still: a second video on a screen
/// somebody is working on is motion competing with a task. The two buttons are the sheet's.
///
/// `who` is null for a visitor who has not signed in. The band still renders — this is the block
/// that tells anybody opening the link what the page is for, and hiding it behind sign-in meant a
/// stranger's first view of the organizer side was a warning and an email field.
function GreetingBanner({ who, onCreate }: { who: string | null; onCreate: () => void }) {
  const t = useT();
  return (
    // A masthead, not a banner card. The artwork stays and washes out of the page's own darkness;
    // what goes is the box that made a greeting look like a widget.
    <section className="relative overflow-hidden border-b border-line pb-8 pt-2 md:pb-10">
      <div
        aria-hidden
        // 55% and flush to the edges, which is how the sheet sets it — the artwork is half the
        // band, not a thumbnail floated in the corner. The fade starts at 30% so the picture is
        // still a picture where it meets the words rather than a wash.
        className="pointer-events-none absolute inset-0 left-auto w-full bg-cover bg-[68%_center] opacity-35 sm:w-[76%] sm:opacity-55 lg:w-[64%] lg:bg-center lg:opacity-95"
        style={{
          // A composite built for this band: the stage, the organizer with a laptop, and the
          // handwritten lines — the three elements the dashboard sheet draws. Assembled from
          // artwork the product already had (`hero`, `door-host`, `script-showup`) rather than
          // left as the bare stage photo, which was the single biggest thing still reading as
          // "a different design" when the sheet and the screenshot were put side by side.
          backgroundImage: `url(${basePath}/organizer-banner.webp)`,
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 30%)",
          maskImage: "linear-gradient(to right, transparent 0%, #000 30%)",
        }}
      />
      <div className="relative max-w-[520px]">
        <p className="text-[16px] text-accent-2 md:text-[26px]">
          {who ? t(greetingKey(), { who }) : t("organizer.bannerGuest")}
        </p>
        <h2
          className="mt-2 max-w-[400px] bg-clip-text pb-[0.1em] text-[30px] font-extrabold leading-[1.08] text-transparent md:text-[56px]"
          style={{
            fontFamily: '"Montserrat", var(--font-sans)',
            backgroundImage:
              "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
          }}
        >
          {t("organizer.bannerTitle")}
        </h2>
        {/* The sheet's English line under the headline — "Create events. Verify real people.
            Build stronger communities." It is part of the type setting, not a translation. */}
        <p className="mt-3 text-[16px] leading-snug text-accent-2 md:text-[21px]">
          Create events. Verify real people.
          <br />
          Build stronger communities.
        </p>
        <p className="mt-2 text-[16px] leading-relaxed text-dim md:hidden">{t("organizer.bannerBody")}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Button onClick={onCreate} className="md:min-h-[54px] md:min-w-[240px] md:text-[18px]">+ {t("nav.createEvent")}</Button>
          <Link
            href="/events"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/20 bg-transparent px-5 text-[16px] text-fg transition-colors hover:border-accent/60 hover:bg-white/[0.04] md:min-h-[54px] md:min-w-[230px] md:text-[18px]"
          >
            {t("organizer.seeAllEvents")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Kpis({ events, t }: { events: EventSummary[] | null; t: TFn }) {
  const totals = useMemo(() => {
    if (!events) return null;
    return {
      count: events.length,
      live: events.filter((e) => e.phase === "live").length,
      registered: events.reduce((n, e) => n + e.registered, 0),
      confirmed: events.reduce((n, e) => n + e.confirmed, 0),
      // Deposits taken on events the contract still holds money for. Settled and cancelled events
      // are excluded because their balance is being claimed out from under this number as people
      // withdraw, and a figure that drifts down for reasons nobody can see is worse than one that
      // only counts what is unambiguously still committed.
      escrowed: events
        .filter((e) => e.status === 0)
        .reduce((sum, e) => sum + e.deposit * BigInt(e.registered), 0n),
    };
  }, [events]);

  return (
    // The sheet's four tiles, in its order: what is running now, who the room has vouched for,
    // what the contract is holding, who has signed up. Its third and fourth are "已发放奖励" and
    // "社区评分 4.8" — a reward pool this contract has no concept of, and a rating nothing in this
    // product collects. The two that replace them are the two figures an organizer actually has.
    <div className="grid grid-cols-2 gap-y-8 border-b border-line py-9 lg:grid-cols-4">
      <Kpi
        icon="live"
        label={t("organizer.liveEvents")}
        value={totals && `${totals.live}`}
        sub={totals ? t("organizer.ofNTotal", { n: totals.count }) : ""}
      />
      <Kpi
        icon="verified"
        label={t("organizer.confirmedPresent")}
        value={totals && `${totals.confirmed}`}
        sub={t("organizer.peerVerified")}
      />
      <Kpi
        icon="escrow"
        label={t("organizer.heldInEscrow")}
        // `mon()` prints sub-unit amounts to four places, which is right for a gas figure and
        // wrong for a card that will read "0.0000 MON" on an evening where nobody has registered
        // yet. Zero is zero. On mainnet `fiat()` already formats it as currency.
        value={totals && (totals.escrowed === 0n && !fiatAvailable ? "0 MON" : fiat(totals.escrowed))}
        sub={t("organizer.notInYourWallet")}
      />
      <Kpi
        icon="registered"
        label={t("organizer.registered")}
        value={totals && `${totals.registered}`}
        sub={t("organizer.acrossAllEvents")}
      />
    </div>
  );
}

/// The sheet gives every tile a tinted round icon. It is not decoration at this size: four cards
/// of identical dark grey with a number in each is a row somebody's eye slides off, and the icon
/// is what makes "which one was the money" answerable without reading the captions again.
const KPI_ICONS: Record<string, { path: string; tone: string }> = {
  live: { path: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", tone: "bg-accent text-white shadow-[0_0_16px_rgba(116,88,255,0.32)]" },
  verified: { path: "m9 12 2 2 4-4M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z", tone: "bg-info text-white shadow-[0_0_16px_rgba(69,186,255,0.26)]" },
  escrow: { path: "M3 8h18M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2M3 8v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8M16 13h2", tone: "bg-warn text-[#241300] shadow-[0_0_16px_rgba(255,191,95,0.24)]" },
  registered: { path: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11h4M19 9v4", tone: "bg-ok text-[#03271d] shadow-[0_0_16px_rgba(67,224,178,0.22)]" },
};

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: keyof typeof KPI_ICONS;
  label: string;
  value: string | null;
  sub: string;
}) {
  const { path, tone } = KPI_ICONS[icon];
  return (
    // Icon and figure on one line, label underneath — the sheet's arrangement. Icon-and-label on
    // one line with the number below made the number the third thing read on a card whose entire
    // job is the number.
    // Four figures on the canvas, divided by a hairline. Four bordered tiles in a row is the
    // house style of every admin dashboard ever shipped, and these are not controls — they are the
    // state of everything this organizer runs.
    <div className="min-w-0 px-1 md:px-7 md:first:pl-0 md:[&+&]:border-l md:[&+&]:border-line">
      <div className="flex items-baseline gap-2.5">
        <span aria-hidden className={`hidden shrink-0 self-center ${tone.split(" ")[0]} sm:block`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {/* `break-words` on the value, not truncation: "4,820 MON" wrapping onto two lines is
            legible and an ellipsis in the middle of an amount is not. */}
        <p className="min-w-0 break-words text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] tabular-nums md:text-[40px]">
          {value ?? <Skeleton className="h-7 w-16 align-middle" />}
        </p>
      </div>
      <p className="mt-2.5 text-[14px] leading-snug text-dim">{label}</p>
      {/* Green, per the render — and it is the right green by the spec's own rule: every one of
          these captions is a fact read off the chain rather than a hopeful label. */}
      <p className="mt-1 text-[14px] text-ok">{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                       The event being operated                     */
/* ------------------------------------------------------------------ */

/// The rules, the clock, and the two controls that exist — description, and the fallback branch.
///
/// This is the half of the old dashboard that the table does not replace. The table says which
/// events exist; this says what the selected one is doing right now, which is what somebody
/// standing at the door needs.
function SelectedEvent({
  ev,
  refresh,
  selectedId,
  title,
}: {
  ev: EventInfo | null;
  refresh: () => Promise<void>;
  selectedId: bigint | null;
  /// From the directory, if the organizer ever wrote one. Absent is normal, not an error.
  title?: string;
}) {
  const { signer } = useIdentity();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const readFallback = useCallback(() => {
    if (!hasDeployment) return;
    void publicClient
      .readContract({ address: ESCROW_ADDRESS, abi, functionName: "fallbackAvailable", args: [eventId()] })
      .then(setFallbackOpen)
      .catch(() => {});
  }, []);

  useEffect(readFallback, [readFallback, selectedId]);
  useVisiblePoll(readFallback, 8000);

  // Nothing to load when nothing is picked. This used to render "Loading event…" directly under
  // "You have not created any events yet" — two boxes contradicting each other on the first screen
  // a new organizer ever sees.
  if (selectedId === null) return null;
  if (!ev) return <Card framed={false}><p className="text-[15px] text-dim">{t("organizer.loadingEvent")}</p></Card>;

  const phase = phaseOf(ev);
  const isMine = signer?.address.toLowerCase() === ev.organizer.toLowerCase();
  const endsIn = Number(ev.attestClose) - Math.floor(chainNowMs() / 1000);

  return (
    <div className="space-y-4">
      {!isMine && (
        <Notice tone="warn">
          {t("organizer.readOnly", { who: shortAddress(ev.organizer) })}
        </Notice>
      )}

      <Card framed={false} className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="min-w-0 text-[22px] font-medium tracking-[-0.01em]">
            {title || t("common.eventNumber", { id: selectedId?.toString() ?? "…" })}
          </h2>
          {/* Walk-ins make these two separate facts, and an organizer watching the room wants both:
              how long is left, and whether the door is still letting people in. */}
          <p className="text-[15px] text-dim">
            {phase === "open"
              ? `${t("organizer.checkingInEndsIn", { t: countdown(endsIn) })}${canRegister(ev) ? t("organizer.stillWalkIns") : ""}`
              : phase === "registering"
                ? t("organizer.registeringUntil", {
                    time: new Date(Number(ev.registerDeadline) * 1000).toLocaleTimeString(),
                  })
                : phase === "waiting"
                  ? t("organizer.waitingDoors")
                  : phase === "closed"
                    ? t("organizer.checkInClosed")
                    : t("common.loading")}
          </p>
        </div>

        <dl className="space-y-2 text-[15px]">
          <Row label={t("organizer.depositPer")} value={both(ev.deposit)} />
          <Row
            label={t("organizer.registered")}
            value={t("organizer.ofPlaces", { n: ev.registered, cap: ev.capacity })}
          />
          <Row
            label={t("organizer.confirmedPresent")}
            value={t("organizer.vouchesEach", { n: ev.confirmed, k: ev.k })}
          />
          <Row
            label={t("organizer.runsIfAtLeast")}
            value={t("organizer.nRegister", { n: ev.minQuorum })}
          />
          <Row
            label={t("organizer.status")}
            value={
              [t("organizer.statusOpen"), t("organizer.statusCancelled"), t("organizer.settled")][
                ev.status
              ] ?? "?"
            }
          />
        </dl>

        {/* The display has to be reachable from here. It used to be a URL you typed from memory, on
            the one screen where the organizer is already standing. */}
        {/* `py-2.5 -my-2.5` on the two links: the hit box reaches 44px without the sentence
            growing a line. A link inside prose cannot be a 44px block without wrecking the
            paragraph, and these two are pressed standing up at a venue door. */}
        <p className="text-[14px] leading-relaxed text-faint">
          <Link
            href="/venue"
            className="-my-3 inline-block py-3 underline decoration-line-2 underline-offset-4"
          >
            {t("venue.openDisplay")}
          </Link>{" "}
          {t("organizer.venueNote")}{" "}
          <Link
            href="/verify"
            className="-my-3 inline-block py-3 underline decoration-line-2 underline-offset-4"
          >
            {t("organizer.publicRecord")}
          </Link>
          {t("organizer.venueNoteEnd")}
        </p>
      </Card>

      {notice && <Notice tone="bad">{notice}</Notice>}

      {/* Only the organizer can write it, and the contract enforces that too — showing the form to
          anyone else would be offering a button that reverts. */}
      {isMine && <EditListing />}

      {fallbackOpen && isMine && (
        <div className="space-y-2 rounded-2xl border border-warn/30 bg-warn/10 p-4">
          <h3 className="text-[16px] font-medium text-warn">{t("organizer.fallbackTitle")}</h3>
          <p className="text-[14px] leading-relaxed text-warn/90">{t("organizer.fallbackBody")}</p>
          <p className="text-[14px] leading-relaxed text-warn/70">{t("organizer.fallbackHint")}</p>
          <FallbackForm
            onDone={async () => {
              await refresh();
              setNotice(null);
            }}
            setBusy={setBusy}
            setNotice={setNotice}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}

function FallbackForm({
  onDone,
  setBusy,
  setNotice,
  busy,
}: {
  onDone: () => Promise<void>;
  setBusy: (s: string | null) => void;
  setNotice: (s: string | null) => void;
  busy: string | null;
}) {
  const { signer } = useIdentity();
  const t = useT();
  const [text, setText] = useState("");

  async function submit() {
    const list = text
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s));
    if (!list.length) return setNotice(t("organizer.noValidAddresses"));
    setBusy(t("organizer.confirming"));
    setNotice(null);
    try {
      const hash = await signer!.write({
        functionName: "organizerCheckIn",
        args: [eventId(), list as `0x${string}`[]],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setText("");
      await onDone();
    } catch (e) {
      setNotice(shortenError(e, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="0x…"
        className="w-full rounded-lg border border-warn/40 bg-ink p-2 font-mono text-xs text-fg"
      />
      <button
        onClick={() => void submit()}
        disabled={!!busy}
        className="min-h-[44px] rounded-lg bg-warn px-3 text-[14px] font-medium text-ink disabled:opacity-40"
      >
        {busy ?? t("organizer.confirmAttendees")}
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*                             Create event                           */
/* ------------------------------------------------------------------ */

/// The four steps of the create sheet, in its order. Its third is 奖励与资金 — money paid *to*
/// attendees out of a pool the organizer funds — and this contract has no such pool. What it does
/// have is the deposit, which is the only money in the product, so the step keeps its position and
/// changes its subject rather than being dropped and leaving a three-step flow the sheet does not
/// draw.
/// Where a half-filled create form lives between visits.
///
/// Local, not on chain: nothing here has been paid for yet, and a draft is not a fact about the
/// world — it is one person's unfinished sentence. The sheet puts a "保存草稿" button at the top of
/// step one, which is the honest scope for it.
///
/// Restored on mount rather than saved on every keystroke. Autosave would be fine, but the sheet
/// draws a button and a button is better here: it tells somebody the form is safe to leave, which
/// an invisible autosave never does.
const DRAFT_KEY = "peerproof.create.draft";

type Draft = {
  title: string;
  blurb: string;
  venue: string;
  tags: string;
  cover: string;
  url: string;
  deposit: string;
  capacity: string;
  minQuorum: string;
  k: string;
  startAt: string;
  runsMins: string;
  walkIns: boolean;
};

function readDraft(): Partial<Draft> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Draft>) : null;
  } catch {
    // Private browsing, or a draft written by an older shape of this form. Either way, start
    // clean rather than crashing the one screen that creates events.
    return null;
  }
}

/// The default start: the next quarter hour at least half an hour out, as a `datetime-local` value.
///
/// Not "now". An event whose doors open the instant it is created cannot be registered for, and the
/// contract rejects a window that has already begun — so the default has to be far enough ahead to
/// be usable and round enough to read as a suggestion rather than a timestamp.
function defaultStart() {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  // `toISOString` is UTC and `datetime-local` is not, so the offset has to come off first or the
  // field opens showing a time several hours from the one just computed.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/// How far ahead the chosen start is, for the timeline preview. Clamped at zero: a start in the
/// past draws a timeline running backwards, and the submit path already refuses it.
function minutesUntil(startAt: string) {
  const ms = new Date(startAt).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60_000)) : 0;
}

function formatStart(startAt: string, lang: string) {
  const d = new Date(startAt);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(lang === "zh" ? "zh-CN" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/// Everything the escrow refuses, checked here first and said in words.
///
/// `createEvent` reverts with a bare `BadParams()` for eight different reasons, and the form used
/// to let somebody walk all four steps, sign, pay gas, and receive that. Worse, two of its refusals
/// are reachable by filling the form exactly as suggested: a start time that was in the future when
/// it was typed and in the past by the time the fourth step was reached, and a minimum that equals
/// the vouches needed.
///
/// Returns a dictionary key, or null when the contract will take it.
function whyNotValid(v: {
  deposit: string;
  capacity: string;
  minQuorum: string;
  k: string;
  startAt: string;
  runsMins: string;
  walkIns: boolean;
}): string | null {
  const deposit = Number(v.deposit);
  const capacity = Number(v.capacity);
  const minQuorum = Number(v.minQuorum);
  const k = Number(v.k);
  const runs = Number(v.runsMins);
  const openMs = new Date(v.startAt).getTime();

  if (!(deposit > 0)) return "create.badDeposit";
  if (!Number.isInteger(capacity) || capacity < 1) return "create.badCapacity";
  if (!Number.isInteger(k) || k < 1) return "create.badK";
  if (!Number.isInteger(minQuorum) || minQuorum < 1) return "create.badQuorum";
  if (minQuorum > capacity) return "create.quorumOverCapacity";
  if (minQuorum <= k) return "create.quorumUnderK";
  if (!Number.isFinite(openMs)) return "create.badStart";
  if (!(runs > 0)) return "create.badRuns";

  const closeMs = openMs + runs * 60_000;
  if (closeMs <= Date.now()) return "create.startInPast";
  // Without walk-ins registration shuts when the doors open, so a start that has already passed
  // leaves nobody any time to register — which is the one configuration the contract calls out.
  if (!v.walkIns && openMs <= Date.now()) return "create.openPastNoWalkIns";
  return null;
}

const STEPS = ["about", "verify", "money", "publish"] as const;
type Step = (typeof STEPS)[number];

/// The sheet's English second line under each step name.
const STEP_EN: Record<Step, string> = {
  about: "Tell Your Story",
  verify: "Verification Rules",
  money: "Deposit & Places",
  publish: "Preview & Launch",
};

const STEP_LABEL: Record<Step, string> = {
  about: "create.stepAbout",
  verify: "create.stepVerify",
  money: "create.stepMoney",
  publish: "create.stepPublish",
};

function CreateForm({ onCreated, onDone }: { onCreated: () => Promise<void>; onDone: () => void }) {
  const { signer } = useIdentity();
  const { t, lang } = useLang();
  const [deposit, setDeposit] = useState("30");
  const [capacity, setCapacity] = useState("40");
  const [minQuorum, setMinQuorum] = useState("10");
  const [k, setK] = useState("3");
  // Expressed the way somebody plans an event, not the way the contract stores it: when the doors
  // open, how long it runs, and whether people can still join once it has started.
  /// When the doors open, as a wall-clock moment in the organizer's own timezone.
  ///
  /// This was "minutes from now", which is the shape the contract wants — it stores absolute
  /// seconds and the form computed them at submit. But nobody planning an evening thinks "in 2,880
  /// minutes"; they think "Thursday, 7pm". Minutes was a demo affordance that survived into the
  /// part of the product somebody would actually use.
  const [startAt, setStartAt] = useState(() => defaultStart());
  const [savedDraft, setSavedDraft] = useState(false);
  const [runsMins, setRunsMins] = useState("180");
  const [walkIns, setWalkIns] = useState(true);
  // Four steps, as the create sheet draws them. Its third is 奖励与资金 — a reward pool this
  // contract has no concept of — but the money in this product is the deposit, so that step keeps
  // its place and its subject changes to the thing that is actually financial here.
  const [step, setStep] = useState<Step>("about");
  const [tags, setTags] = useState("");
  const [cover, setCover] = useState("");
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [url, setUrl] = useState("");
  const [venue, setVenue] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState(() => t("create.creating"));
  const [notice, setNotice] = useState<string | null>(null);

  // Restored once, at mount. `localStorage` does not exist during the static export, so this
  // cannot be a lazy initialiser on each field.
  useEffect(() => {
    const d = readDraft();
    if (!d) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (d.title) setTitle(d.title);
    if (d.blurb) setBlurb(d.blurb);
    if (d.venue) setVenue(d.venue);
    if (d.tags) setTags(d.tags);
    if (d.cover) setCover(d.cover);
    if (d.url) setUrl(d.url);
    if (d.deposit) setDeposit(d.deposit);
    if (d.capacity) setCapacity(d.capacity);
    if (d.minQuorum) setMinQuorum(d.minQuorum);
    if (d.k) setK(d.k);
    // A start time from last week is worse than the default — it is a value the contract will
    // reject, restored silently into a field somebody may not look at again.
    if (d.startAt && new Date(d.startAt).getTime() > Date.now()) setStartAt(d.startAt);
    if (d.runsMins) setRunsMins(d.runsMins);
    if (typeof d.walkIns === "boolean") setWalkIns(d.walkIns);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const saveDraft = () => {
    const draft: Draft = {
      title, blurb, venue, tags, cover, url,
      deposit, capacity, minQuorum, k, startAt, runsMins, walkIns,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setSavedDraft(true);
      setTimeout(() => setSavedDraft(false), 2000);
    } catch {
      // Nothing to tell anybody: the form is still on screen and still works.
    }
  };

  const [created, setCreated] = useState<{ id: bigint; beacon: string } | null>(null);

  async function submit() {
    if (!signer) return;
    // Re-checked at the press, not only at render: the clock moves between the fourth step being
    // reached and the button being pressed, and "the doors already opened" is exactly the failure
    // that takes a minute of form-filling to reach.
    const stop = whyNotValid({ deposit, capacity, minQuorum, k, startAt, runsMins, walkIns });
    if (stop) {
      setNotice(t(stop));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // Descriptions live in a second contract. Whether it exists yet is our problem, not the
      // organizer's — so if it does not, deploy it as part of this action rather than putting a
      // "deploy a contract" button in front of somebody who wanted to create an event.
      const wantsWords = !!(title || blurb || url || venue || tags || cover);
      if (wantsWords && !(await checkDirectory())) {
        setBusyLabel(t("listing.settingUp"));
        await deployDirectory(signer.sendRaw);
      }
      setBusyLabel(t("create.creating"));
      // The venue display's key. Generated fresh per event and handed to the device at the door;
      // it signs beacons and nothing else, so it never needs funding.
      const beaconPk = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("")}` as `0x${string}`;
      const { privateKeyToAccount } = await import("viem/accounts");
      const beacon = privateKeyToAccount(beaconPk);

      const now = BigInt(Math.floor(chainNowMs() / 1000));
      // `datetime-local` has no timezone, so `Date.parse` reads it in the browser's — which is the
      // one the organizer typed it in. The contract stores UTC seconds either way.
      const attestOpen = BigInt(Math.floor(new Date(startAt).getTime() / 1000));
      const attestClose = attestOpen + BigInt(Number(runsMins) * 60);
      // The only window the contract refuses is one that has already finished. Doors opening right
      // now is legitimate — and it is what somebody setting up a long-running event wants, so that
      // people can start vouching the moment it exists. This used to require a start in the future,
      // which was a rule the frontend invented.
      if (!Number.isFinite(Number(attestOpen)) || attestClose <= now) {
        setNotice(t("create.startInPast"));
        setBusy(false);
        return;
      }
      // Walk-ins keep registration open until the event ends. Without them it closes when the
      // doors do, which is the classic RSVP shape — the organizer picks.
      const regDeadline = walkIns ? attestClose : attestOpen;

      const hash = await signer.write({
        functionName: "createEvent",
        args: [
          beacon.address,
          parseEther(deposit),
          Number(capacity),
          Number(minQuorum),
          Number(k),
          regDeadline,
          attestOpen,
          attestClose,
        ],
        gas: GAS_LIMITS.createEvent,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(t("create.reverted"));

      const next = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi,
        functionName: "nextEventId",
      })) as bigint;
      const id = next - 1n;
      setCreated({ id, beacon: beaconPk });
      // The draft has become an event. Leaving it behind would re-fill the form the next time
      // somebody opens it, with the details of something that already exists.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* nothing to do */
      }

      // A second transaction, deliberately. The escrow stores nothing but the fields that decide
      // where money goes, so the description lives in EventDirectory — and an event that exists
      // without a description is a listing that reads badly, not a broken event. Failing here must
      // not look like the event failed.
      if (wantsWords) {
        try {
          setBusyLabel(t("create.savingDescription"));
          // One named struct, not six positional strings — the positional form is what let two
          // call sites keep passing five arguments after the function grew a sixth, and viem
          // refuses to encode that, so every listing write failed before reaching the chain.
          const listing = { title, blurb, url, venue, tags, cover };
          await signer.write({
            functionName: "describe",
            args: [id, listing],
            gas: await estimatedGas(
              {
                to: directoryAddress(),
                abi: eventDirectoryAbi,
                functionName: "describe",
                args: [id, listing],
                account: signer.address,
              },
              offlineDescribeGas(title, blurb, url, venue, tags, cover),
            ),
            to: directoryAddress(),
            abi: eventDirectoryAbi,
          });
          setNotice(null);
        } catch (e) {
          setNotice(t("create.descriptionFailed", { why: shortenError(e, t) }));
        }
      }
      await onCreated();
    } catch (e) {
      setNotice(shortenError(e, t));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card framed={false} className="space-y-3">
        <h3 className="text-[18px] font-medium">
          {t("create.createdTitle", { id: created.id.toString() })}
        </h3>
        <p className="text-[15px] leading-relaxed text-dim">{t("create.beaconBody")}</p>
        <CopyableCode value={created.beacon} tone="ok" />
        <p className="text-[14px] text-faint">{t("create.beaconWarning")}</p>
        <VenueHandoff beaconPk={created.beacon} />
        {/* The description is a second transaction and it can fail on its own. This card used to
            not render `notice` at all, so when it did fail the message was written to state nobody
            displayed: an event appeared with no title and no explanation, and no way to fix it. */}
        {notice && <Notice tone="warn">{notice}</Notice>}
        {notice && (
          <p className="text-[14px] leading-relaxed text-faint">
            {t("create.descriptionFailedNote")}
          </p>
        )}
        <Button onClick={onDone} variant="ghost">
          ← {t("create.backToEvents")}
        </Button>
      </Card>
    );
  }

  const invalid = whyNotValid({ deposit, capacity, minQuorum, k, startAt, runsMins, walkIns });

  // Any edit clears the last failure. A red "BadParams" left sitting under a form somebody has
  // since corrected is worse than no message: it says the thing in front of them is still wrong.
  const edited = <T,>(set: (v: T) => void) => (v: T) => {
    setNotice(null);
    set(v);
  };
  const stepIndex = STEPS.indexOf(step);
  const go = (by: number) => setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, stepIndex + by))]);

  return (
    // A rail on the left and the current step on the right, which is what the create sheet draws.
    // Four stacked panels with everything visible at once was the old shape, and the financial
    // rules — the part that locks forever — competed for attention with the title field.
    <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start">
      {/* Horizontal and scrollable on a phone, vertical beside the form on a desktop. A four-item
          vertical rail on a 390px screen costs 200px before the first field. */}
      <ol className={`${organizerStyles.stepRail} -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:space-y-1 lg:px-0`}>
        {STEPS.map((name, i) => {
          const done = i < stepIndex;
          const here = i === stepIndex;
          return (
            <li key={name} className="shrink-0 lg:w-full">
              <button
                type="button"
                // Backwards only. Skipping ahead would let somebody land on "publish" without the
                // deposit being set, and the numbers it reviews would be defaults they never saw.
                onClick={() => i < stepIndex && setStep(name)}
                disabled={i > stepIndex}
                // The selected step has to win at a glance. It was a 15% accent wash behind the
                // same grey text as its neighbours — two of the three signals the design uses
                // (fill, border, text weight) were missing, so the row read as four identical
                // items with a slightly different background on one.
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left transition-colors ${
                  here
                    ? "bg-accent/16 shadow-[inset_3px_0_0_var(--color-accent)]"
                    : done
                      ? "hover:bg-white/[0.035]"
                      : ""
                } ${i > stepIndex ? "cursor-default" : ""}`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[14px] font-semibold ${
                    here
                      ? "border-accent-2 bg-accent text-white shadow-[0_0_0_4px_rgba(110,84,255,0.18)]"
                      : done
                        ? "border-ok/50 bg-ok/15 text-ok"
                        : "border-line-2 bg-raised text-faint"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                {/* Bilingual, as the sheet sets them: 活动基础信息 / Tell Your Story. */}
                <span className="min-w-0">
                  {/* Semibold on the current step, medium on the rest. The whole rail was one
                      weight, which left colour doing all the work at 15% opacity. */}
                  <span
                    className={`block whitespace-nowrap text-[15.5px] ${
                      here ? "font-semibold text-fg" : done ? "font-medium text-dim" : "font-medium text-faint"
                    }`}
                  >
                    {t(STEP_LABEL[name])}
                  </span>
                  <span
                    className={`hidden whitespace-nowrap text-[12.5px] lg:block ${
                      here ? "text-accent-2" : "text-faint"
                    }`}
                  >
                    {STEP_EN[name]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 space-y-4">
        <section className={`${organizerStyles.formPanel} space-y-4 p-4 md:p-6 ${step === "about" ? "" : "hidden"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[22px] font-medium tracking-tight">{t("create.aboutTitle")} ✨</p>
              <p className="mt-1 text-[15px] text-dim">{t("create.aboutSub")}</p>
            </div>
            {/* Top right of step one, where the sheet puts it. */}
            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-white/10 bg-white/[0.02] px-4 text-[15px] text-dim transition-colors hover:border-accent/60 hover:bg-white/[0.04] hover:text-fg"
            >
              {savedDraft ? t("create.draftSaved") : t("create.saveDraft")}
            </button>
          </div>
          {/* First in step one, where the sheet puts the cover. */}
          <CoverField value={cover} onChange={edited(setCover)} />
          <Field label={t("listing.title")} value={title} onChange={edited(setTitle)} hint={t("listing.titleHint")} />
          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[14px] uppercase tracking-wide text-faint">
                {t("listing.description")}
              </span>
              {/* The sheet's counter. A limit nobody can see is a limit that stops your sentence
                  mid-word. */}
              <span className="text-[13px] tabular-nums text-faint">{blurb.length}/600</span>
            </span>
            <textarea
              value={blurb}
              onChange={(e) => edited(setBlurb)(e.target.value)}
              rows={4}
              maxLength={600}
              placeholder={t("listing.blurbPlaceholder")}
              className="w-full rounded-xl border border-line-2 bg-ink px-3.5 py-3 text-[16px] text-fg"
            />
          </label>
          <Field label={t("listing.venue")} value={venue} onChange={edited(setVenue)} hint={t("listing.venueHint")} />
          {/* The sheet's 线上活动 toggle, sitting with the place it replaces. It writes the word
              rather than setting a flag: the contract has no notion of online, and a listing that
              says "Online" is the same fact expressed in the one field that exists. */}
          <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
            <input
              type="checkbox"
              checked={venue.trim() === t("listing.online")}
              onChange={(e) => edited(setVenue)(e.target.checked ? t("listing.online") : "")}
              className="h-4 w-4 accent-accent"
            />
            <span className="text-dim">{t("listing.onlineEvent")}</span>
          </label>
          {/* Chips, as the sheet draws them. Stored as the same comma-separated string either way —
              this is a way of typing it, not a different shape on chain. */}
          <TagInput value={tags} onChange={edited(setTags)} />
          <Field label={t("listing.link")} value={url} onChange={edited(setUrl)} hint={t("listing.linkHint")} />
          {/* Not a block. An event with no title is a legitimate thing to create — the escrow does
              not need one — but it is listed to strangers as "Event #7", and finding that out on
              the events page is too late. */}
          {!title.trim() && <p className="text-[14px] text-faint">{t("listing.noTitleWarn")}</p>}
        </section>

        <section className={`${organizerStyles.formPanel} space-y-4 p-4 md:p-6 ${step === "verify" ? "" : "hidden"}`}>
          <div>
            <p className="text-[22px] font-medium tracking-tight">{t("create.verifyTitle")}</p>
            <p className="mt-1 text-[15px] text-dim">{t("create.verifySub")}</p>
          </div>
          {/* The sheet offers four methods — wallet, on-site check-in, geolocation, peer vouching —
              with toggles. This contract has one: people in the room sign for each other. Drawing
              three switches that do nothing would be the single most dishonest thing on a screen
              whose product is "you do not have to trust the organizer". So the one that exists is
              stated as what it is, and its parameter is the question. */}
          <div className="border-l-2 border-accent bg-accent/[0.07] px-4 py-3.5">
            <p className="text-[16px] font-medium">{t("create.methodPeer")}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-dim">{t("create.methodPeerBody")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label={t("create.vouchesNeeded")} value={k} onChange={edited(setK)} hint={t("create.kHint")} />
            <label className="block">
              <span className="mb-1.5 block text-[14px] uppercase tracking-wide text-faint">
                {t("create.startAt")}
              </span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => edited(setStartAt)(e.target.value)}
                className="min-h-[46px] w-full rounded-xl border border-line-2 bg-ink px-3.5 text-[16px] text-fg outline-none focus:border-accent"
              />
              <span className="mt-1.5 block text-[14px] text-faint">{t("create.startHint")}</span>
            </label>
            <Field label={t("create.runsMins")} value={runsMins} onChange={edited(setRunsMins)} hint={t("create.runsHint")} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-ink/45 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <input
              type="checkbox"
              checked={walkIns}
              onChange={(e) => edited(setWalkIns)(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span className="text-[15px] leading-relaxed">
              <span className="font-medium text-fg">{t("create.walkIns")}</span>
              <span className="block text-dim">
                {walkIns ? t("create.walkInsOnBody") : t("create.walkInsOffBody")}
              </span>
            </span>
          </label>
          <EventTimeline
            doorsMins={minutesUntil(startAt)}
            runsMins={Number(runsMins) || 0}
            walkIns={walkIns}
          />
        </section>

        <section className={`${organizerStyles.formPanel} space-y-4 p-4 md:p-6 ${step === "money" ? "" : "hidden"}`}>
          <div>
            <p className="text-[22px] font-medium tracking-tight">{t("create.moneyTitle")}</p>
            <p className="mt-1 text-[15px] text-dim">{t("create.moneySub")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label={t("create.deposit")} value={deposit} onChange={edited(setDeposit)} hint={fiat(parseEther(deposit || "0"))} />
            <Field label={t("create.capacity")} value={capacity} onChange={edited(setCapacity)} />
            <Field label={t("organizer.runsIfAtLeast")} value={minQuorum} onChange={edited(setMinQuorum)} hint={t("create.quorumHint")} />
          </div>
          <p className="text-[14px] leading-relaxed text-faint">{t("create.noCustodyNote")}</p>
        </section>

        <section className={`${organizerStyles.formPanel} space-y-4 p-4 md:p-6 ${step === "publish" ? "" : "hidden"}`}>
          <div>
            <p className="text-[22px] font-medium tracking-tight">{t("create.publishTitle")}</p>
            <p className="mt-1 text-[15px] text-dim">{t("create.publishSub")}</p>
          </div>
          {/* Everything back, in one place, before the irreversible press. The numbers below are
              fixed at creation — the contract has no function that changes any of them — so this is
              the last screen on which a typo is cheap. */}
          <dl className="divide-y divide-white/[0.055] rounded-lg bg-ink/45 px-4 py-2">
            <Row label={t("listing.title")} value={title || t("create.untitled")} />
            {venue && <Row label={t("listing.venue")} value={venue} />}
            {tags && <Row label={t("listing.tags")} value={tags} />}
            <Row label={t("create.deposit")} value={`${deposit} MON`} />
            <Row label={t("create.capacity")} value={capacity} />
            <Row label={t("organizer.runsIfAtLeast")} value={minQuorum} />
            <Row label={t("create.vouchesNeeded")} value={k} />
            <Row label={t("create.startAt")} value={formatStart(startAt, lang)} />
            <Row label={t("create.runsMins")} value={runsMins} />
            <Row label={t("create.walkIns")} value={t(walkIns ? "common.yes" : "common.no")} />
          </dl>
          {invalid ? (
            <Notice tone="warn">{t(invalid)}</Notice>
          ) : (
            <p className="text-[14px] leading-relaxed text-faint">{t("create.lockedNote")}</p>
          )}
        </section>

        {notice && <Notice tone="bad">{notice}</Notice>}

        <div className="flex gap-2.5">
          {stepIndex > 0 && (
            <Button onClick={() => go(-1)} variant="ghost" disabled={busy}>
              ← {t("common.back")}
            </Button>
          )}
          {step === "publish" ? (
            <Button onClick={() => void submit()} disabled={busy || !!invalid} className="flex-1">
              {busy ? busyLabel : t("nav.createEvent")}
            </Button>
          ) : (
            <Button onClick={() => go(1)} className="flex-1">
              {t("create.nextStep", { name: t(STEP_LABEL[STEPS[stepIndex + 1]]) })} →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right text-dim">{value}</dd>
    </div>
  );
}
