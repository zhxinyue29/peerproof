"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import EventCover from "@/components/EventCover";
import { useIdentity } from "@/components/IdentityProvider";
import { Notice, Skeleton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import { ESCROW_ADDRESS, explorerAddressUrl, hasDeployment, publicClient } from "@/lib/chain";
import { readAllEvents, type EventSummary } from "@/lib/events";
import { mon, shortAddress } from "@/lib/format";

/// What this account can prove.
///
/// Built from the design's Proof Profile, minus everything on it that does not exist. The sheet
/// shows 貢獻項目 8, 社群聲譽 1,250, an achievements gallery, saved events, invitations and a
/// "Verified Builder" badge. There is no reputation score in this system, no projects, no badges
/// and nothing to save — and inventing them here would be worse than leaving the page plainer than
/// the sheet, because this is the one screen whose entire subject is what somebody can and cannot
/// substantiate. A product that argues you should not have to trust anyone does not get to make up
/// a number called 聲譽.
///
/// So every figure below is read from the escrow and computable by anyone with the same address:
///
///   events   — how many of the contract's events this account registered for
///   shown up — of those, how many the room confirmed present
///   rate     — the second over the first, and absent entirely until the first has happened
///   staked   — deposits this account put into the contract, summed
///
/// Two reads per event and no indexer. That is affordable because the listing is small and this
/// page is not on anybody's critical path; if the contract ever holds hundreds of events this wants
/// a log scan instead, and the first sign will be this page getting slow rather than wrong.

type Row = { event: EventSummary; registered: boolean; confirmed: boolean };

export default function MePage() {
  const t = useT();
  const { signer } = useIdentity();
  const address = signer?.address ?? null;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | "verified" | "awaiting">("all");

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
                address: ESCROW_ADDRESS,
                abi,
                functionName: "isRegistered",
                args: [e.id, address],
              }),
              publicClient.readContract({
                address: ESCROW_ADDRESS,
                abi,
                functionName: "isConfirmed",
                args: [e.id, address],
              }),
            ])) as [boolean, boolean];
            return { event: e, registered, confirmed };
          }),
        );
        if (!dropped) setRows(states.filter((s) => s.registered));
      } catch {
        // The page says "cannot reach the contract" rather than "you have attended nothing". Those
        // are opposite claims and only one of them is survivable to get wrong on this screen.
        if (!dropped) setFailed(true);
      }
    })();

    return () => {
      dropped = true;
    };
  }, [address]);

  const attended = rows?.filter((r) => r.confirmed).length ?? 0;
  const staked = rows?.reduce((n, r) => n + r.event.deposit, 0n) ?? 0n;
  // Absent rather than 0% when nothing has been registered yet: "0% turnout" reads as a record of
  // failure, and having no record at all is not the same thing.
  const rate = rows && rows.length > 0 ? Math.round((attended / rows.length) * 100) : null;
  const shown = (rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "verified" ? r.confirmed : !r.confirmed,
  );

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav />

        <main className="pb-16 pt-6 md:pt-10">
          {!address ? (
            /* A whole blank page carrying one line of grey text reads as a page that failed to
               load, not as a page waiting for you. This says what the screen is for, what it will
               show, and the one thing to do next — which is the job every empty state has and the
               one a bare notice cannot do. */
            <div className="mx-auto max-w-[520px] rounded-2xl border border-line bg-panel p-8 text-center md:mt-10">
              <span
                aria-hidden
                className="mx-auto block h-14 w-14 rounded-2xl border border-line-2"
                style={{ background: "linear-gradient(145deg, #6e54ff, #3a2da8)" }}
              />
              <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em]">{t("nav.myProof")}</h1>
              <p className="mt-2 text-[16px] leading-relaxed text-dim">{t("me.signedOutBody")}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-faint">{t("me.signInFirst")}</p>
              <Link
                href="/events"
                className="mt-6 inline-flex min-h-[48px] items-center rounded-xl bg-accent px-6 text-[16px] font-medium text-white transition-transform duration-100 active:scale-[0.985]"
              >
                {t("me.findOne")}
              </Link>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-5">
                {/* The same address-derived colour the app draws everywhere else. It is a weak
                    identity check rather than decoration: the same account is the same colour on
                    every screen, so a wrong account is visibly a different one before a single
                    character has been read. */}
                <Identicon address={address} />
                <div className="min-w-0">
                  <h1
                    className="bg-clip-text pb-[0.08em] text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-transparent md:text-[40px]"
                    style={{
                      fontFamily: '"Montserrat", var(--font-sans)',
                      backgroundImage:
                        "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
                    }}
                  >
                    {signer?.label ?? shortAddress(address)}
                  </h1>
                  <a
                    href={explorerAddressUrl(address)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 font-mono text-[14px] text-dim hover:text-fg"
                  >
                    {address}
                    <span aria-hidden>↗</span>
                  </a>
                </div>
              </header>

              {/* Four tiles, as the sheet has. Its four are 12 events, 8 projects, 98% turnout and
                  1,250 reputation; two of those do not exist, so the fourth here is the total
                  staked — which was a grey footnote under the row and is as much a fact about this
                  account as the other three. */}
              <dl className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat value={rows ? String(rows.length) : null} label={t("me.eventsJoined")} />
                <Stat value={rows ? String(attended) : null} label={t("me.confirmedPresent")} />
                <Stat
                  value={rows ? (rate === null ? "—" : `${rate}%`) : null}
                  label={t("me.turnout")}
                  tone={rate !== null && rate >= 80 ? "ok" : undefined}
                />
                <Stat value={rows ? mon(staked) : null} label={t("me.staked")} />
              </dl>

              <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] md:text-[26px]">
                  {t("me.history")}
                </h2>
                {/* The sheet's chips, narrowed to the two states that exist. "Verified" is the one
                    an account cannot reach by signing up, so it is worth being able to isolate. */}
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", t("me.filterAll")],
                    ["verified", t("me.verified")],
                    ["awaiting", t("me.awaiting")],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`min-h-[40px] rounded-full border px-4 text-[14px] transition-colors ${
                        filter === key
                          ? "border-accent bg-accent/15 text-fg"
                          : "border-line-2 text-dim hover:text-fg"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {failed ? (
                <Notice tone="bad">{t("me.unreachable")}</Notice>
              ) : !rows ? (
                <div className="mt-4 space-y-3">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />
                  ))}
                </div>
              ) : shown.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
                  <p className="text-[16px] text-dim">{t("me.noneYet")}</p>
                  <Link
                    href="/events"
                    className="mt-3 inline-flex min-h-[44px] items-center text-[15px] text-accent-2 hover:text-fg"
                  >
                    {t("me.findOne")} →
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {shown.map(({ event, confirmed }) => (
                    <li key={event.id.toString()}>
                      <Link
                        href={`/event?event=${event.id}`}
                        className="flex min-w-0 items-center gap-4 rounded-2xl border border-line bg-panel p-3 transition-colors hover:border-line-2"
                      >
                        <EventCover id={event.id} nodes={5} className="h-[64px] w-[96px] shrink-0 rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[16px] font-medium">
                            {event.listing.title || t("common.eventNumber", { id: event.id.toString() })}
                          </p>
                          {/* The sheet puts place and date under each title. There is no place on
                              chain yet — `venue` was added to the listing tonight and no event has
                              been described with one — so this carries what the contract does know:
                              when the doors open, and what it cost to hold a place. */}
                          <p className="mt-0.5 truncate text-[14px] text-dim">
                            {event.listing.venue ? `${event.listing.venue} · ` : ""}
                            {new Date(Number(event.attestOpen) * 1000).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="shrink-0 text-[15px] font-medium tabular-nums text-accent-2">
                          {mon(event.deposit)}
                        </span>
                        {/* Green means the room vouched for this account, not that the transaction
                            went through. It is the only state on this page that cannot be reached
                            by signing up — which is the whole reason the page exists. */}
                        {confirmed ? (
                          <span className="shrink-0 rounded-full bg-ok/15 px-3 py-1.5 text-[13px] font-medium text-ok">
                            {t("me.verified")}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-line-2 px-3 py-1.5 text-[13px] text-faint">
                            {t("me.awaiting")}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {/* The public record, which lost its only entrance when the nav came out of the bar.
                  It belongs here rather than in a menu: it answers "prove it" about the list
                  directly above, and it is where somebody goes after reading their own figures and
                  wanting to see the transactions they came from. Pointed at the newest event,
                  because that is the one whose graph has anything in it. */}
              {rows && rows.length > 0 && (
                <Link
                  href={`/verify?event=${rows[0].event.id}`}
                  className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[15px] text-accent-2 transition-colors hover:text-fg"
                >
                  {t("verify.title")}
                  <span aria-hidden>→</span>
                </Link>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string | null; label: string; tone?: "ok" }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 md:p-5">
      <dt
        className={`text-[30px] font-semibold leading-none tracking-[-0.025em] tabular-nums md:text-[34px] ${
          tone === "ok" ? "text-ok" : "text-accent-2"
        }`}
      >
        {value ?? <Skeleton className="h-8 w-16 align-middle" />}
      </dt>
      <dd className="mt-2 text-[14px] text-dim">{label}</dd>
    </div>
  );
}

function Identicon({ address }: { address: `0x${string}` }) {
  const hue = Number.parseInt(address.slice(2, 6), 16) % 360;
  return (
    <span
      aria-hidden
      className="h-16 w-16 shrink-0 rounded-2xl border border-line-2 md:h-20 md:w-20"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 58% 64%), hsl(${(hue + 45) % 360} 52% 44%))`,
      }}
    />
  );
}
