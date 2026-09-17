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

/// Contract reverts arrive as long simulation dumps; surface only the custom error name.
/// EIP-1193 rejections that are worth saying in words. A wallet reports these as numbers, and the
/// number is never the thing the person needs to know.
const PROVIDER_CODES: Record<number, string> = {
  4001: "You rejected this in your wallet.",
  4100: "Your wallet has not authorised this site. Reconnect and try again.",
  4902: "Your wallet does not have this network configured.",
  [-32002]: "Your wallet already has a request open — check it for a pending prompt.",
};

/// What the escrow's own errors mean to somebody standing in a room holding a phone.
///
/// The contract refuses with a named error and viem carries that name in the middle of a stack of
/// wrapped exceptions. Reading `shortMessage` first — which is what this did — throws it away and
/// leaves "The contract function \"attest\" reverted", a sentence that tells a person nothing about
/// what to do next. The name is the only part that does.
const CONTRACT_ERRORS: Record<string, string> = {
  StaleBeacon:
    "The venue code has expired — it changes every two minutes. Scan the screen at the door again, then scan this person.",
  BadBeacon: "That venue code is for a different event.",
  StaleCode: "Their code expired before it reached the chain. Ask them to hold it steady and scan again.",
  BadCode: "That code didn't verify. It may belong to a different event.",
  PairAlreadyUsed: "You two have already vouched for each other. One scan counts for both of you.",
  SelfAttestation: "That's your own code — you need somebody else's.",
  NotRegistered: "One of you hasn't registered for this event.",
  WindowOpen: "Check-in hasn't opened yet.",
  WindowClosed: "Check-in has closed for this event.",
  WrongStatus: "This event is no longer open.",
  AlreadyRegistered: "You're already registered.",
  AtCapacity: "This event is full.",
  DeadlinePassed: "Registration has closed.",
  QuorumNotMet: "Too few people registered for this event to run.",
  FallbackPending: "Settlement is waiting out the fallback window.",
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

export function shortenError(e: unknown): string {
  const named = contractErrorName(e);
  if (named) return CONTRACT_ERRORS[named] ?? named;

  // Wallets throw plain objects, not Errors: `{ code: 4001, message: "User rejected the request" }`
  // goes through String() as "[object Object]", which is how a rejected transaction came back to
  // somebody as no reason at all. Read the shape before falling back to stringifying it.
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; shortMessage?: unknown; details?: unknown; message?: unknown };
    if (typeof o.code === "number" && PROVIDER_CODES[o.code]) return PROVIDER_CODES[o.code];
    // viem's shortMessage is written for humans; message is the whole trace.
    for (const k of ["shortMessage", "details", "message"] as const) {
      if (typeof o[k] === "string" && o[k]) {
        e = o[k] as string;
        break;
      }
    }
  }

  const s = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  if (/user (rejected|denied)/i.test(s)) return PROVIDER_CODES[4001];
  if (/insufficient funds/i.test(s)) {
    return "Not enough MON in this wallet to cover the gas for this transaction.";
  }
  const m = s.match(/Error:\s*(\w+)\(\)/) ?? s.match(/reverted with the following reason:\s*(\S+)/);
  if (m) return m[1];
  const line = s.split("\n")[0].slice(0, 160);
  // Still nothing legible — better to admit that than to print "[object Object]".
  return line && line !== "[object Object]" ? line : "The wallet refused this without saying why.";
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
