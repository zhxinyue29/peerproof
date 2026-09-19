"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import EventCover from "@/components/EventCover";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import EditProfile from "@/components/EditProfile";
import { useIdentity } from "@/components/IdentityProvider";
import { Notice, Skeleton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import { basePath, ESCROW_ADDRESS, explorerAddressUrl, hasDeployment, publicClient } from "@/lib/chain";
import { readAllEvents, type EventSummary } from "@/lib/events";
import { readProfile, type Profile } from "@/lib/directory";
import { mon, shortAddress } from "@/lib/format";

/// Everything this account can prove, and nothing it cannot.
///
/// Built to the profile sheet: banner, four figures, a rail of sections, the two event lists, an
/// impact row. What the sheet also shows and this does not, with the reason in each case:
///
///   社区声誉值 4,320     there is no reputation anywhere in this system, and inventing one on the
///                        single screen about what an account can substantiate would be the worst
///                        thing in this codebase
///   Verified Builder     no badges exist
///   ≈ $3,820 USD         no price feed — a number in dollars would be a guess wearing a currency
///   +12% 较上月          nothing keeps history, so there is nothing to compare against
///   身份标签 / 贡献与徽章 no tags, no achievements
///   活动满意度 92%       nothing in this product collects a rating
///   我的身份             dropped at your request
///
/// What remains is the event list plus two reads per event — `isRegistered` and `isConfirmed` —
/// so anybody holding this address computes exactly the same page.

type Row = { event: EventSummary; registered: boolean; confirmed: boolean };
type Tab = "overview" | "joined" | "hosted" | "settings";

/// A handle as typed, reduced to the handle. People write "@alice", "alice", and the whole profile
/// URL into a box labelled X — pasting any of those into `https://x.com/` gives a dead link two
/// times out of three, and the one thing a link on a profile has to do is go somewhere.
function strip(handle: string) {
  return handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|github\.com)\//i, "").replace(/\/+$/, "");
}

/// `example.com` is what people type and is not a URL a browser will follow as written — without a
/// scheme the href resolves against our own origin and lands on a 404 inside PeerProof.
function withScheme(url: string) {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
}

function ProfileLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      // `noreferrer noopener` on every outbound link from a page that knows an address: the
      // referrer would carry this account's own URL to whatever the person linked to.
      rel="noreferrer noopener me"
      className="underline decoration-line-2 underline-offset-4 hover:text-fg"
    >
      {label}
    </a>
  );
}

export default function MePage() {
  const t = useT();
  const { signer, setUpPrivy, useDevKey, devMode, busy } = useIdentity();
  const address = signer?.address ?? null;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [hosted, setHosted] = useState<EventSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  /// What this account wrote about itself, from the directory contract. `null` while reading, and
  /// an empty profile when it has never written one — the two look the same on screen but not to
  /// the code, so a slow read does not flash "no name" before the name arrives.
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!address) return;
    let dropped = false;
    void readProfile(address)
      .then((pr) => !dropped && setProfile(pr))
      .catch(() => {});
    return () => {
      dropped = true;
    };
  }, [address]);

  useEffect(() => {
    if (!hasDeployment || !address) return;
    let dropped = false;

    void (async () => {
      try {
        const events = await readAllEvents();
        const states = await Promise.all(
          events.map(async (e) => {
            const [registered, confirmed] = (await Promise.all([
              publicClient.readContract({
                address: ESCROW_ADDRESS, abi, functionName: "isRegistered", args: [e.id, address],
              }),
              publicClient.readContract({
                address: ESCROW_ADDRESS, abi, functionName: "isConfirmed", args: [e.id, address],
              }),
            ])) as [boolean, boolean];
            return { event: e, registered, confirmed };
          }),
        );
        if (dropped) return;
        setRows(states.filter((s) => s.registered));
        // Hosting costs no extra read: the organizer is already on every summary.
        setHosted(events.filter((e) => e.organizer.toLowerCase() === address.toLowerCase()));
      } catch {
        // "Cannot reach the contract", never "you have attended nothing". Opposite claims, and only
        // one of them is survivable to get wrong on this page.
        if (!dropped) setFailed(true);
      }
    })();

    return () => {
      dropped = true;
    };
  }, [address]);

  const attended = rows?.filter((r) => r.confirmed).length ?? 0;
  const staked = rows?.reduce((n, r) => n + r.event.deposit, 0n) ?? 0n;
  // Absent rather than 0% before anything has been joined: "0% turnout" is a record of failure, and
  // having no record at all is a different claim.
  const rate = rows && rows.length > 0 ? Math.round((attended / rows.length) * 100) : null;
  const reach = hosted?.reduce((n, e) => n + e.registered, 0) ?? 0;
  const escrowed = hosted?.reduce((n, e) => n + e.deposit * BigInt(e.registered), 0n) ?? 0n;
  const places = new Set(
    [
      ...(rows ?? []).map((r) => r.event.listing.venue),
      ...(hosted ?? []).map((e) => e.listing.venue),
    ].filter(Boolean),
  ).size;

  if (!address) {
    return (
      <Frame>
        <div className="mx-auto max-w-[520px] rounded-2xl border border-line bg-panel p-8 text-center md:mt-10">
          <span
            aria-hidden
            className="mx-auto block h-14 w-14 rounded-2xl border border-line-2"
            style={{ background: "linear-gradient(145deg, #6e54ff, #3a2da8)" }}
          />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em]">{t("nav.myProof")}</h1>
          <p className="mt-2 text-[16px] leading-relaxed text-dim">{t("me.signedOutBody")}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-faint">{t("me.signInFirst")}</p>
          {/* Signing in is the action this page is missing, so it is the button on it. It used to
              send you to the events list to "sign in at an event" — the account page being the one
              screen in the product you could not sign in from, while the bar above it offered a
              sign-in button the whole time. Browsing events is still here, as the second thing. */}
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={setUpPrivy}
              disabled={!!busy}
              className="inline-flex min-h-[48px] items-center rounded-xl bg-accent px-6 text-[16px] font-medium text-white transition-transform duration-100 active:scale-[0.985] disabled:opacity-60"
            >
              {busy ?? t("home.signIn")}
            </button>
            <Link
              href="/events"
              className="inline-flex min-h-[44px] items-center text-[15px] text-dim underline decoration-line-2 underline-offset-4 hover:text-fg"
            >
              {t("me.findOne")}
            </Link>
            {devMode && (
              <button
                type="button"
                onClick={useDevKey}
                className="inline-flex min-h-[44px] items-center text-[14px] text-faint underline decoration-line-2 underline-offset-4"
              >
                Throwaway local key (dev)
              </button>
            )}
          </div>
        </div>
      </Frame>
    );
  }

  const hue = Number.parseInt(address.slice(2, 6), 16) % 360;

  return (
    <Frame>
      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        {/* The rail, minus the three sections that would lead nowhere. */}
        {/* A row on a phone, a column on a desktop. As a column it was four stacked rows — about
            250px of navigation above the first thing anybody came here to read, on the screen with
            the least room. The same four items scroll sideways in 56px. */}
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:sticky lg:top-6 lg:block lg:rounded-2xl lg:border lg:border-line lg:bg-panel lg:p-2 lg:px-2">
          {(
            [
              ["overview", t("me.tabOverview")],
              ["joined", t("me.tabJoined")],
              ["hosted", t("me.tabHosted")],
              ["settings", t("me.tabSettings")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-left text-[15px] transition-colors lg:w-full lg:rounded-xl lg:border-0 lg:px-3.5 ${
                tab === key
                  ? "border-accent bg-accent/15 font-medium text-fg"
                  : "border-line-2 bg-panel text-dim hover:text-fg lg:bg-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          {/* The banner. The sheet fills its right half with artwork; this uses the scene the rest
              of the product already uses, faded far enough back that the words stay first. */}
          <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 md:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] bg-cover bg-center opacity-50 lg:block"
              style={{
                // `basePath`, not `../hero.webp`. The relative form happens to resolve here and
                // does not on a route one level deeper — the same mistake already shipped once on
                // the events page, where it silently loaded nothing.
                backgroundImage: `url(${basePath}/hero.webp)`,
                WebkitMaskImage: "linear-gradient(to right, transparent, #000 55%)",
                maskImage: "linear-gradient(to right, transparent, #000 55%)",
              }}
            />
            {/* `items-start`, not `items-center`. Centring was right when the block beside the
                square was two lines; with a bio and a link row it is five, and centring floated the
                name clear above the top of the avatar. */}
            <div className="relative flex flex-wrap items-start gap-5">
              {/* Round, as the profile sheet draws it. Everywhere else in this product a rounded
                  square is a *thing* — an event cover, a contract, a QR card. A person is the one
                  subject that gets a circle, and the sheet is consistent about it. */}
              <span
                aria-hidden
                className="h-20 w-20 shrink-0 rounded-full border border-line-2"
                style={{
                  background: `linear-gradient(145deg, hsl(${hue} 58% 64%), hsl(${(hue + 45) % 360} 52% 44%))`,
                }}
              />
              <div className="min-w-0">
                <h1
                  className="bg-clip-text pb-[0.08em] text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-transparent md:text-[38px]"
                  style={{
                    fontFamily: '"Montserrat", var(--font-sans)',
                    backgroundImage:
                      "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
                  }}
                >
                  {/* The name this account gave itself, when it gave itself one. The page was
                      showing the address even to somebody who had filled in the profile form —
                      the form wrote to the chain and nothing on the page ever read it back, which
                      is the same "only you can see it" problem that put profiles on chain in the
                      first place. */}
                  {profile?.name || signer?.label || shortAddress(address)}
                </h1>
                {profile?.bio && (
                  <p className="mt-2 max-w-[56ch] text-[16px] leading-relaxed text-dim">{profile.bio}</p>
                )}
                {(profile?.city || profile?.x || profile?.github || profile?.website) && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-faint">
                    {profile.city && <span>{profile.city}</span>}
                    {profile.x && <ProfileLink href={`https://x.com/${strip(profile.x)}`} label={`@${strip(profile.x)}`} />}
                    {profile.github && (
                      <ProfileLink href={`https://github.com/${strip(profile.github)}`} label={`github.com/${strip(profile.github)}`} />
                    )}
                    {profile.website && <ProfileLink href={withScheme(profile.website)} label={profile.website} />}
                  </p>
                )}
                {/* A link only when there is somewhere to go. `explorerAddressUrl` returns "" on
                    a chain with no explorer, and `href=""` is a link to the current page — it
                    opened a blank tab. The address still has to be readable either way, so the
                    fallback is the same line without the anchor. */}
                {explorerAddressUrl(address) ? (
                  <a
                    href={explorerAddressUrl(address)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 break-all font-mono text-[13px] text-dim hover:text-fg md:text-[14px]"
                  >
                    {address} <span aria-hidden>↗</span>
                  </a>
                ) : (
                  <p className="mt-1 break-all font-mono text-[13px] text-dim md:text-[14px]">
                    {address}
                  </p>
                )}
              </div>
              {/* "Edit profile", top right of the banner, which is where the sheet puts it. It was
                  only reachable by finding the Settings tab and scrolling — on the one screen
                  whose whole subject is what this account says about itself. */}
              <button
                type="button"
                onClick={() => setTab("settings")}
                className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-line-2 px-4 text-[15px] text-dim transition-colors hover:border-accent hover:text-fg"
              >
                {t("profile.edit")}
              </button>
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile value={rows ? String(rows.length) : null} label={t("me.eventsJoined")}
                  sub={t("me.vsLastMonth", { delta: "—" })} />
            <Tile value={hosted ? String(hosted.length) : null} label={t("me.eventsHosted")} />
            <Tile value={rows ? mon(staked) : null} label={t("me.staked")}
                  sub={t("me.approxUsd", { amount: "—" })} />
            <Tile
              value={rows ? (rate === null ? "—" : `${rate}%`) : null}
              label={t("me.turnout")}
              tone={rate !== null && rate >= 80 ? "ok" : undefined}
            />
          </dl>

          {failed && <Notice tone="bad">{t("me.unreachable")}</Notice>}

          {(tab === "overview" || tab === "joined") && (
            <EventList
              title={t("me.recentJoined")}
              empty={t("me.noneYet")}
              emptyHref="/events"
              emptyCta={t("me.findOne")}
              loading={!rows}
              t={t}
              items={(rows ?? []).map(({ event, confirmed }) => ({
                event,
                right: confirmed
                  ? { text: t("me.verified"), ok: true }
                  : { text: t("me.awaiting"), ok: false },
              }))}
            />
          )}

          {(tab === "overview" || tab === "hosted") && (
            <EventList
              title={t("me.myHosted")}
              empty={t("me.noneHosted")}
              emptyHref="/organizer"
              emptyCta={t("events.createFirst")}
              loading={!hosted}
              t={t}
              items={(hosted ?? []).map((event) => ({
                event,
                right: { text: t("me.nRegistered", { n: String(event.registered) }), ok: false },
              }))}
            />
          )}

          {tab === "overview" && (
            /* The sheet's impact row, minus 活动满意度 — nothing here collects a rating, so that
               figure could only ever have been made up. */
            <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t("me.impact")}</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Impact value={hosted ? String(reach) : null} label={t("me.reach")} />
                <Impact value={hosted ? String(places) : null} label={t("me.places")} />
                <Impact value={hosted ? mon(escrowed) : null} label={t("me.escrowed")} />
              </dl>
            </section>
          )}

          {tab === "settings" && (
            <div className="space-y-6">
              {/* The form was imported and never rendered — shipped, announced, and absent from the
                  page. The i18n audit is what caught it: `profile.title` showed up as an unused
                  key, which for a string that is supposed to be a section heading can only mean
                  the section is not there. */}
              <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
                <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t("profile.title")}</h2>
                <EditProfile onSaved={setProfile} />
              </section>
              <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
                <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t("me.tabSettings")}</h2>
                <div>
                  <p className="mb-2 text-[13px] text-faint">{t("lang.label")}</p>
                  <LanguageSwitcher />
                </div>
              </section>
            </div>
          )}

          {rows && rows.length > 0 && (
            <Link
              href={`/verify?event=${rows[0].event.id}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] text-accent-2 transition-colors hover:text-fg"
            >
              {t("verify.title")} <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav />
        <main className="pb-16 pt-6 md:pt-8">{children}</main>
      </div>
    </div>
  );
}

/// `sub` is for the figures the sheet shows underneath a number — a dollar conversion, a
/// month-on-month change. Neither exists yet and both will: the first needs a price source, the
/// second needs enough history to have a previous month. So the slot is built and reads "—".
///
/// "—" rather than 0, deliberately. "+0% on last month" is an assertion about a month that has not
/// happened; "—" is the absence of one. The difference matters most on the page whose whole subject
/// is what can and cannot be substantiated.
function Tile({
  value, label, tone, sub,
}: { value: string | null; label: string; tone?: "ok"; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 md:p-5">
      <dt
        className={`whitespace-nowrap text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums md:text-[30px] ${
          tone === "ok" ? "text-ok" : "text-accent-2"
        }`}
      >
        {value ?? <Skeleton className="h-7 w-16 align-middle" />}
      </dt>
      <dd className="mt-2 text-[14px] text-dim">{label}</dd>
      {sub && <dd className="mt-1 text-[13px] text-faint">{sub}</dd>}
    </div>
  );
}

function Impact({ value, label }: { value: string | null; label: string }) {
  return (
    <div>
      <dt className="text-[24px] font-semibold leading-none tabular-nums text-fg">
        {value ?? <Skeleton className="h-6 w-14 align-middle" />}
      </dt>
      <dd className="mt-1.5 text-[14px] text-dim">{label}</dd>
    </div>
  );
}

function EventList({
  title,
  items,
  empty,
  emptyHref,
  emptyCta,
  loading,
  t,
}: {
  title: string;
  items: { event: EventSummary; right: { text: string; ok: boolean } }[];
  empty: string;
  emptyHref: string;
  emptyCta: string;
  loading: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <section>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">{title}</h2>
      {loading ? (
        <div className="mt-3 space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-line bg-panel p-6">
          <p className="text-[16px] text-dim">{empty}</p>
          <Link
            href={emptyHref}
            className="mt-3 inline-flex min-h-[44px] items-center text-[15px] text-accent-2 hover:text-fg"
          >
            {emptyCta} →
          </Link>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map(({ event, right }) => (
            <li key={event.id.toString()}>
              <Link
                href={`/event?event=${event.id}`}
                className="flex min-w-0 items-center gap-4 rounded-2xl border border-line bg-panel p-3 transition-colors hover:border-line-2"
              >
                <EventCover id={event.id} nodes={5} className="h-[60px] w-[88px] shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium">
                    {event.listing.title || t("common.eventNumber", { id: event.id.toString() })}
                  </p>
                  <p className="mt-0.5 truncate text-[14px] text-dim">
                    {event.listing.venue ? `${event.listing.venue} · ` : ""}
                    {new Date(Number(event.attestOpen) * 1000).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 text-[15px] font-medium tabular-nums text-accent-2">
                  {mon(event.deposit)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${
                    right.ok ? "bg-ok/15 font-medium text-ok" : "border border-line-2 text-faint"
                  }`}
                >
                  {right.text}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
