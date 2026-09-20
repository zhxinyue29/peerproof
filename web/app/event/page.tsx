"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Hex } from "viem";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import HowItWorksModal from "@/components/HowItWorksModal";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useIdentity } from "@/components/IdentityProvider";
import IdentityGate from "@/components/IdentityGate";
import EventCover from "@/components/EventCover";
import CoverImage from "@/components/CoverImage";
import Funding, { needFor } from "@/components/Funding";
import RegisteredResult from "@/components/RegisteredResult";
import { Accordion, Button, LinkButton, Notice, Sheet, Skeleton } from "@/components/ui";
import { chainNowMs, eventId, GAS_LIMITS, hasDeployment, isLocalChain, publicClient } from "@/lib/chain";
import { useBack } from "@/lib/back";
import { countdown, mon, shortAddress, shortenError } from "@/lib/format";
import { useLang, useT, type TFn } from "@/lib/i18n";
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
  const back = useBack("/events");
  const router = useRouter();
  const { t, lang } = useLang();
  // The app's language, not the browser's: somebody who switched to Chinese on an
  // English-locale laptop was still reading "Thu, Sep 4" on this row.
  const locale = lang === "zh" ? "zh-CN" : "en-GB";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState<Hex | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"about" | "venue" | "rules" | "faq">("about");
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
      <Frame>
        <h1 className="mb-4 text-[28px] font-semibold tracking-[-0.02em]">{t("common.noContract")}</h1>
        <Notice>
          {t("event.runDevChain")} <code className="text-fg">scripts/dev-chain.sh</code>
          {t("event.runDevChainEnd")}
        </Notice>
      </Frame>
    );
  }

  // Said outright rather than rendered as zeroes. Before this the page drew a whole event out of
  // an empty struct — 0.0000 MON held by the contract, a window on the 1st of January 1970, "this
  // event is full" under nought of nought places — which is the one thing this product must never
  // do, on the one page that exists to say it doesn't.
  if (missing) {
    return (
      <Frame>
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
      </Frame>
    );
  }

  const surplus = ev ? projectedPayout(ev) - ev.deposit : 0n;

  /// The card that actually joins the event. Lives in the right column, which is where the sheet
  /// puts it — the decision belongs beside the numbers it depends on, not below three paragraphs
  /// of explanation. Held as a value so the JSX stays one expression whichever column it lands in.
  const action = (
    <>
          {me?.registered ? (
            <div className="space-y-3">
              <Notice tone="ok">{t("event.youreIn")}</Notice>
              <LinkButton href="/floor">
                {phase === "open" ? t("event.goToFloor") : t("event.openMyCode")}
              </LinkButton>
            </div>
          ) : sample ? (
            /* A sample event cannot be joined — it is not on any chain. The register button was
               fully live here: pressing it opened the sign-in sheet, asked somebody to make an
               account, and led to an event that does not exist. The banner above already says this
               page is an example; the primary action should agree with it rather than contradict it. */
            <LinkButton href="/events">{t("events.seeRealOnes")}</LinkButton>
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
    </>
  );

  return (
    // The last participant screen still wearing the sidebar. An event belongs to the directory you
    // reached it from — "Events" stays lit, because leaving every item unlit on a screen you arrived
    // at by tapping it reads as having fallen out of the app.
    //
    // The two-column grid is lifted from AppShell rather than reinvented: same breakpoint, same
    // 320px rail, same sticky offset, so the detail panel sits where it always did.
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav page={t("event.pageName")} />

        <main className="grid min-w-0 gap-5 pb-16 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start lg:gap-6 md:pt-8">
      <div className="flex min-w-0 flex-col gap-5 md:gap-6">
        {/* Said once, at the top, before anything below it is read.
            Everything on this screen — the deposit, the count, the window, the rules — is a literal
            from lib/sampleEvents. None of it is on any chain. On a product whose whole argument is
            that you do not have to take anyone's word for it, an invented event that does not admit
            it would be the worst thing here; an admitted one is a mockup, which is what every empty
            state in every product is. */}
        {/* Full width, at the top of the column — not in the 320px rail beside it.
            The sheet's panel 04 is a screen of its own: an illustration, a congratulation and the
            event as a card. Squeezed into the rail the heading wrapped onto three lines and the
            card truncated its own title, which is the opposite of what a moment of arrival should
            look like. */}
        {justRegistered && ev && (
              <RegisteredResult
                eventId={eventId()}
                title={meta.title}
                venue={meta.venue}
                cover={meta.cover}
                startsAt={ev.attestOpen}
                deposit={ev.deposit}
                hash={justRegistered}
                opensIn={Number(ev.attestOpen) - Math.floor(chainNowMs() / 1000)}
                vouchesNeeded={ev.k}
                onContinue={() => router.push("/floor")}
              />
        )}

        {sample && <Notice tone="warn">{t("events.sampleDetail")}</Notice>}
        {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}

        {/* Back to wherever this was opened from. It was hardcoded to `/events`, so an organizer
            who opened their own event from the dashboard was returned to the participant listing —
            a different side of the product than the one they were working on. `/events` stays as
            the fallback for a link opened cold, which is the common case at a venue door. */}
        <Link
          {...back}
          className="-mb-2 inline-flex min-h-[44px] w-fit items-center gap-1.5 text-[14px] text-faint hover:text-dim"
        >
          <span aria-hidden>‹</span>
          {t("common.back")}
        </Link>

        {/* The organizer's picture when there is one, and one of the product's own otherwise —
            the sheet's cover is a photograph, and a drawn constellation beside it read as a slot
            waiting to be filled. */}
        <CoverImage
          id={eventId()}
          src={meta.cover}
          nodes={11}
          className="h-[200px] w-full shrink-0 rounded-2xl border border-line md:h-[260px]"
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

        {/* Place and time, on one line, each behind a tinted round glyph — the sheet's shape.
            They are the two facts somebody checks before anything else, and a line of dim grey
            text under a headline is where the eye goes last. */}
        {ev && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <MetaChip
              icon="cal"
              tone="accent"
              label={t("event.whenLabel")}
              value={new Date(Number(ev.attestOpen) * 1000).toLocaleString(
                lang === "zh" ? "zh-CN" : "en-GB",
                { dateStyle: "full", timeStyle: "short" },
              )}
            />
            <MetaChip
              icon="pin"
              tone="ok"
              label={t("listing.venue")}
              value={meta.venue || t("event.venueUnset")}
              muted={!meta.venue}
            />
          </div>
        )}

        {/* The listing's tags, as the sheet sets them under the meta row. Only when there are
            any — an empty row of chips is a control that is not there. */}
        {ev && meta.tags.trim() !== "" && (
          <div className="flex flex-wrap gap-2">
            {meta.tags
              .split(",")
              .map((v: string) => v.trim())
              .filter(Boolean)
              .map((tag: string) => (
                <span
                  key={tag}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 text-[14px] text-fg"
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-2" />
                  {tag}
                </span>
              ))}
          </div>
        )}

        {/* 验证方式, as four tiles — the shape the sheet gives this block.
            Its four are methods: wallet, on-site check-in, geolocation, peer vouching. This
            contract has one method, so four method tiles would be three lies. What it does have is
            four true properties of that one method, and those are what the tiles say: who vouches,
            what the door does, where it is written, who pays out. Same block, same rhythm, nothing
            in it that cannot be checked. */}
        <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{t("event.methodTitle")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <VerifyTile
              icon="peers"
              title={t("create.methodPeer")}
              body={ev ? t("event.vTilePeers", { k: String(ev.k) }) : ""}
              lit
            />
            <VerifyTile icon="qr" title={t("event.vDoorTitle")} body={t("event.vDoorBody")} lit />
            <VerifyTile icon="chain" title={t("event.vChainTitle")} body={t("event.vChainBody")} lit />
            <VerifyTile icon="coin" title={t("event.vPayTitle")} body={t("event.vPayBody")} lit />
          </div>

          <button
            type="button"
            onClick={() => setHowOpen(true)}
            className="group mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-line-2 px-5 text-[15px] text-dim transition-colors hover:border-accent hover:text-fg"
          >
            {t("home.howTitle4")}
            <span aria-hidden className="text-accent-2 transition-transform duration-200 motion-safe:group-hover:translate-x-1">
              →
            </span>
          </button>
        </section>

        {/* The sheet's tab strip: 活动介绍 / 日程安排 / 场地信息 / 验证规则 / 常见问题.
            Three of those five are here. 日程安排 and 场地信息 are not: this contract stores one
            timestamp and one line of free text for a venue, and a tab that opens onto a single
            sentence is a tab that teaches people not to press the others.
            Tabs rather than the stack of accordions this was: the sheet shows one body at a time
            with the rest named across the top, which is a shape somebody scans before they read. */}
        <section className="rounded-2xl border border-line bg-panel">
          <div className="overflow-x-auto border-b border-line px-5">
            <div className="flex min-w-max gap-1">
              {(
                [
                  ["about", "event.tabAbout"],
                  ["venue", "event.tabVenue"],
                  ["rules", "event.tabRules"],
                  ["faq", "event.tabFaq"],
                ] as const
              ).map(([key, label]) => {
                const on = detailTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDetailTab(key)}
                    aria-current={on ? "page" : undefined}
                    className={`relative flex min-h-[50px] items-center whitespace-nowrap px-3.5 text-[15px] transition-colors ${
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
          </div>

          <div className="space-y-3 p-5 text-[15.5px] leading-relaxed text-dim md:p-6">
            {detailTab === "about" && (
              <>
                {meta.blurb ? (
                  <p className="whitespace-pre-line text-fg">{meta.blurb}</p>
                ) : (
                  <p className="text-faint">{t("event.noBlurb")}</p>
                )}
                {meta.url && (
                  <a
                    href={meta.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-[44px] items-center text-accent-2 underline decoration-line-2 underline-offset-4"
                  >
                    {t("listing.link")} ↗
                  </a>
                )}
              </>
            )}

            {detailTab === "venue" && (
              <>
                {meta.venue ? (
                  <>
                    <p className="text-fg">{meta.venue}</p>
                    {/* A map link rather than an embedded map: an iframe from a mapping provider is
                        an outbound request on every load of a page that otherwise makes none, and
                        it would carry the event's address to them for every visitor. */}
                    <a
                      href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(meta.venue)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-[44px] items-center text-accent-2 underline decoration-line-2 underline-offset-4"
                    >
                      {t("event.openMap")} ↗
                    </a>
                  </>
                ) : (
                  <p className="text-faint">{t("event.venueUnset")}</p>
                )}
                <p>{t("event.venueNote")}</p>
              </>
            )}

            {detailTab === "rules" && (
              <>
                <p>{t("event.howP1")}</p>
                <p>{t("event.howP2")}</p>
                <p>{t("event.howP3")}</p>
              </>
            )}

            {detailTab === "faq" && (
              <>
                <p className="font-medium text-fg">{t("event.depositTitle")}</p>
                <p>
                  {t("event.depositP1")}
                  {ev && ev.confirmed > 0 && surplus > 0n ? (
                    <>
                      {" "}
                      {t("event.surplusAbout")}{" "}
                      <span className="font-medium tabular-nums">{mon(surplus)}</span>{" "}
                      {t("event.surplusAtCount")}
                    </>
                  ) : null}
                  {t("event.depositP1End")}
                </p>
                <p>{t("event.depositP2")}</p>
                <p>{t("event.depositP3")}</p>
                <Link
                  href="/verify"
                  className="inline-flex min-h-[44px] items-center gap-1.5 text-accent-2 underline decoration-line-2 underline-offset-4"
                >
                  {t("event.publicProof")} ↗
                </Link>
              </>
            )}
          </div>
        </section>
      </div>

      <HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />

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
          <div className="min-w-0 space-y-4 lg:sticky lg:top-9">
            {/* 活动快照, as the sheet calls it: how full the room is, how many the room has
                vouched for, and the button. */}
            <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
              <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{t("event.snapshot")}</h2>
              {ev && (
                <>
                  <p className="text-[28px] font-semibold leading-none tabular-nums">
                    {ev.registered}
                    <span className="text-[20px] text-faint">/{ev.capacity}</span>
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="img"
                       aria-label={`${ev.registered} / ${ev.capacity}`}>
                    <div className="flex h-full w-full">
                      <span className="h-full bg-ok" style={{ width: `${pct(ev.confirmed, ev.capacity)}%` }} />
                      <span className="h-full bg-accent"
                            style={{ width: `${pct(ev.registered - ev.confirmed, ev.capacity)}%` }} />
                    </div>
                  </div>
                  <p className="text-[14px] text-dim">
                    <span className="font-semibold tabular-nums text-ok">{ev.confirmed}</span>{" "}
                    {t("events.confirmedCount")}
                  </p>
                </>
              )}
              {action}
            </section>

            {/* The sheet's second right-hand block is 活动奖励 — a prize pool this contract does
                not have. The money that does exist is the deposit, so that slot says what the
                deposit is and who is holding it. Left column had it as a banner; the sheet keeps
                the left column for what the event *is* and the right for what it *costs*. */}
            <section
              aria-label={t("event.deposit")}
              className="rounded-2xl border border-line-2 bg-gradient-to-br from-accent/15 to-ok/[0.06] p-5"
            >
              <p className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums">
                {ev ? mon(ev.deposit) : <Skeleton className="h-7 w-24 align-middle" />}
              </p>
              <p className="mt-2 text-[15px] font-medium leading-snug">
                {t("event.heldBy")}
                <span className="mt-0.5 block font-normal text-dim">{t("event.notByOrganizer")}</span>
              </p>
            </section>

            {/* The three fixed numbers, in the rail. The sheet keeps counts on this side; on the
                left they sat between the description and the tabs, splitting what the event is
                from what people say about it. */}
            <section className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              <StatTile value={ev && `${ev.registered}`} label={t("event.registered")} />
              <StatTile value={ev && `${ev.k}`} label={t("event.vouchesNeededLbl")} />
              <StatTile value={ev && `${ev.minQuorum}`} label={t("event.minimumToRun")} />
            </section>

            <Details ev={ev} />
          </div>
        </main>
      </div>
    </div>
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
    // No border of its own: these three sit in one strip in the rail now, divided by the gap of
    // the grid that holds them. A card inside a card reads as two things.
    <div className="min-w-0 bg-panel p-3.5">
      <div className="text-[22px] font-semibold leading-none tabular-nums md:text-[24px]">
        {value || <Skeleton className="h-6 w-10 align-middle" />}
      </div>
      {/* `dim`, not `faint` — the spec keeps low-contrast grey for optional metadata, and a number
          without its unit is not information. */}
      <div className="mt-1.5 break-words text-[13px] leading-snug text-faint">{label}</div>
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

/// One of the two facts under the title: a tinted round glyph and the value, inline.
const TILE_ICONS: Record<string, string> = {
  cal: "M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  pin: "M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
};

/// This was two bordered panels, one per fact. The sheet does not draw them that way and it was
/// right not to: a date and a street are one glance, and giving each of them a box the size of a
/// card turns the top of the page into a grid of rectangles with two short strings in it. The
/// glyph carries the label, so the label is only in the accessible name.
function MetaChip({
  icon,
  tone,
  label,
  value,
  muted,
}: {
  icon: keyof typeof TILE_ICONS;
  tone: "accent" | "ok";
  label: string;
  value: string;
  /// The venue nobody filled in. Shown as a placeholder rather than hidden: an event with no place
  /// is a fact about the listing, and leaving the chip out makes the row look like it never had one.
  muted?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          tone === "accent" ? "bg-accent/15 text-accent-2" : "bg-ok/15 text-ok"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d={TILE_ICONS[icon]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="sr-only">{label}：</span>
      <span className={`text-[15.5px] ${muted ? "text-faint" : "font-medium text-fg"}`}>{value}</span>
    </span>
  );
}

/// One of the four squares in 验证方式.
const VERIFY_ICONS: Record<string, string> = {
  peers: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11h4M19 9v4",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  chain: "M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m2.5-7.5H10.8a1.8 1.8 0 0 0 0 3.6h2.4a1.8 1.8 0 0 1 0 3.6H9.5",
};

function VerifyTile({
  icon,
  title,
  body,
  lit,
}: {
  icon: keyof typeof VERIFY_ICONS;
  title: string;
  body: string;
  /// Every tile here is true of this event, so every one is lit. The prop exists because the block
  /// is the place a future method would land, and a tile that is not available has to be able to
  /// look unavailable rather than be quietly dropped.
  lit?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border px-3 py-4 text-center ${
        lit ? "border-accent/25 bg-accent/[0.06]" : "border-line bg-ink/40"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          lit ? "bg-accent/20 text-accent-2" : "bg-line text-faint"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d={VERIFY_ICONS[icon]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className={`mt-3 text-[15px] font-medium ${lit ? "text-fg" : "text-faint"}`}>{title}</p>
      <p className="mt-1.5 text-[13px] leading-snug text-faint">{body}</p>
    </div>
  );
}

/// One item in the title's meta row: a small outline glyph, then the value.
const EVENT_META_PATHS: Record<string, string> = {
  pin: "M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  cal: "M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
};

function EventMetaItem({
  icon,
  children,
}: {
  icon: keyof typeof EVENT_META_PATHS;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-faint">
        <path d={EVENT_META_PATHS[icon]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}

/// Clamped, and never divided by a zero capacity. An uncapped event has `capacity` 0, and a bar
/// that renders NaN% collapses to nothing — which looks exactly like an empty room.
function pct(n: number, of: number) {
  if (!of) return 0;
  return Math.max(0, Math.min(100, (n / of) * 100));
}

/// Top bar plus the page's container, for the branches that render before there is an event to
/// show. Written once because three branches need it and three hand-written copies drift.
function Frame({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav page={t("event.pageName")} />
        <main className="pb-16 pt-6 md:pt-8">{children}</main>
      </div>
    </div>
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
