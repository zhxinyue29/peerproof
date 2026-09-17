"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Hex } from "viem";
import Link from "next/link";
import { useIdentity } from "@/components/IdentityProvider";
import IdentityGate from "@/components/IdentityGate";
import Funding, { needFor } from "@/components/Funding";
import RegisteredResult from "@/components/RegisteredResult";
import {
  Accordion,
  AppHeader,
  Button,
  Footer,
  FooterLinks,
  LinkButton,
  Notice,
  Shell,
  Sheet,
  Split,
  Stat,
} from "@/components/ui";
import { chainNowMs, eventId, GAS_LIMITS, hasDeployment, isLocalChain, publicClient } from "@/lib/chain";
import { mon, shortenError } from "@/lib/format";
import { canRegister, phaseOf, projectedPayout, useEvent } from "@/lib/useEvent";
import { useEventMeta } from "@/lib/eventMeta";

/// One event: what it is, what it costs, and the way in.
///
/// Lives at /event rather than / because the two roles needed separating. An organizer who pressed
/// back landed in the participants' listing, full of other people's events, with no way back to
/// their own — so / is now a door marked with which of the two you are, and this is what a
/// participant finds behind theirs.
export default function EventPage() {
  const { signer } = useIdentity();
  const { ev, me, refresh } = useEvent(signer?.address ?? null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRegistered, setJustRegistered] = useState<Hex | null>(null);
  const [joining, setJoining] = useState(false);

  const phase = phaseOf(ev);
  // Not `phase === "registering"`: with walk-ins a room that is already checking people in
  // is still taking them, and asking the phase hid the button for the entire event.
  const joinable = canRegister(ev);
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
      // Shown once, here, rather than as a permanent banner: it is an account of a transaction
      // that just happened, and on the next visit the ordinary "You're in" state is the truth.
      setJustRegistered(hash);
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
          <Link href="/verify" className="text-[15px] text-faint underline decoration-line-2">
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
              {meta.blurb && <p className="text-[15px] leading-relaxed text-dim md:text-[16px]">{meta.blurb}</p>}
              <p className="pt-1 text-[15px] leading-relaxed text-dim md:max-w-[46ch] md:text-[16px]">
                Put a deposit down to hold your place. Show up, vouch for the people around you,
                and the contract gives it back — plus a share of whatever the no-shows leave
                behind.
              </p>
            </div>

            {/* One unit, because it is one argument: this is the amount, and this is who holds it.
                Split across two cards it was two facts; together it is the reason to keep reading. */}
            <div className="flex items-center gap-4 rounded-2xl border border-line-2 bg-gradient-to-br from-accent/15 to-ok/[0.06] p-5">
              <p className="whitespace-nowrap text-[30px] font-extrabold tracking-tight tabular-nums md:text-[32px]">
                {ev ? mon(ev.deposit) : "—"}
              </p>
              <p className="text-[15px] font-medium leading-snug text-ok">
                Held by the contract.
                <span className="mt-0.5 block font-normal text-dim">Not by the organizer.</span>
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

            {justRegistered && ev ? (
              <RegisteredResult
                deposit={ev.deposit}
                hash={justRegistered}
                opensIn={Number(ev.attestOpen) - Math.floor(chainNowMs() / 1000)}
                vouchesNeeded={ev.k}
                onContinue={() => router.push("/floor")}
              />
            ) : me?.registered ? (
              <div className="space-y-3">
                <Notice tone="ok">
                  You&apos;re in. Your deposit is held by the contract, not by the organizer.
                </Notice>
                <LinkButton href="/floor">
                  {phase === "open" ? "Go to the floor" : "Open my attendance code"}
                </LinkButton>
              </div>
            ) : joinable ? (
              /* Signed in: the button is the whole thing. Not signed in: the button opens the
                 sheet, and the three ways to sign in appear at the moment they become a question
                 somebody is asking — not while they are still deciding whether to come. */
              <div className="space-y-3">
                {error && <Notice tone="bad">{error}</Notice>}
                {ev && me && signer && (
                  <Funding
                    need={needFor(ev.deposit, GAS_LIMITS.register)}
                    have={me.balance}
                    what="register"
                    address={signer.address}
                  />
                )}
                <Button
                  onClick={() => (signer ? void register() : setJoining(true))}
                  disabled={
                    busy || !ev || (!!signer && (!me || me.balance < needFor(ev.deposit, GAS_LIMITS.register)))
                  }
                  className="w-full"
                >
                  {busy ? "Staking…" : ev ? `Stake ${mon(ev.deposit)} and register` : "Loading…"}
                </Button>
                <p className="text-center text-[14px] text-dim">
                  {signer ? (
                    <>balance {me ? mon(me.balance) : "—"} · you never see a gas prompt</>
                  ) : (
                    <>Choose how to sign in when you join. No wallet plugin required.</>
                  )}
                </p>
              </div>
            ) : (
              <Notice>
                  {ev && ev.registered >= ev.capacity
                    ? "This event is full."
                    : "Registration for this event has closed."}
                </Notice>
            )}

            {/* The case for the mechanism, in the same words as before, one tap away instead of
                between somebody and the decision they came to make. */}
            <div className="pt-1">
              <Accordion
                title="How attendance works"
                sub="Scan the venue, then prove the people around you"
              >
                <p>
                  Your code changes every fifteen seconds, so a screenshot forwarded to somebody
                  else is worthless two rotations later.
                </p>
                <p>
                  Every vouch carries a signature from the screen at the door, which changes every
                  two minutes — so whoever submitted it had to read that screen in the room.
                </p>
                <p>
                  And being counted present requires having vouched for somebody yourself. Every
                  account that settles as present held a live venue code. You cannot be relayed in
                  by a friend.
                </p>
              </Accordion>
              <Accordion title="What happens to the deposit" sub="Show up, and it comes back with more">
                <p>
                  Show up and it returns to you, plus a share of the deposits left behind by people
                  who did not
                  {ev && ev.confirmed > 0 && surplus > 0n ? (
                    <> — about <span className="font-medium tabular-nums">{mon(surplus)}</span> at
                    the current count</>
                  ) : null}
                  .
                </p>
                <p>Don&apos;t, and your deposit goes to the people who did.</p>
                <p>
                  If too few people register for the event to run, every deposit is refunded in
                  full — including yours.
                </p>
              </Accordion>
            </div>
          </>
        }
      />

      {joining && !signer && (
        <Sheet
          title="How do you want to sign in?"
          sub="One of these, once. Nothing to install."
          onClose={() => setJoining(false)}
        >
          <IdentityGate>
            <p className="text-[15px] text-dim">You&apos;re signed in — press register again.</p>
          </IdentityGate>
        </Sheet>
      )}

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
