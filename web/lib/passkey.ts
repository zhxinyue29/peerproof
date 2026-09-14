import type { Hex } from "viem";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { LocalAccount } from "viem";

/// The attest key lives at the standard EVM path. It is not a wallet — it exists only to sign
/// the rotating codes, which is why it can sign without a biometric prompt every 15 seconds.
const ATTEST_KEY_PATH = "m/44'/60'/0'/0/0";

/// rpId is baked into every passkey and CANNOT be changed later: WebAuthn scopes credentials to
/// it, so moving domains makes every derived account unreproducible. Scoped to the registrable
/// domain rather than a subdomain so subdomains stay free to change.
export function relyingPartyId(): string {
  if (typeof window === "undefined") return "localhost";
  const host = window.location.hostname;
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  const parts = host.split(".");
  // *.vercel.app is a public suffix, so the registrable name includes the project label.
  if (host.endsWith(".vercel.app")) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export type PrfSupport =
  | { available: true }
  | { available: false; reason: "no-webauthn" | "no-platform-authenticator" | "prf-unavailable" };

/// Cheap pre-flight. Real PRF support can only be proven by a ceremony, but this catches the
/// common desktop-Chrome case (local profile authenticator exposes no hmac-secret) before we
/// make the user tap anything.
export async function checkPrfSupport(): Promise<PrfSupport> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { available: false, reason: "no-webauthn" };
  }
  try {
    const platform =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!platform) return { available: false, reason: "no-platform-authenticator" };
  } catch {
    return { available: false, reason: "no-platform-authenticator" };
  }
  return { available: true };
}

export type AttestIdentity = {
  /// Signs rotating codes. Never prompts after the one derivation ceremony.
  account: LocalAccount;
  credentialId: string;
  /// On this path the derived key *is* the participant — it holds the deposit — so it is only ever
  /// kept for the life of a tab. See lib/session.ts.
  attestPk: Hex;
};

function deriveKey(prfOutput: Uint8Array): { account: LocalAccount; attestPk: Hex } {
  // prfOutput is a deterministic 32 bytes per (credential, rpId, salt). Mera leaves derivation
  // to the caller; BIP-39/32 keeps it interoperable with normal wallet tooling.
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(ATTEST_KEY_PATH);
  if (!node.privateKey) throw new Error("derivation produced no private key");

  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  return {
    account: toViemAccount(session),
    attestPk: `0x${Buffer.from(node.privateKey).toString("hex")}` as Hex,
  };
}

export class PrfUnavailableError extends Error {
  constructor() {
    super("This device's passkey does not support the PRF extension.");
    this.name = "PrfUnavailableError";
  }
}

/// First-time setup: one ceremony, one prompt.
export async function createAttestIdentity(displayName: string): Promise<AttestIdentity> {
  const rpId = relyingPartyId();
  try {
    const res = await createPasskeyWithPrfOutput({
      rp: { id: rpId, name: "PeerProof" },
      user: { name: displayName, displayName },
    });
    return { ...deriveKey(res.prfOutput), credentialId: res.credentialId };
  } catch (err) {
    if (isMeraError(err) && err.code === "PRF_UNAVAILABLE") throw new PrfUnavailableError();
    throw err;
  }
}

/// Development escape hatch, reached only via `?dev=1`. Uses a random key held in sessionStorage
/// so the attestation floor can be exercised on desktop browsers, which mostly cannot do PRF.
/// The UI labels this loudly; it is not a production fallback (that is a connected wallet).
export function createDevIdentity(): AttestIdentity {
  const KEY = "peerproof.dev.entropy";
  let hex = sessionStorage.getItem(KEY);
  if (!hex) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(KEY, hex);
  }
  const entropy = Uint8Array.from(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  return { ...deriveKey(entropy), credentialId: "dev" };
}

/// Returning user: re-derives the identical key from an existing passkey.
export async function unlockAttestIdentity(): Promise<AttestIdentity> {
  const rpId = relyingPartyId();
  try {
    const res = await getPasskeyPrfOutput({ rpId });
    return { ...deriveKey(res.prfOutput), credentialId: res.credentialId };
  } catch (err) {
    if (isMeraError(err) && err.code === "PRF_UNAVAILABLE") throw new PrfUnavailableError();
    throw err;
  }
}
