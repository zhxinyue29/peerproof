"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import AppShell from "@/components/AppShell";
import IdentityGate from "@/components/IdentityGate";
import GateIntro from "@/components/GateIntro";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button, Card, CopyableCode, Field, Notice, Skeleton } from "@/components/ui";
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
import { useT, type TFn } from "@/lib/i18n";
import { canRegister, phaseOf, useEvent, type EventInfo } from "@/lib/useEvent";
import { readAllEvents, type EventSummary } from "@/lib/events";
import { useVisiblePoll } from "@/lib/poll";
import { checkDirectory, deployDirectory, describeGas, directoryAddress } from "@/lib/directory";
import { eventDirectoryAbi } from "@/lib/directoryArtifact";
import DeployDirectory from "@/components/DeployDirectory";
import EditListing from "@/components/EditListing";
import EventsTable from "@/components/EventsTable";
import EventTimeline from "@/components/EventTimeline";
import LivePulse from "@/components/LivePulse";
import VenueHandoff from "@/components/VenueHandoff";

/// The organizer's screen, rebuilt to `04-organizer-dashboard-*.png`.
///
/// Two things about it are load-bearing rather than decorative. It reads *every* event this address
/// created, not the one the build points at — an organizer who ran three nights had no way to see
/// the first two. And the payouts panel is still an absence: a dashed note saying the contract
/// settles itself, sitting where a product with an escape hatch would put the button.
export default function OrganizerPage() {
  const t = useT();
  const { signer, devMode } = useIdentity();
  const { ev, refresh } = useEvent(signer?.address ?? null);
  const [tab, goTo] = useUrlTab();
  const [all, setAll] = useState<EventSummary[] | null>(null);

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
      window.history.replaceState(null, "", `${window.location.pathname}?event=${id}`);
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

  if (!hasDeployment) {
    return (
      <AppShell nav="organizer" active="overview" title={t("organizer.title")} langSwitcher={<LanguageSwitcher />}>
        <Notice>{t("common.noContract")}</Notice>
      </AppShell>
    );
  }

  return (
    <AppShell
      nav="organizer"
      active={creating ? "create" : "overview"}
      title={creating ? t("nav.createEvent") : t("organizer.title")}
      subtitle={creating ? t("create.subtitle") : t("organizer.subtitle")}
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
      langSwitcher={<LanguageSwitcher />}
    >
      {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}

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
            {/* The greeting band from the dashboard sheet. Its artwork is the same clip the landing
                page runs, held still: a second video on a screen somebody is working on is motion
                competing with a task. The two buttons are the sheet's, and both already existed —
                this only gives them the place the design puts them. */}
            <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 md:p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-[44%] bg-cover bg-center opacity-60 lg:block"
                style={{
                  backgroundImage: `url(${basePath}/hero.webp)`,
                  WebkitMaskImage: "linear-gradient(to right, transparent, #000 58%)",
                  maskImage: "linear-gradient(to right, transparent, #000 58%)",
                }}
              />
              <div className="relative max-w-[42ch]">
                <p className="text-[15px] text-dim">
                  {t("organizer.greeting", { who: signer?.label ?? shortAddress(signer?.address ?? "0x") })}
                </p>
                <h2
                  className="mt-2 bg-clip-text pb-[0.1em] text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] text-transparent md:text-[36px]"
                  style={{
                    fontFamily: '"Montserrat", var(--font-sans)',
                    backgroundImage:
                      "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
                  }}
                >
                  {t("organizer.bannerTitle")}
                </h2>
                <p className="mt-2 text-[16px] leading-relaxed text-dim">{t("organizer.bannerBody")}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button onClick={() => goTo("create")}>+ {t("nav.createEvent")}</Button>
                  <Link
                    href="/events"
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-line-2 px-5 text-[16px] text-dim transition-colors hover:border-accent hover:text-fg"
                  >
                    {t("organizer.seeAllEvents")}
                  </Link>
                </div>
              </div>
            </section>

            <Kpis events={mine} t={t} />

            {/* The split is composed here rather than handed to AppShell's `aside`, which spans the
                whole of `children` — that would push the KPI band into the narrow column and leave
                each card about 140px wide at the width the renders were drawn at. The band is
                full-bleed in `04-organizer-dashboard-desktop.png`, above both columns. */}
            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start lg:gap-6">
              <div className="min-w-0 space-y-5">
                <EventsTable events={mine} selectedId={selectedId} onSelect={select} />
                <SelectedEvent
                  ev={ev}
                  refresh={refresh}
                  selectedId={selectedId}
                  title={selected?.listing.title}
                />
              </div>
              <div className="min-w-0 lg:sticky lg:top-9">
                <LivePulse eventId={selectedId} live={selected?.phase === "live"} />
              </div>
            </div>
          </div>
        )}

        {/* Dev only. Creating an event deploys this on demand, so an organizer never meets it —
            "deploy a contract" is our infrastructure problem, not something to put in front of
            somebody who wanted to invite people to a reading group. */}
        {devMode && <DeployDirectory />}
      </IdentityGate>

      <p className="text-[14px] leading-relaxed text-faint md:max-w-[70ch]">
        {t("organizer.footNote")}
      </p>
    </AppShell>
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
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      <Kpi
        label={t("organizer.yourEvents")}
        value={totals && `${totals.count}`}
        sub={totals ? t("organizer.liveNow", { n: totals.live }) : ""}
      />
      <Kpi
        label={t("organizer.registered")}
        value={totals && `${totals.registered}`}
        sub={t("organizer.acrossAllEvents")}
      />
      <Kpi
        label={t("organizer.heldInEscrow")}
        // `mon()` prints sub-unit amounts to four places, which is right for a gas figure and
        // wrong for a card that will read "0.0000 MON" on an evening where nobody has registered
        // yet. Zero is zero. On mainnet `fiat()` already formats it as currency.
        value={totals && (totals.escrowed === 0n && !fiatAvailable ? "0 MON" : fiat(totals.escrowed))}
        sub={t("organizer.notInYourWallet")}
      />
      <Kpi
        label={t("organizer.confirmedPresent")}
        value={totals && `${totals.confirmed}`}
        sub={t("organizer.peerVerified")}
      />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | null; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 md:p-5">
      <p className="text-[14px] text-dim">{label}</p>
      {/* `break-words` on the value, not truncation: "4,820 MON" wrapping onto two lines is legible
          and an ellipsis in the middle of an amount is not. */}
      <p className="mt-1.5 break-words text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums md:text-[32px]">
        {value ?? <Skeleton className="h-7 w-16 align-middle" />}
      </p>
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

  if (!ev) return <Card><p className="text-[15px] text-dim">{t("organizer.loadingEvent")}</p></Card>;

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

      <Card className="space-y-4">
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
        <p className="text-[14px] leading-relaxed text-faint">
          <Link href="/venue" className="underline decoration-line-2 underline-offset-4">
            {t("venue.openDisplay")}
          </Link>{" "}
          {t("organizer.venueNote")}{" "}
          <Link href="/verify" className="underline decoration-line-2 underline-offset-4">
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

function CreateForm({ onCreated, onDone }: { onCreated: () => Promise<void>; onDone: () => void }) {
  const { signer } = useIdentity();
  const t = useT();
  const [deposit, setDeposit] = useState("30");
  const [capacity, setCapacity] = useState("40");
  const [minQuorum, setMinQuorum] = useState("10");
  const [k, setK] = useState("3");
  // Expressed the way somebody plans an event, not the way the contract stores it: when the doors
  // open, how long it runs, and whether people can still join once it has started.
  const [doorsMins, setDoorsMins] = useState("30");
  const [runsMins, setRunsMins] = useState("180");
  const [walkIns, setWalkIns] = useState(true);
  const [step, setStep] = useState<"about" | "rules">("about");
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState(() => t("create.creating"));
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: bigint; beacon: string } | null>(null);

  async function submit() {
    if (!signer) return;
    setBusy(true);
    setNotice(null);
    try {
      // Descriptions live in a second contract. Whether it exists yet is our problem, not the
      // organizer's — so if it does not, deploy it as part of this action rather than putting a
      // "deploy a contract" button in front of somebody who wanted to create an event.
      const wantsWords = !!(title || blurb || url);
      if (wantsWords && !(await checkDirectory())) {
        setBusyLabel(t("listing.settingUp"));
        await deployDirectory(signer.address);
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
      const attestOpen = now + BigInt(Number(doorsMins) * 60);
      const attestClose = attestOpen + BigInt(Number(runsMins) * 60);
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

      // A second transaction, deliberately. The escrow stores nothing but the fields that decide
      // where money goes, so the description lives in EventDirectory — and an event that exists
      // without a description is a listing that reads badly, not a broken event. Failing here must
      // not look like the event failed.
      if (wantsWords) {
        try {
          setBusyLabel(t("create.savingDescription"));
          await signer.write({
            functionName: "describe",
            // No venue field in the create flow yet — the listing editor on the event page
            // has one, and an empty string here is what every listing described before tonight
            // already reads as.
            args: [id, title, blurb, url, ""],
            gas: describeGas(title, blurb, url),
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
      <Card className="space-y-3">
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

  return (
    <div className="space-y-3">
      {/* Two steps rather than two stacked panels. Everything was visible at once, so the financial
          rules — the part that locks forever — competed for attention with the title field. One
          question at a time, and the irreversible one on its own screen. */}
      <div className="flex gap-2">
        {(["about", "rules"] as const).map((sName, i) => (
          <div key={sName} className="flex flex-1 items-center gap-2.5">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[14px] ${
                step === sName
                  ? "border-accent-2 bg-accent text-white"
                  : "border-line-2 bg-raised text-faint"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-[15px] ${step === sName ? "text-fg" : "text-faint"}`}>
              {sName === "about" ? t("create.stepAbout") : t("create.stepRules")}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {/* Description first. Somebody creating an event thinks about what it is before they think
            about deposit mechanics, and a form that opens with six numbers reads as a config screen
            rather than a way to invite people. */}
        <section className={`space-y-2.5 rounded-2xl border border-line bg-panel p-4 md:p-5 ${step === "about" ? "" : "hidden"}`}>
          <div>
            <p className="text-[22px] font-medium tracking-tight">{t("create.aboutTitle")}</p>
            <p className="mt-1 text-[15px] text-dim">{t("create.aboutSub")}</p>
          </div>
          <Field
            label={t("listing.title")}
            value={title}
            onChange={setTitle}
            hint={t("listing.titleHint")}
          />
          <label className="block">
            <span className="mb-1.5 block text-[14px] uppercase tracking-wide text-faint">
              {t("listing.description")}
            </span>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder={t("listing.blurbPlaceholder")}
              className="w-full rounded-xl border border-line-2 bg-ink px-3.5 py-3 text-[16px] text-fg"
            />
          </label>
          <Field
            label={t("listing.link")}
            value={url}
            onChange={setUrl}
            hint={t("listing.linkHint")}
          />
        </section>

        {step === "about" && (
          <Button onClick={() => setStep("rules")} className="w-full">
            {t("create.next")}
          </Button>
        )}

        <section className={`space-y-3 rounded-2xl border border-line bg-panel p-4 md:p-5 ${step === "rules" ? "" : "hidden"}`}>
          <div>
            <p className="text-[22px] font-medium tracking-tight">{t("create.rulesTitle")}</p>
            <p className="mt-1 text-[15px] font-medium text-dim">{t("create.rulesSub")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label={t("create.deposit")} value={deposit} onChange={setDeposit} hint={fiat(parseEther(deposit || "0"))} />
            <Field label={t("create.capacity")} value={capacity} onChange={setCapacity} />
            <Field label={t("organizer.runsIfAtLeast")} value={minQuorum} onChange={setMinQuorum} hint={t("create.quorumHint")} />
            <Field label={t("create.vouchesNeeded")} value={k} onChange={setK} hint={t("create.kHint")} />
            <Field label={t("create.doorsMins")} value={doorsMins} onChange={setDoorsMins} hint={t("create.doorsHint")} />
            <Field label={t("create.runsMins")} value={runsMins} onChange={setRunsMins} hint={t("create.runsHint")} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-ink p-3.5">
            <input
              type="checkbox"
              checked={walkIns}
              onChange={(e) => setWalkIns(e.target.checked)}
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
            doorsMins={Number(doorsMins) || 0}
            runsMins={Number(runsMins) || 0}
            walkIns={walkIns}
          />

          <p className="text-[14px] leading-relaxed text-faint">{t("create.noCustodyNote")}</p>
        </section>

        {notice && <Notice tone="bad">{notice}</Notice>}

        {step === "rules" && (
          <div className="flex gap-2.5">
            <Button onClick={() => setStep("about")} variant="ghost" disabled={busy}>
              ← {t("common.back")}
            </Button>
            <Button onClick={() => void submit()} disabled={busy} className="flex-1">
              {busy ? busyLabel : t("nav.createEvent")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right text-dim">{value}</dd>
    </div>
  );
}
