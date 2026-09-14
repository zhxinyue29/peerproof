"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VouchGraph from "@/components/VouchGraph";
import {
  AppHeader,
  Card,
  Eyebrow,
  Footer,
  KeyValue,
  Notice,
  Shell,
  Skeleton,
  Split,
} from "@/components/ui";
import { ESCROW_ADDRESS, eventId, explorerTxUrl, hasDeployment, isLocalChain } from "@/lib/chain";
import { useVisiblePoll } from "@/lib/poll";
import { both, fiat, shortenError } from "@/lib/format";
import { readHistory, type EventHistory } from "@/lib/logs";
import { useEvent } from "@/lib/useEvent";
import { useEventMeta } from "@/lib/eventMeta";

/// Public, no key required. The whole product claims nobody has to be trusted, and a claim like
/// that is worth nothing if the only way to check it is to believe our own UI. Everything here is
/// read straight from chain events, so a sceptic can reconstruct the same numbers themselves.
export default function VerifyPage() {
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
        setError(shortenError(e));
      }
    };
    void load();
  }, []);

  // 15s, and only while somebody is looking. The public record is an archive, not a ticker.
  useVisiblePoll(() => {
    if (!hasDeployment) return;
    void readHistory(eventId()).then(setHistory).catch(() => {});
  }, 15000);

  if (!hasDeployment) {
    return (
      <Shell>
        <Notice>No contract configured.</Notice>
      </Shell>
    );
  }

  const forfeited = ev && history ? ev.deposit * BigInt(Math.max(0, ev.registered - ev.confirmed)) : 0n;

  return (
    <Shell>
      {isLocalChain && (
        <Notice tone="warn">Local chain — real transactions, fake money.</Notice>
      )}

      <AppHeader title="Public record" back="/events" />

      <header className="space-y-2">
        <h1 className="text-[24px] font-medium leading-[1.2] tracking-tight md:text-[34px]">
          {meta.title}
        </h1>
        <p className="text-[13px] leading-relaxed text-dim md:max-w-[60ch] md:text-[15px]">
          Who vouched for whom, and where the money went. Nothing here comes from our database — it
          is rebuilt from the contract&apos;s own events every few seconds.
        </p>
      </header>

      {error && <Notice tone="bad">{error}</Notice>}

      <Split
        main={      <Card className="space-y-3">
          <Eyebrow>the attestation graph</Eyebrow>
          {history ? (
            <VouchGraph participants={history.participants} vouches={history.vouches} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <Skeleton className="h-40 w-40 rounded-full" />
              <span className="text-[13px] text-faint">reading chain events…</span>
            </div>
          )}
        </Card>}
        side={
          <>
      {ev && (
          <Card className="space-y-2.5">
            <Eyebrow>settlement arithmetic</Eyebrow>
            <KeyValue label={`${ev.registered} registered × ${both(ev.deposit)}`} value={fiat(ev.deposit * BigInt(ev.registered))} />
            <KeyValue label={`${ev.confirmed} confirmed present`} value="get their deposit back" />
            <KeyValue
              label={`${Math.max(0, ev.registered - ev.confirmed)} never confirmed`}
              value={`forfeit ${fiat(forfeited)}`}
            />
            <hr className="border-line" />
            {history?.settlement ? (
              <>
                <KeyValue
                  label="Each confirmed attendee receives"
                  value={both(history.settlement.sharePerAttendee)}
                  strong
                />
                <p className="pt-1 text-xs leading-relaxed text-faint">
                  Fixed by the contract at settlement. The divisor cannot move afterwards, so the
                  pool can never be over-committed.{" "}
                  {explorerTxUrl(history.settlement.hash) && (
                    <a href={explorerTxUrl(history.settlement.hash)} className="underline">
                      settlement transaction
                    </a>
                  )}
                </p>
              </>
            ) : (
              <>
                <KeyValue
                  label="Projected per confirmed attendee"
                  value={
                    ev.confirmed > 0
                      ? both(ev.deposit + forfeited / BigInt(ev.confirmed))
                      : "— (nobody confirmed yet)"
                  }
                  strong
                />
                <p className="pt-1 text-xs leading-relaxed text-faint">
                  Not final. If nobody can be confirmed present, the contract refunds every deposit
                  rather than issue an unreliable verdict — and the organizer receives nothing in
                  that branch either.
                </p>
              </>
            )}
          </Card>
        )}
          </>
        }
      />

      {history && history.vouches.length > 0 && (
        <Card className="space-y-2">
          <Eyebrow>every vouch · {history.vouches.length} transactions</Eyebrow>
          <ul className="space-y-1 font-mono text-[11px]">
            {history.vouches.map((v) => (
              <li key={v.hash} className="flex items-center gap-2 text-dim">
                <span>{v.from.slice(0, 8)}</span>
                <span className="text-faint">vouched</span>
                <span>{v.to.slice(0, 8)}</span>
                {explorerTxUrl(v.hash) ? (
                  <a href={explorerTxUrl(v.hash)} className="ml-auto text-faint underline decoration-line-2">
                    {v.hash.slice(0, 10)}…
                  </a>
                ) : (
                  <span className="ml-auto text-faint">{v.hash.slice(0, 10)}…</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Footer>
        <div className="space-y-2 text-xs text-faint">
        <p>
          Contract <span className="font-mono">{ESCROW_ADDRESS}</span> · event{" "}
          {eventId().toString()}
          {history && ` · blocks ${history.fromBlock}–${history.toBlock}`}
        </p>
        {/* Named, not hidden. A page arguing "do not take our word for it" has to say which reader
            produced the numbers on it — and if the index is gone, that it fell back rather than
            quietly showing less. */}
        {history && (
          <p>
            {history.source === "envio"
              ? "Attestation graph indexed by Envio HyperIndex."
              : "Attestation graph read from contract logs directly — the index was unreachable."}
          </p>
        )}
        <p>
          There is no function on this contract that pays the organizer. Check the source: every
          branch of <span className="font-mono">claim</span> pays{" "}
          <span className="font-mono">msg.sender</span>, and only registered attendees can reach
          it.
        </p>
          <Link href="/" className="inline-block text-dim underline decoration-line-2">
            back to the event
          </Link>
        </div>
      </Footer>
    </Shell>
  );
}


