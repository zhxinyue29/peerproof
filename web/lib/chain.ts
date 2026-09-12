import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Account,
  type Address,
} from "viem";
import { monad, monadTestnet } from "viem/chains";

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
export const EVENT_ID = BigInt(process.env.NEXT_PUBLIC_EVENT_ID ?? "1");

/// viem defaults to a 4000ms polling interval, which would report ~4s for an attestation that
/// actually settled in 300ms — and the on-screen latency is the entire point of this product.
/// Monad finalises in two 300ms slots, so poll well inside that.
const POLLING_INTERVAL = 100;

export const publicClient = createPublicClient({
  chain,
  // Monad has no global mempool, so confirmation logic must never depend on pending visibility.
  transport: http(RPC_URL, { retryCount: 2 }),
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

/// Log reads go through a separate endpoint, because the per-request block cap differs wildly and
/// it decides whether a page load is two requests or a hundred. Measured against live nodes:
///
///   mainnet  rpc.monad.xyz            100 blocks    rpc3.monad.xyz (Ankr)   1,000
///   testnet  testnet-rpc.monad.xyz    100 blocks    monad-testnet.drpc.org  1,000
///
/// A ten-minute attestation window spans ~2,000 blocks at 300ms, so the default endpoints are not
/// usable for history at all — a 900-block chunk against a 100-block cap is rejected outright,
/// which is exactly how /verify broke.
const LOGS_RPC_URL =
  process.env.NEXT_PUBLIC_LOGS_RPC_URL ||
  (isLocal
    ? RPC_URL
    : chain.id === 143
      ? "https://rpc3.monad.xyz"
      : "https://monad-testnet.drpc.org");

/// Kept just under the endpoint's cap. Overridable so a swap of endpoint can raise it.
export const LOGS_CHUNK = BigInt(process.env.NEXT_PUBLIC_LOGS_CHUNK ?? (isLocal ? "5000" : "900"));

/// Scanning starts at the deployment block rather than a blind lookback: the contract cannot have
/// emitted anything before it existed, and on a chain producing 3 blocks a second the difference
/// is between a handful of requests and hundreds.
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");

export const logsClient = createPublicClient({
  chain,
  transport: http(LOGS_RPC_URL, { retryCount: 2 }),
  pollingInterval: POLLING_INTERVAL,
});

/// Gas is billed on the limit, not on usage, so limits are pinned from measured worst cases
/// rather than estimated and padded. Numbers from `forge test --gas-report` under
/// `network = "monad"`; see README.
export const GAS_LIMITS = {
  register: 110_000n,
  attest: 240_000n,
  claim: 100_000n,
  settle: 70_000n,
  createEvent: 140_000n,
} as const;

export const EPOCH = 15n;
export const BEACON_EPOCH = 120n;

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
