import { chromium } from "playwright";
const BASE = "http://127.0.0.1:8779";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem("peerproof.lang", "zh"));
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 90)));

const load = async (path) => { await p.goto(BASE + path, { waitUntil: "networkidle" }); await p.waitForTimeout(1200); };

for (const path of ["/", "/events/", "/me/", "/event/?event=-1", "/organizer/", "/floor/", "/venue/", "/verify/"]) {
  await load(path);
  const n = await p.locator("button:visible").count();
  const links = await p.evaluate(() => [...document.querySelectorAll("a[href]")]
    .filter(a => a.offsetParent)
    .map(a => ({ label: (a.innerText||a.getAttribute("aria-label")||"").trim().slice(0,16), href: a.getAttribute("href") })));
  const badLinks = links.filter(l => !l.href || l.href === "#");
  const dead = [];
  for (let i = 0; i < n; i++) {
    await load(path);
    const el = p.locator("button:visible").nth(i);
    const label = ((await el.innerText().catch(()=>"")) || (await el.getAttribute("aria-label").catch(()=>"")) || "").trim().slice(0,16);
    const before = await p.evaluate(() => [location.href, document.body.innerText.length, document.querySelectorAll("dialog[open]").length].join("|"));
    await el.click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(450);
    const after = await p.evaluate(() => [location.href, document.body.innerText.length, document.querySelectorAll("dialog[open]").length].join("|"));
    if (before === after) dead.push(label || "(无标签)");
  }
  console.log(`${path}  按钮 ${n}  链接 ${links.length}  无反应 ${dead.length}${dead.length ? " → " + dead.join(" / ") : ""}${badLinks.length ? "  空href " + badLinks.length : ""}`);
}
if (errs.length) { console.log("--- 页面异常 ---"); [...new Set(errs)].slice(0,5).forEach(e => console.log("  " + e)); }
await b.close();
