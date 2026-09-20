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
/// Nothing on this page is in a box. The graph stands on the page's own canvas, the figures it
/// produces are hung in the whitespace the ring leaves empty, the settlement is arithmetic set as
/// type, and the transactions are a register — hairlines, a monospace column and nothing drawn
/// around any of it. Three versions of this page were a dashboard with progressively fewer
/// borders; a page arguing "inspect the evidence" should not look like a tool that has already
/// done the inspecting for you.
///
/// Every figure below is computed from the contract's own logs and from nothing else.
export default function VerifyPage() {
  const t = useT();
  const back = useBack("/event");
  const { ev } = useEvent(null, 4000);
  const [history, setHistory] = useState<EventHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = useEventMeta(eventId());

  // Two sources for one highlight. Clicking pins an edge (a phone has no hover, and reading a hash
  // off a line you have to keep your finger on is not reading); moving the pointer previews one
  // without disturbing what is pinned. Resolved here rather than in the graph because the ledger
  // lights the same edges from the other end.
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

  // The newest thing this event did on chain. The one outbound action is a way out of our own UI,
  // and the only honest target for it is a transaction we can prove exists — a settlement once
  // there is one, otherwise the latest accepted vouch. Before anything has happened there is
  // nothing to open, and the action is withheld rather than pointed at a guess.
  const latestTx = history?.settlement?.hash ?? history?.vouches.at(-1)?.hash ?? null;
  const explorerHref = latestTx ? explorerTxUrl(latestTx) : "";

  return (
    <Frame>
      {/* ── the exhibit label ──────────────────────────────────────────────
          A byline, not a page header: eyebrow, the claim, one rule, and on the right the room and
          the stretch of chain these numbers were read out of. */}
      <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-accent-2">
        {t("verify.title")}
      </p>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line pb-5">
        <h1
          className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] text-fg md:text-[34px]"
          style={{ fontFamily: '"Montserrat", var(--font-sans)' }}
        >
          {t("verify.roomDecided")}
        </h1>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[15px] text-faint">
          <span className="truncate">
            {meta.title} · {t("common.eventNumber", { id: eventId().toString() })}
            {history &&
              ` · ${t("verify.blocks", { from: `${history.fromBlock}`, to: `${history.toBlock}` })}`}
          </span>
          {explorerHref && (
            <a
              href={explorerHref}
              target="_blank"
              rel="noreferrer"
              className="text-dim underline decoration-line-2 underline-offset-4 transition-colors hover:text-fg"
            >
              {t("verify.openOnExplorer")} ↗
            </a>
          )}
        </div>
      </div>

      {isLocalChain && (
        <div className="pt-5">
          <Notice tone="warn">{t("common.localChain")}</Notice>
        </div>
      )}

      {/* ── the stage ──────────────────────────────────────────────────────
          The figures hang in the corners the ring leaves empty, sized as captions rather than as
          headlines. Parked out at the page edges they read as three numbers in the margin; here
          they read as annotations on the picture — which is what they are, since every one of them
          is produced by the lines underneath them. */}
      <section className="relative mt-6">
        <div className="md:px-[150px] lg:px-[210px]">
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
        </div>

        <div className="pointer-events-none absolute left-2 top-[16%] hidden md:block lg:left-[86px]">
          <Figure
            value={ev ? `${ev.confirmed}` : "—"}
            label={t("verify.statVerified")}
            note={t("verify.figureNoteVerified")}
            tone={ev && ev.confirmed > 0 ? "ok" : "fg"}
          />
        </div>
        <div className="pointer-events-none absolute left-2 top-[16%] mt-[128px] hidden md:block lg:left-[86px]">
          <p className="border-t border-line pt-3 text-[15px] text-faint">
            {history?.settlement ? t("verify.statSettled") : t("verify.statPending")}
          </p>
        </div>
        <div className="pointer-events-none absolute right-2 top-[16%] hidden text-right md:block lg:right-[86px]">
          <Figure
            value={history ? `${history.vouches.length}` : "—"}
            label={t("verify.statProofs")}
            note={t("verify.figureNoteProofs")}
            align="right"
          />
        </div>

        {/* The phone has no spare corners, so they go in a row under the picture, on one hairline. */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-5 md:hidden">
          <Figure
            value={ev ? `${ev.confirmed}` : "—"}
            label={t("verify.statVerified")}
            tone={ev && ev.confirmed > 0 ? "ok" : "fg"}
            small
          />
          <Figure value={history ? `${history.vouches.length}` : "—"} label={t("verify.statProofs")} small />
          <Figure
            value={history?.settlement ? "✓" : "—"}
            label={history?.settlement ? t("verify.statSettled") : t("verify.statPending")}
            tone={history?.settlement ? "ok" : "faint"}
            small
          />
        </div>
      </section>

      {/* Where a selected edge names its transaction. Fixed height whether or not anything is
          selected: if it appeared only on hover, every pass of the mouse would shove the page down
          a row — on the page whose whole point is careful inspection. */}
      <InspectBar history={history} active={active} loading={!history} />

      <p className="mx-auto mt-8 max-w-[64ch] text-center text-[16px] leading-relaxed text-dim">
        {t("verify.subtitle")}
      </p>

      {/* ── settlement, as type ────────────────────────────────────────────
          A figure, the three lines that get to it, and two sentences of provenance. Hairlines and a
          baseline do what a panel was doing, and the page stops looking like it has a widget in it. */}
      <section className="mx-auto mt-16 w-full max-w-[1000px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line pb-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-faint">
            {t("verify.settlement")}
          </h2>
          <span className="text-[14px] text-faint">
            {history?.settlement ? t("verify.statSettled") : t("verify.projectedLabel")}
          </span>
        </div>

        {ev ? (
          <Settlement
            deposit={ev.deposit}
            registered={ev.registered}
            confirmed={ev.confirmed}
            forfeited={forfeited}
            settlement={history?.settlement ?? null}
          />
        ) : (
          <p className="py-10 text-center text-[15px] text-faint">{t("common.loading")}</p>
        )}
      </section>

      {/* ── the register ───────────────────────────────────────────────────
          A public record reads like a printed one: monospace, right-aligned hashes, one hairline a
          row, no zebra, no chrome. The only ink that is not grey is the link out of this UI. */}
      {history && (history.vouches.length > 0 || history.settlement) && (
        <section className="mx-auto mt-20 w-full max-w-[1000px]">
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-faint">
              {t("verify.everyVouch", { n: history.vouches.length })}
            </h2>
            <span className="text-[14px] text-faint">{t("verify.newestFirst")}</span>
          </div>
          <Ledger history={history} active={active} onHover={setHovered} onSelect={setPinned} />
        </section>
      )}

      {history && history.participants.length > 0 && (
        <section className="mx-auto mt-16 w-full max-w-[1000px]">
          <h2 className="border-b border-line pb-3 text-[13px] font-bold uppercase tracking-[0.18em] text-faint">
            {t("verify.whoWasThere")}
          </h2>
          <Roster history={history} />
        </section>
      )}

      <div className="mx-auto mt-14 w-full max-w-[1000px] space-y-2 text-[14px] leading-relaxed text-faint">
        <p className="break-all font-mono">
          {ESCROW_ADDRESS} · {t("common.eventNumber", { id: eventId().toString() })}
        </p>
        {/* Named, not hidden. A page arguing "do not take our word for it" has to say which reader
            produced the numbers on it — and if the index is gone, that it fell back rather than
            quietly showing less. */}
        {history && <p>{history.source === "envio" ? t("verify.viaEnvio") : t("verify.viaLogs")}</p>}
        <p>{t("verify.noPayoutFunction")}</p>
        <Link
          {...back}
          className="inline-flex min-h-[44px] items-center text-dim underline decoration-line-2 underline-offset-4"
        >
          {t("verify.backToEvent")}
        </Link>
      </div>

      {/* An RPC failure is a fact about the network, not about this event, and a full-width red
          banner gave it more authority than the evidence it was interrupting. Whatever was last
          read stays on screen underneath: the page is not wrong, it is behind. */}
      <RetryToast message={error} onRetry={() => void load()} onDismiss={() => setError(null)} />
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// A figure standing on the canvas — no tile, no rule around it. Mint only where the chain has
/// actually confirmed something: a green zero is a claim nothing on chain supports.
function Figure({
  value,
  label,
  note,
  tone = "fg",
  align = "left",
  small = false,
}: {
  value: string;
  label: string;
  note?: string;
  tone?: "fg" | "ok" | "faint";
  align?: "left" | "right";
  small?: boolean;
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p
        className={`font-semibold leading-none tracking-[-0.035em] tabular-nums ${
          small ? "text-[30px]" : "text-[44px] lg:text-[50px]"
        } ${tone === "ok" ? "text-ok" : tone === "faint" ? "text-faint" : "text-fg"}`}
      >
        {value}
      </p>
      <p className={`mt-2.5 ${small ? "text-[13px]" : "text-[15px]"} text-dim`}>{label}</p>
      {note && !small && <p className="mt-1 text-[13px] text-faint">{note}</p>}
    </div>
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
    <>
      <div className="grid gap-10 pt-7 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16">
        <div className="min-w-0">
          {/* `mon()` rather than `both()`: at this size a mainnet build's `$0.35 (13.33 MON)` wraps
              to two lines and stops reading as a single figure. The fiat equivalent is on every row
              of the breakdown beside it, so nothing is hidden. */}
          <p
            className={`text-[46px] font-semibold leading-none tracking-[-0.035em] tabular-nums md:text-[62px] ${
              settlement ? "text-ok" : "text-fg"
            }`}
          >
            {share === null ? "—" : mon(share)}
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-dim">
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

        <dl className="min-w-0 self-end">
          <Line term={`${registered} × ${both(deposit)}`} value={fiat(deposit * BigInt(registered))} />
          <Line
            term={t("verify.confirmedPresent", { n: confirmed })}
            value={t("verify.getDepositBack")}
          />
          <Line
            term={t("verify.neverConfirmed", { n: Math.max(0, registered - confirmed) })}
            value={t("verify.forfeit", { amount: fiat(forfeited) })}
            last
          />
        </dl>
      </div>

      <div className="mt-8 grid gap-6 border-t border-line pt-6 text-[14px] leading-relaxed text-faint md:grid-cols-2 md:gap-14">
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
    </>
  );
}

/// One line of the arithmetic. A hairline under each, nothing around any of them.
function Line({ term, value, last = false }: { term: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-6 py-3 text-[16px] ${
        last ? "" : "border-b border-line/70"
      }`}
    >
      <dt className="min-w-0 truncate text-dim">{term}</dt>
      <dd className="shrink-0 tabular-nums text-fg">{value}</dd>
    </div>
  );
}

/// Every transaction behind the numbers above, newest first, each one a link out of this UI.
///
/// The settlement sits at the head rather than in its own block: it is the last thing that happened
/// to this event, and separating it would suggest it came from somewhere other than the same log
/// stream as the vouches.
///
/// Collapsed past six, because the register is reference material and the graph above is the
/// argument — but the count in the heading is always the true one, so collapsing can never be
/// mistaken for there being less evidence than there is.
function Ledger({
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

  const rows: Array<{
    key: string;
    edge: EdgeKey | null;
    n: number | null;
    label: string;
    block: bigint | null;
    hash: string;
  }> = [];
  if (history.settlement) {
    rows.push({
      key: history.settlement.hash,
      edge: null,
      n: null,
      label: t("verify.settlementRow"),
      block: null,
      hash: history.settlement.hash,
    });
  }
  history.vouches.forEach((v, i) => {
    rows.push({
      key: edgeKey(v),
      edge: edgeKey(v),
      n: i + 1,
      label: t("verify.inspectVouch", { from: shortAddress(v.from), to: shortAddress(v.to) }),
      block: v.block,
      hash: v.hash,
    });
  });
  // Newest first, but the settlement keeps the head of the list.
  const body = rows.slice(history.settlement ? 1 : 0).reverse();
  const ordered = history.settlement ? [rows[0], ...body] : body;
  const shown = all ? ordered : ordered.slice(0, 6);

  return (
    <div className="min-w-0">
      <ul className="font-mono text-[14px]">
        {shown.map((r) => {
          const url = explorerTxUrl(r.hash);
          const short = `${r.hash.slice(0, 8)}…${r.hash.slice(-6)}`;
          const isActive = r.edge !== null && r.edge === active;
          return (
            <li
              key={r.key}
              // Hovering a row lights its line in the graph above, and clicking pins it. The
              // register and the picture are the same evidence seen twice.
              onMouseEnter={() => onHover(r.edge)}
              onMouseLeave={() => onHover(null)}
              onClick={() => r.edge && onSelect(isActive ? null : r.edge)}
              className={`flex min-w-0 items-center gap-4 border-b border-line/70 py-3 transition-colors sm:gap-6 ${
                isActive ? "text-fg" : "text-dim"
              } ${r.edge ? "cursor-pointer hover:text-fg" : ""}`}
            >
              <span className="w-[3.5ch] shrink-0 tabular-nums text-faint">{r.n ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              {r.block !== null && (
                <span className="hidden shrink-0 tabular-nums text-faint sm:inline">
                  {t("verify.blockAt", { n: r.block.toString() })}
                </span>
              )}
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-accent-2 underline decoration-line-2 underline-offset-4"
                >
                  {short} ↗
                </a>
              ) : (
                <span className="shrink-0 text-faint">{short}</span>
              )}
            </li>
          );
        })}
      </ul>

      {ordered.length > 6 && (
        <button
          type="button"
          onClick={() => setAll((x) => !x)}
          className="mt-3 inline-flex min-h-[44px] items-center text-[15px] text-dim underline decoration-line-2 underline-offset-4"
        >
          {all ? t("verify.showLess") : t("verify.showAll", { n: ordered.length })}
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
    <ul className="grid gap-x-16 font-mono text-[14px] sm:grid-cols-2">
      {history.participants.map((p) => (
        <li
          key={p.address}
          className="flex items-center justify-between gap-4 border-b border-line/70 py-2.5"
        >
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
        <main className="pb-24 pt-6 md:pt-10">{children}</main>
      </div>
    </div>
  );
}
