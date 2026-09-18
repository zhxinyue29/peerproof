"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import RotatingCode from "@/components/RotatingCode";
import Scanner from "@/components/Scanner";
import PayoutResult from "@/components/PayoutResult";
import VouchResult from "@/components/VouchResult";
import IdentityGate from "@/components/IdentityGate";
import {
  AppHeader,
  Button,
  Card,
  Dots,
  Eyebrow,
  Flash,
  KeyValue,
  LinkButton,
  Notice,
  Progress,
  Shell,
  Skeleton,
} from "@/components/ui";
import { useIdentity } from "@/components/IdentityProvider";
import {
  EPOCH,
  ESCROW_ADDRESS,
  eventId,
  GAS_LIMITS,
  chainNowMs,
  currentBeaconEpoch,
  currentEpoch,
  explorerTxUrl,
  hasDeployment,
  isLocalChain,
  publicClient,
  secondsLeftInEpoch,
  resolveEventId,
  syncChainClock,
  walletClientFor,
} from "@/lib/chain";
import {
  beaconDigest,
  codeDigest,
  makeBeaconCode,
  makePeerCode,
  parseBeaconCode,
  parsePeerCode,
} from "@/lib/codes";
import { attendanceEscrowAbi } from "@/lib/abi";
import { countdown, mon, shortAddress, shortenError } from "@/lib/format";
import { phaseOf, useEvent } from "@/lib/useEvent";
import { useT } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type LogEntry = { who: Address; hash: Hex; latencyMs: number };

/// Mirrors AttendanceEscrow.FALLBACK_WINDOW.
const FALLBACK_WINDOW_SECONDS = 3600;

export default function FloorPage() {
  const t = useT();
  const { signer, devMode } = useIdentity();
  const { ev, me, refresh, error: readError } = useEvent(signer?.address ?? null);

  const [scanning, setScanning] = useState(false);
  const [claimHash, setClaimHash] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Number(EPOCH));
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [result, setResult] = useState<{
    who: Address;
    latencyMs: number;
    hash: Hex;
    mine: number;
    theirs: number;
  } | null>(null);
  const inFlight = useRef(false);

  const phase = phaseOf(ev);
  const windowOpen = phase === "open";

  // Arriving is now its own transaction, and once it lands it never expires. What was here before
  // was a venue signature held in memory, good for two minutes, that every attestation had to
  // carry — so scanning the door bought you 120 seconds in which to spot a stranger, greet them,
  // wait for them to unlock their phone and open the app, and get their code into frame. Miss it
  // and you walked back to the door. The window was mine, not the mechanism's, and it was wrong.
  const checkedIn = !!me && me.checkedInAt > 0;

  /* ---------------- rotating code ---------------- */

  useEffect(() => {
    if (!signer || !hasDeployment) return;
    let shown = -1n;
    const tick = async () => {
      setSecondsLeft(secondsLeftInEpoch());
      const e = currentEpoch();
      if (e !== shown) {
        shown = e;
        setPayload(await makePeerCode(signer.attest, ESCROW_ADDRESS, eventId(), e));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 250);
    return () => clearInterval(id);
  }, [signer]);

  /* ---------------- writes ---------------- */

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label);
      setNotice(null);
      try {
        await fn();
      } catch (e) {
        setNotice(shortenError(e));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const submitAttest = useCallback(
    async (subject: Address, epoch: bigint, code: Hex) => {
      if (!signer || inFlight.current) return;
      inFlight.current = true;
      setNotice(null);
      try {
        // Read before sending: the result card shows both counters moving, and the subject's
        // count is only knowable from the chain. One extra read, on the one screen where the
        // number is the point.
        const theirsBefore = Number(
          await publicClient
            .readContract({
              address: ESCROW_ADDRESS,
              abi: attendanceEscrowAbi,
              functionName: "attestCount",
              args: [eventId(), subject],
            })
            .catch(() => 0n),
        );
        const minesBefore = me?.received ?? 0;
        const started = performance.now();
        // signer.write simulates first, so a stale code or a repeated pair surfaces as its custom
        // error name instead of costing gas. Monad bills on the limit, so a doomed write is not
        // free either.
        const hash = await signer.write({
          functionName: "attest",
          args: [eventId(), subject, epoch, code],
          gas: GAS_LIMITS.attest,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        // waitForTransactionReceipt resolves for reverted transactions too, so a green tick
        // without this check would be a lie on stage.
        if (receipt.status !== "success") {
          setNotice("That attestation reverted on chain.");
          return;
        }
        const latencyMs = Math.round(performance.now() - started);
        setLog((l) => [{ who: subject, hash, latencyMs }, ...l]);
        setResult({ who: subject, latencyMs, hash, mine: minesBefore, theirs: theirsBefore });
        await refresh();
      } catch (e) {
        setNotice(shortenError(e));
      } finally {
        inFlight.current = false;
      }
    },
    [signer, refresh, me],
  );

  const onScan = useCallback(
    async (text: string) => {
      // Before the doors, and after they shut, the contract refuses everything below. Saying so
      // here is not politeness: reading the venue code used to be a free in-memory operation and
      // is now a transaction, so an unguarded scan at 18:55 would cost real gas to be told no.
      const tooEarly = ev && Math.floor(chainNowMs() / 1000) < Number(ev.attestOpen);
      const outsideWindow = !windowOpen
        ? tooEarly
          ? `Code reads fine — check-in opens in ${countdown(Number(ev!.attestOpen) - Math.floor(chainNowMs() / 1000))}.`
          : "Code reads fine, but check-in has closed for this event."
        : null;

      const b = parseBeaconCode(text);
      if (b) {
        if (!signer || inFlight.current) return;
        const ok = await recoverAddress({
          hash: beaconDigest(ESCROW_ADDRESS, b.eventId, b.beaconEpoch),
          signature: b.sig,
        }).catch(() => null);
        if (!ok) return setNotice("That venue code is malformed.");
        if (outsideWindow) return setNotice(outsideWindow);
        // Say so and keep looking, rather than closing the camera.
        //
        // The venue display is a large lit screen in a room where people are holding up small ones,
        // so it lands in frame by accident constantly. Treating that as a completed action shut the
        // scanner on somebody who was mid-way through finding a person, and they had to open it
        // again — for doing nothing wrong.
        if (checkedIn) {
          return setNotice(t("floor.alreadyCheckedIn"));
        }
        // Straight to chain, while the code on the display is still the current one. This is the
        // only moment in the evening that is genuinely time-critical, and it is over in a second:
        // a venue signature carries no proof of when it was read, so the only honest way to date
        // one is to spend it immediately in a transaction the chain timestamps itself.
        inFlight.current = true;
        try {
          setBusy("Checking in…");
          const hash = await signer.write({
            functionName: "checkIn",
            args: [eventId(), b.beaconEpoch, b.sig],
            gas: GAS_LIMITS.checkIn,
          });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") {
            return setNotice("Check-in reverted on chain. Scan the venue display again.");
          }
          setScanning(false);
          setNotice(null);
          setFlash(t("floor.checkedInFlash"));
          await refresh();
        } catch (e) {
          setNotice(shortenError(e));
        } finally {
          inFlight.current = false;
          setBusy(null);
        }
        return;
      }

      const p = parsePeerCode(text);
      if (!p) return setNotice("Not a PeerProof code.");
      if (!signer) return;
      if (p.subject.toLowerCase() === signer.address.toLowerCase()) {
        return setNotice("That's your own code — you need somebody else's.");
      }
      // The same check the contract performs, done locally so a bad scan never costs gas.
      const recovered = await recoverAddress({
        hash: codeDigest(ESCROW_ADDRESS, p.eventId, p.subject, p.epoch),
        signature: p.sig,
      }).catch(() => null);
      if (!recovered) return setNotice("That code failed verification.");

      // Everything above is worth exercising whenever somebody wants to: the camera, the
      // permission prompt, the decode, the signature check. Only submitting is time-bound, so
      // only submitting is refused — and it says why rather than reverting on chain. The window
      // comes before the check-in prompt, because "go and scan the door" is bad advice at a venue
      // whose doors have not opened.
      if (outsideWindow) {
        setScanning(false);
        return setNotice(outsideWindow);
      }
      // Checked here rather than left to the chain: a doomed transaction still costs gas on Monad,
      // which bills the limit rather than the amount used.
      if (!checkedIn) {
        setScanning(true);
        return setNotice("Scan the venue display first — you only have to do it once.");
      }

      setScanning(false);
      await submitAttest(p.subject, p.epoch, p.sig);
    },
      [checkedIn, signer, submitAttest, windowOpen, ev, refresh],
  );

  const settle = () =>
    run("Settling…", async () => {
      const hash = await signer!.write({
        functionName: "settle",
        args: [eventId()],
        gas: GAS_LIMITS.settle,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    });

  const claim = () =>
    run("Claiming…", async () => {
      const hash = await signer!.write({
        functionName: "claim",
        args: [eventId()],
        gas: GAS_LIMITS.claim,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      // Kept so the payout screen can link to it. A number somebody can check beats a number they
      // have to believe, and that distinction is the whole product.
      setClaimHash(hash);
      await refresh();
    });

  /* ---------------- dev helpers ---------------- */

  /// Signs a beacon with the fixture's venue key and checks in with it, so a laptop with no second
  /// screen can still get through the door.
  const devCheckIn = () =>
    run("Checking in…", async () => {
      const venue = privateKeyToAccount(process.env.NEXT_PUBLIC_DEV_BEACON_PK as Hex);
      const bEpoch = currentBeaconEpoch();
      const b = parseBeaconCode(await makeBeaconCode(venue, ESCROW_ADDRESS, eventId(), bEpoch))!;
      const hash = await signer!.write({
        functionName: "checkIn",
        args: [eventId(), b.beaconEpoch, b.sig],
        gas: GAS_LIMITS.checkIn,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    });

  /// Cycles through the fixture's attendees so repeated presses build up real credits, rather
  /// than hitting PairAlreadyUsed on the second try. Handy for filming, too: pre-seed the graph,
  /// then let the physical devices add the edges the camera actually shows.
  const devPeerIndex = useRef(0);
  const devAttestPeer = () =>
    run("Attesting…", async () => {
      const pks = (process.env.NEXT_PUBLIC_DEV_PEER_PKS ?? process.env.NEXT_PUBLIC_DEV_PEER_PK ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as Hex[];
      if (!pks.length) throw new Error("no dev peer keys configured");
      const pk = pks[devPeerIndex.current % pks.length];
      devPeerIndex.current += 1;
      const peer = privateKeyToAccount(pk);
      const epoch = currentEpoch();
      const p = parsePeerCode(await makePeerCode(peer, ESCROW_ADDRESS, eventId(), epoch))!;
      await submitAttest(p.subject, p.epoch, p.sig);
    });

  const devFund = () =>
    run("Funding…", async () => {
      const funder = privateKeyToAccount(process.env.NEXT_PUBLIC_DEV_FUNDER_PK as Hex);
      const hash = await walletClientFor(funder).sendTransaction({
        to: signer!.address,
        value: 10n ** 18n * 100n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    });

  const devRpc = (method: string, params: unknown[]) =>
    fetch(process.env.NEXT_PUBLIC_RPC_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });

  const devWarpTo = (target: bigint, label: string) =>
    run(label, async () => {
      const secs = Number(target) - Math.floor(chainNowMs() / 1000) + 5;
      await devRpc("evm_increaseTime", [Math.max(secs, 1)]);
      await devRpc("evm_mine", []);
      await Promise.all([syncChainClock(), resolveEventId()]);
      await refresh();
    });

  /* ---------------- render ---------------- */

  if (!hasDeployment) {
    return (
      <Shell handheld>
        <Notice>
          No contract configured. Run <code className="text-fg">scripts/dev-chain.sh</code>.
        </Notice>
      </Shell>
    );
  }

  const k = ev?.k ?? 3;
  const received = me?.received ?? 0;
  const settled = ev?.status === 2;
  const cancelled = ev?.status === 1;
  // The contract refuses settle() until the grace period elapses whenever peers alone failed to
  // reach quorum, so the button must not be offered before then.
  const graceEnds = ev ? Number(ev.attestClose) + FALLBACK_WINDOW_SECONDS : 0;
  const graceLeft = Math.max(0, graceEnds - Math.floor(chainNowMs() / 1000));
  const settleBlocked = !!ev && ev.peerConfirmed <= ev.k && graceLeft > 0;

  return (
    <Shell handheld>
      <AppHeader
        title={t("floor.title")}
        back="/event"
        right={
          <span className="flex items-center gap-2.5">
            {windowOpen && ev && (
              <span className="font-mono text-lg tabular-nums text-fg">
                {countdown(Number(ev.attestClose) - Math.floor(chainNowMs() / 1000))}
              </span>
            )}
            {/* Reachable from the one screen somebody is standing in a room holding. Anywhere else
                and a person who opened the app in a language they cannot read has to navigate in
                it to find the way out. */}
            <LanguageSwitcher />
          </span>
        }
      />

      {isLocalChain && <Notice tone="warn">{t("floor.localChain")}</Notice>}

      <IdentityGate>
        {!me?.registered ? (
          <div className="space-y-4">
            <h1 className="text-[22px] font-medium leading-snug">{t("floor.notRegistered")}</h1>
            <p className="text-[15px] leading-relaxed text-dim">{t("floor.notRegisteredBody")}</p>
            <LinkButton href="/event">{t("floor.goRegister")}</LinkButton>
          </div>
        ) : (
          <>
            <RotatingCode payload={payload} secondsLeft={secondsLeft} totalSeconds={Number(EPOCH)} />

            {/* Scanning before the window opens is not something the contract allows, so the buttons
                were disabled — but at 35% opacity they read as absent rather than as not-yet, and
                somebody looked for them and concluded the feature was missing. A locked state says
                which, and a countdown says for how long. */}
            {!windowOpen ? (
              <div className="space-y-2.5 rounded-xl border border-line-2 bg-raised p-4 text-center">
                {/* Not "when registration closes" — walk-ins let registration run past the doors,
                    so the two are no longer the same moment. Doors are the one this screen waits on. */}
                <p className="text-[16px] font-medium">{t("floor.doorsOpenIn")}</p>
                <p className="text-[32px] font-medium leading-none tabular-nums text-accent-2">
                  {ev ? countdown(Number(ev.attestOpen) - Math.floor(chainNowMs() / 1000)) : "…"}
                </p>
                <p className="text-[15px] leading-relaxed text-dim">{t("floor.doorsOpenBody")}</p>
              </div>
            ) : !checkedIn ? (
              /* One thing to do, and it is not the thing this screen used to lead with. Two
                 side-by-side buttons made scanning a person look available before arriving was
                 done, so people tried it, got refused, and had to work out the order themselves. */
              <div className="space-y-2.5">
                <Button onClick={() => setScanning(true)} disabled={!!busy} className="w-full">
                  {busy ?? t("floor.checkIn")}
                </Button>
                <p className="text-center text-[15px] leading-relaxed text-dim">
                  {t("floor.checkInHint")}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Button onClick={() => setScanning(true)} disabled={!!busy} className="w-full">
                  {busy ?? t("floor.scanSomeone")}
                </Button>
                <p className="text-center text-[15px] text-ok">
                  {t("floor.checkedIn")}{" "}
                  {me!.checkedInAt > 0 &&
                    `· ${new Date(me!.checkedInAt * 1000).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`}
                </p>
              </div>
            )}

            {notice && <Notice tone="bad">{notice}</Notice>}
            {/* A read that keeps failing leaves every number on this screen stale, and the
                numbers are the reason to look at it. Say so rather than letting somebody act
                on a vouch count from four minutes ago. */}
            {!notice && readError && (
              <Notice tone="warn">
                {t("floor.staleRead")} {readError}
              </Notice>
            )}

            {/* Two counters, the same shape, because they answer the same question at two scales:
                how far am I, and how far is the room. The design puts the shortfall on the right of
                the number rather than in a sentence underneath — at arm's length in a dark room,
                "1 more" is read and a paragraph is not. */}
            <Card className="!p-4">
              <div className="flex items-baseline justify-between gap-3">
                <Eyebrow>{t("floor.vouchedForYou")}</Eyebrow>
                {me && !me.confirmed && received < k && (
                  <span className="text-[15px] text-warn">
                    {t("floor.needMore", { n: Math.max(0, k - received) })}
                  </span>
                )}
                {me?.confirmed && <span className="text-[15px] text-ok">✓</span>}
              </div>
              <p className="mt-1 text-[34px] font-medium leading-none tabular-nums">
                {me ? received : <Skeleton className="h-8 w-14 align-middle" />}
                {me && <span className="text-faint">/{k}</span>}
              </p>
              <div className="mt-3">
                <Progress value={received} max={k} />
              </div>
              <p className="mt-3 text-[15px] leading-relaxed">
                {me?.confirmed ? (
                  <span className="text-ok">{t("floor.countsPresent")}</span>
                ) : (me?.given ?? 0) === 0 ? (
                  <span className="text-warn">{t("floor.scanAtLeastOne")}</span>
                ) : null}
              </p>
            </Card>

            {log.length > 0 && (
              <ul className="space-y-2">
                {log.map((e) => (
                  <li
                    key={e.hash}
                    className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3"
                  >
                    <span className="text-ok" aria-hidden="true">
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-dim">
                        {shortAddress(e.who)}
                      </span>
                      <span className="block text-[14px] text-faint">{t("floor.vouchedByYou")}</span>
                    </span>
                    {explorerTxUrl(e.hash) ? (
                      <a
                        href={explorerTxUrl(e.hash)}
                        className="font-mono text-xl tabular-nums text-ok underline decoration-line-2"
                      >
                        {(e.latencyMs / 1000).toFixed(2)}s
                      </a>
                    ) : (
                      <span className="font-mono text-xl tabular-nums text-ok">
                        {(e.latencyMs / 1000).toFixed(2)}s
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {ev && (
              <Card className="!p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Eyebrow>{t("floor.confirmedPresent")}</Eyebrow>
                  <span className="text-[15px] text-faint">{t("floor.room")}</span>
                </div>
                <p className="mt-1 text-[34px] font-medium leading-none tabular-nums">
                  {ev.confirmed}
                  <span className="text-faint">/{ev.registered}</span>
                </p>
                <div className="mt-3">
                  <Progress value={ev.confirmed} max={ev.registered} />
                </div>
              </Card>
            )}

            {/* The question the whole product exists to answer, put where somebody sceptical would
                look for it — closed by default, because it is not what you need while scanning. */}
            <details className="rounded-xl border border-line bg-panel px-4 py-3">
              <summary className="cursor-pointer list-none text-[15px] text-dim">
                {t("floor.howProve")}
              </summary>
              <p className="mt-2.5 text-[15px] leading-relaxed text-dim">{t("floor.howProveBody")}</p>
            </details>

            {phase === "closed" && ev && (
              <Card className="space-y-3.5">
                <h2 className="text-[18px] font-medium">
                  {settled ? "Settled" : cancelled ? "Refunding" : "Window closed"}
                </h2>

                {!settled && !cancelled && (
                  <>
                    <p className="text-[15px] leading-relaxed text-dim">
                      Payouts are fixed by the contract, not by anyone&apos;s decision. Anyone can
                      trigger it — in production a scheduled job does, so nobody can stall it.
                    </p>
                    {settleBlocked ? (
                      <Notice tone="warn">
                        Only {ev.peerConfirmed} people were confirmed by their peers, and {ev.k + 1}{" "}
                        are needed — so the contract holds settlement open for {countdown(graceLeft)}{" "}
                        to let the organizer check in whoever did turn up. Without this pause, anyone
                        could settle the moment the window shut and strand the handful who came.
                      </Notice>
                    ) : (
                      <Button onClick={() => void settle()} disabled={!!busy} className="w-full">
                        {busy ?? "Settle this event"}
                      </Button>
                    )}
                  </>
                )}

                {settled &&
                  (me?.confirmed ? (
                    me.claimed ? (
                      <PayoutResult deposit={ev.deposit} total={ev.sharePerAttendee} hash={claimHash} />
                    ) : (
                      <>
                        <div className="space-y-2.5">
                          <KeyValue label="Your deposit back" value={mon(ev.deposit)} />
                          <KeyValue
                            label="Share of forfeited deposits"
                            value={mon(ev.sharePerAttendee - ev.deposit)}
                          />
                          <div className="border-t border-line pt-2.5">
                            <KeyValue label="Total" value={mon(ev.sharePerAttendee)} strong />
                          </div>
                        </div>
                        <Button onClick={() => void claim()} disabled={!!busy} className="w-full">
                          {busy ?? `Claim ${mon(ev.sharePerAttendee)}`}
                        </Button>
                      </>
                    )
                  ) : (
                    <p className="text-[15px] leading-relaxed text-dim">
                      You weren&apos;t confirmed present, so your deposit went to the people who
                      were. Nothing to claim.
                    </p>
                  ))}

                {cancelled && (
                  <>
                    <p className="text-[15px] leading-relaxed text-dim">
                      Attendance couldn&apos;t be established, so the contract refunded every
                      deposit rather than issue an unreliable verdict. Nobody was penalised and the
                      organizer received nothing.
                    </p>
                    <Button
                      onClick={() => void claim()}
                      disabled={!!busy || me?.claimed}
                      className="w-full"
                    >
                      {me?.claimed ? "Refunded" : (busy ?? `Claim ${mon(ev.deposit)} refund`)}
                    </Button>
                  </>
                )}
              </Card>
            )}
          </>
        )}

        {devMode && signer && (
          <details className="mt-auto rounded-xl border border-line bg-panel p-3 text-xs">
            <summary className="cursor-pointer text-faint">dev</summary>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <DevBtn onClick={devFund} label="fund me" />
              {ev && <DevBtn onClick={() => devWarpTo(ev.attestOpen, "Warping…")} label="warp to window" />}
              {ev && <DevBtn onClick={() => devWarpTo(ev.attestClose, "Warping…")} label="warp past close" />}
              {ev && (
                <DevBtn onClick={() => devWarpTo(BigInt(graceEnds), "Warping…")} label="warp past grace" />
              )}
              <DevBtn onClick={devCheckIn} label="check in" />
              <DevBtn onClick={devAttestPeer} label="attest scripted peer" />
            </div>
            <p className="mt-2.5 font-mono text-[14px] leading-relaxed text-faint">
              me {signer.address}
              <br />
              phase {phase} · epoch {currentEpoch().toString()} · beacon{" "}
              {currentBeaconEpoch().toString()}
            </p>
          </details>
        )}
      </IdentityGate>

      <Flash message={flash} onDone={() => setFlash(null)} />
      {result && ev && (
        <VouchResult
          who={result.who}
          latencyMs={result.latencyMs}
          hash={result.hash}
          mine={result.mine}
          theirs={result.theirs}
          needed={ev.k}
          onDone={() => setResult(null)}
        />
      )}
      {scanning && (
        <Scanner
          onResult={(t) => void onScan(t)}
          onClose={() => setScanning(false)}
          notice={busy ?? notice}
          title={checkedIn ? "Point at someone's code" : "Point at the screen at the door"}
          hint={
            checkedIn
              ? undefined
              : "The venue display is showing a code that changes every 30 seconds. This is sent straight to the chain, so scan it where it is — not from a photograph."
          }
        />
      )}
    </Shell>
  );
}

function DevBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="rounded border border-line-2 px-2 py-1 text-dim">
      {label}
    </button>
  );
}
