import { getCreate2Address, keccak256, pad, type Address, type Hex } from "viem";
import { ESCROW_ADDRESS, hasDeployment, publicClient } from "@/lib/chain";
import { eventDirectoryAbi, eventDirectoryBytecode } from "@/lib/directoryArtifact";
import { walletSendTransaction } from "@/lib/wallet";

/// Reads and writes event descriptions.
///
/// A separate contract from the escrow on purpose: the escrow holds deposits and stores only what
/// decides where money goes. A title decides nothing, so it lives somewhere that cannot reach the
/// money — see contracts/src/EventDirectory.sol.
///
/// Deployed through the standard CREATE2 factory, so its address is a function of the bytecode and
/// the escrow it points at rather than of who deployed it. That is what removes the configuration
/// step: the app computes the address, checks whether code is there, and is done. The alternative
/// was deploy, copy the address into a build variable, push, wait for a redeploy — the same loop
/// that cost four events before the event id stopped being baked in.
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;

/// "PeerProof-directory". Any fixed value works; this one is legible in a block explorer.
const SALT = pad("0x5065657250726f6f662d6469726563746f7279", { size: 32 });

function initCode(escrow: Address): Hex {
  return `${eventDirectoryBytecode}${escrow.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
}

/// Where the directory lives on this chain, whether or not anyone has deployed it yet.
export function directoryAddress(): Address {
  return getCreate2Address({
    from: CREATE2_FACTORY,
    salt: SALT,
    bytecodeHash: keccak256(initCode(ESCROW_ADDRESS)),
  });
}

export type Listing = {
  title: string;
  blurb: string;
  url: string;
  /// 0 when the organizer never described the event.
  updatedAt: bigint;
};

const EMPTY: Listing = { title: "", blurb: "", url: "", updatedAt: 0n };

/// Cached because every screen asks, and the answer only changes once — at the moment somebody
/// deploys it. `null` means "not asked yet".
let deployed: boolean | null = null;

export async function checkDirectory(): Promise<boolean> {
  if (deployed !== null) return deployed;
  if (!hasDeployment) return (deployed = false);
  try {
    const code = await publicClient.getCode({ address: directoryAddress() });
    deployed = !!code && code !== "0x";
  } catch {
    deployed = false;
  }
  return deployed;
}

export function directoryReady(): boolean {
  return deployed === true;
}

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
  if (!(await checkDirectory())) return EMPTY;
  return (await publicClient.readContract({
    address: directoryAddress(),
    abi: eventDirectoryAbi,
    functionName: "listingOf",
    args: [eventId],
  })) as Listing;
}

/// One call for the whole range — a directory page should cost one request, not one per event.
export async function readListings(from: bigint, to: bigint): Promise<Listing[]> {
  if (to <= from || !(await checkDirectory())) return [];
  const ls = (await publicClient.readContract({
    address: directoryAddress(),
    abi: eventDirectoryAbi,
    functionName: "listingsIn",
    args: [from, to],
  })) as readonly Listing[];
  return [...ls];
}

/// Deploys through the CREATE2 factory, which is a plain call: salt followed by the init code. The
/// wallet already holds the key, so this replaces a keystore file and a password that has to be
/// remembered months later — which is exactly what stopped this getting deployed the first time.
export async function deployDirectory(from: Address): Promise<{ hash: Hex; address: Address }> {
  const expected = directoryAddress();
  const hash = await walletSendTransaction({
    from,
    to: CREATE2_FACTORY,
    data: `${SALT}${initCode(ESCROW_ADDRESS).slice(2)}` as Hex,
    // Measured by simulating the plain deployment against the live testnet: 1,196,705, most of it
    // the 200-gas-per-byte code deposit for 4,107 bytes. The factory adds a little on top.
    gas: 1_400_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Deployment reverted.");

  const code = await publicClient.getCode({ address: expected });
  if (!code || code === "0x") {
    throw new Error(`Nothing deployed at ${expected} — the salt or bytecode does not match.`);
  }
  deployed = true;
  return { hash, address: expected };
}
