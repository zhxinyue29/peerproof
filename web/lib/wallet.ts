import { HDKey } from "@scure/bip32";
import { keccak256, toBytes, type Address, type Hex } from "viem";
import type { LocalAccount } from "viem";
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";

/// Fallback for devices whose passkeys can't do PRF — desktop Chrome's built-in authenticator
/// being the common case. The shape deliberately mirrors the passkey path:
///
///   passkey → PRF output → BIP-32 → attest key
///   wallet  → signature  → BIP-32 → attest key
///
/// One signature prompt, once. The derived key then signs rotating codes locally, which is the
/// only way a 15-second rotation is tolerable — a wallet prompt per code would be unusable.
///
/// Deterministic: the same wallet on the same event always derives the same attest key, so the
/// key survives a refresh without being stored anywhere.
const DERIVATION_PATH = "m/44'/60'/0'/0/0";

function derivationMessage(escrow: Address, eventId: bigint): string {
  return [
    "PeerProof attendance key",
    "",
    "Signing this derives the key that signs your attendance codes.",
    "It does not authorise any transfer.",
    "",
    `Contract: ${escrow}`,
    `Event: ${eventId}`,
  ].join("\n");
}

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function injected(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth ?? null;
}

export function hasInjectedWallet(): boolean {
  return injected() !== null;
}

export class NoWalletError extends Error {
  constructor() {
    super("No browser wallet found.");
    this.name = "NoWalletError";
  }
}

export type WalletIdentity = {
  /// Signs rotating codes. Never prompts after the one derivation signature.
  account: LocalAccount;
  /// The wallet that authorised the derivation — this is what pays the deposit.
  owner: Address;
};

export async function deriveFromWallet(
  escrow: Address,
  eventId: bigint,
): Promise<WalletIdentity> {
  const eth = injected();
  if (!eth) throw new NoWalletError();

  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  const owner = accounts[0];
  if (!owner) throw new NoWalletError();

  const signature = (await eth.request({
    method: "personal_sign",
    params: [derivationMessage(escrow, eventId), owner],
  })) as Hex;

  // Hash the signature rather than using it raw: a signature is not uniformly distributed and is
  // 65 bytes, and BIP-32 wants a seed. keccak gives a clean 32 bytes.
  const seed = toBytes(keccak256(signature));
  const node = HDKey.fromMasterSeed(seed).derive(DERIVATION_PATH);
  if (!node.privateKey) throw new Error("derivation produced no private key");

  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  return { account: toViemAccount(session), owner };
}

/// Sends a transaction from the connected wallet itself. Used for the deposit and the payout
/// claim: those are the user's money moving, so they should see a wallet prompt for them.
export async function walletSendTransaction(tx: {
  from: Address;
  to: Address;
  data: Hex;
  value?: bigint;
  gas?: bigint;
}): Promise<Hex> {
  const eth = injected();
  if (!eth) throw new NoWalletError();
  return (await eth.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        ...(tx.value !== undefined ? { value: `0x${tx.value.toString(16)}` } : {}),
        ...(tx.gas !== undefined ? { gas: `0x${tx.gas.toString(16)}` } : {}),
      },
    ],
  })) as Hex;
}

export async function walletChainId(): Promise<number | null> {
  const eth = injected();
  if (!eth) return null;
  const id = (await eth.request({ method: "eth_chainId" })) as Hex;
  return Number(BigInt(id));
}
