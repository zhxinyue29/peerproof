import type { Address, Hex } from "viem";
import { publicClient } from "@/lib/chain";
import { eventDirectoryAbi, eventDirectoryBytecode } from "@/lib/directoryArtifact";
import { walletDeploy } from "@/lib/wallet";

/// Reads and writes event descriptions.
///
/// A separate contract from the escrow on purpose: the escrow holds deposits and stores only what
/// decides where money goes. A title decides nothing, so it lives somewhere that cannot reach the
/// money — see contracts/src/EventDirectory.sol.
export const DIRECTORY_ADDRESS = (process.env.NEXT_PUBLIC_DIRECTORY_ADDRESS ?? "") as Address;
export const hasDirectory = /^0x[0-9a-fA-F]{40}$/.test(DIRECTORY_ADDRESS);

export type Listing = {
  title: string;
  blurb: string;
  url: string;
  /// 0 when the organizer never described the event.
  updatedAt: bigint;
};

const EMPTY: Listing = { title: "", blurb: "", url: "", updatedAt: 0n };

/// Monad bills the gas limit rather than the amount used, so this cannot pad generously. Fitted to
/// three measurements of `describe` against input size (contracts/test/DirectoryGas.t.sol):
///
///   32 bytes → 143,809 · 300 → 331,496 · 1020 → 777,169
///
/// 140k + 700/byte sits 6–13% above each, which is margin without being a surcharge. A short
/// listing costs a fraction of a long one instead of everyone paying for the longest.
export function describeGas(title: string, blurb: string, url: string): bigint {
  const bytes = new TextEncoder().encode(title + blurb + url).length;
  return 140_000n + BigInt(bytes) * 700n;
}

export async function readListing(eventId: bigint): Promise<Listing> {
  if (!hasDirectory) return EMPTY;
  const l = (await publicClient.readContract({
    address: DIRECTORY_ADDRESS,
    abi: eventDirectoryAbi,
    functionName: "listingOf",
    args: [eventId],
  })) as Listing;
  return l;
}

/// One call for the whole range — a directory page should cost one request, not one per event.
export async function readListings(from: bigint, to: bigint): Promise<Listing[]> {
  if (!hasDirectory || to <= from) return [];
  const ls = (await publicClient.readContract({
    address: DIRECTORY_ADDRESS,
    abi: eventDirectoryAbi,
    functionName: "listingsIn",
    args: [from, to],
  })) as readonly Listing[];
  return [...ls];
}

/// Deploys the directory from the browser. The wallet already holds the key, so this replaces a
/// keystore file and a password that has to be remembered months later — which is exactly what
/// stopped this getting deployed the first time.
export async function deployDirectory(
  from: Address,
  escrow: Address,
): Promise<{ hash: Hex; address: Address }> {
  // Constructor arg is appended to the creation bytecode, left-padded to a word.
  const arg = escrow.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = `${eventDirectoryBytecode}${arg}` as Hex;
  // Measured by simulating script/DeployDirectory.s.sol against the live testnet: 1,196,705, most
  // of it the 200-gas-per-byte code deposit for 4,107 bytes.
  return walletDeploy(from, data, 1_300_000n);
}
