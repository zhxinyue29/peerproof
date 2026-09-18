// Decodes the code as it is actually drawn, not as it is generated.
//
// The first probe fed the decoder a QR straight out of the encoder and found it readable at 15% of
// the frame. That does not settle anything, because nobody photographs the encoder's output: they
// photograph a phone screen, after the browser has scaled a 640px PNG into a CSS box, applied
// `image-rendering: pixelated`, and drawn it at some device pixel ratio.
//
// So this renders RotatingCode's markup at a real phone viewport, screenshots it the way a screen
// actually looks, and only then asks the decoder to read it — at a range of apparent sizes, which
// is the thing a person changes by moving their hand.
//
//   node scripts/qr-render-probe.mjs
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
const FRAME_W = 1024;
const FRAME_H = 576;

const toB64 = (hex) =>
  Buffer.from(hex.slice(2), "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function peerPayload() {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const epoch = 119310800n;
  const inner = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, address, uint64"), [
      ESCROW, EVENT_ID, account.address, epoch,
    ]),
  );
  return `pp2:${EVENT_ID}:${toB64(account.address)}:${epoch}:${toB64(await account.signMessage({ message: { raw: inner } }))}`;
}

async function serveLib() {
  const server = createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><meta charset=utf-8><title>probe</title>");
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

/// RotatingCode's markup and classes, reduced to the parts that affect the pixels: the white
/// plate, its padding, the full-width image and the pixelated scaling.
const PLATE_HTML = (dataUrl, plateWidthPx) => `
<!doctype html><meta charset=utf-8>
<body style="margin:0;background:#0a0713">
  <div style="width:${plateWidthPx}px;background:#fff;border-radius:16px;padding:10px;box-sizing:border-box">
    <img src="${dataUrl}" style="width:100%;display:block;image-rendering:pixelated">
  </div>
</body>`;

async function main() {
  const payload = await peerPayload();
  const { server, port } = await serveLib();
  const browser = await chromium.launch();

  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 640,
    color: { dark: "#0a0713", light: "#ffffff" },
  });

  const decoder = await browser.newPage();
  await decoder.goto(`http://127.0.0.1:${port}/`);
  await decoder.evaluate(async () => {
    window.QrScanner = (await import("/qr-scanner.min.js")).default;
  });
  const decode = async (buf) =>
    decoder.evaluate(async (d) => {
      const img = new Image();
      img.src = "data:image/png;base64," + d;
      await img.decode();
      try {
        return (await QrScanner.scanImage(img, { returnDetailedScanResult: true })).data;
      } catch {
        return null;
      }
    }, buf.toString("base64"));

  // A 390px-wide phone, the plate filling the column the way /floor lays it out, at the device
  // pixel ratios real phones report.
  for (const dpr of [2, 3]) {
    const shot = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: dpr,
    });
    await shot.setContent(PLATE_HTML(dataUrl, 366));
    const plate = await shot.locator("div").first().screenshot();
    const meta = await sharp(plate).metadata();
    console.log(`\n=== phone screen at DPR ${dpr} — plate captured at ${meta.width}×${meta.height}px ===`);

    for (const blur of [0, 1.5, 3]) {
      let smallest = null;
      let marks = "";
      const fracs = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      for (const frac of fracs) {
        const side = Math.round(FRAME_H * frac);
        let frame = await sharp({
          create: { width: FRAME_W, height: FRAME_H, channels: 3, background: "#5a5a5a" },
        })
          .composite([
            {
              input: await sharp(plate).resize(side, side, { fit: "inside" }).toBuffer(),
              gravity: "centre",
            },
          ])
          .png()
          .toBuffer();
        if (blur > 0) frame = await sharp(frame).blur(blur).png().toBuffer();
        const ok = (await decode(frame)) === payload;
        if (ok && smallest === null) smallest = frac;
        marks += ok ? "." : "x";
      }
      console.log(
        `  blur σ=${String(blur).padEnd(3)} ${marks}  smallest readable: ${
          smallest ? `${Math.round(smallest * 100)}% of frame` : "NEVER"
        }`,
      );
    }
    await shot.close();
  }
  console.log("\n  scale: 20 25 30 35 40 50 60 70 80 90 (% of frame height)");

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
