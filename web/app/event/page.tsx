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
import AttendeeRow from "@/components/AttendeeRow";
import Funding, { needFor } from "@/components/Funding";
import RegisteredResult from "@/components/RegisteredResult";
import { Accordion, Button, LinkButton, Notice, Sheet, Skeleton } from "@/components/ui";
import { basePath, chainNowMs, eventId, GAS_LIMITS, hasDeployment, isLocalChain, publicClient } from "@/lib/chain";
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
  const [detailTab, setDetailTab] = useState<"about" | "agenda" | "venue" | "rules" | "faq">("about");
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

  /// The invitation. Held as a value for the same reason `action` is: it renders outside the
  /// two-column grid, above it, at the full width of the page.
  const heroSlot = (
    <>
        {/* ═══ the invitation ═══
            Cover, title, when, where, tags — one picture with the facts written on it, the width
            of the page. It was a 200px band above a headline above a chip row above a bordered
            block of explanation: four stacked rectangles, the shape of a documentation page. An
            invitation is one image that tells you what this is and where to be, and everything
            that argues for coming can wait until after somebody has decided to read on.

            `isolate` because the scrim and the text are positioned against this box, not the page. */}
        <section className="relative isolate mt-2 overflow-hidden rounded-[28px] border border-accent/20 shadow-[0_0_0_1px_rgba(110,84,255,0.10),0_30px_70px_-40px_rgba(110,84,255,0.55)]">
          <CoverImage
            id={eventId()}
            src={meta.cover}
            nodes={11}
            className="h-[300px] w-full md:h-[clamp(340px,44vh,460px)]"
          />
          {/* Deep at the bottom, gone by halfway. The title has to hold against whatever photograph
              an organizer uploads — including a bright one — and a flat wash over the whole image
              would dull the picture everywhere to protect two lines of text in one corner. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/78 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-5 md:p-8">
            <h1
              className="bg-clip-text pb-[0.1em] text-[30px] font-extrabold leading-[1.06] tracking-[-0.03em] text-transparent md:text-[44px] md:leading-[1.02]"
              style={{
                fontFamily: '"Montserrat", var(--font-sans)',
                backgroundImage:
                  "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
              }}
            >
              {meta.title}
            </h1>

            {/* Place and time, on one line. They are the two facts somebody checks before anything
                else, so they sit on the picture with the title rather than below the fold. */}
            {ev && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <MetaChip
                  icon="cal"
                  tone="accent"
                  label={t("event.whenLabel")}
                  value={new Date(Number(ev.attestOpen) * 1000).toLocaleString(
                    lang === "zh" ? "zh-CN" : "en-GB",
                    { dateStyle: "full", timeStyle: "short" },
                  )}
                />
                <span aria-hidden className="hidden text-faint sm:inline">·</span>
                <MetaChip
                  icon="pin"
                  tone="ok"
                  label={t("listing.venue")}
                  value={meta.venue || t("event.venueUnset")}
                  muted={!meta.venue}
                />
              </div>
            )}

            {/* Only when there are any — an empty row of chips is a control that is not there. */}
            {ev && meta.tags.trim() !== "" && (
              <div className="flex flex-wrap gap-2">
                {meta.tags
                  .split(",")
                  .map((v: string) => v.trim())
                  .filter(Boolean)
                  .map((tag: string) => (
                    <span
                      key={tag}
                      className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-white/10 bg-ink/50 px-3.5 text-[14px] text-fg backdrop-blur-sm"
                    >
                      <TagGlyph tag={tag} />
                      {tag}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </section>

    </>
  );

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
                /* 56px, not the shared 46: on the sheet this is the tallest control on the page
                   and the only one that costs money to press. Local to this button rather than a
                   change to Button itself, which every other screen is sized around. */
                className="w-full min-h-[56px] text-[17px]"
              >
                {busy
                  ? t("event.staking")
                  : ev
                    ? t("event.stakeAndRegister", { amount: mon(ev.deposit) })
                    : t("common.loading")}
                {/* The sheet's primary carries an arrow. Only when it can actually be pressed —
                    an arrow on a disabled button points at nothing. */}
                {!busy && ev && <span aria-hidden className="ml-2">→</span>}
              </Button>
              {/* The sheet puts an outlined button directly under the primary one, the same width.
                  The action that belongs there is the one somebody deciding whether to stake is
                  actually asking for — what happens after I press the purple button. It used to
                  sit down in the 验证方式 block, three sections away from the decision. */}
              <button
                type="button"
                onClick={() => setHowOpen(true)}
                className="group flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl border border-line-2 px-4 text-[16px] text-dim transition-colors hover:border-accent hover:text-fg"
              >
                {t("home.howTitle4")}
                <span aria-hidden className="text-accent-2 transition-transform duration-200 motion-safe:group-hover:translate-x-1">
                  →
                </span>
              </button>
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

        {/* 895 : 384 with a 32px gutter, measured off the full-size sheet.
            This was 320px fixed (a quarter of the content — far too narrow), then 1.6fr:1fr
            (38% — too wide) from the 532px crop, where the card is 177px across and everything
            is within a few pixels of the noise floor. The full-size sheet is drawn at very nearly
            this page's own scale — 1311px of content against 1345 — so its numbers transfer
            almost one to one, and this is the last time this ratio needs guessing at. */}
        {/* Above the picture, not between it and the tabs: the way out of a page and the warning
            that this page is a mockup are both chrome, and chrome that sits under the hero pushes
            the thing somebody came for off the first screen. */}
        <div className="flex flex-col gap-3 pt-4 md:pt-5">
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

          {sample && <Notice tone="warn">{t("events.sampleDetail")}</Notice>}
          {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}
        </div>

        <div className="pt-3">{heroSlot}</div>

        <main className="grid min-w-0 gap-5 pb-16 pt-6 lg:grid-cols-[minmax(0,2.33fr)_minmax(0,1fr)] lg:items-start lg:gap-8 md:pt-8">
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


        {/* The sheet's tab strip, all five of it: 活动介绍 / 日程安排 / 场地信息 / 验证规则 /
            常见问题. 日程安排 used to be missing on the grounds that the contract stores one
            timestamp — but it stores four, and they are the four that decide whether somebody can
            still join, when the doors open and when vouching stops. That is a schedule, and it was
            sitting in an extra card in the right rail that the sheet does not have.
            No bordered box around the strip: the sheet sets the tabs straight onto the page and
            only the panel beneath them is a card. */}
        <section>
          <div className="overflow-x-auto px-1">
            <div className="flex min-w-max gap-1">
              {(
                [
                  ["about", "event.tabAbout"],
                  ["agenda", "event.tabAgenda"],
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
                      on ? "font-medium text-accent-2" : "text-dim hover:text-fg"
                    }`}
                  >
                    {t(label)}
                    {on && (
                      <span aria-hidden className="absolute inset-x-2.5 bottom-0 h-[2.5px] rounded-full bg-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 space-y-3 rounded-2xl border border-line bg-panel p-5 text-[15.5px] leading-relaxed text-dim md:p-6">
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

            {/* What used to be the 活动详情 card in the right rail. The sheet has a 日程安排 tab
                and no such card, and these four timestamps are a schedule — when you can still
                join, when the doors open, when vouching closes. */}
            {detailTab === "agenda" && <Details ev={ev} bare />}

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
                {/* The two numbers that were a three-up strip in the rail. They belong to this
                    tab: "how many people have to vouch" is the rule, not a statistic. */}
                {ev && (
                  <dl className="grid grid-cols-2 gap-3 pb-1">
                    <div className="rounded-xl border border-line bg-raised p-4">
                      <dt className="text-[13.5px] text-faint">{t("event.vouchesNeededLbl")}</dt>
                      <dd className="mt-1 text-[22px] font-semibold tabular-nums text-fg">{ev.k}</dd>
                    </div>
                    <div className="rounded-xl border border-line bg-raised p-4">
                      <dt className="text-[13.5px] text-faint">{t("event.minimumToRun")}</dt>
                      <dd className="mt-1 text-[22px] font-semibold tabular-nums text-fg">{ev.minQuorum}</dd>
                    </div>
                  </dl>
                )}
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
        {/* 验证方式, as four tiles — the shape the sheet gives this block.
            Its four are methods: wallet, on-site check-in, geolocation, peer vouching. This
            contract has one method, so four method tiles would be three lies. What it does have is
            four true properties of that one method, and those are what the tiles say: who vouches,
            what the door does, where it is written, who pays out. Same block, same rhythm, nothing
            in it that cannot be checked. */}
        {/* No panel. Four true properties of one method do not become more credible for being
            put in a box, and the box was the last thing on the first screen standing between
            somebody and the decision this page exists for. A rule and some air do the same
            separating for nothing. */}
        <section className="border-t border-line pt-7">
          <h2 className="text-[20px] font-semibold text-fg">{t("event.methodTitle")}</h2>
          <div className="mt-5 grid grid-cols-2 gap-y-6 divide-line sm:grid-cols-4 sm:gap-y-0 sm:divide-x">
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
            {/* 活动状态, laid out as the sheet draws it: the phase as a lit dot, the count, the
                bar, the faces, then the button. The dot is the piece that was missing — the card
                said how full the room was without ever saying whether you could still join it. */}
            {/* One panel, floating, holding the whole decision: what it costs, who is holding it,
                how full the room is, and the button. It was three cards plus a repeat of the cover
                photograph — and the deposit, which is the number somebody actually decides on, was
                in the second of them, below the fold on a laptop. */}
            <section className="space-y-4 rounded-[26px] border border-white/[0.06] bg-panel/55 p-5 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl md:p-6">
              <div>
                <p className="text-[15px] text-dim">{t("event.deposit")}</p>
                <p className="mt-1 text-[38px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
                  {ev ? mon(ev.deposit) : <Skeleton className="h-9 w-28 align-middle" />}
                </p>
                <p className="mt-2 text-[15px] leading-snug text-dim">
                  {t("event.heldBy")}
                  <span className="mt-0.5 block text-faint">{t("event.notByOrganizer")}</span>
                </p>
              </div>

              <div className="border-t border-line pt-4">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-dim">
                  {t("event.snapshot")}
                </h2>
              </div>
              {ev && (
                <>
                  <PhaseDot ev={ev} t={t} />
                  {/* The sheet puts the percentage on the same line, right-aligned — the fraction
                      is the exact fact and the percentage is the one you read without thinking. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[40px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                      {ev.registered}
                      <span className="text-[26px] font-medium text-faint">/{ev.capacity}</span>
                    </p>
                    <p className="text-[14px] tabular-nums text-faint">
                      {pct(ev.registered, ev.capacity)}%
                    </p>
                  </div>
                  {/* One continuous mint-to-violet sweep, as the sheet draws it — but still two
                      segments underneath, because the boundary between them is real: the mint part
                      is people the room has already vouched for, the violet part is people who have
                      only paid. A single flat bar would lose the one number on this page that
                      cannot be produced by signing up. Each segment carries its own slice of the
                      same gradient, so the seam does not read as a colour change. */}
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink" role="img"
                       aria-label={`${ev.registered} / ${ev.capacity}`}>
                    <div className="flex h-full w-full">
                      <span className="h-full bg-gradient-to-r from-ok to-accent-2"
                            style={{ width: `${pct(ev.confirmed, ev.capacity)}%` }} />
                      <span className="h-full bg-gradient-to-r from-accent-2 to-accent"
                            style={{ width: `${pct(ev.registered - ev.confirmed, ev.capacity)}%` }} />
                    </div>
                  </div>
                  <AttendeeRow eventId={eventId()} total={ev.registered} />
                  {/* 已验证参与者, as its own row: the label on the left, the faces of the people
                      the room has actually vouched for, and a way through to the public record.
                      It was a sentence with a number in it; the sheet makes it the second most
                      important thing in the card, because it is the only figure here that cannot
                      be produced by paying. */}
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-[14px] text-dim">{t("event.verifiedLabel")}</span>
                    <AttendeeRow eventId={eventId()} total={ev.confirmed} confirmedOnly small />
                    <Link
                      href="/verify"
                      aria-label={t("nav.verify")}
                      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-2 text-dim transition-colors hover:border-accent hover:text-fg"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </div>
                </>
              )}
              {action}
            </section>

            {/* The rail's third card was `rail-card.webp` — the same artwork the hero above now
                runs at full width. Two copies of one picture on one screen is not a composition,
                and the second one was carrying no information at all. */}
            {/* The rail is 活动状态, the money, and the picture above — three cards. It had four,
                and the two extra ones are what made it look nothing like the drawing.
                They are not deleted. The counts (how many vouches, how few people it takes to run)
                moved into the 验证规则 tab, and the timings moved into 日程安排 — both tabs the
                sheet itself draws, and both the place somebody would look for exactly those facts.
                Nothing on this page knows less than it did. */}
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
function Details({ ev, bare }: { ev: EventInfo | null; bare?: boolean }) {
  const { t, lang } = useLang();
  // The app's language, not the browser's: somebody who switched to Chinese on an
  // English-locale laptop was still reading "Thu, Sep 4" on this row.
  const locale = lang === "zh" ? "zh-CN" : "en-GB";

  return (
    <section className={bare ? "" : "rounded-2xl border border-line bg-panel p-5 md:p-[22px]"}>
      {!bare && <h2 className="text-[16px] font-semibold">{t("event.details")}</h2>}
      <dl className={bare ? "space-y-4" : "mt-4 space-y-4"}>
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
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
          tone === "accent" ? "border-accent/45 text-accent-2" : "border-ok/45 text-ok"
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
  // Read off the hi-res sheet, which settled three things the low-res crop could not show:
  // the badge is a rounded square and not a circle, each item keeps its second line, and the four
  // are separated by hairline rules rather than by their own boxes.
  //
  // I had deleted the second lines in the previous pass and moved them into a `title` tooltip, on
  // the grounds that the sheet drew "a glyph over a word". It draws a glyph over two. On a phone a
  // tooltip is nothing at all, so that was information removed rather than tidied.
  return (
    <div className="flex flex-col items-center px-2 text-center">
      <span
        aria-hidden
        className={`flex h-[42px] w-[42px] items-center justify-center rounded-[13px] ${
          lit
            ? "bg-gradient-to-br from-accent-2 to-accent text-white shadow-[0_6px_18px_-8px_rgba(110,84,255,0.9)]"
            : "bg-line text-faint"
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d={VERIFY_ICONS[icon]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className={`mt-3 text-[16px] font-semibold ${lit ? "text-fg" : "text-faint"}`}>{title}</p>
      <p className="mt-1.5 text-[14px] leading-snug text-faint">{body}</p>
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

/// The sheet's status line: a lit dot and the phase, in the phase's own colour.
///
/// It reads off `phaseOf`, which is derived from the chain's clock rather than the browser's —
/// a laptop an hour fast would otherwise tell somebody registration had closed while the contract
/// was still taking deposits.
function PhaseDot({ ev, t }: { ev: EventInfo; t: TFn }) {
  const phase = phaseOf(ev);
  const [label, tone] =
    ev.status !== 0
      ? [t("event.phaseSettled"), "text-dim"]
      : phase === "open"
        ? [t("event.phaseAttest"), "text-accent-2"]
        : phase === "closed"
          ? [t("event.phaseClosed"), "text-faint"]
          : canRegister(ev)
            ? [t("event.phaseOpen"), "text-ok"]
            : [t("event.phaseClosed"), "text-faint"];

  return (
    <p className={`flex items-center gap-2 text-[15px] font-medium ${tone}`}>
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-current" />
      {label}
    </p>
  );
}

/// The little mark in front of a tag.
///
/// The sheet draws an icon on three of its four chips and leaves the fourth bare, which is the
/// honest shape for a field like this: `tags` is free text an organizer typed, so there is no
/// closed set to map. Tags the product actually knows about get their glyph; anything else gets
/// nothing rather than a generic dot pretending to mean something.
const TAG_GLYPHS: [RegExp, string][] = [
  [/^monad$/i, "M12 3 4 12l8 9 8-9-8-9Z"],
  [/社区|community/i, "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11h4M19 9v4"],
  [/线下|offline|irl|meetup/i, "M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  [/开发|dev|builder|hack/i, "m8 6-5 6 5 6M16 6l5 6-5 6"],
  [/线上|online|virtual/i, "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.4 3.8 5.5 3.8 9S14.5 18.6 12 21m0-18C9.5 5.4 8.2 8.5 8.2 12S9.5 18.6 12 21M3.3 9h17.4M3.3 15h17.4"],
];

function TagGlyph({ tag }: { tag: string }) {
  const hit = TAG_GLYPHS.find(([re]) => re.test(tag));
  if (!hit) return null;
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-accent-2">
      <path d={hit[1]} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
