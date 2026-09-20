"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useBack } from "@/lib/back";
import ProofNetwork, { NetworkSkeleton, edgeKey, type EdgeKey } from "@/components/ProofNetwork";
import { Notice } from "@/components/ui";
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
/// The page is one stage and four captions, in that order: who this is about, the graph at the
/// size of the room, the three facts the graph produces, what the contract therefore pays, and
/// every transaction behind all of it. Nothing on this page is computed from anything but the
/// contract's own logs.
///
/// What it is not, any more, is a dashboard. Two earlier versions put the graph beside a 380px
/// settlement rail, and however few borders that rail had it was still an equal — a page arguing
/// "look at the evidence" that gave the evidence half the width. The rail is now a panel floating
/// under the stage, narrower than the graph and unmistakably after it.
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

  const load = useCallback(async () => {
    try {
      setHistory(await readHistory(eventId()));
      setError(null);
    } catch (e) {
      setError(shortenError(e, t));
    }
  }, [t]);

  useEffect(() => {
    if (!hasDeployment) return;
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
      <Frame>
        <div className="py-16">
          <Notice>{t("common.noContract")}</Notice>
        </div>
      </Frame>
    );
  }

  const forfeited =
    ev && history ? ev.deposit * BigInt(Math.max(0, ev.registered - ev.confirmed)) : 0n;

  // The newest thing this event did on chain. The stage's one outbound action is a way out of our
  // own UI, and the only honest target for it is a transaction we can prove exists — a settlement
  // once there is one, otherwise the latest accepted vouch. Before anything has happened there is
  // nothing to open, and the action is withheld rather than pointed at a guess.
  const latestTx = history?.settlement?.hash ?? history?.vouches.at(-1)?.hash ?? null;
  const explorerHref = latestTx ? explorerTxUrl(latestTx) : "";

  return (
    <Frame>
      {/* ═══ 1. whose record this is ═══
          One line, small, quiet. The page's subject is the graph; this is the label on the
          exhibit, and an event title at hero scale would compete with its own evidence. */}
      <header className="flex flex-col gap-3 pb-6 pt-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <h1
            className="bg-clip-text pb-[0.08em] text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em] text-transparent md:text-[30px]"
            style={{
              fontFamily: '"Montserrat", var(--font-sans)',
              backgroundImage:
                "linear-gradient(97deg, #ffffff 0%, #efeaff 28%, #d6c9fd 58%, #e6ddfe 82%, #cfc2fb 100%)",
            }}
          >
            {t("verify.title")}
          </h1>
          <p className="mt-1 truncate text-[15px] text-faint">
            {meta.title} · {t("common.eventNumber", { id: eventId().toString() })}
          </p>
        </div>

        {explorerHref && (
          <a
            href={explorerHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] shrink-0 items-center text-[15px] text-dim underline decoration-line-2 underline-offset-4 transition-colors hover:text-fg"
          >
            {t("verify.openOnExplorer")} ↗
          </a>
        )}
      </header>

      {isLocalChain && (
        <div className="pb-4">
          <Notice tone="warn">{t("common.localChain")}</Notice>
        </div>
      )}

      {/* ═══ 2. the stage ═══
          Sized in viewport units rather than in pixels of content: whatever the room contains, the
          graph is what you are looking at when the page opens. */}
      <section className="flex min-h-[58vh] flex-col justify-center md:min-h-[64vh]">
        {history ? (
          <ProofNetwork
            participants={history.participants}
            vouches={history.vouches}
            selected={active}
            onSelect={setPinned}
            onHover={setHovered}
          />
        ) : (
          <NetworkSkeleton />
        )}

        {/* The line where a selected edge names its transaction. Fixed height whether or not
            anything is selected: if it appeared only on hover, every pass of the mouse would shove
            the page down a row — on the page whose whole point is careful inspection. */}
        <InspectBar history={history} active={active} loading={!history} />
      </section>

      {/* ═══ 3. the three facts the graph produces ═══
          Under the picture, because they are what the picture says — not above it as a summary you
          read instead of looking. No boxes: scale and one hairline do the separating. */}
      <div className="flex flex-wrap items-stretch justify-center gap-y-6 pt-10 text-center">
        <Fact
          value={ev ? `${ev.confirmed}` : "—"}
          label={t("verify.statVerified")}
          tone={ev && ev.confirmed > 0 ? "ok" : "fg"}
        />
        <Fact
          value={history ? `${history.vouches.length}` : "—"}
          label={t("verify.statProofs")}
          divider
        />
        <Fact
          value={history?.settlement ? "✓" : "—"}
          label={history?.settlement ? t("verify.statSettled") : t("verify.statPending")}
          tone={history?.settlement ? "ok" : "faint"}
          divider
        />
      </div>

      {/* The one sentence that says where all of the above came from. It sits under the figures
          rather than under the page title because that is where somebody first wonders. */}
      <p className="mx-auto mt-6 max-w-[62ch] text-center text-[15px] leading-relaxed text-faint">
        {t("verify.subtitle")}
      </p>

      {/* ═══ 4. what the contract therefore pays ═══ */}
      {ev && (
        <Settlement
          deposit={ev.deposit}
          registered={ev.registered}
          confirmed={ev.confirmed}
          forfeited={forfeited}
          settlement={history?.settlement ?? null}
        />
      )}

      {/* ═══ 5. every transaction behind all of it ═══ */}
      <div className="mx-auto mt-16 w-full max-w-[880px] space-y-10">
        {history && (history.vouches.length > 0 || history.settlement) && (
          <div className="min-w-0 space-y-3">
            <SectionLabel>{t("verify.everyVouch", { n: history.vouches.length })}</SectionLabel>
            <ProofList history={history} active={active} onHover={setHovered} onSelect={setPinned} />
          </div>
        )}

        {history && history.participants.length > 0 && (
          <div className="min-w-0 space-y-3">
            <SectionLabel>{t("verify.whoWasThere")}</SectionLabel>
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

      {/* An RPC failure is a fact about the network, not about this event, and it used to take the
          full width at the top of the page in red — louder than anything it was interrupting. It
          is now a corner notice carrying the one control that helps. */}
      <RetryToast message={error} onRetry={() => void load()} onDismiss={() => setError(null)} />
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// One of the three figures under the graph.
///
/// Mint only where the chain has actually confirmed something: a green zero, or a green "pending",
/// is a claim nothing on chain supports.
function Fact({
  value,
  label,
  tone = "fg",
  divider = false,
}: {
  value: string;
  label: string;
  tone?: "fg" | "ok" | "faint";
  divider?: boolean;
}) {
  return (
    <div className={`min-w-[150px] px-6 sm:px-10 ${divider ? "sm:border-l sm:border-line" : ""}`}>
      <p
        className={`text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[52px] ${
          tone === "ok" ? "text-ok" : tone === "faint" ? "text-faint" : "text-fg"
        }`}
      >
        {value}
      </p>
      <p className="mt-2.5 text-[15px] text-dim">{label}</p>
    </div>
  );
}

/// A heading for the reference material at the foot of the page. Small, wide-tracked, quiet — what
/// sits under it is evidence to be checked, not a section to be browsed.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-faint">{children}</h2>
  );
}

/// The line under the graph that names whichever edge is being inspected.
function InspectBar({
  history,
  active,
  loading,
}: {
  history: EventHistory | null;
  active: EdgeKey | null;
  loading: boolean;
}) {
  const t = useT();
  const v: Vouch | undefined = history?.vouches.find((x) => edgeKey(x) === active);
  const url = v ? explorerTxUrl(v.hash) : "";

  return (
    <div className="flex min-h-[56px] flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-6 text-[15px]">
      {loading ? (
        <span className="text-faint">{t("verify.readingChain")}</span>
      ) : v ? (
        <>
          <span className="font-mono text-fg">
            {t("verify.inspectVouch", { from: shortAddress(v.from), to: shortAddress(v.to) })}
          </span>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent-2 underline decoration-line-2 underline-offset-4"
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

/// What the contract pays, and the arithmetic that gets there.
///
/// One floating panel rather than a sidebar: narrower than the stage above it, so it reads as the
/// conclusion of the picture rather than as a second column competing with it. Blur and a dropped
/// shadow are what hold it off the page — the one border is white at 6%, doing far less work than
/// a drawn frame would.
function Settlement({
  deposit,
  registered,
  confirmed,
  forfeited,
  settlement,
}: {
  deposit: bigint;
  registered: number;
  confirmed: number;
  forfeited: bigint;
  settlement: EventHistory["settlement"];
}) {
  const t = useT();
  const settledNote = t("verify.settledNote");
  const noApproval = t("verify.noOrganizerApproved");

  // The contract's own figure once it has settled; until then the projection, which is labelled as
  // one. The two are never blended.
  const share = settlement
    ? settlement.sharePerAttendee
    : confirmed > 0
      ? deposit + forfeited / BigInt(confirmed)
      : null;

  return (
    <section className="mx-auto mt-14 w-full max-w-[880px] rounded-[26px] border border-white/[0.06] bg-panel/55 px-6 py-7 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl md:px-9 md:py-8">
      <div className="grid gap-7 md:grid-cols-2 md:gap-10">
        <div className="min-w-0">
          {/* `mon()` rather than `both()`: at this size a mainnet build's `$0.35 (13.33 MON)` wraps
              to two lines and stops reading as a single figure. The fiat equivalent is on every row
              of the breakdown beside it, so nothing is hidden. */}
          <p
            className={`text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums md:text-[52px] ${
              settlement ? "text-ok" : "text-fg"
            }`}
          >
            {share === null ? "—" : mon(share)}
          </p>
          <p className="mt-3 text-[16px] leading-relaxed text-dim">
            {settlement ? t("verify.eachReceives") : t("verify.eachWouldReceive")}
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-faint">
            {share === null
              ? t("verify.nobodyConfirmedYet")
              : t("verify.depositPlusShare", {
                  deposit: mon(deposit),
                  share: mon(share - deposit),
                })}
          </p>
        </div>

        <div className="min-w-0 space-y-2.5 md:border-l md:border-line md:pl-10">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-faint">
            {t("verify.arithmetic")}
          </p>
          <Line
            label={`${registered} × ${both(deposit)}`}
            value={fiat(deposit * BigInt(registered))}
          />
          <Line
            label={t("verify.confirmedPresent", { n: confirmed })}
            value={t("verify.getDepositBack")}
          />
          <Line
            label={t("verify.neverConfirmed", { n: Math.max(0, registered - confirmed) })}
            value={t("verify.forfeit", { amount: fiat(forfeited) })}
          />
        </div>
      </div>

      <div className="mt-7 space-y-2 border-t border-line pt-5 text-[14px] leading-relaxed text-faint">
        <p>
          {settlement ? (
            <>
              {settledNote}
              {sentenceGap(settledNote)}
              {explorerTxUrl(settlement.hash) && (
                <a
                  href={explorerTxUrl(settlement.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-2 underline decoration-line-2 underline-offset-4"
                >
                  {t("verify.settlementTx")}
                </a>
              )}
            </>
          ) : (
            t("verify.projectedNote")
          )}
        </p>
        <p>
          <span className="font-semibold text-dim">{noApproval}</span>
          {sentenceGap(noApproval)}
          {t("verify.payoutFollowsGraph")}
        </p>
      </div>
    </section>
  );
}

/// One row of the arithmetic. No rule between rows: label and figure are far enough apart in
/// weight that the eye pairs them without being told to.
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 text-[15px]">
      <span className="min-w-0 truncate text-dim">{label}</span>
      <span className="shrink-0 tabular-nums text-fg">{value}</span>
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
              className={`-mx-3 flex min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                isActive ? "bg-white/[0.04]" : ""
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
                  className="shrink-0 font-mono text-[14px] text-accent-2 underline decoration-line-2 underline-offset-4"
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
          className="mt-1 inline-flex min-h-[44px] items-center text-[15px] text-dim underline decoration-line-2 underline-offset-4"
        >
          {all ? t("verify.showLess") : t("verify.showAll", { n: rows.length })}
        </button>
      )}
    </div>
  );
}

/// Who registered, and what the contract says became of them. A caption to the picture, not a
/// second dataset — so it is set in columns with nothing drawn around it.
function Roster({ history }: { history: EventHistory }) {
  const t = useT();
  return (
    <ul className="grid gap-x-10 gap-y-2 font-mono text-[14px] sm:grid-cols-2">
      {history.participants.map((p) => (
        <li key={p.address} className="flex items-center justify-between gap-3">
          <span className={p.confirmed ? "text-dim" : "text-faint"}>{shortAddress(p.address)}</span>
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

/// The read failed. Say so where a failure belongs — beside the work, not on top of it.
///
/// The old banner was full width, red, and at the top of the page, which gave an RPC hiccup more
/// visual authority than the evidence it was interrupting. Whatever was last read stays on screen
/// underneath this, which is the honest state of things: the page is not wrong, it is behind.
function RetryToast({
  message,
  onRetry,
  onDismiss,
}: {
  message: string | null;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 md:bottom-6 md:left-auto md:right-6 md:justify-end">
      <div className="pointer-events-auto flex max-w-[440px] items-center gap-3 rounded-2xl border border-white/[0.06] bg-raised/90 px-4 py-3 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        <span className="min-w-0 text-[14px] leading-snug text-dim">{message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[36px] shrink-0 rounded-lg border border-line-2 px-3 text-[14px] text-fg transition-colors hover:border-accent/60"
        >
          {t("common.retry")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("common.close")}
          className="min-h-[36px] shrink-0 px-1 text-[18px] leading-none text-faint transition-colors hover:text-fg"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/// Top bar plus the page column.
///
/// The participant screens all wear the top bar; this one had been left on the sidebar, so arriving
/// here from the account page swapped the whole chrome. Caught by a language-switch test that
/// printed the nav items as part of the page text — "首页 活动 验证" is a rail, and no other
/// participant screen has one.
function Frame({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav page={t("verify.title")} />
        <main className="pb-20 pt-4 md:pt-6">{children}</main>
      </div>
    </div>
  );
}
