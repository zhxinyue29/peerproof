/// Photograph every participant screen at one width, in one language.
///
///   node scripts/page-shots.mjs <outDir> [baseUrl]
///
/// Exists because "I changed the design" and "the design changed" are different claims, and only
/// one of them survives being looked at. Every restyling pass in this repo that skipped this step
/// shipped something that looked right in the diff and wrong on the page.
///
/// Language is set before the first script runs, not after `goto`. Setting it afterwards and
/// reloading looked like it worked and quietly produced English frames on a Chinese system, because
/// the page had already chosen by the time the write landed.
import { chromium } from "playwright";

const OUT = process.argv[2];
const BASE = process.argv[3] ?? "http://127.0.0.1:8779";

const PAGES = [
  ["/", "00-主页"],
  ["/events/", "01-活动列表"],
  ["/event/?event=-1", "02-样例详情"],
  ["/me/", "03-我的证明"],
  ["/organizer/", "04-主办方"],
  ["/verify/", "05-验证"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem("peerproof.lang", "zh"));
const page = await ctx.newPage();

for (const [path, name] of PAGES) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
}

await browser.close();
