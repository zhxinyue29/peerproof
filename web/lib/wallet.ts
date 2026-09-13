import { HDKey } from "@scure/bip32";
import { keccak256, toBytes, type Address, type Hex } from "viem";
import type { LocalAccount } from "viem";
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
// chain.ts does not import this file, so this cannot close a cycle.
import { publicClient } from "@/lib/chain";

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

export type Eip1193 = {
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

/// `provider` defaults to the injected wallet, but any EIP-1193 provider works — which is the
/// whole reason Privy needs no separate derivation path. Its embedded wallet exposes the same
/// interface, so an email login lands in exactly this function.
export async function deriveFromWallet(
  escrow: Address,
  eventId: bigint,
  provider?: Eip1193 | null,
): Promise<WalletIdentity> {
  const eth = provider ?? injected();
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
/// `to` is optional: omitting it is how a transaction deploys a contract rather than calling one.
/// That is the only difference, and it is why deploying from the browser needs no keystore and no
/// password — the wallet already holds the key and asks for a click instead.
export async function walletSendTransaction(
  tx: {
    from: Address;
    to?: Address;
    data: Hex;
    value?: bigint;
    gas?: bigint;
  },
  provider?: Eip1193 | null,
): Promise<Hex> {
  const eth = provider ?? injected();
  if (!eth) throw new NoWalletError();
  return (await eth.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: tx.from,
        // Must be absent, not null or zero: a zero `to` is a call to the zero address.
        ...(tx.to ? { to: tx.to } : {}),
        data: tx.data,
        ...(tx.value !== undefined ? { value: `0x${tx.value.toString(16)}` } : {}),
        ...(tx.gas !== undefined ? { gas: `0x${tx.gas.toString(16)}` } : {}),
      },
    ],
  })) as Hex;
}

/// Waits for the receipt and returns the address the contract landed at.
export async function walletDeploy(
  from: Address,
  bytecode: Hex,
  gas: bigint,
  provider?: Eip1193 | null,
): Promise<{ hash: Hex; address: Address }> {
  const hash = await walletSendTransaction({ from, data: bytecode, gas }, provider);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Deployment reverted.");
  if (!receipt.contractAddress) throw new Error("No contract address in receipt.");
  return { hash, address: receipt.contractAddress };
}

export async function walletChainId(): Promise<number | null> {
  const eth = injected();
  if (!eth) return null;
  const id = (await eth.request({ method: "eth_chainId" })) as Hex;
  return Number(BigInt(id));
}
