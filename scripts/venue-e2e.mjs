// The evening, in order: arrive, scan the door, find somebody, scan them.
//
// scan-e2e covers the peer scan but reaches the chain directly to check in, deliberately, so that a
// failure in one is never mistaken for the other. This covers the half that was skipped — and it is
// the half a person does first, on a screen they have never seen, in a room they just walked into.
//
// Both scans go through the camera. The fake capture file carries the venue beacon for the first
// leg and the peer's rotating code for the second, which means the app has to tell them apart from
// the payload alone, take a different branch for each, and get both on chain.
//
//   anvil --block-time 1 &
//   scripts/dev-chain.sh
//   (cd web && npm run dev)
//   node scripts/venue-e2e.mjs
import { chromium } from "playwright";
import QRCode from "qrcode";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbiParameters } from "viem";

const RPC = process.env.RPC ?? "http://127.0.0.1:8545";
const APP = process.env.APP ?? "http://localhost:3000";
// fileURLToPath, not `.pathname` — this repo lives under a path with Chinese characters and the
// percent-encoded form is not a filename.
const ENV = process.env.ENVFILE ?? fileURLToPath(new URL("../web/.env.local", import.meta.url));
const CAST = process.env.CAST ?? `${process.env.HOME}/.foundry/bin/cast`;
const ATTEST_KEY_PATH = "m/44'/60'/0'/0/0";
const DEV_ENTROPY = "cc".repeat(32);

const env = Object.fromEntries(
  readFileSync(ENV, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const ESCROW = env.NEXT_PUBLIC_ESCROW_ADDRESS;
const EVENT_ID = BigInt(env.NEXT_PUBLIC_EVENT_ID || "1");
const PEER_PKS = (env.NEXT_PUBLIC_DEV_PEER_PKS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const FUNDER_PK = env.NEXT_PUBLIC_DEV_FUNDER_PK;
const BEACON_PK = env.NEXT_PUBLIC_DEV_BEACON_PK;

if (env.NEXT_PUBLIC_CHAIN !== "local") {
  console.error(`${ENV} is not the local fixture — run scripts/dev-chain.sh first`);
  process.exit(1);
}

const cast = (...a) => execFileSync(CAST, a, { encoding: "utf8" }).trim();
const toB64 = (h) =>
  Buffer.from(h.slice(2), "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const client = createPublicClient({ transport: http(RPC) });

function devAccount() {
  const entropy = Uint8Array.from(DEV_ENTROPY.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(entropyToMnemonic(entropy, wordlist))).derive(ATTEST_KEY_PATH);
  const pk = `0x${Buffer.from(node.privateKey).toString("hex")}`;
  return { pk, account: privateKeyToAccount(pk) };
}

async function beaconPayload(epoch) {
  const a = privateKeyToAccount(BEACON_PK);
  const inner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, string, uint64"), [ESCROW, EVENT_ID, "beacon", epoch]),
  );
  return `ppb2:${EVENT_ID}:${epoch}:${toB64(await a.signMessage({ message: { raw: inner } }))}`;
}

async function peerPayload(pk, epoch) {
  const a = privateKeyToAccount(pk);
  const inner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, address, uint64"), [ESCROW, EVENT_ID, a.address, epoch]),
  );
  return { subject: a.address, payload: `pp2:${EVENT_ID}:${toB64(a.address)}:${epoch}:${toB64(await a.signMessage({ message: { raw: inner } }))}` };
}

async function film(frames, dir, y4m) {
  const list = [];
  for (const [i, { payload, seconds }] of frames.entries()) {
    const png = join(dir, `f-${i}.png`);
    writeFileSync(png, await QRCode.toBuffer(payload, {
      errorCorrectionLevel: "M", margin: 1, width: 900, color: { dark: "#0a0713", light: "#ffffff" },
    }));
    list.push(`file '${png}'`, `duration ${seconds}`);
  }
  list.push(`file '${join(dir, `f-${frames.length - 1}.png`)}'`);
  const lf = join(dir, "frames.txt");
  writeFileSync(lf, list.join("\n"));
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", lf, "-r", "15",
    "-vf", "scale=450:450,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x5a5a5a", "-pix_fmt", "yuv420p", y4m],
    { stdio: "pipe" });
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "venue-e2e-"));
  const { pk: MY_PK, account: me } = devAccount();
  console.log(`escrow  ${ESCROW}  event ${EVENT_ID}`);
  console.log(`arriver ${me.address}`);

  cast("send", me.address, "--value", "50ether", "--private-key", FUNDER_PK, "--rpc-url", RPC);
  const isReg = () => cast("call", ESCROW, "isRegistered(uint256,address)(bool)", String(EVENT_ID), me.address, "--rpc-url", RPC);
  if (isReg() !== "true") {
    const deposit = cast("call", ESCROW, "getEvent(uint256)((address,address,uint96,uint32,uint32,uint8,uint64,uint64,uint64,uint8,uint32,uint32,uint32,uint256))", String(EVENT_ID), "--rpc-url", RPC)
      .replace(/[()]/g, "").split(",")[2].trim().split(" ")[0];
    cast("send", ESCROW, "register(uint256,address)", String(EVENT_ID), me.address, "--value", deposit, "--private-key", MY_PK, "--rpc-url", RPC);
  }
  const evRow = cast("call", ESCROW, "getEvent(uint256)((address,address,uint96,uint32,uint32,uint8,uint64,uint64,uint64,uint8,uint32,uint32,uint32,uint256))", String(EVENT_ID), "--rpc-url", RPC)
    .replace(/[()]/g, "").split(",").map((s) => s.trim().split(" ")[0]);
  const attestOpen = Number(evRow[7]);
  const now0 = Number((await client.getBlock()).timestamp);
  if (now0 < attestOpen) {
    cast("rpc", "evm_increaseTime", String(attestOpen - now0 + 5), "--rpc-url", RPC);
    cast("rpc", "evm_mine", "--rpc-url", RPC);
  }

  const checkedIn = () => cast("call", ESCROW, "checkedInAt(uint256,address)(uint64)", String(EVENT_ID), me.address, "--rpc-url", RPC).split(" ")[0];
  console.log(`registered ${isReg()} · checked in ${checkedIn()}`);
  if (checkedIn() !== "0") {
    console.error("this identity has already checked in — re-run scripts/dev-chain.sh for a clean run");
    process.exit(1);
  }

  // A pair may only vouch once, so pick somebody this identity has not met.
  const peerPk = PEER_PKS.find((p) => {
    const them = privateKeyToAccount(p).address;
    const [lo, hi] = [me.address.toLowerCase(), them.toLowerCase()].sort();
    return cast("call", ESCROW, "pairUsed(uint256,bytes32)(bool)", String(EVENT_ID), keccak256(`0x${lo.slice(2)}${hi.slice(2)}`), "--rpc-url", RPC) !== "true";
  });

  // Chromium opens the capture file at launch and plays from frame zero when the camera starts, so
  // the reel is filmed for a window that begins shortly *ahead* and the run waits for the chain to
  // reach it. Beacon first, held through check-in; then the peer's code, rotating as their phone
  // would. One file, two kinds of code, exactly as a room presents them.
  const blockTs = Number((await client.getBlock()).timestamp);
  const beaconEpoch = BigInt(Math.floor(blockTs / 30) + 3);
  const beaconStart = Number(beaconEpoch) * 30;
  // Eight seconds of beacon, then the peer's screen.
  //
  // Not thirty: the capture file restarts at frame zero every time the camera opens, so a long
  // beacon frame means the second scan spends that whole time looking at the door display again.
  // Eight is enough to decode and get check-in on chain, and after that the reel is a phone.
  const frames = [{ payload: await beaconPayload(beaconEpoch), seconds: 8 }];
  const peerFrom = Math.floor((beaconStart + 8) / 15);
  for (let i = 0; i < 8; i++) {
    const { payload } = await peerPayload(peerPk, BigInt(peerFrom + i));
    frames.push({ payload, seconds: 15 });
  }
  const subject = privateKeyToAccount(peerPk).address;
  const y4m = join(dir, "camera.y4m");
  await film(frames, dir, y4m);
  console.log(`beacon epoch ${beaconEpoch} then peer ${subject} from code epoch ${peerFrom}\n`);

  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`],
  });
  const ctx = await browser.newContext({ permissions: ["camera"], viewport: { width: 420, height: 900 } });
  await ctx.addInitScript((e) => sessionStorage.setItem("peerproof.dev.entropy", e), DEV_ENTROPY);
  await ctx.addInitScript(() => localStorage.setItem("peerproof.lang", "en"));
  const page = await ctx.newPage();
  const log = [];
  page.on("pageerror", (e) => log.push("pageerror: " + e.message.slice(0, 120)));

  await page.goto(`${APP}/floor/?dev=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /throwaway local key/i }).click({ timeout: 30000 });
  await page.getByText(/signed in as/i).waitFor({ timeout: 30000 });

  const primary = () => page.locator("button:visible").filter({ hasText: /^(scan someone|check in at the door)$/i }).first();
  console.log(`before check-in the button reads: ${JSON.stringify(await primary().innerText())}`);

  process.stdout.write("waiting for the filmed beacon epoch … ");
  for (;;) {
    if (Math.floor(Number((await client.getBlock()).timestamp) / 30) >= Number(beaconEpoch)) break;
    await page.waitForTimeout(1000);
  }
  console.log("now");

  const t0 = Date.now();
  await primary().click();
  let arrived = false;
  for (let i = 0; i < 40 && !arrived; i++) {
    await page.waitForTimeout(1000);
    arrived = checkedIn() !== "0";
  }
  console.log(`${arrived ? "✓" : "✗"} CHECK-IN ${arrived ? "ON CHAIN" : "never landed"} after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!arrived) {
    console.log("   screen:", (await page.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 12).join(" / "));
    await page.screenshot({ path: join(dir, "checkin-failed.png"), fullPage: true });
    console.log("   " + join(dir, "checkin-failed.png"));
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(2500);
  console.log(`after check-in the button reads: ${JSON.stringify(await primary().innerText())}`);

  const count = () => Number(cast("call", ESCROW, "attestCount(uint256,address)(uint32)", String(EVENT_ID), subject, "--rpc-url", RPC).split(" ")[0]);
  const before = count();
  const t1 = Date.now();
  await primary().click();
  let vouched = false;
  for (let i = 0; i < 60 && !vouched; i++) {
    await page.waitForTimeout(1000);
    vouched = count() > before;
  }
  console.log(`${vouched ? "✓" : "✗"} VOUCH ${vouched ? "ON CHAIN" : "never landed"} after ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  await page.screenshot({ path: join(dir, "after.png"), fullPage: true });
  if (!vouched) console.log("   screen:", (await page.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 14).join(" / "));
  if (log.length) console.log("\npage errors:\n  " + log.join("\n  "));
  console.log(`\nscreenshots in ${dir}`);

  await browser.close();
  process.exit(arrived && vouched ? 0 : 1);
}

main().catch((e) => {
  console.error("\n" + e.stack);
  process.exit(1);
});
