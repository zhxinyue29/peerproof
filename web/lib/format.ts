import { formatEther } from "viem";

/// Deposits are denominated in MON on chain but shown in fiat first: an attendee is deciding
/// whether five dollars is worth committing, not whether 30 MON is. The MON figure stays in
/// parentheses so a crypto-native judge can see we are not hiding the unit.
///
/// A live price feed is out of scope — Chainlink Data Feeds are on Monad mainnet and would be the
/// production answer. This rate is configuration, and the UI never implies it is live.
const MON_PER_UNIT = Number(process.env.NEXT_PUBLIC_MON_FIAT_RATE ?? "0.026");
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "USD";

/// Testnet MON has no market price, so converting it to dollars would be inventing a number.
/// On testnet every amount is shown in MON only, and the copy says the stake is scaled down.
const SHOW_FIAT = process.env.NEXT_PUBLIC_CHAIN === "mainnet";

const SYMBOLS: Record<string, string> = { USD: "$", CNY: "¥", EUR: "€" };

export const fiatAvailable = SHOW_FIAT;

export function fiat(wei: bigint): string {
  if (!SHOW_FIAT) return mon(wei);
  const value = Number(formatEther(wei)) * MON_PER_UNIT;
  const symbol = SYMBOLS[CURRENCY] ?? "";
  return `${symbol}${value.toFixed(2)}`;
}

export function mon(wei: bigint): string {
  const n = Number(formatEther(wei));
  // Deposits are whole-ish numbers; gas figures are not.
  return n >= 1 ? `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} MON` : `${n.toFixed(4)} MON`;
}

/// `$0.78 (30 MON)` on mainnet; just `30 MON` on testnet, where a fiat figure would be fiction.
export function both(wei: bigint): string {
  return SHOW_FIAT ? `${fiat(wei)} (${mon(wei)})` : mon(wei);
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/// A sentence that exists in two languages.
///
/// This module is imported by hooks, by event handlers and by `useEvent`'s bare promise chains, so
/// it cannot call `useT()` — a hook here would be a hook called outside a component. Instead each
/// message carries its dictionary key next to the English it was written as, and `shortenError`
/// takes an optional `t`. A caller that has one gets the reader's language; a caller that does not
/// gets exactly the string this file has always returned, so no screen regresses while the call
/// sites are converted one at a time.
type Copy = { key: string; en: string };

function say(c: Copy, t?: (k: string) => string): string {
  return t ? t(c.key) : c.en;
}

/// Contract reverts arrive as long simulation dumps; surface only the custom error name.
/// EIP-1193 rejections that are worth saying in words. A wallet reports these as numbers, and the
/// number is never the thing the person needs to know.
const PROVIDER_CODES: Record<number, Copy> = {
  4001: { key: "error.walletRejected", en: "You rejected this in your wallet." },
  4100: {
    key: "error.walletUnauthorised",
    en: "Your wallet has not authorised this site. Reconnect and try again.",
  },
  4902: {
    key: "error.walletNoNetwork",
    en: "Your wallet does not have this network configured.",
  },
  [-32002]: {
    key: "error.walletBusy",
    en: "Your wallet already has a request open — check it for a pending prompt.",
  },
};

/// What the escrow's own errors mean to somebody standing in a room holding a phone.
///
/// The contract refuses with a named error and viem carries that name in the middle of a stack of
/// wrapped exceptions. Reading `shortMessage` first — which is what this did — throws it away and
/// leaves "The contract function \"attest\" reverted", a sentence that tells a person nothing about
/// what to do next. The name is the only part that does.
const CONTRACT_ERRORS: Record<string, Copy> = {
  StaleBeacon: {
    key: "error.staleBeacon",
    en: "That venue code had already changed by the time check-in reached the chain. Scan the screen at the door again.",
  },
  BadBeacon: { key: "error.badBeacon", en: "That venue code is for a different event." },
  NotCheckedIn: {
    key: "error.notCheckedIn",
    en: "Check in at the door first — scan the screen at the venue. You only do it once.",
  },
  AlreadyCheckedIn: {
    key: "error.alreadyCheckedIn",
    en: "You are already checked in. Go and scan people.",
  },
  StaleCode: {
    key: "error.staleCode",
    en: "Their code expired before it reached the chain. Ask them to hold it steady and scan again.",
  },
  BadCode: { key: "error.badCode", en: "That code didn't verify. It may belong to a different event." },
  PairAlreadyUsed: {
    key: "error.pairAlreadyUsed",
    en: "You two have already vouched for each other. One scan counts for both of you.",
  },
  SelfAttestation: { key: "error.selfAttestation", en: "That's your own code — you need somebody else's." },
  NotRegistered: { key: "error.notRegistered", en: "One of you hasn't registered for this event." },
  WindowOpen: { key: "error.windowOpen", en: "Check-in hasn't opened yet." },
  WindowClosed: { key: "error.windowClosed", en: "Check-in has closed for this event." },
  WrongStatus: { key: "error.wrongStatus", en: "This event is no longer open." },
  AlreadyRegistered: { key: "error.alreadyRegistered", en: "You're already registered." },
  // These two say the same thing the event screen already says, in the same words, so they share
  // its keys rather than introducing a second phrasing for one fact.
  AtCapacity: { key: "event.full", en: "This event is full." },
  DeadlinePassed: { key: "event.registrationClosed", en: "Registration has closed." },
  QuorumNotMet: { key: "error.quorumNotMet", en: "Too few people registered for this event to run." },
  FallbackPending: { key: "error.fallbackPending", en: "Settlement is waiting out the fallback window." },
};

/// viem wraps the revert several layers deep; the name lives on a `cause` somewhere in the chain.
function contractErrorName(e: unknown): string | undefined {
  let cur = e as { cause?: unknown; data?: { errorName?: string }; name?: string } | undefined;
  for (let i = 0; cur && i < 8; i++) {
    const named = cur.data?.errorName;
    if (typeof named === "string") return named;
    cur = cur.cause as typeof cur;
  }
  return undefined;
}

/// `t` is optional so this stays callable from anywhere. Pass it wherever a component can — the
/// venue is where these sentences are read, and reading them in the wrong language is the failure
/// this whole pass exists to prevent.
export function shortenError(e: unknown, t?: (k: string) => string): string {
  const named = contractErrorName(e);
  if (named) {
    const hit = CONTRACT_ERRORS[named];
    return hit ? say(hit, t) : named;
  }

  // Wallets throw plain objects, not Errors: `{ code: 4001, message: "User rejected the request" }`
  // goes through String() as "[object Object]", which is how a rejected transaction came back to
  // somebody as no reason at all. Read the shape before falling back to stringifying it.
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; shortMessage?: unknown; details?: unknown; message?: unknown };
    if (typeof o.code === "number" && PROVIDER_CODES[o.code]) return say(PROVIDER_CODES[o.code], t);
    // viem's shortMessage is written for humans; message is the whole trace.
    for (const k of ["shortMessage", "details", "message"] as const) {
      if (typeof o[k] === "string" && o[k]) {
        e = o[k] as string;
        break;
      }
    }
  }

  const s = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  if (/user (rejected|denied)/i.test(s)) return say(PROVIDER_CODES[4001], t);
  if (/insufficient funds/i.test(s)) {
    return say(
      {
        key: "error.insufficientFunds",
        en: "Not enough MON in this wallet to cover the gas for this transaction.",
      },
      t,
    );
  }
  const m = s.match(/Error:\s*(\w+)\(\)/) ?? s.match(/reverted with the following reason:\s*(\S+)/);
  if (m) return m[1];
  const line = s.split("\n")[0].slice(0, 160);
  // Still nothing legible — better to admit that than to print "[object Object]".
  return line && line !== "[object Object]"
    ? line
    : say({ key: "error.noReason", en: "The wallet refused this without saying why." }, t);
}

/// Written for an attestation window measured in minutes, where m:ss is exactly right. A
/// registration window can be a day long, and "1433:18" is not a length anyone can read — so past
/// an hour it switches to units.
export function countdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  if (seconds >= 86_400) {
    const d = Math.floor(seconds / 86_400);
    const h = Math.floor((seconds % 86_400) / 3_600);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  if (seconds >= 3_600) {
    const h = Math.floor(seconds / 3_600);
    const m = Math.floor((seconds % 3_600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
