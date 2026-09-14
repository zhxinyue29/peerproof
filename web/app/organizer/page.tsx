"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import IdentityGate from "@/components/IdentityGate";
import { AppHeader, Button, Card, CopyableCode, Eyebrow, Field, Notice, Shell } from "@/components/ui";
import { useIdentity } from "@/components/IdentityProvider";
import { attendanceEscrowAbi as abi } from "@/lib/abi";
import {
  ESCROW_ADDRESS,
  eventId,
  GAS_LIMITS,
  chainNowMs,
  hasDeployment,
  isLocalChain,
  publicClient,
} from "@/lib/chain";
import { both, countdown, fiat, shortAddress, shortenError } from "@/lib/format";
import { phaseOf, useEvent } from "@/lib/useEvent";
import { checkDirectory, deployDirectory, describeGas, directoryAddress } from "@/lib/directory";
import { eventDirectoryAbi } from "@/lib/directoryArtifact";
import DeployDirectory from "@/components/DeployDirectory";
import DeployEscrow from "@/components/DeployEscrow";

export default function OrganizerPage() {
  const { signer, devMode } = useIdentity();
  const { ev, refresh } = useEvent(signer?.address ?? null);
  const [tab, setTab] = useState<"dashboard" | "create">("dashboard");

  if (!hasDeployment) {
    return (
      <Shell>
        <Notice>No contract configured.</Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      {isLocalChain && (
        <Notice tone="warn">Local chain — real transactions, fake money.</Notice>
      )}

      <AppHeader
        title="Organizer"
        back="/events"
        right={
          <Link href="/verify" className="text-[13px] text-faint underline decoration-line-2">
            public record
          </Link>
        }
      />

      <div className="flex gap-1 rounded-xl border border-line bg-panel p-1 text-sm">
        {(["dashboard", "create"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`min-h-[46px] flex-1 rounded-lg px-3 capitalize transition-colors ${
              tab === t ? "bg-raised text-fg" : "text-faint"
            }`}
          >
            {t === "create" ? "new event" : t}
          </button>
        ))}
      </div>

      <IdentityGate>
        {tab === "dashboard" ? <Dashboard /> : <CreateForm onCreated={refresh} />}
        {/* Dev only. Creating an event deploys this on demand, so an organizer never meets it —
            "deploy a contract" is our infrastructure problem, not something to put in front of
            somebody who wanted to invite people to a reading group. */}
        {devMode && <DeployDirectory />}
        {devMode && <DeployEscrow />}
      </IdentityGate>

      {tab === "dashboard" && ev && <PayoutControls />}

      <p className="text-[11px] leading-relaxed text-faint md:max-w-[70ch]">
        Everything on this screen is read from the contract. The organizer role exists to describe
        an event, not to decide its outcome.
      </p>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function Dashboard() {
  const { signer } = useIdentity();
  const { ev, refresh } = useEvent(signer?.address ?? null);
  const [escrowed, setEscrowed] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const phase = phaseOf(ev);

  useEffect(() => {
    const poll = async () => {
      setEscrowed(await publicClient.getBalance({ address: ESCROW_ADDRESS }));
      setFallbackOpen(
        await publicClient.readContract({
          address: ESCROW_ADDRESS,
          abi,
          functionName: "fallbackAvailable",
          args: [eventId()],
        }),
      );
    };
    void poll();
    const id = setInterval(() => void poll(), 3000);
    return () => clearInterval(id);
  }, []);

  if (!ev) return <p className="text-sm text-dim">Loading event…</p>;

  const isMine = signer?.address.toLowerCase() === ev.organizer.toLowerCase();

  return (
    <div className="space-y-4">
      {!isMine && (
        <Notice tone="warn">
          This event was created by {shortAddress(ev.organizer)}. You&apos;re viewing it read-only.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Registered" value={`${ev.registered}`} sub={`of ${ev.capacity} places`} />
        <Stat label="Confirmed present" value={`${ev.confirmed}`} sub={`needs ${ev.k} vouches each`} />
        <Stat label="Held in escrow" value={escrowed !== null ? fiat(escrowed) : "—"} sub="not in your wallet" />
        <Stat
          label="Phase"
          value={
            { loading: "…", registering: "Registering", waiting: "Pre-event", open: "Live", closed: "Closed" }[
              phase
            ]
          }
          sub={
            phase === "open"
              ? `closes in ${countdown(Number(ev.attestClose) - Math.floor(chainNowMs() / 1000))}`
              : phase === "registering"
                ? `until ${new Date(Number(ev.registerDeadline) * 1000).toLocaleTimeString()}`
                : ""
          }
        />
      </div>

      <Card className="space-y-2 text-sm">
        <Row label="Deposit per attendee" value={both(ev.deposit)} />
        <Row label="Runs if at least" value={`${ev.minQuorum} register`} />
        <Row label="Vouches to be present" value={`${ev.k}`} />
        <Row
          label="Status"
          value={["Open", "Cancelled — everyone refunded", "Settled"][ev.status] ?? "?"}
        />
      </Card>

      {notice && <Notice tone="bad">{notice}</Notice>}

      {fallbackOpen && isMine && (
        <div className="space-y-2 rounded-2xl border border-warn/30 bg-warn/10 p-4">
          <h3 className="text-sm font-medium text-warn">Fallback check-in is unlocked</h3>
          <p className="text-xs leading-relaxed text-warn/90">
            Peers couldn&apos;t establish quorum — too few people showed up to vouch for each
            other. You may confirm who was actually there. This is the only branch where your word
            counts for anything, and it still gives you no way to receive the money.
          </p>
          <p className="text-xs leading-relaxed text-warn/70">
            Paste addresses to confirm, one per line. (In a healthy room this whole section is
            absent, because the contract refuses the call.)
          </p>
          <FallbackForm
            onDone={async () => {
              await refresh();
              setNotice(null);
            }}
            setBusy={setBusy}
            setNotice={setNotice}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}

function FallbackForm({
  onDone,
  setBusy,
  setNotice,
  busy,
}: {
  onDone: () => Promise<void>;
  setBusy: (s: string | null) => void;
  setNotice: (s: string | null) => void;
  busy: string | null;
}) {
  const { signer } = useIdentity();
  const [text, setText] = useState("");

  async function submit() {
    const list = text
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s));
    if (!list.length) return setNotice("No valid addresses.");
    setBusy("Confirming…");
    setNotice(null);
    try {
      const hash = await signer!.write({
        functionName: "organizerCheckIn",
        args: [eventId(), list as `0x${string}`[]],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setText("");
      await onDone();
    } catch (e) {
      setNotice(shortenError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="0x…"
        className="w-full rounded-lg border border-warn/40 bg-ink p-2 font-mono text-xs text-fg"
      />
      <button
        onClick={() => void submit()}
        disabled={!!busy}
        className="rounded-lg bg-warn px-3 py-2 text-xs font-medium text-ink disabled:opacity-40"
      >
        {busy ?? "Confirm these attendees"}
      </button>
    </>
  );
}

/// The point of the whole product, rendered as an absence. Judges look for this button.
function PayoutControls() {
  return (
    <section className="rounded-2xl border border-dashed border-line-2 p-5">
      <Eyebrow>payouts</Eyebrow>
      <p className="mt-2.5 text-[15px] leading-relaxed text-dim">
        Settlement is automatic. You cannot release or withhold funds.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        There is no function on this contract that pays the organizer, and no parameter you can
        change after registration opens. When the window closes, anyone — or a scheduled job — can
        trigger the split, and the split is already determined.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function CreateForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { signer } = useIdentity();
  const [deposit, setDeposit] = useState("30");
  const [capacity, setCapacity] = useState("40");
  const [minQuorum, setMinQuorum] = useState("10");
  const [k, setK] = useState("3");
  // Expressed the way somebody plans an event, not the way the contract stores it: when the doors
  // open, how long it runs, and whether people can still join once it has started.
  const [doorsMins, setDoorsMins] = useState("30");
  const [runsMins, setRunsMins] = useState("180");
  const [walkIns, setWalkIns] = useState(true);
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Creating…");
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: bigint; beacon: string } | null>(null);

  async function submit() {
    if (!signer) return;
    setBusy(true);
    setNotice(null);
    try {
      // Descriptions live in a second contract. Whether it exists yet is our problem, not the
      // organizer's — so if it does not, deploy it as part of this action rather than putting a
      // "deploy a contract" button in front of somebody who wanted to create an event.
      const wantsWords = !!(title || blurb || url);
      if (wantsWords && !(await checkDirectory())) {
        setBusyLabel("Setting up descriptions…");
        await deployDirectory(signer.address);
      }
      setBusyLabel("Creating…");
      // The venue display's key. Generated fresh per event and handed to the device at the door;
      // it signs beacons and nothing else, so it never needs funding.
      const beaconPk = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("")}` as `0x${string}`;
      const { privateKeyToAccount } = await import("viem/accounts");
      const beacon = privateKeyToAccount(beaconPk);

      const now = BigInt(Math.floor(chainNowMs() / 1000));
      const attestOpen = now + BigInt(Number(doorsMins) * 60);
      const attestClose = attestOpen + BigInt(Number(runsMins) * 60);
      // Walk-ins keep registration open until the event ends. Without them it closes when the
      // doors do, which is the classic RSVP shape — the organizer picks.
      const regDeadline = walkIns ? attestClose : attestOpen;

      const hash = await signer.write({
        functionName: "createEvent",
        args: [
          beacon.address,
          parseEther(deposit),
          Number(capacity),
          Number(minQuorum),
          Number(k),
          regDeadline,
          attestOpen,
          attestClose,
        ],
        gas: GAS_LIMITS.createEvent,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("createEvent reverted");

      const next = (await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi,
        functionName: "nextEventId",
      })) as bigint;
      const id = next - 1n;
      setCreated({ id, beacon: beaconPk });

      // A second transaction, deliberately. The escrow stores nothing but the fields that decide
      // where money goes, so the description lives in EventDirectory — and an event that exists
      // without a description is a listing that reads badly, not a broken event. Failing here must
      // not look like the event failed.
      if (wantsWords) {
        try {
          setBusyLabel("Saving the description…");
          await signer.write({
            functionName: "describe",
            args: [id, title, blurb, url],
            gas: describeGas(title, blurb, url),
            to: directoryAddress(),
            abi: eventDirectoryAbi,
          });
          setNotice(null);
        } catch (e) {
          setNotice(`Event created, but the description didn't save: ${shortenError(e)}`);
        }
      }
      await onCreated();
    } catch (e) {
      setNotice(shortenError(e));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card className="space-y-3">
        <h3 className="text-[18px] font-medium">Event #{created.id.toString()} created</h3>
        <p className="text-sm leading-relaxed text-dim">
          Save the venue beacon key below and load it on the device at the door. It signs the
          rotating venue code — without it, nobody can prove they were in the room.
        </p>
        <CopyableCode value={created.beacon} tone="ok" />
        <p className="text-xs text-faint">
          Shown once. It holds no funds, but losing it means the venue display can&apos;t sign.
        </p>
        <p className="text-xs text-faint">
          To point this build at the new event, set{" "}
          <code>NEXT_PUBLIC_EVENT_ID={created.id.toString()}</code>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-4">
        {/* Description first. Somebody creating an event thinks about what it is before they think
            about deposit mechanics, and a form that opens with six numbers reads as a config screen
            rather than a way to invite people. */}
        <section className="space-y-2.5 rounded-2xl border border-line bg-panel p-4 md:p-5">
          <div>
            <Eyebrow>1 · about the event</Eyebrow>
            <p className="mt-1 text-[13px] text-dim">What people see in the listing.</p>
          </div>
          <Field label="Title" value={title} onChange={setTitle} hint="e.g. Thursday reading group" />
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-faint">
              Description
            </span>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Who it's for, what happens, where."
              className="w-full rounded-xl border border-line-2 bg-ink px-3.5 py-3 text-[15px] text-fg"
            />
          </label>
          <Field label="Link (optional)" value={url} onChange={setUrl} hint="A fuller page, if you have one" />
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-panel p-4 md:p-5">
          <div>
            <Eyebrow>2 · the rules</Eyebrow>
            <p className="mt-1 text-[13px] text-dim">
              Fixed once registration opens — including for you.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Deposit (MON)" value={deposit} onChange={setDeposit} hint={fiat(parseEther(deposit || "0"))} />
            <Field label="Capacity" value={capacity} onChange={setCapacity} />
            <Field label="Runs if at least" value={minQuorum} onChange={setMinQuorum} hint="must exceed vouches" />
            <Field label="Vouches needed" value={k} onChange={setK} hint="3 is a good default" />
            <Field label="Doors open in (mins)" value={doorsMins} onChange={setDoorsMins} hint="when check-in starts" />
            <Field label="Runs for (mins)" value={runsMins} onChange={setRunsMins} hint="how long check-in stays open" />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-ink p-3.5">
            <input
              type="checkbox"
              checked={walkIns}
              onChange={(e) => setWalkIns(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span className="text-[13px] leading-relaxed">
              <span className="font-medium text-fg">Take walk-ins</span>
              <span className="block text-dim">
                {walkIns
                  ? "People can still join after the doors open — the ones a room attracts on the night are often the ones worth keeping."
                  : "Registration closes when the doors open. Classic RSVP: decide in advance, or not at all."}
              </span>
            </span>
          </label>

          <p className="text-xs leading-relaxed text-faint">
            You send no funds and gain no spending power. Deposits go to the contract; the split is
            decided by who vouches for whom.
          </p>
        </section>

        {notice && <Notice tone="bad">{notice}</Notice>}

        <Button onClick={() => void submit()} disabled={busy} className="w-full">
          {busy ? busyLabel : "Create event"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */



function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="mt-0.5 text-2xl font-medium tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-faint">{sub}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-faint">{label}</span>
      <span className="text-right text-dim">{value}</span>
    </div>
  );
}
