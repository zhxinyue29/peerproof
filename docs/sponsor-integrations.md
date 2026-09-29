# Sponsor integrations — what is actually wired, and how to check it

Written against the code in this repository, not against what would be convenient to claim. Every
row names the files you can read and the thing you can run. Where an integration is partial, the
partial part is stated in the same sentence as the working part.

Audited 2026-09-27 against `feat/sponsor-integrations`, branched from `700a1fd`. The Chainlink CRE
row was corrected on 2026-09-29: the repository holds no record of a successful simulation or of a
receiver deployment.

| | Status | One-line role |
|---|---|---|
| Monad | **live** | The chain every commitment, attestation and settlement is written to. |
| Privy | **live** | Sign-in, embedded wallet, network switch, and the provider the attest key is derived from. |
| Mera | **live** | Passkey PRF → the key that signs rotating attendance codes. Not the only account path. |
| Envio | **live, verified end to end** | HyperIndex serves the attestation graph `/verify` renders. Cross-checked against chain receipts. |
| Chainlink CRE | **Implemented and compiled; simulation and receiver deployment are not yet verified.** | Scheduled settlement workflow into a receiver contract. |
| Alchemy | **configured, measured, last in the order** | Second endpoint for `eth_getLogs`. Works; the free tier's 10-block cap makes it slower than Monad's own node. |
| Crouton | **not enabled** | No verified Monad RPC endpoint exists to integrate against. See the section below. |

---

## Privy — more than a login button

**Files:** `web/components/PrivyBridge.tsx`, `PrivyClientProvider.tsx`, `PrivyInner.tsx`,
`PrivyLogout.tsx`, `IdentityGate.tsx`, `IdentityProvider.tsx`, `Funding.tsx`, `TopUp.tsx`,
`lib/session.ts`, `lib/signer.ts`.

What the code actually uses, beyond authentication:

- **Embedded wallet.** `getEmbeddedConnectedWallet(wallets)` in `PrivyBridge.tsx` takes the wallet
  Privy provisions on login (`createOnLogin`), so a participant with no extension and no seed
  phrase still has an account that can hold a deposit.
- **Network switch.** `wallet.switchChain(monadTestnet.id)` before anything else, because Privy's
  provider caches the chain it was created with and a later switch does not reach an existing
  provider. Without this the first transaction is signed for the wrong chain.
- **EIP-1193 provider used for key derivation.** `wallet.getEthereumProvider()` is handed to
  `deriveFromWallet()` in `lib/wallet.ts`, which asks that provider for one signature and derives
  the event-scoped attest key from it. The Privy wallet is the *root of the signing identity*, not
  a session token.
- **Write transport.** The signer built from that provider is what sends `register`, `checkIn`,
  `attest` and `claim` — see `walletSigner()` in `lib/signer.ts`.
- **Funding.** `Funding.tsx` compares the balance against deposit + gas before enabling the join
  button; `TopUp.tsx` calls Privy's `useAddFunds` for the top-up flow.
- **Session restore.** `lib/session.ts` stores the derived key per (address, event); on reload
  `IdentityProvider` re-enables the Privy gate so the provider is rebuilt rather than prompting
  for a second signature.

**User flow:** sign in (email or wallet) → Privy provisions/connects a wallet → chain switched to
Monad testnet → one signature derives the attest key → deposit and attestations are sent from that
account.

**How to test:** open `/event?event=2`, press the join button, choose email. After the code, watch
for exactly one signature prompt, then a `register` transaction from the Privy wallet address shown
under the button.

**Not claimed:** Privy is one of three account paths. Passkey and browser wallet are the others.

---

## Mera — passkey PRF as the attestation identity

**Files:** `web/lib/passkey.ts`, `web/lib/wallet.ts`.

```ts
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput,
         createSecp256k1SigningSession, isMeraError } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
```

- `createPasskeyWithPrfOutput` / `getPasskeyPrfOutput` run the WebAuthn PRF ceremony; the PRF
  output is the entropy for a BIP-39 seed, and the attest key is derived at `m/44'/60'/0'/0/0`.
- `createSecp256k1SigningSession` + `toViemAccount` turn that into a viem `LocalAccount`, which is
  what signs the rotating codes — every 15 seconds, without a biometric prompt each time.
- `relyingPartyId()` pins the credential to the registrable domain, because WebAuthn scopes
  credentials to the rpId and changing it would make every derived account unreproducible. This is
  also why the deployment host is fixed: moving off `zhxinyue29.github.io` would orphan every
  passkey account ever created.
- `checkPrfSupport()` is a pre-flight: desktop Chrome's local profile authenticator exposes no
  hmac-secret, so the app finds out before asking anyone to tap.

**The fallback is real and is not hidden.** When PRF is unavailable the product uses a browser
wallet or Privy instead, and `deriveFromWallet()` in `lib/wallet.ts` derives the same kind of key
from a wallet signature. So: Mera is *an* account layer in PeerProof, used wherever the device
supports it. It is not the only one, and nothing in this repository or on the site says it is.

**How to test:** on a device with a platform authenticator (Touch ID, Windows Hello with a
resident key), open `/event` and choose the passkey path. One ceremony, then `/floor` signs codes
with no further prompts.

---

## Envio — the indexed history `/verify` actually renders

**Files:** `indexer/` (config.yaml, schema.graphql, src/handlers/AttendanceEscrow.ts),
`web/lib/envio.ts`, `web/lib/logs.ts`.

**Status: live.** A HyperIndex deployment on Envio Cloud indexes the escrow the site reads, and
`/verify` on the production site is served from it. The endpoint is supplied to the build by the
`ENVIO_URL` repository variable (`.github/workflows/pages.yml`) rather than written into the repo.

- `readHistory()` in `lib/logs.ts` calls `readHistoryFromEnvio()` **first**, and only falls through
  to log reading when the index errors or is not configured.
- `lib/envio.ts` sends one GraphQL query for `chain_metadata`, `Event`, `Participant` and `Vouch`,
  with a 6-second timeout, and throws rather than returning a partial graph.
- The indexer handles `Registered`, `Attested`, `Confirmed` and `Settled`.

### What it took to get here — three real failures

Worth recording, because each one produced a *green* signal while being broken.

**1. The deployment crashed on handler load.**
`ERR_REQUIRE_CYCLE_MODULE: Cannot require() ES Module .../AttendanceEscrow.ts in a cycle.` The
cause was not a cycle in this project's code — `indexer/src/` holds one file whose only import is
`envio`. It was `indexer/package.json` missing `"type": "module"`: Node decides a `.ts` file's
module system from the nearest package.json, so without that field it took the CommonJS path,
detected ESM syntax, and fell back to `require(esm)` — which is refused the moment the handler
imports `envio` back. Verified by flipping only that field against the real envio package on Node
22.23.3 and 24.21.0: present, the handler loads; absent, the exact production error. Fixed in
`c2739d3`, which also adds the tsconfig from Envio's own v3.10.0 template.

**2. Type-checking the handler for the first time exposed a second crash waiting behind it.**
The handler writes `event.transaction.hash` on four entities, and `Participant.registeredTxHash`
and `Vouch.txHash` are `String!` — but nothing had ever selected that field, so the first
`Registered` event would have written a non-null column as undefined. `field_selection:
transaction_fields: [hash]` in `config.yaml`, same commit.

**3. The indexer was indexing the wrong contract, and looked healthy doing it.**
`config.yaml` pointed at `0x289a7ce1…d9c1`, an earlier deployment with different bytecode (9,973
bytes against 10,665) and its own event numbering, while the site has been on `0xEa05…e679` since
block 63,497,445. The deployment ran, answered HTTP 200 in 2.2 s, and returned an **empty graph**
for event #2 — a successful response, so `readHistory` never fell through to RPC and `/verify`
would have shown "nobody vouched" for an event with two registrations and a real `Attested` log.
The indexer's own sync guard could not catch it either: `latest_processed_block` was genuinely past
`start_block`. It was indexing the wrong contract correctly. Fixed in `9ed8e8e`.

The shape of all three is the same, and it is the reason `lib/envio.ts` refuses to return partial
data: an index that answers 200 with empty arrays is indistinguishable from an event where nothing
happened.

### Verification

Not "it returned something" — every value the index reported was taken back to a chain receipt and
decoded:

```
readHistory(2n)  →  source=envio  provider=envio   2.67 s   1 HTTP request, 0 eth_getLogs
                    2 participants (1 confirmed), 1 vouch, no settlement

chain getEvent(2).registered = 2                            matches the participant count
0xdb293a42…a0e7 registration tx → block 64249077  decoded Registered(eventId=2, attendee=0xdb29…)
0x74979a58…a80d registration tx → block 64250272  decoded Registered(eventId=2, attendee=0x7497…)
vouch tx 0x2c4352624a…83b288   → block 64250959  decoded Attested(eventId=2,
                                                   attester=0xdb29…, subject=0x7497…)
```

On the production site, `/verify?event=2`: DOMContentLoaded 1.40 s, proof graph rendered at
**5.15 s**, one request to the indexer host, **zero `eth_getLogs`**, no console errors.

**Why it matters more than it looks — measured, not asserted.** Event #2's attestation sits ~1.8M
blocks behind the tip. Reading it from the chain directly, with the index switched off:

```
envio                              1.41 s   1 request      complete
RPC, 100-block cap, cold cache    40.37 s   complete graph published (2 participants,
                                            1 confirmed, 1 vouch, blocks 64239022-64251821)
                                 180 s      still scanning forward to the tip
                              10637 s       746 requests, 717 publishes, then failed
```

Two things in that table matter more than the headline. The reader does find the answer quickly —
anchoring at the event's own `attestOpen` puts it within ~13,000 blocks of everything it needs, and
`onProgress` hands the finished graph to the page at 40 s. But for an event that closed long ago it
then keeps walking forward to the tip looking for nothing, and never gets there: the whole promise
eventually rejects even though the correct answer was published minutes earlier.

So the index is not a speed-up bolted onto a working path. For a finished event it is the only path
that terminates, and 1.4 s against 40 s is the smaller half of the difference.

**How to test:** set `NEXT_PUBLIC_ENVIO_URL`, load `/verify?event=2`, and confirm the console shows
no "index unavailable" warning and that the network panel contains one request to the indexer host
and no `eth_getLogs`.

**Not claimed:** the deployment is on Envio's free tier, which removes inactive deployments after
30 days. That is why the RPC reader below still exists and is still maintained.

---

## Chainlink CRE — settlement workflow

**Files:** `cre/project.yaml`, `cre/settle-workflow/{workflow.yaml,main.ts,config.testnet.json}`,
`contracts/src/SettleReceiver.sol`, `cre/README.md`.

- `settle` on the escrow is permissionless. The workflow exists so that nobody has to remember to
  call it; if it never fires, `settle` is exactly as callable by a stranger as before.
- The path is `cron tick → workflow → DON-signed report → KeystoneForwarder → SettleReceiver.onReport
  → escrow.settle`. `SettleReceiver` has no owner and no setters.
- Reports that are early, repeated, or for an unknown event are declined and logged, not reverted.

**Status: Implemented and compiled; simulation and receiver deployment are not yet verified.** `cre/README.md` explains that deploy approval gates `cre workflow deploy`, and
that `cre workflow simulate` compiles the workflow to WASM and runs it locally. The repository holds
no record of a successful simulation — no `simulate.log`, no broadcast transaction —
`settleReceiverAddress` in `cre/settle-workflow/config.testnet.json` is still the zero address, and
`contracts/broadcast/` has no `SettleReceiver` deployment. **This is not a deployed CRE workflow and
is not described as one.**

**How to test:** `cre workflow simulate settle-workflow --target testnet-settings
--non-interactive --trigger-index 0 --broadcast`, with `cre/.env` holding a key (the simulator
requires one even for read-only workflows).

---

## Alchemy — a second endpoint for reading logs

**Files:** `web/lib/rpcProviders.ts`, `web/lib/logs.ts`, `web/lib/chain.ts`, `web/.env.example`.

**Role, and only this role:** reading history. `eth_getLogs`, `eth_getBlockByNumber` and
`eth_blockNumber` for `/verify`. It is not in the wallet write path — `register`, `createEvent`,
`checkIn`, `attest`, `claim` and `settle` all still go through the signer's own transport,
untouched by this change.

**Configuration**

```
NEXT_PUBLIC_ALCHEMY_RPC_URL=https://monad-testnet.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_ALCHEMY_LOGS_CHUNK=10
```

Supplied to the production build by the `ALCHEMY_RPC_URL` repository **secret**, which keeps the key
out of the git history. It does not keep it private at runtime: this site is a static export
(`output: export`), so any `NEXT_PUBLIC_` value is compiled into public JavaScript. What restricts
the key is the domain allowlist in Alchemy's dashboard, exactly as with the Privy App ID.

### Measured, with a real key, 2026-09-27

```
eth_chainId        HTTP 200   722 ms   0x279f = 10143        (Monad testnet, as documented)
eth_blockNumber    HTTP 200  1657 ms   block 65,910,828
eth_getLogs  64250955-64250964 (10 blocks)   ACCEPTED   308 ms   1 log
    block 64250959  Attested(eventId=2)  tx 0x2c4352624a…83b288   ← the real attestation
```

The block-range limit, found by bisection rather than assumed:

```
31 blocks  REJECTED   "Under the Free tier plan, you can make eth_getLogs
25 blocks  REJECTED    requests with up to a 10 block range"
16 blocks  REJECTED
11 blocks  REJECTED
10 blocks  ACCEPTED
```

A sustained scan additionally hits `Your app has exceeded its compute units per second capacity`
before it completes, at the request rate `lib/logs.ts` already paces itself to.

### What that means for the fallback order

Monad's own endpoint serves **100** blocks per call; this Alchemy plan serves **10**. The cost of
this page is the scan divided by the endpoint's cap, so putting Alchemy first would make every page
load ten times more requests than asking the public node.

So the order is not hardcoded. `logProviders()` sorts by block cap, widest first:

1. Envio HyperIndex (not an RPC endpoint; tried before all of these, in `readHistory`)
2. the configured logs endpoint — Monad testnet, 100 blocks
3. Alchemy — 10 blocks on the free tier
4. the network's public RPC, when the configured endpoint is something else

Raise `NEXT_PUBLIC_ALCHEMY_LOGS_CHUNK` on a paid plan and Alchemy moves to the front on its own,
with no code change and no stale assumption left in the file.

Each provider gets its own client with the same 16-call JSON-RPC batching the configured endpoint
uses, plus a 15-second timeout. A failure is logged with the provider's name and the next endpoint
is tried; progress already published by a provider that then fails is not withdrawn, because the
logs it found were real. The last failure is rethrown rather than swallowed, because a page that
renders an empty graph when it could not reach the chain is claiming nobody vouched for anybody.

**How to test**

```bash
# Alchemy unreachable — the read continues on the next endpoint
NEXT_PUBLIC_ALCHEMY_RPC_URL=https://monad-testnet.g.alchemy.com/v2/invalid-key npm run dev
# Everything configured unreachable — the public RPC answers
NEXT_PUBLIC_ALCHEMY_RPC_URL=https://monad-testnet.g.alchemy.com/v2/invalid-key \
NEXT_PUBLIC_LOGS_RPC_URL=https://rpc-that-does-not-exist.invalid npm run dev
```

Open `/verify?event=2` and watch the console for
`[peerproof] logs via <name> failed, trying the next endpoint`, then check in devtools that
requests move to the next host. Verified: an invalid key fails on the first request with
`Must be authenticated!`, is logged with the provider's name, and the read continues.

**Not claimed:** on the free tier this is a redundancy layer, not a speed-up. It is a real,
configured, measured endpoint that the reader will use when the ones ahead of it are unavailable —
and it is ten times narrower than the endpoint ahead of it. Saying otherwise would be the easiest
thing in this document to check and catch.

What the whole RPC tier buys, stated plainly: for a **live or recent** event it is a complete
answer, because the anchor sits near the tip and the scan is short. For an event that closed weeks
ago it publishes the right graph in well under a minute and then fails to finish — see the Envio
section's table. A second endpoint makes that path survive one provider going down; it does not
make a finished event cheap to read. Only the index does that.

---

## Crouton — not enabled

**Status: not enabled. Integration blocked pending verified provider configuration.**

What was checked, 2026-09-24:

- Monad's own RPC provider list (`docs.monad.xyz/tooling-and-infra/rpc-providers`) names 18
  providers. Crouton is not among them.
- Crouton Digital's own site lists Monad under **staking/validator** services. It advertises
  enterprise RPC for "Solana, Celestia and Bitcoin", and publishes no Monad JSON-RPC endpoint,
  no URL format, no API-key procedure and no statement about `eth_getLogs`.

There is therefore no endpoint to configure and nothing to test. Writing a plausible-looking URL
into the fallback list would produce an integration that fails on first use, so none was written.
Crouton does not appear in the code, in `.env.example`, or on the website.

If Crouton publishes a Monad endpoint, adding it is one entry in `logProviders()` in
`web/lib/rpcProviders.ts` and one variable in `.env.example`.
