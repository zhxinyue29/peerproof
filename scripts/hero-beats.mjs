/// Photograph the hero sequence one beat at a time.
///
/// The sequence is a single eight-second CSS loop, so a plain screenshot catches whatever moment
/// the shutter happened to land on — which is how you end up shipping an animation nobody has
/// looked at in the state that matters. `document.getAnimations()` hands back the running
/// keyframes; pausing them and setting `currentTime` freezes the whole page at an exact moment of
/// the loop, and the same moment every run.
///
///   node scripts/hero-beats.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8777";
const OUT = process.argv[3] || "/tmp/hero-beats";

/// Four moments, one per beat, each chosen at the point the beat is fully resolved rather than at
/// its start — a fade caught halfway tells you nothing about whether the thing is legible.
const BEATS = [
  { t: 1000, name: "1-room", note: "0-2s the room" },
  { t: 3600, name: "2-card", note: "2-4s phone resolves, three rows ticked" },
  { t: 5600, name: "3-arcs", note: "4-6s circuit closed" },
  { t: 7000, name: "4-claim", note: "6-8s the claim" },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const lang of ["en", "zh"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  // Both languages get set explicitly. The first run of this left English implicit and every
  // "en" frame came back in Chinese — the browser is on a Chinese system, so the page's own
  // detection was right and the script was wrong.
  await page.evaluate((l) => localStorage.setItem("peerproof.lang", l), lang);
  await page.reload({ waitUntil: "networkidle" });
  // The still has to be decoded before any of this means anything — a beat photographed over a
  // blank box is a picture of a loading state.
  await page.waitForTimeout(1200);

  for (const b of BEATS) {
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = t;
      }
    }, b.t);
    await page.waitForTimeout(120);
    const file = `${OUT}/${lang}-${b.name}.png`;
    await page.screenshot({ path: file });
    console.log(`${file}  ${b.note}`);
  }
  await page.close();
}
await browser.close();
