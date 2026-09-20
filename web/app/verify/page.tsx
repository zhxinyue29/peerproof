"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useBack } from "@/lib/back";
import ProofNetwork, { edgeKey, type EdgeKey } from "@/components/ProofNetwork";
import { Card, Eyebrow, KeyValue, Notice, Skeleton } from "@/components/ui";
import { ESCROW_ADDRESS, eventId, explorerTxUrl, hasDeployment, isLocalChain } from "@/lib/chain";
import { useVisiblePoll } from "@/lib/poll";
import { both, fiat, mon, sentenceGap, shortAddress, shortenError } from "@/lib/format";
import { readHistory, type EventHistory, type Vouch } from "@/lib/logs";
import { useEvent } from "@/lib/useEvent";
import { useEventMeta } from "@/lib/eventMeta";
import { useT } from "@/lib/i18n";

/// Public, no key required. The whole product claims nobody has to be trusted, and a claim like
/// that is worth nothing if the only way to check it is to believe our own UI. Everything here is
/// read straight from chain events, so a sceptic can reconstruct the same numbers themselves.
///
/// The layout is the argument. What this page has that no competitor's event app can have is the
/// evidence itself, so the evidence gets the stage: the proof network runs the full width with no
/// panel around it, the two figures it produces sit above it as plain type, and the settlement
/// arithmetic — the one thing here that really is a ledger — keeps its panel underneath. It was
/// the other way round before, a 400px thumbnail in a box beside a wall of rows, which showed a
/// page that *has* evidence rather than a page that *is* evidence.
///
/// Nothing on this page is computed from anything but the contract's own logs.
export default function VerifyPage() {
  const t = useT();
  const back = useBack("/event");
  const { ev } = useEvent(null, 4000);
  const [history, setHistory] = useState<EventHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = useEventMeta(eventId());

  // Two sources for one highlight. Clicking pins an edge (a phone has no hover, and reading a hash
  // off a line you have to keep your finger on is not reading); moving the pointer previews one
  // without disturbing what is pinned. Resolved here rather than in the graph because the vouch
  // list lights the same edges from the other end.
  const [pinned, setPinned] = useState<EdgeKey | null>(null);
  const [hovered, setHovered] = useState<EdgeKey | null>(null);
  const active = hovered ?? pinned;

  useEffect(() => {
    if (!hasDeployment) return;
    const load = async () => {
      try {
        setHistory(await readHistory(eventId()));
        setError(null);
      } catch (e) {
        setError(shortenError(e, t));
      }
    };
    void load();
  }, []);

  // 15s, and only while somebody is looking. The public record is an archive, not a ticker.
  //
  // The in-flight guard is not belt and braces. Rebuilding the graph from logs is rate-limited and
  // can outlast the interval, and without this the ticks queue up behind each other: each one
  // starts another full read, the reads overlap, and the page never stops loading — which is what
  // it did, for exactly as long as anyone left it open.
  const reading = useRef(false);
  useVisiblePoll(() => {
    if (!hasDeployment || reading.current) return;
    reading.current = true;
    void readHistory(eventId())
      .then(setHistory)
      .catch(() => {})
      .finally(() => {
        reading.current = false;
      });
  }, 15000);

  if (!hasDeployment) {
    return (
      <Frame title={t("verify.title")}>
        <Notice>{t("common.noContract")}</Notice>
      </Frame>
    );
  }

  const forfeited =
    ev && history ? ev.deposit * BigInt(Math.max(0, ev.registered - ev.confirmed)) : 0n;

  // The newest thing this event did on chain. The render's top-right action is a way out of our own
  // UI, and the only honest target for it is a transaction we can prove exists — a settlement once
  // there is one, otherwise the latest accepted vouch. Before anything has happened there is
  // nothing to open, and the action is withheld rather than pointed at a guess.
  // Bound rather than called inline: sentenceGap has to read the very string it follows.
  const settledNote = t("verify.settledNote");
  const noApproval = t("verify.noOrganizerApproved");

  const latestTx = history?.settlement?.hash ?? history?.vouches.at(-1)?.hash ?? null;
  const explorerHref = latestTx ? explorerTxUrl(latestTx) : "";

  return (
    <Frame
      title={t("verify.title")}
      subtitle={t("verify.subtitle")}
      action={
        explorerHref ? (
          <a
            href={explorerHref}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-line-2 bg-panel px-5 text-[16px] text-dim transition-colors hover:border-accent/50 hover:text-fg"
          >
            {t("verify.openOnExplorer")} ↗
          </a>
        ) : undefined
      }
    >
      {(isLocalChain || error) && (
        <div className="flex flex-col gap-3 pb-5">
          {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}
          {error && <Notice tone="bad">{error}</Notice>}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* The stage. No border, no panel: the page's own background is the  */}
      {/* room, and a frame around the evidence would make it a picture of  */}
      {/* evidence.                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="min-w-0">
        <div className="flex flex-col gap-5 pb-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            {/* Which room. The page title is the product's claim; this is the event the claim is
                about, and on a page whose whole job is checkability it cannot be left implicit. */}
            <p className="truncate text-[14px] text-faint">
              {meta.title} · {t("common.eventNumber", { id: eventId().toString() })}
            </p>
            <h2 className="text-[24px] font-semibold tracking-[-0.015em] md:text-[26px]">
              {t("verify.roomDecided")}
            </h2>
          </div>

          {/* The two numbers the graph produces, said out loud before it is read. Plain type on the
              page, not tiles — four bordered boxes here would put the evidence back in a box by a
              different route. */}
          <div className="flex shrink-0 flex-wrap items-end gap-x-9 gap-y-4">
            <Figure
              value={ev ? `${ev.confirmed}` : "—"}
              label={t("verify.statVerified")}
              tone={ev && ev.confirmed > 0 ? "ok" : "fg"}
            />
            <Figure value={history ? `${history.vouches.length}` : "—"} label={t("verify.statProofs")} />
            {history && (
              <p
                className={`pb-1.5 text-[15px] ${history.settlement ? "text-ok" : "text-faint"}`}
              >
                {history.settlement ? t("verify.statSettled") : t("verify.statPending")}
              </p>
            )}
          </div>
        </div>

        {history ? (
          <ProofNetwork
            participants={history.participants}
            vouches={history.vouches}
            selected={active}
            onSelect={setPinned}
            onHover={setHovered}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 py-20">
            <Skeleton className="h-52 w-52 rounded-full" />
            <span className="text-[15px] text-faint">{t("verify.readingChain")}</span>
          </div>
        )}

        {/* Fixed height, always rendered. This is the line where a selected edge tells you which
            transaction it is; if it appeared only when something was selected, every hover would
            shove the page down by a row — on the page whose point is careful inspection. */}
        <InspectBar history={history} active={active} />

        <Legend />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Underneath: the arithmetic, and every row behind it.             */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-10 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <div className="min-w-0 space-y-8">
          {history && (history.vouches.length > 0 || history.settlement) && (
            <div className="min-w-0 space-y-3">
              <h3 className="text-[18px] font-semibold tracking-[-0.01em]">
                {t("verify.everyVouch", { n: history.vouches.length })}
              </h3>
              <ProofList
                history={history}
                active={active}
                onHover={setHovered}
                onSelect={setPinned}
              />
            </div>
          )}

          {history && history.participants.length > 0 && (
            <div className="min-w-0 space-y-3">
              <h3 className="text-[18px] font-semibold tracking-[-0.01em]">
                {t("verify.whoWasThere")}
              </h3>
              <Roster history={history} />
            </div>
          )}

          <div className="space-y-2 text-[14px] leading-relaxed text-faint">
            <p className="break-all">
              <span className="font-mono">{ESCROW_ADDRESS}</span> ·{" "}
              {t("common.eventNumber", { id: eventId().toString() })}
              {history &&
                ` · ${t("verify.blocks", { from: `${history.fromBlock}`, to: `${history.toBlock}` })}`}
            </p>
            {/* Named, not hidden. A page arguing "do not take our word for it" has to say which
                reader produced the numbers on it — and if the index is gone, that it fell back
                rather than quietly showing less. */}
            {history && (
              <p>{history.source === "envio" ? t("verify.viaEnvio") : t("verify.viaLogs")}</p>
            )}
            <p>{t("verify.noPayoutFunction")}</p>
            <Link
              {...back}
              className="inline-flex min-h-[44px] items-center text-dim underline decoration-line-2"
            >
              {t("verify.backToEvent")}
            </Link>
          </div>
        </div>

        {/* The one thing on this page that is genuinely a ledger, and the only thing that keeps a
            panel. */}
        <Card className="min-w-0 space-y-5 lg:sticky lg:top-9">
          <h2 className="text-[22px] font-semibold tracking-[-0.01em]">{t("verify.settlement")}</h2>

          {ev ? (
            <>
              <Payout
                deposit={ev.deposit}
                // The contract's own figure once it has settled; until then the projection, which
                // is labelled as one. The two are never blended.
                share={
                  history?.settlement
                    ? history.settlement.sharePerAttendee
                    : ev.confirmed > 0
                      ? ev.deposit + forfeited / BigInt(ev.confirmed)
                      : null
                }
                settled={!!history?.settlement}
              />

              <div className="space-y-2.5">
                <Eyebrow>{t("verify.arithmetic")}</Eyebrow>
                <KeyValue
                  label={`${ev.registered} × ${both(ev.deposit)}`}
                  value={fiat(ev.deposit * BigInt(ev.registered))}
                />
                <KeyValue
                  label={t("verify.confirmedPresent", { n: ev.confirmed })}
                  value={t("verify.getDepositBack")}
                />
                <KeyValue
                  label={t("verify.neverConfirmed", {
                    n: Math.max(0, ev.registered - ev.confirmed),
                  })}
                  value={t("verify.forfeit", { amount: fiat(forfeited) })}
                />
              </div>

              <p className="text-[14px] leading-relaxed text-dim">
                {history?.settlement ? (
                  <>
                    {settledNote}
                    {sentenceGap(settledNote)}
                    {explorerTxUrl(history.settlement.hash) && (
                      <a
                        href={explorerTxUrl(history.settlement.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-2 underline decoration-line-2"
                      >
                        {t("verify.settlementTx")}
                      </a>
                    )}
                  </>
                ) : (
                  t("verify.projectedNote")
                )}
              </p>

              <p className="text-[14px] leading-relaxed text-dim">
                <span className="font-semibold text-fg">{noApproval}</span>
                {sentenceGap(noApproval)}
                {t("verify.payoutFollowsGraph")}
              </p>
            </>
          ) : (
            <Skeleton className="h-40 w-full rounded-xl" />
          )}
        </Card>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// One of the stage's headline figures. Mint only when the chain has actually confirmed somebody:
/// a green zero is a claim nothing on chain supports.
function Figure({ value, label, tone = "fg" }: { value: string; label: string; tone?: "fg" | "ok" }) {
  return (
    <div className="min-w-0">
      <p
        className={`text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[46px] ${
          tone === "ok" ? "text-ok" : "text-fg"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-[15px] text-dim">{label}</p>
    </div>
  );
}

/// The line under the graph that names whichever edge is being inspected.
///
/// It keeps its height whether or not anything is selected — see the call site. Its resting state
/// is the instruction, so the interaction is discoverable without a tooltip nobody hovers.
function InspectBar({ history, active }: { history: EventHistory | null; active: EdgeKey | null }) {
  const t = useT();
  const v: Vouch | undefined = history?.vouches.find((x) => edgeKey(x) === active);
  const url = v ? explorerTxUrl(v.hash) : "";

  return (
    <div className="flex min-h-[52px] flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line pt-4 text-[15px]">
      {v ? (
        <>
          <span className="font-mono text-fg">
            {t("verify.inspectVouch", { from: shortAddress(v.from), to: shortAddress(v.to) })}
          </span>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent-2 underline decoration-line-2"
            >
              {`${v.hash.slice(0, 10)}…${v.hash.slice(-6)}`} ↗
            </a>
          ) : (
            <span className="font-mono text-faint">{`${v.hash.slice(0, 10)}…${v.hash.slice(-6)}`}</span>
          )}
        </>
      ) : (
        <span className="text-faint">{t("verify.inspectHint")}</span>
      )}
    </div>
  );
}

/// What the two node states mean.
///
/// 15px, not 12px. This is read in a room with the lights down, and the smallest type anywhere
/// else in the product is 14.
function Legend() {
  const t = useT();
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 pt-3 text-[15px] text-faint">
      <span className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-ok bg-panel" />{" "}
        {t("graph.confirmed")}
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-line-2 bg-panel" />{" "}
        {t("graph.neverConfirmed")}
      </span>
      <span>{t("graph.numberMeans")}</span>
    </div>
  );
}

/// The one number this page exists to justify.
///
/// `mon()` rather than `both()`: at 38px a mainnet build's `$0.35 (13.33 MON)` wraps to two lines
/// and stops reading as a single figure. The fiat equivalent is still on every row of the breakdown
/// underneath, so nothing is hidden by showing the on-chain unit here.
function Payout({
  deposit,
  share,
  settled,
}: {
  deposit: bigint;
  share: bigint | null;
  settled: boolean;
}) {
  const t = useT();
  return (
    <div className="min-w-0 rounded-2xl border border-line-2 bg-raised p-5">
      <p className="text-[38px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[40px]">
        {share === null ? "—" : mon(share)}
      </p>
      <p className="mt-2.5 text-[16px] leading-relaxed text-dim">
        {settled ? t("verify.eachReceives") : t("verify.eachWouldReceive")}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-dim">
        {share === null
          ? t("verify.nobodyConfirmedYet")
          : t("verify.depositPlusShare", {
              deposit: mon(deposit),
              share: mon(share - deposit),
            })}
      </p>
    </div>
  );
}

/// Every transaction behind the numbers above, newest first, each one a link out of this UI.
///
/// The settlement sits at the head of the list rather than in its own block: it is the last thing
/// that happened to this event, and separating it would suggest it came from somewhere other than
/// the same log stream as the vouches.
///
/// Collapsed past three, because the full list is reference material and the graph above is the
/// argument — but the count in the heading is always the true one, so collapsing can never be
/// mistaken for there being less evidence than there is.
function ProofList({
  history,
  active,
  onHover,
  onSelect,
}: {
  history: EventHistory;
  active: EdgeKey | null;
  onHover: (k: EdgeKey | null) => void;
  onSelect: (k: EdgeKey | null) => void;
}) {
  const t = useT();
  const [all, setAll] = useState(false);

  const rows: Array<{ key: string; edge: EdgeKey | null; label: string; hash: string }> = [];
  if (history.settlement) {
    rows.push({
      key: history.settlement.hash,
      edge: null,
      label: t("verify.settlementRow"),
      hash: history.settlement.hash,
    });
  }
  for (const v of [...history.vouches].reverse()) {
    rows.push({
      key: edgeKey(v),
      edge: edgeKey(v),
      label: `${shortAddress(v.from)} → ${shortAddress(v.to)}`,
      hash: v.hash,
    });
  }

  const shown = all ? rows : rows.slice(0, 3);

  return (
    <div className="min-w-0">
      <ul className="min-w-0">
        {shown.map((r) => {
          const url = explorerTxUrl(r.hash);
          const short = `${r.hash.slice(0, 6)}…${r.hash.slice(-4)}`;
          const isActive = r.edge !== null && r.edge === active;
          return (
            <li
              key={r.key}
              // Hovering a row lights its line in the graph above, and clicking pins it. The list
              // and the picture are the same evidence seen twice; nothing here is a separate table.
              onMouseEnter={() => onHover(r.edge)}
              onMouseLeave={() => onHover(null)}
              onClick={() => r.edge && onSelect(isActive ? null : r.edge)}
              className={`-mx-2 flex min-w-0 items-center justify-between gap-3 rounded-lg border-b border-line px-2 py-2.5 transition-colors last:border-0 ${
                isActive ? "bg-raised" : ""
              } ${r.edge ? "cursor-pointer" : ""}`}
            >
              <span
                className={`min-w-0 truncate font-mono text-[14px] ${isActive ? "text-fg" : "text-dim"}`}
              >
                {r.label}
              </span>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-[14px] text-accent-2 underline decoration-line-2"
                >
                  {short} ↗
                </a>
              ) : (
                <span className="shrink-0 font-mono text-[14px] text-faint">{short}</span>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length > 3 && (
        <button
          type="button"
          onClick={() => setAll((x) => !x)}
          className="mt-2 inline-flex min-h-[44px] items-center text-[15px] text-dim underline decoration-line-2"
        >
          {all ? t("verify.showLess") : t("verify.showAll", { n: rows.length })}
        </button>
      )}
    </div>
  );
}

/// Who registered, and what the contract says became of them.
///
/// Plain rows in columns rather than a bordered list: this is the roster the graph's nodes stand
/// for, and it should read as a caption to the picture, not as a second dataset.
function Roster({ history }: { history: EventHistory }) {
  const t = useT();
  return (
    <ul className="grid gap-x-8 gap-y-1.5 font-mono text-[14px] sm:grid-cols-2 xl:grid-cols-3">
      {history.participants.map((p) => (
        <li key={p.address} className="flex items-center justify-between gap-3 border-b border-line py-1.5">
          <span className={p.confirmed ? "text-fg" : "text-faint"}>{shortAddress(p.address)}</span>
          <span className={p.confirmed ? "text-ok" : "text-faint"}>
            {/* "Deposit forfeited" is a claim about money that has already moved. Before settlement
                it has not, and this said it about everybody who had not yet reached quorum —
                including people standing in the room at that moment, collecting vouches, on the
                page that exists to prove nothing here is invented. */}
            {p.confirmed
              ? p.viaOrganizer
                ? t("graph.presentFallback")
                : t("graph.present")
              : history.settlement
                ? t("graph.forfeited")
                : t("graph.notYet")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/// Top bar plus the page column, replacing the app rail.
///
/// The participant screens all wear the top bar; this one had been left on the sidebar, so arriving
/// here from the account page swapped the whole chrome. Caught by a language-switch test that
/// printed the nav items as part of the page text — "首页 活动 验证" is a rail, and no other
/// participant screen has one.
///
/// The two-column grid moved into the page body: the settlement rail used to run the whole height
/// beside a graph squeezed into what was left, and the graph is the thing this page is for.
function Frame({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav page={title} />
        <main className="pb-16 pt-6 md:pt-8">
          <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <h1
                className="bg-clip-text pb-[0.1em] text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-transparent md:text-[40px]"
                style={{
                  fontFamily: '"Montserrat", var(--font-sans)',
                  backgroundImage:
                    "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="text-[16px] leading-relaxed text-dim md:max-w-[58ch]">{subtitle}</p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
