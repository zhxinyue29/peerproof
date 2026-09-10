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
export function shortenError(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  const m = s.match(/Error:\s*(\w+)\(\)/) ?? s.match(/reverted with the following reason:\s*(\S+)/);
  return m ? m[1] : s.split("\n")[0].slice(0, 160);
}

export function countdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
