// What the old scanner could and could not read, measured rather than remembered.
//
// "The venue code scans and a person's code does not" was reported three times and never explained.
// The two codes went through the same camera and the same decoder, so the difference had to be in
// the code or in how much of it the decoder was being shown. Both changed at once when this was
// last touched, which means nobody knows which mattered.
//
// This puts the original conditions back and sweeps them: the hex payloads, qr-scanner's default
// scan region — the middle two thirds of the frame, downscaled to 400×400 — and the same sweep
// under today's settings, which read the whole frame at 1024.
//
//   node scripts/qr-regression-probe.mjs
import { chromium } from "playwright";
import QRCode from "qrcode";
import sharp from "sharp";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = resolve(ROOT, "web/node_modules/qr-scanner");
const ESCROW = "0x6Dcaa43a0b6eBB82A4117b2c0eF28f246f345E2b";
const EVENT_ID = 1n;
const FRAME_W = 1280;
const FRAME_H = 720;

const toB64 = (h) =>
  Buffer.from(h.slice(2), "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function payloads() {
  const peer = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const venue = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const epoch = 119310800n;
  const bEpoch = 59655400n;
  const pInner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, address, uint64"), [ESCROW, EVENT_ID, peer.address, epoch]),
  );
  const vInner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, string, uint64"), [ESCROW, EVENT_ID, "beacon", bEpoch]),
  );
  const pSig = await peer.signMessage({ message: { raw: pInner } });
  const vSig = await venue.signMessage({ message: { raw: vInner } });
  return {
    "peer · old (hex, ECC L)": { text: `pp1:${EVENT_ID}:${peer.address}:${epoch}:${pSig}`, ecc: "L" },
    "peer · now (b64, ECC M)": { text: `pp2:${EVENT_ID}:${toB64(peer.address)}:${epoch}:${toB64(pSig)}`, ecc: "M" },
    "venue · old (hex, ECC L)": { text: `ppb1:${EVENT_ID}:${bEpoch}:${vSig}`, ecc: "L" },
    "venue · now (b64, ECC M)": { text: `ppb2:${EVENT_ID}:${bEpoch}:${toB64(vSig)}`, ecc: "M" },
  };
}

async function serveLib() {
  const server = createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><meta charset=utf-8>");
      return;
    }
    try {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(await readFile(resolve(LIB, req.url.replace(/^\//, "").split("?")[0])));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}

/// A camera frame with the code at `frac` of the frame height, slightly defocused — an arm's length,
/// not a screenshot.
async function frame(qr, frac) {
  const side = Math.round(FRAME_H * frac);
  const composed = await sharp({
    create: { width: FRAME_W, height: FRAME_H, channels: 3, background: "#5a5a5a" },
  })
    .composite([{ input: await sharp(qr).resize(side, side).toBuffer(), gravity: "centre" }])
    .png()
    .toBuffer();
  return sharp(composed).blur(1.5).png().toBuffer();
}

async function main() {
  const codes = await payloads();
  for (const [name, { text, ecc }] of Object.entries(codes)) {
    const seg = QRCode.create(text, { errorCorrectionLevel: ecc });
    console.log(`${name.padEnd(26)} ${String(text.length).padStart(4)} chars · ${seg.modules.size}×${seg.modules.size} modules`);
  }
  console.log();

  const { server, port } = await serveLib();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(async () => {
    window.QrScanner = (await import("/qr-scanner.min.js")).default;
  });

  // "old" is qr-scanner's default: centre two thirds, downscaled to 400×400. "now" is what the app
  // asks for: the whole frame at 1024 across.
  const decode = (buf, mode) =>
    page.evaluate(
      async ([data, m]) => {
        const img = new Image();
        img.src = "data:image/png;base64," + data;
        await img.decode();
        const opts =
          m === "now"
            ? {
                returnDetailedScanResult: true,
                calculateScanRegion: (v) => ({
                  x: 0, y: 0, width: v.naturalWidth, height: v.naturalHeight,
                  downScaledWidth: Math.min(1024, v.naturalWidth),
                  downScaledHeight: Math.round((Math.min(1024, v.naturalWidth) * v.naturalHeight) / v.naturalWidth),
                }),
              }
            : { returnDetailedScanResult: true };
        try {
          return (await QrScanner.scanImage(img, opts)).data;
        } catch {
          return null;
        }
      },
      [buf.toString("base64"), mode],
    );

  const fracs = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.85];
  for (const mode of ["old", "now"]) {
    console.log(`--- scan region: ${mode === "old" ? "centre 2/3 at 400×400 (the default)" : "whole frame at 1024"} ---`);
    for (const [name, { text, ecc }] of Object.entries(codes)) {
      if (mode === "old" && name.includes("now")) continue;
      if (mode === "now" && name.includes("old")) continue;
      const qr = await QRCode.toBuffer(text, {
        errorCorrectionLevel: ecc, margin: 1, width: 640,
        color: { dark: "#0a0713", light: "#ffffff" },
      });
      let marks = "", smallest = null;
      for (const f of fracs) {
        const ok = (await decode(await frame(qr, f), mode)) === text;
        if (ok && smallest === null) smallest = f;
        marks += ok ? "." : "x";
      }
      console.log(
        `  ${name.padEnd(26)} ${marks}  ${smallest ? `readable from ${Math.round(smallest * 100)}% of frame height` : "NEVER READABLE"}`,
      );
    }
  }
  console.log(`\n  scale: ${fracs.map((f) => Math.round(f * 100)).join(" ")} (% of frame height, blurred σ=1.5)`);

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
