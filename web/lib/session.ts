import type { Address, Hex } from "viem";
import { chain, ESCROW_ADDRESS } from "@/lib/chain";

/// Remembers a derived attendance key so a page refresh does not cost another signature.
///
/// Without this, every reload sent the user back through a wallet prompt or a biometric ceremony —
/// which no other product does, and which during an event means interrupting somebody mid-scan.
///
/// What is stored depends on what the key controls, because the two paths are not equally risky:
///
///   wallet · privy — the key only signs attendance codes. The wallet holds the deposit and is
///                    still required for every transaction, so a copy of this key lets somebody
///                    forge codes for one event and nothing else. Kept for a day.
///   passkey        — the derived key *is* the participant. It holds the deposit and can claim the
///                    payout, which makes it a wallet key in everything but name. Kept only for
///                    the life of the tab, and re-derived from the passkey after that — one
///                    biometric, which is the cheapest possible re-entry and leaves nothing at
///                    rest.
///
/// Scoped to chain, contract, event and owner: a key derived for one event must never be reused
/// for another, and the derivation itself is per-event for the same reason.
const DAY_MS = 24 * 60 * 60 * 1000;

type Stored = {
  kind: "passkey" | "wallet" | "privy";
  attestPk: Hex;
  /// What to call this account when showing it to its owner — an email address on the email path.
  /// Stored so a reload does not turn a recognisable account back into a hex string.
  label?: string;
  /// The registered participant. Same as the attest key's address on the passkey path.
  owner: Address;
  expiresAt: number;
};

function keyFor(eventId: bigint, owner?: Address): string {
  const who = owner ? owner.toLowerCase() : "self";
  return `peerproof.session.${chain.id}.${ESCROW_ADDRESS.toLowerCase()}.${eventId}.${who}`;
}

function storeFor(kind: Stored["kind"]): Storage | null {
  if (typeof window === "undefined") return null;
  return kind === "passkey" ? sessionStorage : localStorage;
}

export function saveSession(
  eventId: bigint,
  kind: Stored["kind"],
  attestPk: Hex,
  owner: Address,
  label?: string,
): void {
  const store = storeFor(kind);
  if (!store) return;
  const value: Stored = {
    kind,
    attestPk,
    owner,
    label,
    expiresAt: Date.now() + (kind === "passkey" ? DAY_MS : DAY_MS),
  };
  try {
    store.setItem(keyFor(eventId, owner), JSON.stringify(value));
    // A second entry without the owner, so a returning visitor can be found before their wallet
    // has been asked who it is.
    store.setItem(keyFor(eventId), JSON.stringify(value));
  } catch {
    // Private browsing and full quotas both throw here. Losing the convenience is fine; failing
    // the sign-in because of it is not.
  }
}

export function loadSession(eventId: bigint, owner?: Address): Stored | null {
  if (typeof window === "undefined") return null;
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(keyFor(eventId, owner));
      if (!raw) continue;
      const v = JSON.parse(raw) as Stored;
      if (!v?.attestPk || !v?.expiresAt) continue;
      if (Date.now() > v.expiresAt) {
        store.removeItem(keyFor(eventId, owner));
        continue;
      }
      return v;
    } catch {
      // A corrupt entry is not worth a crash — treat it as absent.
    }
  }
  return null;
}

export function clearSession(eventId: bigint, owner?: Address): void {
  if (typeof window === "undefined") return;
  for (const store of [localStorage, sessionStorage]) {
    try {
      store.removeItem(keyFor(eventId, owner));
      store.removeItem(keyFor(eventId));
    } catch {
      // Nothing to do; the entry expires on its own.
    }
  }
}
