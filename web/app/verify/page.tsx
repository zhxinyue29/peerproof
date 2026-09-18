"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import VouchGraph from "@/components/VouchGraph";
import { Card, Eyebrow, KeyValue, Notice, Skeleton } from "@/components/ui";
import { ESCROW_ADDRESS, eventId, explorerTxUrl, hasDeployment, isLocalChain } from "@/lib/chain";
import { useVisiblePoll } from "@/lib/poll";
import { both, fiat, mon, sentenceGap, shortAddress, shortenError } from "@/lib/format";
import { readHistory, type EventHistory } from "@/lib/logs";
import { useEvent } from "@/lib/useEvent";
import { useEventMeta } from "@/lib/eventMeta";
import { useT } from "@/lib/i18n";

/// Public, no key required. The whole product claims nobody has to be trusted, and a claim like
/// that is worth nothing if the only way to check it is to believe our own UI. Everything here is
/// read straight from chain events, so a sceptic can reconstruct the same numbers themselves.
///
/// V3 (`08-verify-desktop.png`) gives the evidence and the arithmetic one screen each side of a
/// split: the graph is what happened, the settlement panel is what it adds up to, and every row in
/// the panel can be opened on a block explorer. Nothing on this page is computed from anything but
/// the contract's own logs.
export default function VerifyPage() {
  const t = useT();
  const { ev } = useEvent(null, 4000);
  const [history, setHistory] = useState<EventHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = useEventMeta(eventId());

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
      <AppShell
        nav="participant"
        active="verify"
        title={t("verify.title")}
        langSwitcher={<LanguageSwitcher />}
      >
        <Notice>{t("common.noContract")}</Notice>
      </AppShell>
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
    <AppShell
      nav="participant"
      active="verify"
      title={t("verify.title")}
      subtitle={t("verify.subtitle")}
      langSwitcher={<LanguageSwitcher />}
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
      aside={
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="min-w-0 space-y-5">
            <h2 className="text-[22px] font-semibold tracking-[-0.01em]">
              {t("verify.settlement")}
            </h2>

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

            {history && (history.vouches.length > 0 || history.settlement) && (
              <div className="min-w-0 space-y-2 border-t border-line pt-4">
                <h3 className="text-[18px] font-semibold tracking-[-0.01em]">
                  {t("verify.everyVouch", { n: history.vouches.length })}
                </h3>
                <ProofList history={history} />
              </div>
            )}
          </Card>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-5 md:gap-6">
        {isLocalChain && <Notice tone="warn">{t("common.localChain")}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}

        <Card className="min-w-0 space-y-4">
          <div className="space-y-1">
            {/* Which room. The page title is the product's claim; this is the event the claim is
                about, and on a page whose whole job is checkability it cannot be left implicit. */}
            <p className="truncate text-[14px] text-faint">
              {meta.title} · {t("common.eventNumber", { id: eventId().toString() })}
            </p>
            <h2 className="text-[22px] font-semibold tracking-[-0.01em] md:text-[24px]">
              {t("verify.roomDecided")}
            </h2>
            <p className="text-[16px] leading-relaxed text-dim">{t("verify.eachLine")}</p>
          </div>

          {history ? (
            <VouchGraph participants={history.participants} vouches={history.vouches} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <Skeleton className="h-40 w-40 rounded-full" />
              <span className="text-[15px] text-faint">{t("verify.readingChain")}</span>
            </div>
          )}
        </Card>

        <div className="space-y-2 text-[14px] leading-relaxed text-faint">
          <p className="break-all">
            <span className="font-mono">{ESCROW_ADDRESS}</span> ·{" "}
            {t("common.eventNumber", { id: eventId().toString() })}
            {history && ` · ${t("verify.blocks", { from: `${history.fromBlock}`, to: `${history.toBlock}` })}`}
          </p>
          {/* Named, not hidden. A page arguing "do not take our word for it" has to say which reader
              produced the numbers on it — and if the index is gone, that it fell back rather than
              quietly showing less. */}
          {history && (
            <p>{history.source === "envio" ? t("verify.viaEnvio") : t("verify.viaLogs")}</p>
          )}
          <p>{t("verify.noPayoutFunction")}</p>
          <Link href="/event" className="inline-block text-dim underline decoration-line-2">
            {t("verify.backToEvent")}
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

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
function ProofList({ history }: { history: EventHistory }) {
  const t = useT();
  const rows: Array<{ key: string; label: string; hash: string }> = [];
  if (history.settlement) {
    rows.push({
      key: history.settlement.hash,
      label: t("verify.settlementRow"),
      hash: history.settlement.hash,
    });
  }
  for (const v of [...history.vouches].reverse()) {
    rows.push({
      key: `${v.hash}-${v.from}-${v.to}`,
      label: `${shortAddress(v.from)} → ${shortAddress(v.to)}`,
      hash: v.hash,
    });
  }

  return (
    <ul className="min-w-0">
      {rows.map((r) => {
        const url = explorerTxUrl(r.hash);
        const short = `${r.hash.slice(0, 6)}…${r.hash.slice(-4)}`;
        return (
          <li
            key={r.key}
            className="flex min-w-0 items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
          >
            <span className="min-w-0 truncate font-mono text-[14px] text-dim">{r.label}</span>
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
  );
}
