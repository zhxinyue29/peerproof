// Measures how large a code has to appear in the camera frame before it decodes.
//
// Written because "scanning a person does nothing" was diagnosed three times from a phone and
// never from a measurement. The venue code scanned and the peer code did not, through the same
// camera and the same decoder — so the difference is in the code, and a code is something a laptop
// can hold still and look at properly.
//
// Renders both payload types exactly as the app does, composites each into a frame the size the
// scanner actually decodes (its calculateScanRegion downscales to 1024 across), and sweeps the
// code's height as a fraction of that frame. The decoder is qr-scanner itself, driven in headless
// Chromium, so this is not a similar library behaving similarly.
//
// The library is served over HTTP rather than injected: it loads its worker by relative specifier,
// which cannot resolve on about:blank, and a harness that fails to start looks exactly like a code
// that cannot be read.
//
//   node scripts/qr-decode-probe.mjs
import { chromium } from "playwright";
import QRCode from "qrcode";
import sharp from "sharp";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const LIB = resolve(ROOT, "web/node_modules/qr-scanner");

const ESCROW = "0x6Dcaa43a0b6eBB82A4117b2c0eF28f246f345E2b";
const EVENT_ID = 1n;

const toB64 = (hex) =>
  Buffer.from(hex.slice(2), "hex")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function peerPayload() {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const epoch = 119310800n;
  const inner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, address, uint64"), [
      ESCROW,
      EVENT_ID,
      account.address,
      epoch,
    ]),
  );
  const sig = await account.signMessage({ message: { raw: inner } });
  return `pp2:${EVENT_ID}:${toB64(account.address)}:${epoch}:${toB64(sig)}`;
}

async function beaconPayload() {
  const account = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const beaconEpoch = 59655400n;
  const inner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, string, uint64"), [
      ESCROW,
      EVENT_ID,
      "beacon",
      beaconEpoch,
    ]),
  );
  const sig = await account.signMessage({ message: { raw: inner } });
  return `ppb2:${EVENT_ID}:${beaconEpoch}:${toB64(sig)}`;
}

/// The scanner's own numbers: it decodes the whole frame downscaled to 1024 across. A phone in
/// landscape hands back 16:9, so this is the picture the decoder actually receives.
const FRAME_W = 1024;
const FRAME_H = 576;

async function frameWith(qrPng, fractionOfHeight, blurSigma) {
  const side = Math.max(16, Math.round(FRAME_H * fractionOfHeight));
  const code = await sharp(qrPng).resize(side, side, { kernel: "lanczos3" }).toBuffer();
  let buf = await sharp({
    create: { width: FRAME_W, height: FRAME_H, channels: 3, background: "#6b6b6b" },
  })
    .composite([
      { input: code, top: Math.round((FRAME_H - side) / 2), left: Math.round((FRAME_W - side) / 2) },
    ])
    .png()
    .toBuffer();
  // A phone camera at arm's length is not a screenshot. A little defocus is the difference between
  // a number that flatters us and one that predicts the room.
  if (blurSigma > 0) buf = await sharp(buf).blur(blurSigma).png().toBuffer();
  return buf;
}

async function serveLib() {
  const server = createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><meta charset=utf-8><title>probe</title>");
      return;
    }
    try {
      const body = await readFile(resolve(LIB, req.url.replace(/^\//, "").split("?")[0]));
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}

async function main() {
  const payloads = { peer: await peerPayload(), venue: await beaconPayload() };

  for (const [name, p] of Object.entries(payloads)) {
    const seg = QRCode.create(p, { errorCorrectionLevel: "M" });
    console.log(
      `${name.padEnd(6)} ${String(p.length).padStart(4)} chars · QR version ${seg.version} · ${seg.modules.size}×${seg.modules.size} modules`,
    );
  }
  console.log();

  const { server, port } = await serveLib();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("  [page error]", e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(async () => {
    const mod = await import("/qr-scanner.min.js");
    window.QrScanner = mod.default;
  });

  // Sanity check first. A harness that silently fails reports "unreadable" for everything, which
  // is the same answer a real defect gives and the reason this check is not optional.
  const sanity = await page.evaluate(async (d) => {
    const img = new Image();
    img.src = "data:image/png;base64," + d;
    await img.decode();
    try {
      return (await QrScanner.scanImage(img, { returnDetailedScanResult: true })).data;
    } catch (e) {
      return "ERR " + (e?.message ?? e);
    }
  }, (await QRCode.toBuffer("HELLO-WORLD", { width: 512, margin: 2 })).toString("base64"));
  if (sanity !== "HELLO-WORLD") {
    console.error(`harness broken: trivial code returned ${JSON.stringify(sanity)}`);
    process.exit(1);
  }
  console.log("harness ok (trivial code decodes)\n");

  const decode = async (pngBuf) =>
    page.evaluate(async (data) => {
      const img = new Image();
      img.src = "data:image/png;base64," + data;
      await img.decode();
      try {
        return (await QrScanner.scanImage(img, { returnDetailedScanResult: true })).data;
      } catch {
        return null;
      }
    }, pngBuf.toString("base64"));

  const fracs = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  for (const blur of [0, 1.2, 2.5]) {
    console.log(`--- blur σ=${blur} ---`);
    for (const [name, payload] of Object.entries(payloads)) {
      const qrPng = await QRCode.toBuffer(payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 640,
        color: { dark: "#0a0713", light: "#ffffff" },
      });
      let smallest = null;
      let marks = "";
      for (const frac of fracs) {
        const ok = (await decode(await frameWith(qrPng, frac, blur))) === payload;
        if (ok && smallest === null) smallest = frac;
        marks += ok ? "." : "x";
      }
      console.log(
        `  ${name.padEnd(6)} ${marks}  smallest readable: ${
          smallest ? `${Math.round(smallest * 100)}% of frame height (${Math.round(FRAME_H * smallest)}px)` : "never"
        }`,
      );
    }
  }
  console.log(`\n  scale: ${fracs.map((f) => Math.round(f * 100)).join(" ")} (% of frame height)`);

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
