"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import RotatingCode from "@/components/RotatingCode";
import Scanner from "@/components/Scanner";
import PayoutResult from "@/components/PayoutResult";
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
import { countdown, mon, shortAddress, shortenError } from "@/lib/format";
import { phaseOf, useEvent } from "@/lib/useEvent";

type LogEntry = { who: Address; hash: Hex; latencyMs: number };

/// Mirrors AttendanceEscrow.FALLBACK_WINDOW.
const FALLBACK_WINDOW_SECONDS = 3600;

export default function FloorPage() {
  const { signer, devMode } = useIdentity();
  const { ev, me, refresh } = useEvent(signer?.address ?? null);

  const [beacon, setBeacon] = useState<{ epoch: bigint; sig: Hex } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [claimHash, setClaimHash] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Number(EPOCH));
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const inFlight = useRef(false);

  const phase = phaseOf(ev);
  const windowOpen = phase === "open";

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
      if (!signer || !beacon || inFlight.current) return;
      inFlight.current = true;
      setNotice(null);
      try {
        const started = performance.now();
        // signer.write simulates first, so a stale code or a repeated pair surfaces as its custom
        // error name instead of costing gas. Monad bills on the limit, so a doomed write is not
        // free either.
        const hash = await signer.write({
          functionName: "attest",
          args: [eventId(), subject, epoch, code, beacon.epoch, beacon.sig],
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
        setFlash(`Vouched · landed in ${(latencyMs / 1000).toFixed(2)}s`);
        await refresh();
      } catch (e) {
        setNotice(shortenError(e));
      } finally {
        inFlight.current = false;
      }
    },
    [beacon, signer, refresh],
  );

  const onScan = useCallback(
    async (text: string) => {
      const b = parseBeaconCode(text);
      if (b) {
        const ok = await recoverAddress({
          hash: beaconDigest(ESCROW_ADDRESS, b.eventId, b.beaconEpoch),
          signature: b.sig,
        }).catch(() => null);
        if (!ok) return setNotice("That venue code is malformed.");
        setBeacon({ epoch: b.beaconEpoch, sig: b.sig });
        setScanning(false);
        setNotice(null);
        return;
      }

      const p = parsePeerCode(text);
      if (!p) return setNotice("Not a PeerProof code.");
      if (!signer) return;
      if (p.subject.toLowerCase() === signer.address.toLowerCase()) {
        return setNotice("That's your own code — you need somebody else's.");
      }
      if (!beacon) {
        setScanning(true);
        return setNotice("Scan the venue display first.");
      }
      // The same check the contract performs, done locally so a bad scan never costs gas.
      const recovered = await recoverAddress({
        hash: codeDigest(ESCROW_ADDRESS, p.eventId, p.subject, p.epoch),
        signature: p.sig,
      }).catch(() => null);
      if (!recovered) return setNotice("That code failed verification.");

        setScanning(false);

        // Everything above is worth exercising whenever somebody wants to: the camera, the
        // permission prompt, the decode, the signature check. Only submitting is time-bound, so
        // only submitting is refused — and it says why rather than reverting on chain.
        if (!windowOpen) {
          return setNotice(
            ev && Math.floor(chainNowMs() / 1000) < Number(ev.attestOpen)
              ? `Code reads fine — check-in opens in ${countdown(Number(ev.attestOpen) - Math.floor(chainNowMs() / 1000))}.`
              : "Code reads fine, but check-in has closed for this event.",
          );
        }

        await submitAttest(p.subject, p.epoch, p.sig);
      },
      [beacon, signer, submitAttest, windowOpen, ev],
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

  const devReadBeacon = () =>
    run("Reading beacon…", async () => {
      const venue = privateKeyToAccount(process.env.NEXT_PUBLIC_DEV_BEACON_PK as Hex);
      const bEpoch = currentBeaconEpoch();
      const b = parseBeaconCode(await makeBeaconCode(venue, ESCROW_ADDRESS, eventId(), bEpoch))!;
      setBeacon({ epoch: b.beaconEpoch, sig: b.sig });
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
        title="Attendance floor"
        back="/event"
        right={
          windowOpen && ev ? (
            <span className="font-mono text-lg tabular-nums text-fg">
              {countdown(Number(ev.attestClose) - Math.floor(chainNowMs() / 1000))}
            </span>
          ) : undefined
        }
      />

      {isLocalChain && (
        <Notice tone="warn">
          Local chain — latency here is this node&apos;s block time, not Monad&apos;s.
        </Notice>
      )}

      <IdentityGate>
        {!me?.registered ? (
          <div className="space-y-4">
            <h1 className="text-[22px] font-medium leading-snug">
              You&apos;re not registered for this event
            </h1>
            <p className="text-[13px] leading-relaxed text-dim">
              A deposit is what makes an attestation worth anything, so the floor is only open to
              people who staked one.
            </p>
            <LinkButton href="/event">Go back and register</LinkButton>
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
                <p className="text-[15px] font-medium">Doors open in</p>
                <p className="text-[32px] font-medium leading-none tabular-nums text-accent-2">
                  {ev ? countdown(Number(ev.attestOpen) - Math.floor(chainNowMs() / 1000)) : "…"}
                </p>
                <p className="text-[13px] leading-relaxed text-dim">
                  Until then your code above is live and so is everyone else&apos;s — there is just
                  nothing to submit yet. Keep this page open; it unlocks on its own.
                </p>
              </div>
            ) : (
              <div className="flex gap-2.5">
                <Button onClick={() => setScanning(true)} disabled={!!busy} className="flex-1">
                  {busy ?? "Scan someone"}
                </Button>
                <button
                  onClick={() => setScanning(true)}
                  className={`min-h-[46px] rounded-xl border px-4 text-[15px] font-medium transition-transform duration-100 active:scale-[0.985] ${
                    beacon ? "border-line-2 text-faint" : "border-warn/50 text-warn"
                  }`}
                >
                  {beacon ? "Venue ✓" : "Scan venue"}
                </button>
              </div>
            )}

            {notice && <Notice tone="bad">{notice}</Notice>}

            <Card className="!p-4">
              <div className="flex items-end justify-between">
                <div>
                  <Eyebrow>vouched for you</Eyebrow>
                  <p className="mt-1 text-[34px] font-medium leading-none tabular-nums">
                    {me ? received : <Skeleton className="h-8 w-14 align-middle" />}
                    {me && <span className="text-faint">/{k}</span>}
                  </p>
                </div>
                <span className="pb-1.5">
                  <Dots filled={received} total={k} />
                </span>
              </div>
              <p className="mt-3.5 border-t border-line pt-3.5 text-[13px] leading-relaxed">
                {me?.confirmed ? (
                  <span className="text-ok">You count as present.</span>
                ) : (me?.given ?? 0) === 0 ? (
                  <span className="text-warn">
                    Scan at least one person — being vouched for isn&apos;t enough on its own.
                  </span>
                ) : (
                  <span className="text-dim">Need {Math.max(0, k - received)} more.</span>
                )}
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
                      <span className="block text-[11px] text-faint">vouched by you</span>
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
              <div className="space-y-2 border-t border-line pt-4">
                <div className="flex justify-between text-[13px]">
                  <span className="text-faint">confirmed present</span>
                  <span className="tabular-nums text-dim">
                    {ev.confirmed}/{ev.registered}
                  </span>
                </div>
                <Progress value={ev.confirmed} max={ev.registered} />
              </div>
            )}

            {phase === "closed" && ev && (
              <Card className="space-y-3.5">
                <h2 className="text-[18px] font-medium">
                  {settled ? "Settled" : cancelled ? "Refunding" : "Window closed"}
                </h2>

                {!settled && !cancelled && (
                  <>
                    <p className="text-[13px] leading-relaxed text-dim">
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
                    <p className="text-[13px] leading-relaxed text-dim">
                      You weren&apos;t confirmed present, so your deposit went to the people who
                      were. Nothing to claim.
                    </p>
                  ))}

                {cancelled && (
                  <>
                    <p className="text-[13px] leading-relaxed text-dim">
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
              <DevBtn onClick={devReadBeacon} label="read beacon" />
              <DevBtn onClick={devAttestPeer} label="attest scripted peer" />
            </div>
            <p className="mt-2.5 font-mono text-[10px] leading-relaxed text-faint">
              me {signer.address}
              <br />
              phase {phase} · epoch {currentEpoch().toString()} · beacon{" "}
              {currentBeaconEpoch().toString()}
            </p>
          </details>
        )}
      </IdentityGate>

      <Flash message={flash} onDone={() => setFlash(null)} />
      {scanning && <Scanner onResult={(t) => void onScan(t)} onClose={() => setScanning(false)} />}
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
