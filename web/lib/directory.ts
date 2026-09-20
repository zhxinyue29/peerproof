import { getCreate2Address, keccak256, pad, type Address, type Hex } from "viem";
import { ESCROW_ADDRESS, hasDeployment, publicClient } from "@/lib/chain";
import { eventDirectoryAbi, eventDirectoryBytecode } from "@/lib/directoryArtifact";

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
  /// Where it happens, as the organizer wrote it. Added with the contract field on 2026-09-20;
  /// every listing described before that reads as "".
  venue: string;
  /// Comma-separated, exactly as typed. The contract stores the string and nothing parses it into
  /// a list — the events page searches it as prose, which is also how somebody reads it.
  tags: string;
  /// A link to a picture, or empty. There is no server to upload to, so the organizer points at
  /// one they already host.
  cover: string;
  /// 0 when the organizer never described the event.
  updatedAt: bigint;
};

/// Exported, because two modules need the same "no listing" value and the one in lib/events.ts
/// was a second hand-written copy that fell behind when `venue` and `tags` were added — leaving a
/// `tags` of undefined that the events page split on.
export const EMPTY_LISTING: Listing = {
  title: "",
  blurb: "",
  url: "",
  venue: "",
  tags: "",
  cover: "",
  updatedAt: 0n,
};
const EMPTY = EMPTY_LISTING;

/// Cached because every screen asks, and the answer only changes once — at the moment somebody
/// deploys it. `null` means "not asked yet".
///
/// Only a *successful* read is cached. Caching the failure too meant one flaky RPC call at startup
/// settled the question for the rest of the session: every event on every screen fell back to
/// "PeerProof event", with the titles sitting on chain the whole time and nothing retrying. A
/// network error is not an answer to "is it deployed".
let deployed: boolean | null = null;

export async function checkDirectory(): Promise<boolean> {
  if (deployed !== null) return deployed;
  if (!hasDeployment) return (deployed = false);
  try {
    const code = await publicClient.getCode({ address: directoryAddress() });
    deployed = !!code && code !== "0x";
    return deployed;
  } catch {
    // Left null so the next caller asks again.
    return false;
  }
}

export function directoryReady(): boolean {
  return deployed === true;
}

/// Monad bills the gas limit rather than the amount used, so this is fitted rather than padded.
///
/// Fitted to `setProfile`/`describe` measurements taken against the deployed contract on
/// 2026-09-20, after `venue` and `tags` joined the struct:
///
///   describe · 2 fields / 27 bytes → 123,297 · 5 fields / 132 bytes → 229,253
///
/// The previous fit was `140,000 + 700/byte`, measured when the struct had three strings. It was
/// 31% over on a short listing and **5,253 short** on an ordinary one — a listing with a title, a
/// blurb, a link, a venue and tags could not be saved at all, and on Monad the failed attempt was
/// charged in full. Bytes alone cannot model this: every non-empty field costs a length slot of
/// its own, so a one-word venue is far more than one word's worth of gas.
///
/// `PAD` is the margin over the fit. Twenty percent, because the alternative to over-paying is a
/// write that runs out of gas and costs exactly the same.
const PAD = 12n;

export function describeGas(
  title: string,
  blurb: string,
  url: string,
  venue = "",
  tags = "",
  cover = "",
): bigint {
  const parts = [title, blurb, url, venue, tags, cover];
  return (fit(83_000n, 11_000n, parts) * PAD) / 10n;
}

/// Shared shape: a flat cost, a cost per field that has anything in it, and a cost per byte.
function fit(base: bigint, perField: bigint, parts: string[]): bigint {
  const fields = BigInt(parts.filter((v) => v.length > 0).length);
  const bytes = BigInt(new TextEncoder().encode(parts.join("")).length);
  return base + perField * fields + 700n * bytes;
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
/// Whatever the signed-in account uses to send a transaction — `Signer["sendRaw"]`, taken as a
/// function so this module does not have to import the signer and close a cycle.
type RawSender = (args: { to: Address; data: Hex; gas?: bigint }) => Promise<Hex>;

/// Never lower than this, whatever an estimate says, and used unchanged when estimation fails.
/// A deploy that runs out of gas costs the same as one that succeeds — Monad bills the limit —
/// so the floor is set above the largest figure this contract has ever needed rather than at it.
const DEPLOY_GAS_FLOOR = 1_900_000n;

export async function deployDirectory(send: RawSender): Promise<{ hash: Hex; address: Address }> {
  const expected = directoryAddress();
  const data = `${SALT}${initCode(ESCROW_ADDRESS).slice(2)}` as Hex;

  // Estimated, not hardcoded. It was 1,400,000 — a figure measured when the contract was 4,107
  // bytes, and the contract has since grown a venue field, a tags field and the whole profile
  // struct. It now needs 1,689,094. Every press of the deploy button ran out of gas and reverted,
  // which is a failure mode that looks exactly like "this product cannot deploy its own contract",
  // and the number would have gone stale again the next time the contract grew.
  let gas = DEPLOY_GAS_FLOOR;
  try {
    const estimate = await publicClient.estimateGas({ to: CREATE2_FACTORY, data });
    // A fifth over: the estimate is against the current state, and the deploy lands a block or two
    // later. Cheap insurance against a refund of nothing.
    const padded = (estimate * 120n) / 100n;
    if (padded > gas) gas = padded;
  } catch {
    // An RPC that will not estimate. The floor is a real measurement, so this is still a deploy
    // worth attempting rather than an error to show somebody.
  }

  const hash = await send({ to: CREATE2_FACTORY, data, gas });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Deployment reverted.");

  const code = await publicClient.getCode({ address: expected });
  if (!code || code === "0x") {
    throw new Error(`Nothing deployed at ${expected} — the salt or bytecode does not match.`);
  }
  deployed = true;
  return { hash, address: expected };
}

/// What an account says about itself. Lives in this contract for the same reason the listings do:
/// it holds no money, so the worst anyone can do by writing nonsense is make their own page read
/// badly.
///
/// On chain rather than in localStorage because a profile only its owner can see is decoration on a
/// page whose entire subject is what other people can check. On chain rather than on a server
/// because there is no server — adding one would put back the party this product argues you should
/// not need.
export type Profile = {
  name: string;
  bio: string;
  city: string;
  x: string;
  github: string;
  website: string;
  updatedAt: bigint;
};

export const EMPTY_PROFILE: Profile = {
  name: "",
  bio: "",
  city: "",
  x: "",
  github: "",
  website: "",
  updatedAt: 0n,
};

export async function readProfile(account: `0x${string}`): Promise<Profile> {
  if (!(await checkDirectory())) return EMPTY_PROFILE;
  return (await publicClient.readContract({
    address: directoryAddress(),
    abi: eventDirectoryAbi,
    functionName: "profileOf",
    args: [account],
  })) as Profile;
}

/// The same shape as `describeGas`, fitted to its own measurements — a profile is six separate
/// strings rather than one struct, so it is not the same curve:
///
///   setProfile · 1 field / 9 bytes → 85,887 · 5 fields / 93 bytes → 231,771
///
/// The old shared fit sent 211,764 for that second case. It was the reason saving a filled-in
/// profile failed while saving just a name worked.
export function profileGas(p: Omit<Profile, "updatedAt">): bigint {
  const parts = [p.name, p.bio, p.city, p.x, p.github, p.website];
  return (fit(58_000n, 21_800n, parts) * PAD) / 10n;
}

/// True when nothing the user typed differs from what is already on chain.
///
/// Checked before sending, because every save costs gas and a save that changes nothing costs it
/// for nothing. The usual failure is a form that fires on every press of a button regardless.
export function profileUnchanged(a: Omit<Profile, "updatedAt">, b: Profile): boolean {
  return (
    a.name === b.name &&
    a.bio === b.bio &&
    a.city === b.city &&
    a.x === b.x &&
    a.github === b.github &&
    a.website === b.website
  );
}
