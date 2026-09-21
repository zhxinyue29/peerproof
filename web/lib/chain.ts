import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Account,
  type Address,
} from "viem";
import { monad, monadTestnet } from "viem/chains";
// abi.ts imports nothing, so this cannot close a cycle.
import { attendanceEscrowAbi } from "@/lib/abi";

/// Local anvil, used by scripts/dev-chain.sh. Real transactions, no real money.
const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const isLocal = process.env.NEXT_PUBLIC_CHAIN === "local";
const isTestnet = process.env.NEXT_PUBLIC_CHAIN === "testnet";

/// All three branches matter. This used to read `isLocal ? anvil : monad`, which meant a testnet
/// build got the *mainnet* chain object (143) alongside a testnet RPC URL. viem signs EIP-155 with
/// `chain.id`, so every write — register, attest, claim, settle — would have been signed for 143
/// and rejected by a 10143 node.
///
/// It never surfaced because local runs use anvil, where the id does match, and everything done on
/// testnet so far went through forge and cast rather than the browser. It would have surfaced on
/// camera.
export const chain = isLocal ? anvil : isTestnet ? monadTestnet : monad;
export const isLocalChain = isLocal;

/// Monad's public RPCs are rate limited (25 rps on the default endpoint) and the attestation
/// burst pushes 150+ writes through in two minutes, so production reads should fan out across
/// the alternates before this sees real traffic.
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (isLocal
    ? "http://127.0.0.1:8545"
    : isTestnet
      ? "https://testnet-rpc.monad.xyz"
      : "https://rpc.monad.xyz");

export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "") as Address;
export const hasDeployment = /^0x[0-9a-fA-F]{40}$/.test(ESCROW_ADDRESS);
/// Which event this build shows. A number pins it; "latest" asks the contract.
///
/// Pinning is right for a submission — the link should always open the same event. It is wrong for
/// testing, because a new event then needs a config change and a redeploy, and by the time that
/// lands the registration window has usually closed. That cost four events before this existed.
///
/// "latest" reads `nextEventId` and takes the one below it, so creating an event and reloading the
/// page is the whole procedure.
const CONFIGURED_EVENT = process.env.NEXT_PUBLIC_EVENT_ID?.trim() || "latest";
export const FOLLOWS_LATEST_EVENT = CONFIGURED_EVENT === "latest";

let currentEventId = FOLLOWS_LATEST_EVENT ? 1n : BigInt(CONFIGURED_EVENT);

/// Not reactive. Callers already re-render on their own polling, so a resolution that lands a
/// moment later is picked up on the next tick rather than needing to push through React.
export function eventId(): bigint {
  return currentEventId;
}

export async function resolveEventId(): Promise<bigint> {
  // `?event=3` wins over everything: it is how the directory hands someone a specific event.
  //
  // Read here rather than at module load on purpose. Module load happens before React hydrates, so
  // a URL-derived value would make the client's first render disagree with the prerendered HTML.
  // Resolving inside the startup effect means the first render matches the server and the id
  // arrives on the next tick.
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("event");
    // Negatives are allowed, and they are how the sample events reach their own detail page.
    // The escrow numbers from 1 upwards, so a negative id cannot collide with anything real and
    // cannot be produced by any contract read — it only ever comes from a link this app wrote.
    if (fromUrl && /^-?\d+$/.test(fromUrl) && BigInt(fromUrl) !== 0n) {
      currentEventId = BigInt(fromUrl);
      return currentEventId;
    }
  }
  if (!FOLLOWS_LATEST_EVENT || !hasDeployment) return currentEventId;
  const next = (await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: attendanceEscrowAbi,
    functionName: "nextEventId",
  })) as bigint;
  // nextEventId starts at 1 and post-increments, so the newest event is one below it. Before any
  // event exists there is nothing to point at; leave it at 1 so the page reports "not found"
  // rather than reading event 0.
  currentEventId = next > 1n ? next - 1n : 1n;
  return currentEventId;
}

/// viem defaults to a 4000ms polling interval, which would report ~4s for an attestation that
/// actually settled in 300ms — and the on-screen latency is the entire point of this product.
/// Monad finalises in two 300ms slots, so poll well inside that.
const POLLING_INTERVAL = 100;

/// Where the app is mounted. GitHub Pages serves a project repo from /<repo>/, so a bare "/event/"
/// would leave the app entirely. next/link handles this on its own; a window.location assignment
/// does not.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const publicClient = createPublicClient({
  chain,
  // Monad has no global mempool, so confirmation logic must never depend on pending visibility.
  // One retry, not two. The endpoint allows fifteen eth_call per second and answers a breach with
  // an error — so a retry during a burst is another call against the same budget, and the storm
  // feeds itself. One retry covers a dropped packet; the rest is arithmetic working against us.
  transport: http(RPC_URL, { retryCount: 1, retryDelay: 400 }),
  pollingInterval: POLLING_INTERVAL,
});

export function walletClientFor(account: Account) {
  return createWalletClient({
    account,
    chain,
    transport: http(RPC_URL),
    pollingInterval: POLLING_INTERVAL,
  });
}

/// Log reads go through a separate endpoint because the per-request block cap decides whether a
/// page load is two requests or two thousand. Re-measured against live nodes on 12 Sep 2026, asking
/// for this contract's logs on testnet:
///
///   testnet-rpc.monad.xyz             100 ok · 1000 → "eth_getLogs is limited to a 100 range"
///   monad-testnet.drpc.org            "the method eth_getLogs does not exist/is not available"
///   10143.rpc.hypersync.xyz           rejected without a token
///   monad-testnet-rpc.publicnode.com  no response
///
/// So on testnet there is exactly one endpoint that serves logs, and it caps at 100. This used to
/// point at drpc on the strength of a 1,000-block measurement that no longer holds — drpc has since
/// withdrawn the method entirely, which would have made /verify fail on every request.
///
/// Re-measure before raising the chunk size. A chunk above the cap is not slower, it is rejected.
const LOGS_RPC_URL =
  process.env.NEXT_PUBLIC_LOGS_RPC_URL ||
  (isLocal
    ? RPC_URL
    : chain.id === 143
      ? "https://rpc3.monad.xyz"
      : "https://testnet-rpc.monad.xyz");

/// Kept at the endpoint's cap, not under it. Overridable so a swap of endpoint can raise it.
export const LOGS_CHUNK = BigInt(
  process.env.NEXT_PUBLIC_LOGS_CHUNK ?? (isLocal ? "5000" : chain.id === 143 ? "900" : "100"),
);

/// Scanning starts at the deployment block rather than a blind lookback: the contract cannot have
/// emitted anything before it existed, and on a chain producing 3 blocks a second the difference
/// is between a handful of requests and hundreds.
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");

export const logsClient = createPublicClient({
  chain,
  // The testnet endpoint only permits 100 blocks per eth_getLogs call, but accepts JSON-RPC
  // batches. Coalescing a verification window prevents sixteen browser requests from tripping the
  // HTTP rate limiter while preserving the node's per-call block cap.
  transport: http(LOGS_RPC_URL, { batch: { batchSize: 16, wait: 0 }, retryCount: 2 }),
  pollingInterval: POLLING_INTERVAL,
});

/// Gas is billed on the limit, not on usage, so limits are pinned from measured worst cases
/// rather than estimated and padded. Numbers from `forge test --gas-report` under
/// `network = "monad"`; see README.
export const GAS_LIMITS = {
  register: 110_000n,
  checkIn: 90_000n, // measured max 78,647
  attest: 250_000n, // measured max 240,991
  claim: 100_000n,
  settle: 70_000n,
  createEvent: 140_000n,
} as const;

export const EPOCH = 15n;

/// Mirrors AttendanceEscrow.BEACON_EPOCH. Only the check-in transaction is bound by it: nothing
/// an attendee does after walking through the door depends on the venue display at all.
export const BEACON_EPOCH = 30n;

/// Epochs are derived from chain time, not wall-clock: anvil's clock is warped by the dev
/// fixture, and on a real chain `block.timestamp` is the only thing the contract will agree with.
let chainSkewMs = 0;

export async function syncChainClock(): Promise<void> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  chainSkewMs = Number(block.timestamp) * 1000 - Date.now();
}

export function chainNowMs(): number {
  return Date.now() + chainSkewMs;
}

export function currentEpoch(): bigint {
  return BigInt(Math.floor(chainNowMs() / 1000)) / EPOCH;
}

export function currentBeaconEpoch(): bigint {
  return BigInt(Math.floor(chainNowMs() / 1000)) / BEACON_EPOCH;
}

/// Seconds left before the displayed code rolls over.
export function secondsLeftInEpoch(): number {
  const s = Math.floor(chainNowMs() / 1000);
  return Number(EPOCH) - (s % Number(EPOCH));
}

export function explorerTxUrl(hash: string): string {
  if (isLocal) return "";
  return `https://monadvision.com/tx/${hash}`;
}

/// Empty on a local chain, where no explorer exists to send anybody to — callers render the link
/// only when there is one, rather than offering a dead end.
export function explorerAddressUrl(address: string): string {
  if (isLocal) return "";
  return `https://monadvision.com/address/${address}`;
}
