"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import EventCover from "@/components/EventCover";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import EditProfile from "@/components/EditProfile";
import ProfileRoles from "@/components/ProfileRoles";
import ActivityCalendar from "@/components/ActivityCalendar";
import ShareProfile from "@/components/ShareProfile";
import { SectionTitle } from "@/components/SectionTitle";
import ProfileTabs, { type ProfileTab } from "@/components/profile/ProfileTabs";
import IdentityTags from "@/components/profile/IdentityTags";
import EarnedRewards from "@/components/profile/EarnedRewards";
import Achievements from "@/components/profile/Achievements";
import { useIdentity } from "@/components/IdentityProvider";
import { Notice, Skeleton } from "@/components/ui";
import { useLang, useT } from "@/lib/i18n";
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
/// The rail on the left and the strip under the figures pick from the same set — the sheet draws
/// both, and two selections for one page is how they end up disagreeing.
type Tab = ProfileTab;

/// The rail, in the sheet's order.
const RAIL: { key: Tab; label: string; icon: RailName }[] = [
  { key: "overview", label: "me.tabOverview", icon: "home" },
  { key: "joined", label: "me.tabJoined", icon: "ticket" },
  { key: "hosted", label: "me.tabHosted", icon: "flag" },
  { key: "rewards", label: "me.tabRewards", icon: "coin" },
  { key: "achievements", label: "me.achievements", icon: "badge" },
  { key: "settings", label: "me.tabSettings", icon: "gear" },
];

type RailName = "home" | "ticket" | "flag" | "coin" | "badge" | "gear";

const RAIL_PATHS: Record<RailName, string> = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z",
  ticket: "M4 9V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 6v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-6ZM12 7v10",
  flag: "M6 21V4m0 0h10l-2 3 2 3H6",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m2.5-7.5H10.8a1.8 1.8 0 0 0 0 3.6h2.4a1.8 1.8 0 0 1 0 3.6H9.5",
  badge: "m9 12 2 2 4-4M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.8-1.6L13.6 2h-3.9l-.5 2.6a7.6 7.6 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 3.2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.8 1.6l.5 2.6h3.9l.5-2.6a7.6 7.6 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.13-.53.2-1.07.2-1.6Z",
};

function RailIcon({ name }: { name: RailName }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d={RAIL_PATHS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

/// One item in the banner's meta row: a small outline glyph, then the value.
const META_PATHS: Record<string, string> = {
  pin: "M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  link: "M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1",
  at: "M16 12a4 4 0 1 1-4-4m4 4v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5",
  cal: "M7 3v3m10-3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
};

function Meta({ icon, children }: { icon: keyof typeof META_PATHS; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <path d={META_PATHS[icon]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
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
  const { t, lang } = useLang();
  const { signer, setUpPrivy, useDevKey, devMode, busy } = useIdentity();

  /// Somebody else's page, when the URL names one. This is what makes a profile stored on chain
  /// worth the gas: "只有自己看得见等于没有" was the reason it went on chain, and until now there
  /// was still no way for anyone else to look at it.
  ///
  /// Read from the URL at mount rather than during render — `location` does not exist at export
  /// time, and reading it in a `useState` initialiser would produce markup that disagrees with the
  /// HTML being hydrated.
  const [viewing, setViewing] = useState<`0x${string}` | null>(null);
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("a");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (a && /^0x[0-9a-fA-F]{40}$/.test(a)) setViewing(a as `0x${string}`);
  }, []);

  /// True when this page is about somebody else. Nothing on it can be edited, and none of it is
  /// phrased as "your".
  const guest = viewing !== null && viewing.toLowerCase() !== signer?.address.toLowerCase();
  const address = viewing ?? signer?.address ?? null;

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
  /// The earliest thing the chain knows about this account.
  const joinedAt = (() => {
    const times = (rows ?? []).map((r) => Number(r.event.attestOpen));
    if (!times.length) return null;
    return new Date(Math.min(...times) * 1000).toLocaleDateString(
      lang === "zh" ? "zh-CN" : "en-GB",
      { year: "numeric", month: "long" },
    );
  })();

  const places = new Set(
    [
      ...(rows ?? []).map((r) => r.event.listing.venue),
      ...(hosted ?? []).map((e) => e.listing.venue),
    ].filter(Boolean),
  ).size;

  if (!address) {
    return (
      // The page's own shape, with the sign-in where the record would be — not a centred card
      // instead of the page. Somebody opening this link for the first time should see what the
      // screen is before being asked who they are, and the layout is most of the answer.
      <Frame>
        <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
          <nav
            aria-hidden
            className="hidden rounded-2xl border border-line bg-panel p-2 lg:block"
          >
            {[t("me.tabOverview"), t("me.tabJoined"), t("me.tabHosted"), t("me.tabSettings")].map(
              (label, i) => (
                <span
                  key={label}
                  className={`flex min-h-[44px] items-center rounded-xl px-3.5 text-[15px] ${
                    i === 0 ? "bg-accent/10 text-dim" : "text-faint"
                  }`}
                >
                  {label}
                </span>
              ),
            )}
          </nav>

          <div className="min-w-0 space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 md:p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] bg-cover bg-center opacity-40 lg:block"
                style={{
                  backgroundImage: `url(${basePath}/hero.webp)`,
                  WebkitMaskImage: "linear-gradient(to right, transparent, #000 55%)",
                  maskImage: "linear-gradient(to right, transparent, #000 55%)",
                }}
              />
              <div className="relative max-w-[46ch]">
                <h1 className="text-[26px] font-semibold tracking-[-0.02em] md:text-[30px]">
                  {t("nav.myProof")}
                </h1>
                <p className="mt-2 text-[16px] leading-relaxed text-dim">{t("me.signedOutBody")}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-faint">{t("me.signInFirst")}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
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
            </section>

            {/* The four figures, as dashes. Zeros would be a claim about this reader — that they
                have joined nothing — and nobody has said who they are yet. */}
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile value="—" label={t("me.eventsJoined")} />
              <Tile value="—" label={t("me.eventsHosted")} />
              <Tile value="—" label={t("me.staked")} />
              <Tile value="—" label={t("me.turnout")} />
            </dl>
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
        {/* The sheet's rail: six destinations, and a card beneath. A row on a phone — a vertical
            rail cost 250px of navigation above the first thing anybody came here to read, on the
            screen with the least room. */}
        <div className="lg:sticky lg:top-6 lg:space-y-4">
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:space-y-1 lg:rounded-2xl lg:border lg:border-line lg:bg-panel lg:p-2">
            {RAIL.filter(({ key }) => !(guest && key === "settings")).map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex min-h-[44px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border px-4 text-left text-[15px] transition-colors lg:w-full lg:rounded-xl lg:border-0 lg:px-3.5 ${
                  tab === key
                    ? "border-accent bg-accent/15 font-medium text-fg"
                    : "border-line-2 bg-panel text-dim hover:text-fg lg:bg-transparent"
                }`}
              >
                <RailIcon name={icon} />
                {t(label)}
              </button>
            ))}
          </nav>

          {/* The handwritten card the sheet puts under the rail. Its own artwork because the rail
              is the one column tall enough to carry one, and the page is otherwise all figures. */}
          <div
            aria-hidden
            className="hidden aspect-[210/150] rounded-2xl border border-line bg-cover bg-center lg:block"
            style={{ backgroundImage: `url(${basePath}/rail-card.webp)` }}
          />
        </div>

        <div className="min-w-0 space-y-6">
          {/* Said once, at the top. Everything below is phrased as "my" — that is right for the
              owner and wrong for a visitor, and one line naming whose page this is fixes the
              reading of all of it without translating every heading twice. */}
          {guest && <Notice>{t("me.viewingPublic", { who: shortAddress(address) })}</Notice>}
          {/* The sheet's banner: a large round avatar, the identity beside it, artwork filling
              the right half and bleeding to the edges. */}
          <section className="relative overflow-hidden rounded-2xl border border-line bg-panel">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 left-auto hidden w-[48%] bg-cover bg-center lg:block"
              style={{
                backgroundImage: `url(${basePath}/profile-banner.webp)`,
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 32%)",
                maskImage: "linear-gradient(to right, transparent 0%, #000 32%)",
              }}
            />
            <div className="relative flex min-h-[188px] flex-wrap items-start gap-5 p-6 md:min-h-[212px] md:p-8">
              <span
                aria-hidden
                className="h-[112px] w-[112px] shrink-0 rounded-full border border-line-2 md:h-[128px] md:w-[128px]"
                style={{
                  background: `linear-gradient(145deg, hsl(${hue} 58% 64%), hsl(${(hue + 45) % 360} 52% 44%))`,
                }}
              />
              <div className="min-w-0 max-w-[44ch] flex-1">
                <h1
                  className="bg-clip-text pb-[0.08em] text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-transparent md:text-[38px]"
                  style={{
                    fontFamily: '"Montserrat", var(--font-sans)',
                    backgroundImage:
                      "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
                  }}
                >
                  {profile?.name || signer?.label || shortAddress(address)}
                </h1>
                {profile?.bio && (
                  <p className="mt-2 max-w-[50ch] text-[16px] leading-relaxed text-dim">{profile.bio}</p>
                )}
                {/* The sheet's meta row: place · link · since. "Joined" is the earliest event this
                    account registered for — there is no sign-up moment in this product, and the
                    first deposit is the honest equivalent. */}
                <p className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[15px] text-faint">
                  {profile?.city && <Meta icon="pin">{profile.city}</Meta>}
                  {profile?.website && (
                    <Meta icon="link">
                      <ProfileLink href={withScheme(profile.website)} label={profile.website} />
                    </Meta>
                  )}
                  {profile?.x && (
                    <Meta icon="at">
                      <ProfileLink href={`https://x.com/${strip(profile.x)}`} label={`@${strip(profile.x)}`} />
                    </Meta>
                  )}
                  {joinedAt && <Meta icon="cal">{t("me.joined", { when: joinedAt })}</Meta>}
                </p>
                <p className="mt-2.5 break-all font-mono text-[13px] text-faint md:text-[14px]">{address}</p>
              </div>
              <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                {!guest && (
                  <button
                    type="button"
                    onClick={() => setTab("settings")}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-line-2 bg-ink/55 px-4 text-[15px] text-dim backdrop-blur-sm transition-colors hover:border-accent hover:text-fg"
                  >
                    {t("profile.edit")}
                  </button>
                )}
                <ShareProfile address={address} />
              </div>
            </div>
          </section>

          {/* Four figures and the tag panel on one row, as the sheet sets them. */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_296px]">
            <dl className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-4">
              <Tile value={rows ? String(rows.length) : null} label={t("me.eventsJoined")} icon="ticket" />
              <Tile value={hosted ? String(hosted.length) : null} label={t("me.eventsHosted")} icon="flag" />
              <Tile
                value={rows ? (staked === 0n ? "0 MON" : mon(staked)) : null}
                label={t("me.staked")}
                icon="coin"
              />
              <Tile
                value={rows ? (rate === null ? "—" : `${rate}%`) : null}
                label={t("me.turnout")}
                icon="check"
                tone={rate !== null && rate >= 80 ? "ok" : undefined}
              />
            </dl>
            <IdentityTags
              joined={rows?.length ?? 0}
              hosted={hosted?.length ?? 0}
              confirmed={attended}
              loading={!rows || !hosted}
            />
          </div>

          {/* The sheet's tab strip. The rail on the left selects the same sections. */}
          <ProfileTabs tab={tab} onPick={setTab} />

          {failed && <Notice tone="bad">{t("me.unreachable")}</Notice>}

          {/* Three across, as the sheet draws: what is at stake, the two roles, the calendar. */}
          {tab === "overview" && (
            <div className="grid min-w-0 gap-4 lg:grid-cols-3 lg:items-stretch">
              <EarnedRewards rows={rows} loading={!rows} />
              <ProfileRoles
                joined={rows?.length ?? 0}
                turnout={rate}
                hosted={hosted?.length ?? 0}
                reach={reach}
                loading={!rows || !hosted}
              />
              <ActivityCalendar
                joined={(rows ?? []).map(({ event, confirmed }) => ({ event, confirmed }))}
                hosted={hosted ?? []}
              />
            </div>
          )}

          {tab === "calendar" && (
            <ActivityCalendar
              joined={(rows ?? []).map(({ event, confirmed }) => ({ event, confirmed }))}
              hosted={hosted ?? []}
            />
          )}

          {tab === "rewards" && <EarnedRewards rows={rows} loading={!rows} />}

          {tab === "achievements" && (
            <Achievements
              stats={{ joined: rows?.length ?? 0, confirmed: attended, hosted: hosted?.length ?? 0, reach }}
              loading={!rows || !hosted}
            />
          )}

          {/* Side by side on a wide screen, the way the sheet lays them out — and stacked below
              `lg`, because two lists of event rows at half width start wrapping their titles. */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-3 lg:items-stretch">
          {(tab === "overview" || tab === "joined") && (
            <EventList
              title={t("me.recentJoined")}
              empty={guest ? t("me.noneYetPublic") : t("me.noneYet")}
              emptyHref={guest ? undefined : "/events"}
              emptyCta={guest ? undefined : t("me.findOne")}
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
              empty={guest ? t("me.noneHostedPublic") : t("me.noneHosted")}
              emptyHref={guest ? undefined : "/organizer"}
              emptyCta={guest ? undefined : t("events.createFirst")}
              loading={!hosted}
              t={t}
              items={(hosted ?? []).map((event) => ({
                event,
                right: { text: t("me.nRegistered", { n: String(event.registered) }), ok: false },
              }))}
            />
          )}
          {tab === "overview" && (
            <Achievements
              stats={{ joined: rows?.length ?? 0, confirmed: attended, hosted: hosted?.length ?? 0, reach }}
              loading={!rows || !hosted}
            />
          )}
          </div>

          {tab === "overview" && (
            /* The sheet's impact row. Four figures and the share button, full width.
               活动满意度 92% is the one the sheet has and this does not: nothing in this product
               collects a rating, so that figure could only ever have been made up. */
            <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <SectionTitle zh={t("me.impact")} en="My Impact" />
                <ShareProfile address={address} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Impact icon="people" value={hosted ? String(reach) : null} label={t("me.reach")} />
                <Impact icon="check" value={rows ? (rate === null ? "—" : `${rate}%`) : null} label={t("me.turnout")} />
                <Impact icon="pin" value={hosted ? String(places) : null} label={t("me.places")} />
                <Impact icon="coin" value={hosted ? (escrowed === 0n ? "0 MON" : mon(escrowed)) : null} label={t("me.escrowed")} />
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
  const t = useT();
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav page={t("nav.myProof")} />
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
/// One of the four figures under the banner.
///
/// Leads with a tinted round icon, as the sheet draws. Four identical dark cards with a number in
/// each is a row the eye slides off; the icon is what makes "which one was the money" answerable
/// without reading the captions again.
const TILE_ICONS: Record<string, { path: string; tone: string }> = {
  ticket: {
    path: "M4 9V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 6v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-6ZM12 7v10",
    tone: "text-accent-2 bg-accent/15",
  },
  flag: { path: "M6 21V4m0 0h10l-2 3 2 3H6", tone: "text-accent-2 bg-accent/15" },
  coin: {
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m2.5-7.5H10.8a1.8 1.8 0 0 0 0 3.6h2.4a1.8 1.8 0 0 1 0 3.6H9.5",
    tone: "text-warn bg-warn/15",
  },
  check: { path: "m9 12 2 2 4-4M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z", tone: "text-ok bg-ok/15" },
};

function Tile({
  value,
  label,
  tone,
  sub,
  icon = "ticket",
}: {
  value: string | null;
  label: string;
  tone?: "ok";
  sub?: string;
  icon?: keyof typeof TILE_ICONS;
}) {
  const { path, tone: iconTone } = TILE_ICONS[icon];
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d={path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <dt
          // `truncate`, not `whitespace-nowrap`: "0.0000 MON" is wider than a quarter of the row
          // at this size, and nowrap let it run out of the card rather than fit inside it.
          className={`min-w-0 truncate text-[22px] font-semibold leading-none tracking-[-0.025em] tabular-nums md:text-[26px] ${
            tone === "ok" ? "text-ok" : "text-fg"
          }`}
        >
          {value ?? <Skeleton className="h-7 w-14 align-middle" />}
        </dt>
      </div>
      <dd className="mt-2.5 text-[14px] text-dim">{label}</dd>
      {sub && <dd className="mt-1 text-[13px] text-faint">{sub}</dd>}
    </div>
  );
}

/// One figure in the impact row. The sheet gives each a tinted glyph.
const IMPACT_ICONS: Record<string, { path: string; tone: string }> = {
  people: {
    path: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11h4M19 9v4",
    tone: "text-accent-2 bg-accent/15",
  },
  check: { path: "m9 12 2 2 4-4M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z", tone: "text-ok bg-ok/15" },
  pin: {
    path: "M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    tone: "text-accent-2 bg-accent/15",
  },
  coin: {
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m2.5-7.5H10.8a1.8 1.8 0 0 0 0 3.6h2.4a1.8 1.8 0 0 1 0 3.6H9.5",
    tone: "text-warn bg-warn/15",
  },
};

function Impact({
  value,
  label,
  icon = "people",
}: {
  value: string | null;
  label: string;
  icon?: keyof typeof IMPACT_ICONS;
}) {
  const { path, tone } = IMPACT_ICONS[icon];
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d={path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <dt className="truncate text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums md:text-[24px]">
          {value ?? <Skeleton className="h-6 w-14 align-middle" />}
        </dt>
        <dd className="mt-1.5 text-[13px] leading-snug text-faint">{label}</dd>
      </div>
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
  /// Both absent on somebody else's page — "create your first event" under a stranger's empty
  /// list is an invitation addressed to the wrong person.
  emptyHref?: string;
  emptyCta?: string;
  loading: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-line bg-panel p-5 md:p-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">{title}</h2>
      {loading ? (
        <div className="mt-3 space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3">
          <p className="text-[16px] text-dim">{empty}</p>
          {emptyHref && emptyCta && (
            <Link
              href={emptyHref}
              className="mt-3 inline-flex min-h-[44px] items-center text-[15px] text-accent-2 hover:text-fg"
            >
              {emptyCta} →
            </Link>
          )}
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
