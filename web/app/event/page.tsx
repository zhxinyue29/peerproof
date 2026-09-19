"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Hex } from "viem";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useIdentity } from "@/components/IdentityProvider";
import IdentityGate from "@/components/IdentityGate";
import EventCover from "@/components/EventCover";
import Funding, { needFor } from "@/components/Funding";
import RegisteredResult from "@/components/RegisteredResult";
import { Accordion, Button, LinkButton, Notice, Sheet, Skeleton } from "@/components/ui";
import { chainNowMs, eventId, GAS_LIMITS, hasDeployment, isLocalChain, publicClient } from "@/lib/chain";
import { countdown, mon, shortAddress, shortenError } from "@/lib/format";
import { useLang, type TFn } from "@/lib/i18n";
import { canRegister, phaseOf, projectedPayout, useEvent, type EventInfo } from "@/lib/useEvent";
import { useEventMeta } from "@/lib/eventMeta";

/// One event: what it is, what it costs, and the way in.
///
/// Lives at /event rather than / because the two roles needed separating. An organizer who pressed
/// back landed in the participants' listing, full of other people's events, with no way back to
/// their own — so / is now a door marked with which of the two you are, and this is what a
/// participant finds behind theirs.
///
/// V3 reorders rather than rewrites. The first decision unit is event → deposit → who holds it →
/// join; the mechanism that used to sit between somebody and that decision is still here, a tap
/// away, in the same words. Nothing on this screen is invented: the chain has no venue, no photo
/// and no category, so the cover is a colour and the detail panel says only what the two contracts
/// actually know.
export default function EventPage() {
  const { signer, signOut } = useIdentity();
  const { ev, me, refresh, error: readError, missing, sample } = useEvent(signer?.address ?? null);
  const router = useRouter();
  const { t, lang } = useLang();
  // The app's language, not the browser's: somebody who switched to Chinese on an
  // English-locale laptop was still reading "Thu, Sep 4" on this row.
  const locale = lang === "zh" ? "zh-CN" : "en-GB";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState<Hex | null>(null);
  const [joining, setJoining] = useState(false);

  const phase = phaseOf(ev);
  // Not `phase === "registering"`: with walk-ins a room that is already checking people in
  // is still taking them, and asking the phase hid the button for the entire event.
  const joinable = canRegister(ev);
  const meta = useEventMeta(eventId());

  async function register() {
    if (!signer || !ev) return;
    setBusy(true);
    setError(null);
    try {
      // The attest key, not the participant address: on the wallet path these differ, and the
      // contract verifies rotating codes against whatever is registered here.
      const hash = await signer.write({
        functionName: "register",
        args: [eventId(), signer.attest.address],
        value: ev.deposit,
        gas: GAS_LIMITS.register,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(t("event.revertedOnChain"));
      // Shown once, here, rather than as a permanent banner: it is an account of a transaction
      // that just happened, and on the next visit the ordinary "You're in" state is the truth.
      setJustRegistered(hash);
      await refresh();
    } catch (e) {
      setError(shortenError(e, t));
    } finally {
      setBusy(false);
    }
  }

  if (!hasDeployment) {
    return (
      <AppShell
        nav="participant"
        active="events"
        title={t("common.noContract")}
        langSwitcher={<LanguageSwitcher />}
      >
        <Notice>
          {t("event.runDevChain")} <code className="text-fg">scripts/dev-chain.sh</code>
          {t("event.runDevChainEnd")}
        </Notice>
      </AppShell>
    );
  }

  // Said outright rather than rendered as zeroes. Before this the page drew a whole event out of
  // an empty struct — 0.0000 MON held by the contract, a window on the 1st of January 1970, "this
  // event is full" under nought of nought places — which is the one thing this product must never
  // do, on the one page that exists to say it doesn't.
  if (missing) {
    return (
      <AppShell nav="participant" active="events" langSwitcher={<LanguageSwitcher />}>
        <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 md:p-9">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-10 hidden h-[280px] w-[400px] opacity-[0.18] md:block"
          >
            <EventCover id={0n} nodes={9} bare className="h-full w-full" />
          </span>
          <div className="relative max-w-[52ch] space-y-3">
            <h1 className="text-[24px] font-semibold md:text-[28px]">{t("event.noSuchTitle")}</h1>
            <p className="text-[16px] leading-relaxed text-dim">{t("event.noSuchBody")}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <LinkButton href="/events">{t("nav.events")}</LinkButton>
              <Link
                href="/organizer"
                className="inline-flex min-h-[44px] items-center rounded-xl border border-line-2 px-4 text-[16px] text-dim transition-colors hover:border-accent hover:text-fg"
              >
                {t("events.createFirst")}
              </Link>
            </div>
          </div>
        </section>
      </AppShell>
    );
  }

  const surplus = ev ? projectedPayout(ev) - ev.deposit : 0n;

  return (
    <AppShell
      nav="participant"
      // Not a nav destination of its own. An event belongs to the directory you reached it from,
      // and leaving every item unlit on a screen you arrived at by tapping "Events" reads as
      // having fallen out of the app.
      active="events"
      aside={<Details ev={ev} />}
      langSwitcher={<LanguageSwitcher />}
    >
      {/* AppShell's own column spacing stops at the edge of the aside grid — inside it, children
          are a plain block. The rhythm below is this page's to keep. */}
      <div className="flex min-w-0 flex-col gap-5 md:gap-6">
        {/* Said once, at the top, before anything below it is read.
            Everything on this screen — the deposit, the count, the window, the rules — is a literal
            from lib/sampleEvents. None of it is on any chain. On a product whose whole argument is
            that you do not have to take anyone's word for it, an invented event that does not admit
            it would be the worst thing here; an admitted one is a mockup, which is what every empty
            state in every product is. */}
        {sample && <Notice tone="warn">{t("events.sampleDetail")}</Notice>}
        {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}

        {/* The sidebar and the mobile pill row both lead back to the directory, so this is a
            convenience rather than the only way out — hence the weight of a footnote. */}
        <Link
          href="/events"
          className="-mb-2 inline-flex min-h-[44px] w-fit items-center gap-1.5 text-[14px] text-faint hover:text-dim"
        >
          <span aria-hidden>‹</span>
          {t("common.back")}
        </Link>

        {/* Drawn, not fetched — see EventCover. Denser here than on a card because this surface is
            several times the area, and six points on it read as an accident rather than a figure. */}
        <EventCover
          id={eventId()}
          nodes={11}
          className="h-[170px] shrink-0 rounded-2xl border border-line md:h-[210px]"
        />

        <div className="space-y-2">
          {/* 28/34px from the V3 type scale, matching AppShell's own heading. Rendered here rather
              than through its `title` prop because the cover band has to come first. */}
          {/* Same treatment as the listing and the landing page. A detail page whose title is set
              in the plain body face, one click after a headline with light running across it, reads
              as a different product's screen. */}
          <h1
            className="bg-clip-text pb-[0.1em] text-[30px] font-extrabold leading-[1.06] tracking-[-0.03em] text-transparent md:text-[40px] md:leading-[1.02]"
            style={{
              fontFamily: '"Montserrat", var(--font-sans)',
              backgroundImage:
                "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
            }}
          >
            {meta.title}
          </h1>
          {meta.blurb && <p className="text-[16px] leading-relaxed text-dim md:max-w-[58ch]">{meta.blurb}</p>}
        </div>

        {/* One unit, because it is one argument: this is the amount, and this is who holds it.
            Split across two cards it was two facts; together it is the reason to keep reading. The
            spec calls this weld out by name, so the two never get separated by a breakpoint either —
            the row stays a row at every width and the sentence wraps instead. */}
        <section
          aria-label={t("event.deposit")}
          className="flex items-center gap-4 rounded-2xl border border-line-2 bg-gradient-to-br from-accent/15 to-ok/[0.06] p-5 md:gap-5 md:p-6"
        >
          <p className="whitespace-nowrap text-[32px] font-extrabold leading-none tracking-tight tabular-nums md:text-[38px]">
            {ev ? mon(ev.deposit) : <Skeleton className="h-8 w-32 align-middle" />}
          </p>
          {/* `break-words` so a four-figure deposit on a 320px phone breaks the sentence rather than
              the row: the weld is the point, and a flex child that cannot shrink would push the card
              sideways instead. */}
          <p className="min-w-0 break-words text-[15px] font-medium leading-snug md:text-[16px]">
            {t("event.heldBy")}
            <span className="mt-0.5 block font-normal text-dim">{t("event.notByOrganizer")}</span>
          </p>
        </section>

        {/* Three numbers, left-aligned under their values the way the render shows them. `capacity`
            is deliberately not folded in here as "128/200" — how full the room is belongs next to the
            rest of the logistics, in the detail panel, and a fraction reads as a ratio to reach
            rather than as a count of people. */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <StatTile value={ev && `${ev.registered}`} label={t("event.registered")} />
          <StatTile value={ev && `${ev.k}`} label={t("event.vouchesNeededLbl")} />
          <StatTile value={ev && `${ev.minQuorum}`} label={t("event.minimumToRun")} />
        </div>

        {justRegistered && ev ? (
          <RegisteredResult
            deposit={ev.deposit}
            hash={justRegistered}
            opensIn={Number(ev.attestOpen) - Math.floor(chainNowMs() / 1000)}
            vouchesNeeded={ev.k}
            onContinue={() => router.push("/floor")}
          />
        ) : me?.registered ? (
          <div className="space-y-3">
            <Notice tone="ok">{t("event.youreIn")}</Notice>
            <LinkButton href="/floor">
              {phase === "open" ? t("event.goToFloor") : t("event.openMyCode")}
            </LinkButton>
          </div>
        ) : joinable ? (
          /* Signed in: the button is the whole thing. Not signed in: the button opens the
             sheet, and the three ways to sign in appear at the moment they become a question
             somebody is asking — not while they are still deciding whether to come. */
          <div className="space-y-3">
            {error && <Notice tone="bad">{error}</Notice>}
            {!error && readError && (
              <Notice tone="warn">{t("event.cantReach", { why: readError })}</Notice>
            )}
            {ev && me && signer && (
              <Funding
                need={needFor(ev.deposit, GAS_LIMITS.register)}
                have={me.balance}
                what={t("funding.whatRegister")}
                address={signer.address}
              />
            )}
            <Button
              onClick={() => (signer ? void register() : setJoining(true))}
              disabled={
                busy || !ev || (!!signer && (!me || me.balance < needFor(ev.deposit, GAS_LIMITS.register)))
              }
              className="w-full"
            >
              {busy
                ? t("event.staking")
                : ev
                  ? t("event.stakeAndRegister", { amount: mon(ev.deposit) })
                  : t("common.loading")}
            </Button>
            {signer ? (
              <div className="space-y-1 text-[14px] text-dim">
                <p>
                  {t("event.signedInLabel")}{" "}
                  <span className="font-medium text-fg">
                    {signer.label ?? shortAddress(signer.address)}
                  </span>{" "}
                  ·{" "}
                  <button
                    type="button"
                    onClick={signOut}
                    className="underline decoration-line-2 hover:text-fg"
                  >
                    {t("event.useDifferentAccount")}
                  </button>
                </p>
                {/* The balance is what the button above disables on. Left unsaid, a greyed-out
                    primary action has no explanation anywhere on the screen. */}
                <p className="font-mono text-[14px] text-faint">
                  {t("event.walletBalance", {
                    address: shortAddress(signer.address),
                    balance: me ? mon(me.balance) : "—",
                  })}
                </p>
              </div>
            ) : (
              <p className="text-[14px] text-dim">
                {t("event.chooseSignIn")}{" "}
                <span className="text-accent-2">{t("event.noWalletPlugin")}</span>
              </p>
            )}
          </div>
        ) : (
          <Notice>
            {ev && ev.registered >= ev.capacity
              ? t("event.full")
              : t("event.registrationClosed")}
          </Notice>
        )}

        {/* The case for the mechanism, in the same words as before, one tap away instead of
            between somebody and the decision they came to make. */}
        <div>
          <Accordion title={t("event.howTitle")} sub={t("event.howSub")}>
            <p>{t("event.howP1")}</p>
            <p>{t("event.howP2")}</p>
            <p>{t("event.howP3")}</p>
          </Accordion>
          <Accordion title={t("event.depositTitle")} sub={t("event.depositSub")}>
            <p>
              {t("event.depositP1")}
              {ev && ev.confirmed > 0 && surplus > 0n ? (
                <> {t("event.surplusAbout")}{" "}
                <span className="font-medium tabular-nums">{mon(surplus)}</span>{" "}
                {t("event.surplusAtCount")}</>
              ) : null}
              {t("event.depositP1End")}
            </p>
            <p>{t("event.depositP2")}</p>
            <p>{t("event.depositP3")}</p>
          </Accordion>
          {/* A link wearing the accordion's clothes. It sits in the same stack because it answers the
              same kind of question, but there is nothing to expand — the answer is another screen,
              and the arrow says so. */}
          <Link
            href="/verify"
            className="flex min-h-[58px] items-center justify-between gap-4 border-b border-line py-3"
          >
            <span>
              <span className="block text-[16px] font-medium">{t("event.publicProof")}</span>
              <span className="mt-0.5 block text-[14px] text-dim">
                {t("event.publicProofSub")}
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-faint">
              ↗
            </span>
          </Link>
        </div>
      </div>

      {joining && !signer && (
        <Sheet
          title={t("event.signInSheetTitle")}
          sub={t("event.signInSheetSub")}
          onClose={() => setJoining(false)}
        >
          <IdentityGate>
            <p className="text-[15px] text-dim">{t("event.signedInPressAgain")}</p>
          </IdentityGate>
        </Sheet>
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// Left-aligned, unlike `ui.tsx`'s centred `Stat`. Three of these sit in a row under a left-aligned
/// headline and a left-aligned deposit; centring the numbers put a third ragged edge in a column
/// that has only two.
function StatTile({ value, label }: { value: string | null; label: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel/70 p-3.5 md:p-4">
      <div className="text-[24px] font-semibold leading-none tabular-nums md:text-[27px]">
        {value || <Skeleton className="h-6 w-10 align-middle" />}
      </div>
      {/* `dim`, not `faint` — the spec keeps low-contrast grey for optional metadata, and a number
          without its unit is not information. */}
      <div className="mt-2 break-words text-[14px] leading-snug text-dim md:text-[14px]">{label}</div>
    </div>
  );
}

/// The logistics panel. Everything in it is read off the escrow, which is why there is no address
/// line: the chain has never been told where the event is.
function Details({ ev }: { ev: EventInfo | null }) {
  const { t, lang } = useLang();
  // The app's language, not the browser's: somebody who switched to Chinese on an
  // English-locale laptop was still reading "Thu, Sep 4" on this row.
  const locale = lang === "zh" ? "zh-CN" : "en-GB";

  return (
    <section className="rounded-2xl border border-line bg-panel p-5 md:p-[22px]">
      <h2 className="text-[16px] font-semibold">{t("event.details")}</h2>
      <dl className="mt-4 space-y-4">
        {!ev ? (
          <>
            <DetailRow term={<Skeleton className="h-4 w-36" />} detail={<Skeleton className="h-3.5 w-28" />} />
            <DetailRow term={<Skeleton className="h-4 w-24" />} detail={<Skeleton className="h-3.5 w-40" />} />
            <DetailRow term={<Skeleton className="h-4 w-20" />} detail={<Skeleton className="h-3.5 w-24" />} />
          </>
        ) : (
          <>
            <DetailRow term={window_(ev, t, locale)} detail={doorsLine(ev, t, locale)} />
            <DetailRow
              term={walkIns(ev) ? t("event.walkInsOn") : t("event.walkInsOff")}
              detail={joinUntil(ev, t, locale)}
            />
            {/* How full the room is, as a bar rather than only as a fraction.
                "128 / 200" is a fact you have to do arithmetic on; the bar is the same fact read at
                a glance, which is what somebody deciding whether to stake a deposit is actually
                asking. Both are kept — the numbers stay exact underneath.
                The second, brighter segment is `confirmed`: people the room has already vouched
                for. It is the only figure on this page that cannot be produced by signing up, so
                it is worth seeing grow separately from the ones who merely registered. */}
            <li className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium tabular-nums">
                  {ev.registered} / {ev.capacity}
                </span>
                <span className="text-[13px] text-faint">{t("event.spotsTaken")}</span>
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
                role="img"
                aria-label={`${ev.registered} / ${ev.capacity}`}
              >
                <div className="flex h-full w-full">
                  <span
                    className="h-full bg-ok"
                    style={{ width: `${pct(ev.confirmed, ev.capacity)}%` }}
                  />
                  <span
                    className="h-full bg-accent"
                    style={{ width: `${pct(ev.registered - ev.confirmed, ev.capacity)}%` }}
                  />
                </div>
              </div>
              {ev.confirmed > 0 && (
                <p className="mt-1.5 text-[13px] text-ok">
                  {ev.confirmed} {t("event.confirmedPresentShort")}
                </p>
              )}
            </li>
          </>
        )}
      </dl>
    </section>
  );
}

/// Clamped, and never divided by a zero capacity. An uncapped event has `capacity` 0, and a bar
/// that renders NaN% collapses to nothing — which looks exactly like an empty room.
function pct(n: number, of: number) {
  if (!of) return 0;
  return Math.max(0, Math.min(100, (n / of) * 100));
}

function DetailRow({ term, detail }: { term: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[15px] font-semibold leading-snug md:text-[16px]">{term}</dt>
      <dd className="mt-0.5 text-[14px] leading-snug text-dim md:text-[15px]">{detail}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                         Reading the clock                          */
/* ------------------------------------------------------------------ */

/// Absolute times, not a countdown. A countdown answers "how long", and somebody deciding whether
/// to come is asking "when" — they have an evening to fit this into.
///
/// Rendered in the reader's own locale and zone, because the escrow stores UTC seconds and nobody
/// plans a Thursday in UTC. Safe against hydration mismatch only because `ev` is null on the first
/// render: these strings never exist in the prerendered HTML.
function clock(sec: bigint, locale: string): string {
  return new Date(Number(sec) * 1000).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/// "Today" beats a date somebody has to check against their own calendar. Past tomorrow the date is
/// the only thing that can be right, so it takes over.
function day(sec: bigint, t: TFn, locale: string): string {
  const d = new Date(Number(sec) * 1000);
  const days = Math.round((midnight(d) - midnight(new Date(chainNowMs()))) / 86_400_000);
  if (days === 0) return t("event.today");
  if (days === 1) return t("event.tomorrow");
  if (days === -1) return t("event.yesterday");
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

/// The check-in window, which is the event as far as the contract is concerned. Trailing underscore
/// because `window` is taken by something rather more important.
function window_(ev: EventInfo, t: TFn, locale: string): string {
  const open = new Date(Number(ev.attestOpen) * 1000);
  const close = new Date(Number(ev.attestClose) * 1000);
  // An event that runs past midnight needs both dates or the window reads as ending before it
  // starts.
  return midnight(open) === midnight(close)
    ? `${day(ev.attestOpen, t, locale)} · ${clock(ev.attestOpen, locale)}–${clock(ev.attestClose, locale)}`
    : `${day(ev.attestOpen, t, locale)} ${clock(ev.attestOpen, locale)} – ${day(ev.attestClose, t, locale)} ${clock(ev.attestClose, locale)}`;
}

function doorsLine(ev: EventInfo, t: TFn, locale: string): string {
  const now = Math.floor(chainNowMs() / 1000);
  const untilDoors = Number(ev.attestOpen) - now;
  if (untilDoors > 0) return t("event.doorsOpenIn", { time: countdown(untilDoors) });
  return now < Number(ev.attestClose) ? t("event.checkInOpenNow") : t("event.checkInClosed");
}

/// Walk-ins are not a flag on chain — they are the organizer having set the registration deadline
/// past the moment the doors open. See the create flow, which writes it that way.
function walkIns(ev: EventInfo): boolean {
  return ev.registerDeadline > ev.attestOpen;
}

function joinUntil(ev: EventInfo, t: TFn, locale: string): string {
  if (!walkIns(ev)) return t("event.registrationClosesAtDoors");
  return ev.registerDeadline >= ev.attestClose
    ? t("event.joinUntilClose")
    : t("event.joinUntilTime", { time: clock(ev.registerDeadline, locale) });
}
