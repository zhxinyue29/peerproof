// Scans a peer's code, in the real app, through a real camera pipeline, and says where it stops.
//
// "Scanning a person does nothing" has been diagnosed from a phone three times and never once
// reproduced on a machine that could be instrumented. Two probes established the image is not at
// fault: the payload decodes at 20% of the frame from an actual phone-screen render, through
// defocus at 35%. So whatever is wrong is in the app, and the app is what this drives.
//
// Chromium is handed a video file in place of a camera, so Scanner runs its genuine
// getUserMedia → <video> → decoder worker path. Everything the page logs, throws, or renders is
// captured — which is the part a phone in someone's hand could never report.
//
//   anvil --block-time 1 &
//   scripts/dev-chain.sh
//   (cd web && npm run dev)
//   node scripts/scan-e2e.mjs
import { chromium } from "playwright";
import QRCode from "qrcode";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbiParameters } from "viem";

const RPC = "http://127.0.0.1:8545";
const APP = process.env.APP ?? "http://localhost:3000";
const CAST = process.env.CAST ?? `${process.env.HOME}/.foundry/bin/cast`;
const ATTEST_KEY_PATH = "m/44'/60'/0'/0/0";
/// Whatever the browser will derive from, pinned so the account can be funded before the app asks.
const DEV_ENTROPY = "aa".repeat(32);

const env = Object.fromEntries(
  readFileSync(new URL("../web/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const ESCROW = env.NEXT_PUBLIC_ESCROW_ADDRESS;
const EVENT_ID = BigInt(env.NEXT_PUBLIC_EVENT_ID || "1");
const PEER_PKS = (env.NEXT_PUBLIC_DEV_PEER_PKS ?? env.NEXT_PUBLIC_DEV_PEER_PK ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const PEER_PK = PEER_PKS[0];
const FUNDER_PK = env.NEXT_PUBLIC_DEV_FUNDER_PK;

if (env.NEXT_PUBLIC_CHAIN !== "local" || !PEER_PK) {
  console.error("web/.env.local is not the local fixture — run scripts/dev-chain.sh first");
  process.exit(1);
}

const cast = (...a) => execFileSync(CAST, a, { encoding: "utf8" }).trim();
const toB64 = (hex) =>
  Buffer.from(hex.slice(2), "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const client = createPublicClient({ transport: http(RPC) });

/// Mirrors passkey.ts deriveKey, so the address here is the address the browser will show.
function devAccount() {
  const entropy = Uint8Array.from(DEV_ENTROPY.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(entropyToMnemonic(entropy, wordlist))).derive(
    ATTEST_KEY_PATH,
  );
  const pk = `0x${Buffer.from(node.privateKey).toString("hex")}`;
  return { pk, account: privateKeyToAccount(pk) };
}

async function peerCode(pk, epoch) {
  const account = privateKeyToAccount(pk);
  const inner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, address, uint64"), [
      ESCROW, EVENT_ID, account.address, epoch,
    ]),
  );
  const sig = await account.signMessage({ message: { raw: inner } });
  return {
    subject: account.address,
    payload: `pp2:${EVENT_ID}:${toB64(account.address)}:${epoch}:${toB64(sig)}`,
  };
}

/// A rotating code, not a still.
///
/// The first version of this filmed one epoch's code and looped it, and the run failed with
/// StaleCode — which proved nothing, because by the time a browser had launched and signed in, a
/// real phone would have moved on twice. The other person's screen does not freeze while you find
/// them, so neither does this: one frame per epoch, each held for its fifteen seconds, starting at
/// the epoch the chain is in.
///
/// The code fills ~62% of the height — well above the 35% the render probe read through defocus,
/// so a failure here is never "held it too far away".
async function cameraVideo(codes, dir, y4m) {
  const list = [];
  for (const [i, { payload }] of codes.entries()) {
    const png = join(dir, `code-${i}.png`);
    writeFileSync(png, await QRCode.toBuffer(payload, {
      errorCorrectionLevel: "M", margin: 1, width: 900,
      color: { dark: "#0a0713", light: "#ffffff" },
    }));
    list.push(`file '${png}'`, "duration 15");
  }
  // concat demuxer ignores the duration on the final entry unless the file is repeated.
  list.push(`file '${join(dir, `code-${codes.length - 1}.png`)}'`);
  const listFile = join(dir, "frames.txt");
  writeFileSync(listFile, list.join("\n"));

  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-r", "15",
    "-vf", "scale=450:450,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x5a5a5a",
    "-pix_fmt", "yuv420p", y4m], { stdio: "pipe" });
  return y4m;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "scan-e2e-"));
  const { pk: MY_PK, account: me } = devAccount();
  console.log(`escrow   ${ESCROW}  event ${EVENT_ID}`);
  console.log(`scanner  ${me.address}  (the dev identity the browser will derive)`);

  // Fund and register the scanner before the browser needs either, so the run exercises scanning
  // rather than onboarding.
  //
  // Order matters and the fixture is unforgiving about it: registration closes at the same instant
  // the doors open, so registering has to happen before the clock is moved, not after. Warping
  // first and registering second fails with DeadlinePassed, which reads like a bug in the app.
  cast("send", me.address, "--value", "50ether", "--private-key", FUNDER_PK, "--rpc-url", RPC);
  const isReg = () => cast("call", ESCROW, "isRegistered(uint256,address)(bool)", String(EVENT_ID), me.address, "--rpc-url", RPC);
  if (isReg() !== "true") {
    const deposit = cast("call", ESCROW, "getEvent(uint256)((address,address,uint96,uint32,uint32,uint8,uint64,uint64,uint64,uint8,uint32,uint32,uint32,uint256))", String(EVENT_ID), "--rpc-url", RPC)
      .replace(/[()]/g, "").split(",")[2].trim().split(" ")[0];
    cast("send", ESCROW, "register(uint256,address)", String(EVENT_ID), me.address,
      "--value", deposit, "--private-key", MY_PK, "--rpc-url", RPC);
  }
  // Now into the check-in window.
  const ev = cast("call", ESCROW, "getEvent(uint256)((address,address,uint96,uint32,uint32,uint8,uint64,uint64,uint64,uint8,uint32,uint32,uint32,uint256))", String(EVENT_ID), "--rpc-url", RPC)
    .replace(/[()]/g, "").split(",").map((s) => s.trim().split(" ")[0]);
  const attestOpen = Number(ev[7]);
  const now = Number((await client.getBlock()).timestamp);
  if (now < attestOpen) {
    cast("rpc", "evm_increaseTime", String(attestOpen - now + 5), "--rpc-url", RPC);
    cast("rpc", "evm_mine", "--rpc-url", RPC);
  }

  // Checked in through the chain rather than the UI: this run is about the peer scan, and making
  // it depend on the venue scan working first would confuse a failure in one for the other.
  if (cast("call", ESCROW, "checkedInAt(uint256,address)(uint64)", String(EVENT_ID), me.address, "--rpc-url", RPC) === "0") {
    const bep = cast("call", ESCROW, "currentBeaconEpoch()(uint64)", "--rpc-url", RPC).split(" ")[0];
    const dg = cast("call", ESCROW, "beaconDigest(uint256,uint64)(bytes32)", String(EVENT_ID), bep, "--rpc-url", RPC);
    const bsig = cast("wallet", "sign", "--private-key", env.NEXT_PUBLIC_DEV_BEACON_PK, "--no-hash", dg);
    cast("send", ESCROW, "checkIn(uint256,uint64,bytes)", String(EVENT_ID), bep, bsig, "--private-key", MY_PK, "--rpc-url", RPC);
  }
  console.log(`registered ${isReg()}`);
  console.log(`checked in ${cast("call", ESCROW, "checkedInAt(uint256,address)(uint64)", String(EVENT_ID), me.address, "--rpc-url", RPC)}`);

  // Film the other person's screen for the two minutes that begin in one minute's time.
  //
  // The awkwardness is Chromium's: it opens the capture file when the process launches and starts
  // it from frame zero when getUserMedia is called, so the file cannot be swapped afterwards and
  // the first frame is whatever was written before launch. Two earlier runs failed with StaleCode
  // for that reason alone — a property of the harness, indistinguishable from the defect it was
  // built to find. So the codes are filmed for a window in the near future, and the scan waits
  // until the chain has caught up with frame zero.
  // A pair may only vouch once, ever — so a second run against the same chain has to pick somebody
  // new, or it reports PairAlreadyUsed and looks like the scan broke. It did not; the contract is
  // doing exactly what it exists to do.
  const pk = PEER_PKS.find((p) => {
    const them = privateKeyToAccount(p).address;
    if (them.toLowerCase() === me.address.toLowerCase()) return false;
    // _pairKey is keccak over the two addresses *packed*, lower first — not abi-encoded.
    const [lo, hi] = [me.address.toLowerCase(), them.toLowerCase()].sort();
    const key = keccak256(`0x${lo.slice(2)}${hi.slice(2)}`);
    return cast("call", ESCROW, "pairUsed(uint256,bytes32)(bool)", String(EVENT_ID), key, "--rpc-url", RPC) !== "true";
  });
  if (!pk) {
    console.error("every fixture attendee has already been vouched for by this identity — re-run scripts/dev-chain.sh");
    process.exit(1);
  }

  const blockTs = Number((await client.getBlock()).timestamp);
  const startEpoch = Math.floor(blockTs / 15) + 4;
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push(await peerCode(pk, BigInt(startEpoch + i)));
  const subject = codes[0].subject;
  const y4m = join(dir, "camera.y4m");
  await cameraVideo(codes, dir, y4m);
  console.log(`subject  ${subject}  epochs ${startEpoch}–${startEpoch + 7}\n`);

  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
           `--use-file-for-fake-video-capture=${y4m}`],
  });
  const ctx = await browser.newContext({ permissions: ["camera"], viewport: { width: 420, height: 900 } });
  await ctx.addInitScript((e) => sessionStorage.setItem("peerproof.dev.entropy", e), DEV_ENTROPY);
  // Pin the language. The app now follows the system locale, and on a Chinese machine the primary
  // button stopped matching an English selector — which the run reported as a click timeout, i.e.
  // as a broken scanner. A test that changes its own meaning with the tester's locale is worse
  // than no test.
  await ctx.addInitScript(() => localStorage.setItem("peerproof.lang", "en"));
  const page = await ctx.newPage();

  const log = [];
  page.on("console", (m) => log.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => log.push(`[pageerror] ${e.message}`));

  await page.goto(`${APP}/floor?dev=1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /throwaway local key/i }).click({ timeout: 30000 });
  await page.getByText(/signed in as/i).waitFor({ timeout: 30000 });
  console.log("signed in");

  await page.screenshot({ path: join(dir, "1-floor.png"), fullPage: true });

  // Straight to the peer scan. Check-in state came from the chain above, so whatever the button
  // says is itself a finding.
  const label = await page.locator("button:visible").filter({ hasText: /^(scan someone|check in at the door)$/i }).first().innerText();
  console.log(`primary button reads: ${JSON.stringify(label)}`);

  // Wait for the chain to reach the epoch the video opens on, so the camera's first frame is a
  // code that is live rather than one that expired while the browser was starting.
  process.stdout.write("waiting for the chain to reach the filmed window … ");
  for (;;) {
    const e = Math.floor(Number((await client.getBlock()).timestamp) / 15);
    if (e >= startEpoch) break;
    await page.waitForTimeout(1000);
  }
  console.log("now");

  const attestCount = () =>
    Number(cast("call", ESCROW, "attestCount(uint256,address)(uint32)", String(EVENT_ID), subject, "--rpc-url", RPC).split(" ")[0]);
  const before = attestCount();

  const t0 = Date.now();
  await page.locator("button:visible").filter({ hasText: /^(scan someone|check in at the door)$/i }).first().click();

  // The chain is the only witness worth asking. Reading the screen instead is how an earlier run
  // reported success off the permanent "VOUCHED FOR YOU" heading while nothing had happened.
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) {
    await page.waitForTimeout(1000);
    landed = attestCount() > before;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\noutcome: ${landed ? "VOUCH LANDED ON CHAIN" : "NOTHING LANDED"} after ${elapsed}s`);

  await page.screenshot({ path: join(dir, "2-scanner.png"), fullPage: true });
  const overlayText = await page.locator("body").innerText();
  console.log("\n--- what the screen says ---");
  console.log(overlayText.split("\n").filter(Boolean).slice(0, 25).map((l) => "  " + l).join("\n"));

  console.log("\n--- page console ---");
  for (const l of log.slice(-50)) console.log("  " + l);

  console.log(`\nscreenshots in ${dir}`);
  await browser.close();
}

main().catch((e) => {
  console.error("\n" + e.stack);
  process.exit(1);
});
