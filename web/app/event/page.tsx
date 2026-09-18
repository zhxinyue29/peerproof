"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Hex } from "viem";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useIdentity } from "@/components/IdentityProvider";
import IdentityGate from "@/components/IdentityGate";
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
  const { ev, me, refresh, error: readError } = useEvent(signer?.address ?? null);
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

        {/* No image exists to put here. The escrow stores numbers and the directory stores words;
            stock photography would be the one thing on this page that nothing backs. A gradient keyed
            to the event id gives the page a face while staying honest — and makes the same event
            recognisable between the listing card and this screen, because both derive it the same way.
            TODO: move to lib/cover.ts, which another agent owns, once it lands. */}
        <div
          aria-hidden
          className="h-[170px] shrink-0 rounded-2xl border border-line md:h-[210px]"
          style={{ background: cover(eventId()) }}
        />

        <div className="space-y-2">
          {/* 28/34px from the V3 type scale, matching AppShell's own heading. Rendered here rather
              than through its `title` prop because the cover band has to come first. */}
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[34px] md:tracking-[-0.03em]">
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
                <p className="font-mono text-[13px] text-faint">
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

/// A band of colour per event, derived from its id.
///
/// Duplicated from the listing page on purpose and temporarily: `lib/cover.ts` is being written to
/// own this, and the two must agree or the same event changes colour between the card somebody
/// tapped and the page it opened. Delete this the moment that module exists.
const HUES = [258, 292, 212, 168, 24, 340];
function cover(id: bigint): string {
  const h = HUES[Number(id % BigInt(HUES.length))];
  return `linear-gradient(125deg, hsl(${h} 62% 18%), hsl(${h} 72% 44%) 52%, hsl(${(h + 34) % 360} 48% 14%))`;
}

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
      <div className="mt-2 break-words text-[13px] leading-snug text-dim md:text-[14px]">{label}</div>
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
            <DetailRow
              term={
                <span className="tabular-nums">
                  {ev.registered} / {ev.capacity}
                </span>
              }
              detail={t("event.spotsTaken")}
            />
          </>
        )}
      </dl>
    </section>
  );
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
