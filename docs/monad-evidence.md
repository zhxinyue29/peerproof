# Monad evidence

What PeerProof can show about its use of Monad from the chain itself, what the live interface
measures on top of that, and what none of it proves. Every figure in the table below comes from
[`web/scripts/monad-evidence.mjs`](../web/scripts/monad-evidence.mjs), a read-only script anyone can
rerun (see [Reproduction](#reproduction)).

## Why Monad

PeerProof produces a burst of individual transactions during a short physical event window. Every
check-in and attestation needs to feel immediate while participants are standing face to face.
Monad's sub-second finality and low transaction cost make transaction-per-interaction attendance
practical without batching the proof offchain.

For reference, the Monad documentation (https://docs.monad.xyz/, checked 2026-09-30) gives a 300 ms
block frequency, speculative finality at 300 ms and full finality at 600 ms. The app's interface
says "sub-second" rather than quoting a figure that the next network upgrade could change. Nothing
here has been load-tested, so this document makes no throughput or capacity claim.

## Event #2 immutable receipt evidence

- **Network:** Monad testnet, chain ID 10143. The script refuses to run against any other chain.
- **Contract:** `AttendanceEscrow` at
  [`0xEa057c5a6F431eFF29F573E4db4bc49cD52Ee679`](https://testnet.monadscan.com/address/0xEa057c5a6F431eFF29F573E4db4bc49cD52Ee679),
  [source verified with Sourcify (`exact_match`)](https://repo.sourcify.dev/10143/0xEa057c5a6F431eFF29F573E4db4bc49cD52Ee679).
  The script decodes logs with the event signatures from that verified source.
- **Event #2 as created:** deposit 0.0100 MON, `k = 1`, minimum 2 registrations, capacity 20.
- **The six transactions** are the ones already published in [提交材料.md](提交材料.md): the event's
  creation, the confirmed participant's registration, check-in and attestation, the settlement, and
  the claim. The other participant's own registration and check-in are on chain too, but are not
  part of this set.
- **Settlement was permissionless and manual.** `settle(2)` was sent by an ordinary participant
  account, `0x7497…a80d` — the participant who was not confirmed — not by the organizer
  (`0x4cb6…df7d`) and not by any automated job. It was not triggered by Chainlink CRE: the CRE
  workflow is implemented and compiled, but its simulation and the Receiver deployment are still
  not verified.

Script output, 2026-09-30 — all 28 checks passed:

- every receipt has status `success` and was sent to `AttendanceEscrow`;
- every PeerProof event in these receipts is for event #2;
- the attest receipt contains both `Attested` and `Confirmed`, and the confirmed attendee is the
  scanner, confirmed by peers (`viaOrganizer = false`);
- `Settled`: `confirmed = 1`, `noShows = 1`, `sharePerAttendee = 0.0200 MON`;
- `Claimed`: `0.0200 MON`, to the confirmed attendee.

## Transaction-by-transaction table

| Action | Transaction | Block | Block time (UTC) | Gas (receipt) | Gas limit | Effective gas price | Fee | PeerProof events |
|---|---|---|---|---|---|---|---|---|
| createEvent | [`0x3271d17c…4539`](https://testnet.monadscan.com/tx/0x3271d17c29abe91767ba66c13aacf67cad1b8b473b12c388521efd9f579c4539) | 64240343 | 2026-09-20 18:47:08 | 140,000 | 140,000 | 102.91 gwei | 0.0144074 MON | `EventCreated`, `BeaconKeySet` |
| register | [`0x9cd76bf8…12b5`](https://testnet.monadscan.com/tx/0x9cd76bf8a052990548981160cfa1b867edf30af5439cbdbb1b6e04389eac12b5) | 64249077 | 2026-09-20 19:31:30 | 110,000 | 110,000 | 102 gwei | 0.01122 MON | `Registered` |
| checkIn | [`0xb75fee5a…4248`](https://testnet.monadscan.com/tx/0xb75fee5af6275bd19bab7efdca1b5d31653f9a7d52d2a7c6d81231451d664248) | 64250877 | 2026-09-20 19:40:34 | 90,000 | 90,000 | 102 gwei | 0.00918 MON | `CheckedIn` |
| attest | [`0x2c435262…b288`](https://testnet.monadscan.com/tx/0x2c4352624a7a13a66c1f5a77cea9d456d2d30893a24e3fd99f742a5fd583b288) | 64250959 | 2026-09-20 19:40:59 | 250,000 | 250,000 | 102 gwei | 0.0255 MON | `Attested`, `Confirmed` |
| settle | [`0x8e151c79…60bf`](https://testnet.monadscan.com/tx/0x8e151c79daf64e140b481f3d1f5639e43f2f01da5895c81f1882959bb65760bf) | 66737441 | 2026-09-29 16:42:31 | 70,000 | 70,000 | 102 gwei | 0.00714 MON | `Settled` |
| claim | [`0xcd58dbb4…e3c9`](https://testnet.monadscan.com/tx/0xcd58dbb46884debdc87d6c60091aa5ff6176d6731fea85233908dce759e3e3c9) | 66739330 | 2026-09-29 16:52:10 | 100,000 | 100,000 | 102 gwei | 0.0102 MON | `Claimed` |

Notes on the columns:

- **Fee** is gas limit × effective gas price. Monad charges the gas limit rather than the gas used
  ("total gas deducted from the sender's balance is value + gas_bid * gas_limit", Monad docs,
  *Differences between Monad and Ethereum*). All six receipts report `gasUsed` equal to the
  transaction's gas limit, which matches that. As a spot check, the settle sender's balance fell by
  exactly 0.00714 MON between blocks 66737440 and 66737441.
- **Gas (receipt)** is therefore the charged gas, not how much the contract executed.
- **Block time** is the block's own timestamp, in whole seconds.
- No field was missing from the RPC for these six transactions. The script prints `unavailable`,
  never 0, where one is.

## What the live UI measures

After a real scan, `/floor` shows how long that scan took: from the moment the app submits the
attestation to the moment a successful receipt arrives, measured on the attendee's own device
(`performance.now()` around the write and `waitForTransactionReceipt`, polling every 100 ms). The
figure is labelled "Scan submitted → successful Monad receipt, measured on this device", links to
its transaction, and appears only when the receipt's status is `success`.

It is one measurement per scan, not an average and not Monad's finality. It includes signing, the
RPC round trips and the device's network. It stays in the page's memory and is never stored or sent
anywhere. The no-wallet demo sends no transaction and shows no latency figure.

## What this evidence does not prove

- **Client latency.** A receipt records the block a transaction landed in, not how long anybody
  waited for it. The submit-to-receipt time for Event #2's scan was never recorded, and it cannot be
  recovered from the chain.
- **Throughput, finality or capacity.** Six transactions spread over nine days say nothing about
  transactions per second, average or typical finality, or how a busy room would behave under load.
  None of that has been tested.
- **Physical presence.** The chain proves that two addresses acted as recorded: a check-in against a
  live venue code and a scan of a rotating participant code. It does not prove who held the phones,
  and the venue code raises the cost of remote collusion without eliminating it.
- **Independence of participants.** That the two addresses belonged to two independent people is
  recorded from how the pilot was run ([user-validation.md](user-validation.md)) and is not provable
  on chain.
- **Automation.** Nothing here shows Chainlink CRE triggering settlement; this settlement was sent by
  hand.
- **Mainnet behaviour.** Event #2 ran on Monad testnet.

## Reproduction

From `web/`, with dependencies installed (`npm ci`):

```bash
npm run evidence:monad
```

- `MONAD_RPC_URL=<url> npm run evidence:monad` reads through a different endpoint. Only the
  endpoint's origin is printed, so a key in the URL's path or query is not echoed.
- `npm run evidence:monad -- --json` prints the same facts as JSON.
- Behind an HTTP proxy, set `NODE_USE_ENV_PROXY=1` (Node 24+) so Node's `fetch` honours
  `HTTPS_PROXY`.

The script loads no private key, signs nothing and sends nothing, so it needs no testnet MON. It
exits 2 if the endpoint is unreachable or reports a chain other than 10143, and 1 if any check
fails.
