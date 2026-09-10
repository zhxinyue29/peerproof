# CRE workflow — settlement on a schedule

`settle` is permissionless on the escrow, which is what stops the organizer from being able to
withhold payouts. But permissionless is not automatic: without something firing it, the first person
to think of it pays the gas, and until then confirmed attendees cannot claim.

This workflow closes that gap without adding anyone who has to be trusted. If it never fires,
`settle` is exactly as callable by anyone as it was before.

## How it actually connects

CRE cannot call `settle` directly. This is the part that is easy to get wrong:

```
cron tick → workflow → DON-signed report → KeystoneForwarder → SettleReceiver.onReport → escrow.settle
```

A workflow produces a signed report; a node hands it to Chainlink's `KeystoneForwarder`; the
forwarder calls `onReport(bytes,bytes)` on a contract implementing `IReceiver`. So there is an
adapter contract — [`contracts/src/SettleReceiver.sol`](../contracts/src/SettleReceiver.sol) — whose
entire body is "decode an event id, call `settle`".

The adapter has no owner and no setters. `settle` is already callable by any stranger, so there is no
authority to guard; an `Ownable` would add a privileged address to a system whose whole claim is that
it has none, and protect nothing.

Reports that arrive early, twice, or for an unknown event are **declined and logged, not reverted**.
Chainlink's own interface docs say a reverting `onReport` "can be retried with a higher gas limit" —
so bubbling `WindowOpen` from a five-minute cron would retry a call that cannot succeed yet, at
rising gas, every tick. Four tests in
[`SettleReceiver.t.sol`](../contracts/test/SettleReceiver.t.sol) pin that behaviour.

## Prerequisites

- **Bun ≥ 1.2.21** (`@chainlink/cre-sdk` declares it in `engines`)
- A CRE account — self-serve at <https://app.chain.link/cre/discover>, no waitlist
- Monad testnet MON in the deploy wallet

Deploy approval is **not** needed. It gates `cre workflow deploy` only; `cre workflow simulate` runs
the workflow locally, compiled to WASM on your own machine. Simulation is what this project relies
on.

## Running it

```bash
curl -sSL https://app.chain.link/cre/install.sh | bash    # installs to ~/.cre
cre login                                                  # opens a browser; or set CRE_API_KEY
cre workflow supported-chains --output json                # confirm monad-testnet is on for YOUR tenant
```

That last command matters. Chain enablement is per-tenant, and the docs say so three times: the
published support table is "chains commonly enabled", not a guarantee for your account. Monad testnet
has been recognised since CLI v1.30.0 and Monad mainnet since v1.29.0, but check rather than assume.
The JSON output is also worth keeping as bounty evidence.

Then, from this directory:

```bash
cd settle-workflow && bun install && cd ..
```

Fill in two things first:

1. `settle-workflow/config.testnet.json` → `settleReceiverAddress`, once `SettleReceiver` is
   deployed. **Deploy it against the simulation forwarder**, not the production one — they are
   different addresses and the receiver checks its caller:

   | | KeystoneForwarder |
   |---|---|
   | Monad testnet, simulation | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |
   | Monad testnet, production | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

2. `cre/.env` (gitignored) — the simulator needs a key even for workflows that only read:

   ```
   CRE_ETH_PRIVATE_KEY=<64 hex chars, no 0x prefix>
   MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
   ```

Then simulate, keeping the log:

```bash
cre workflow simulate settle-workflow --target testnet-settings \
  --non-interactive --trigger-index 0 --broadcast 2>&1 | tee simulate.log
```

`--broadcast` is not optional for evidence. Without it the run is a dry run and the tx hash comes
back as `0x0000…0000`, which reads as a failure to anyone looking at the log. With it, the hash is a
real Monad testnet transaction you can link on <https://testnet.monadscan.com>.

## Gas

`gasLimit` is pinned at 150,000, not estimated. **Monad charges the gas limit, not the amount used**,
so padding is a real overcharge on every tick — and the cron ticks whether or not there is anything to
settle.

`onReport` measured 22,880 on the declined path and 66,764 settling, via `forge test --gas-report`.
150,000 leaves headroom for Monad's cold-account repricing (2,600 → 10,100), which local Foundry runs
do not model. Re-measure against a real transaction before using this on mainnet.

## What is not verified here

Written against the documented API and checked field-by-field against Chainlink's own published
snippets, but **not executed** — running it needs a logged-in CRE account, which is not something this
repo can hold. Specifically unconfirmed:

- whether `monad-testnet` is enabled for this particular tenant (`cre workflow supported-chains`)
- whether Monad testnet is on the deploy path or simulation only — the release notes say Monad
  *mainnet* is supported "for local simulation and for production onchain writes", but describe Monad
  *testnet* as added "for local simulation", and that wording difference may be deliberate
