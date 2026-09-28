import { createPublicClient, http, type PublicClient } from "viem";
import { chain, isLocalChain, logsClient, LOGS_CHUNK, LOGS_RPC_URL } from "@/lib/chain";

/// The ordered list of endpoints `/verify` is allowed to rebuild the attestation graph from.
///
/// This is a read path and only a read path. Nothing here signs, sends, or estimates gas — every
/// write in the product goes through the wallet transport in `lib/chain.ts`, and adding a provider
/// here cannot change who sends a transaction or from which account.
///
/// Why a list at all: on testnet there has only ever been one endpoint that serves `eth_getLogs`,
/// and when it is slow or rate-limited `/verify` has nothing else to ask. A second endpoint is the
/// difference between a page that is slow and a page that never answers.
///
/// Envio is not in this list. It is not an RPC endpoint — it answers one indexed GraphQL query
/// instead of a few hundred log requests — and it is tried before any of these, in `readHistory`.
export type LogProvider = {
  /// Recorded on the history object and printed in the console, so a failing read can be
  /// attributed without guessing.
  name: "alchemy" | "configured" | "monad-public";
  url: string;
  /// Blocks per `eth_getLogs`. A request wider than an endpoint's cap is rejected outright rather
  /// than served slowly, so this is a correctness value, not a tuning one.
  chunk: bigint;
};

/// Alchemy publishes one Monad network — testnet, chain 10143 — at
/// `https://monad-testnet.g.alchemy.com/v2/<key>`.
///
/// The chunk default is 10 because that is what the endpoint actually allows, measured against a
/// live key on 27 Sep 2026: 11 blocks and above come back "Under the Free tier plan, you can make
/// eth_getLogs requests with up to a 10 block range", 10 blocks are served. A paid plan raises it,
/// which is what the environment variable is for. Ten is a tenth of what Monad's own endpoint
/// gives, so Alchemy sits behind it in the order below rather than in front.
const ALCHEMY_URL = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ?? "";
const ALCHEMY_CHUNK = BigInt(process.env.NEXT_PUBLIC_ALCHEMY_LOGS_CHUNK ?? "10");

/// The last resort, hardcoded rather than configured: if every configured endpoint is gone, the
/// page should still be able to answer from the chain's own public RPC.
const MONAD_PUBLIC = chain.id === 143 ? "https://rpc3.monad.xyz" : "https://testnet-rpc.monad.xyz";

export function logProviders(): LogProvider[] {
  // On a local chain there is one node and nothing to fall back to; pretending otherwise would
  // send anvil traffic to a public endpoint.
  if (isLocalChain) return [{ name: "configured", url: LOGS_RPC_URL, chunk: LOGS_CHUNK }];

  const providers: LogProvider[] = [
    { name: "configured", url: LOGS_RPC_URL, chunk: LOGS_CHUNK },
  ];
  if (ALCHEMY_URL) providers.push({ name: "alchemy", url: ALCHEMY_URL, chunk: ALCHEMY_CHUNK });
  // Only when the configured endpoint is something else, so the same URL is never tried twice.
  if (LOGS_RPC_URL !== MONAD_PUBLIC) {
    providers.push({ name: "monad-public", url: MONAD_PUBLIC, chunk: 100n });
  }

  // Widest window first, rather than a fixed order.
  //
  // The cost of this page is the number of `eth_getLogs` calls it makes, and that is the scan
  // divided by the endpoint's block cap — so the endpoint that allows the widest window is the
  // cheapest to ask, whoever it belongs to. Hardcoding "Alchemy first" was the plan until the free
  // tier turned out to cap at 10 blocks against Monad's own 100: it would have made every page
  // load ten times more requests than asking the public node. Deriving the order means upgrading
  // that plan and raising NEXT_PUBLIC_ALCHEMY_LOGS_CHUNK moves Alchemy to the front on its own,
  // with no code change and no stale assumption left in the file.
  //
  // Sort is stable, so equal caps keep the order above: the configured endpoint before the
  // network's public one.
  return providers.sort((a, b) => (b.chunk > a.chunk ? 1 : b.chunk < a.chunk ? -1 : 0));
}

/// Clients are built once per URL and reused: viem keeps request state — including the JSON-RPC
/// batch queue — on the transport, so a fresh client per window would batch nothing and throw away
/// every connection between the hundreds of requests a full rebuild makes.
const clients = new Map<string, PublicClient>();

export function clientFor(provider: LogProvider): PublicClient {
  // The configured endpoint already has a client in chain.ts, with the batching and polling the
  // rest of the app expects. Two clients for one URL would batch separately and double the
  // connections for no benefit.
  if (provider.url === LOGS_RPC_URL) return logsClient;

  const existing = clients.get(provider.url);
  if (existing) return existing;
  const client = createPublicClient({
    chain,
    // Same shape as the configured client: batched, because a verification window is sixteen
    // getLogs calls and sixteen separate HTTP requests is what trips rate limiters. Plus a
    // timeout, which the configured client does not need and a fallback does: a hung endpoint is
    // the failure this whole list exists for, and without a bound the request never settles, the
    // provider is never marked bad, and the page waits for ever — the exact symptom being fixed.
    transport: http(provider.url, {
      batch: { batchSize: 16, wait: 0 },
      timeout: 15_000,
      retryCount: 1,
      retryDelay: 400,
    }),
    // No pollingInterval: a fallback client only ever answers one-off reads — getLogs, getBlock,
    // getBlockNumber — and never watches anything, so there is nothing for it to poll.
  });
  clients.set(provider.url, client);
  return client;
}
