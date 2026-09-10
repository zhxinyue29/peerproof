import {
  CronCapability,
  EVMClient,
  Runner,
  bytesToHex,
  getNetwork,
  handler,
  hexToBase64,
  type CronPayload,
  type Runtime,
} from "@chainlink/cre-sdk"
import { encodeAbiParameters, parseAbiParameters } from "viem"

/// Closes a PeerProof event on schedule, so settlement does not depend on somebody remembering.
///
/// `settle` on the escrow is permissionless by design — that is what stops the organizer from being
/// able to withhold payouts. But permissionless is not the same as automatic: without this, the
/// first person to think of it pays the gas, and until then confirmed attendees cannot claim. A cron
/// closes that gap without introducing anyone who *has* to be trusted, because a workflow that fails
/// to fire leaves the function exactly as callable as it was before.
///
/// CRE cannot call `settle` directly. A workflow produces a DON-signed report, a node hands it to
/// Chainlink's KeystoneForwarder, and the forwarder calls `onReport` on a contract implementing
/// IReceiver. That contract is SettleReceiver, and all it does with the report is
/// `settle(eventId)` — see contracts/src/SettleReceiver.sol.

type EvmConfig = {
  chainName: string
  settleReceiverAddress: string
  eventId: string
  gasLimit: string
}

type Config = {
  schedule: string
  evms: EvmConfig[]
}

const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  const evmConfig = runtime.config.evms[0]
  const eventId = BigInt(evmConfig.eventId)

  if (payload.scheduledExecutionTime) {
    runtime.log(`Tick at ${payload.scheduledExecutionTime.seconds}, event ${eventId}`)
  }

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: evmConfig.chainName })
  if (!network) {
    throw new Error(`Unknown chain name: ${evmConfig.chainName}`)
  }
  const evmClient = new EVMClient(network.chainSelector.selector)

  // The whole payload is one event id. SettleReceiver rejects anything that is not exactly 32
  // bytes, because a short report would make abi.decode read past its end and settle an arbitrary
  // event.
  const reportData = encodeAbiParameters(parseAbiParameters("uint256 eventId"), [eventId])

  const report = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  // Most ticks land while the attestation window is still open, and SettleReceiver answers those by
  // emitting a reason rather than reverting — deliberately, because Chainlink retries a reverting
  // onReport with a higher gas limit, and retrying a call that cannot succeed yet just costs more
  // each time.
  //
  // gasLimit is pinned, not estimated: Monad charges the limit rather than the amount used, so
  // padding is a real overcharge on every tick. 150,000 against 66,764 measured for the settling
  // path in SettleReceiver.t.sol, with headroom for Monad's cold-account repricing (2,600 →
  // 10,100). Re-measure against a real transaction before trusting it on mainnet.
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: evmConfig.settleReceiverAddress,
      report,
      gasConfig: { gasLimit: evmConfig.gasLimit },
    })
    .result()

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
  runtime.log(`Report delivered: ${txHash}`)
  runtime.log(`https://testnet.monadscan.com/tx/${txHash}`)

  return JSON.stringify({ eventId: eventId.toString(), txHash, txStatus: writeResult.txStatus })
}

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

// Not called here — the SDK executes it during compilation.
export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
