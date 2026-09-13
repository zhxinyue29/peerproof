"use client";

import { useState } from "react";
import Link from "next/link";
import { useIdentity } from "@/components/IdentityProvider";
import IdentityGate from "@/components/IdentityGate";
import {
  AppHeader,
  BigNumber,
  Button,
  Card,
  Footer,
  FooterLinks,
  LinkButton,
  Notice,
  Row,
  Shell,
  Split,
  Stat,
} from "@/components/ui";
import { eventId, GAS_LIMITS, hasDeployment, isLocalChain, publicClient } from "@/lib/chain";
import { mon, shortenError } from "@/lib/format";
import { phaseOf, projectedPayout, useEvent } from "@/lib/useEvent";
import { useEventMeta } from "@/lib/eventMeta";

/// The page an attendee arrives on from a link. One event, no list: a list of one is a shell.
export default function LandingPage() {
  const { signer } = useIdentity();
  const { ev, me, refresh } = useEvent(signer?.address ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phase = phaseOf(ev);
  const meta = useEventMeta(eventId());

  async function register() {
    if (!signer || !ev) return;
    setBusy(true);
    setError(null);
    try {
      // The attest key, not the participant address: on the wallet path these differ, and the
      // contract verifies rotating codes against whatever is registered here.
      const hash = await signer.write({
        functionName: "register",
        args: [eventId(), signer.attest.address],
        value: ev.deposit,
        gas: GAS_LIMITS.register,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Registration reverted on chain.");
      await refresh();
    } catch (e) {
      setError(shortenError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!hasDeployment) {
    return (
      <Shell>
        <h1 className="text-2xl">No contract configured</h1>
        <Notice>
          Run <code className="text-fg">scripts/dev-chain.sh</code>, then restart the dev server.
        </Notice>
      </Shell>
    );
  }

  const surplus = ev ? projectedPayout(ev) - ev.deposit : 0n;

  return (
    <Shell>
      {isLocalChain && <Notice tone="warn">Local chain — real transactions, fake money.</Notice>}

      <AppHeader
        title="Event"
        back="/events"
        right={
          <Link href="/verify" className="text-[13px] text-faint underline decoration-line-2">
            public record
          </Link>
        }
      />

      <Split
        main={
          <>
            <div className="space-y-2">
              <h1 className="text-[27px] font-medium leading-[1.15] tracking-tight md:text-[38px] md:leading-[1.1]">
                {meta.title}
              </h1>
              {meta.blurb && <p className="text-[13px] leading-relaxed text-dim md:text-[15px]">{meta.blurb}</p>}
              <p className="pt-1 text-[13px] leading-relaxed text-dim md:max-w-[46ch] md:text-[15px]">
                Put a deposit down to hold your place. Show up, vouch for the people around you,
                and the contract gives it back — plus a share of whatever the no-shows leave
                behind.
              </p>
            </div>

            {!ev ? (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="registered" loading />
                <Stat label="vouches needed" loading />
                <Stat label="min to run" loading />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Stat value={`${ev.registered}/${ev.capacity}`} label="registered" />
                <Stat value={`${ev.k}`} label="vouches needed" />
                <Stat value={`${ev.minQuorum}`} label="min to run" />
              </div>
            )}
          </>
        }
        side={
          <>
            <Card>
              <BigNumber
                value={ev && mon(ev.deposit)}
                loading={!ev}
                label="Deposit to hold a place"
                sub="Held by the contract. Not by the organizer."
              />
              <dl className="mt-5 space-y-3 border-t border-line pt-4">
                <Row label="Show up">
                  You get it back
                  {ev && ev.confirmed > 0 && surplus > 0n ? (
                    <>
                      , plus about{" "}
                      <span className="font-medium tabular-nums">{mon(surplus)}</span> from the
                      no-shows
                    </>
                  ) : (
                    <>, plus a share of whatever the no-shows forfeit</>
                  )}
                </Row>
                <Row label="Don't">Your deposit goes to the people who did</Row>
              </dl>
            </Card>

            {me?.registered ? (
              <div className="space-y-3">
                <Notice tone="ok">
                  You&apos;re in. Your deposit is held by the contract, not by the organizer.
                </Notice>
                <LinkButton href="/floor">
                  {phase === "open" ? "Go to the floor" : "Open my attendance code"}
                </LinkButton>
              </div>
            ) : phase === "registering" ? (
              <IdentityGate>
                <div className="space-y-3">
                  {error && <Notice tone="bad">{error}</Notice>}
                  <Button onClick={() => void register()} disabled={busy || !ev} className="w-full">
                    {busy ? "Staking…" : ev ? `Stake ${mon(ev.deposit)} and register` : "Loading…"}
                  </Button>
                  <p className="text-center text-xs text-faint">
                    balance {me ? mon(me.balance) : "—"} · you never see a gas prompt
                  </p>
                </div>
              </IdentityGate>
            ) : (
              <Notice>Registration for this event has closed.</Notice>
            )}
          </>
        }
      />

      <Footer>
        <p className="leading-relaxed">
          Attendance is decided by the people in the room. The organizer has no function that
          releases, withholds, or receives deposits —{" "}
          <Link href="/verify" className="text-fg underline decoration-line-2">
            check it yourself
          </Link>
          .
        </p>
        <FooterLinks
          items={[
            { href: "/venue", label: "Venue display" },
            { href: "/organizer", label: "Organizer" },
          ]}
        />
      </Footer>
    </Shell>
  );
}
