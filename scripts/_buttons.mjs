import { chromium } from "playwright";
const BASE = process.env.APP ?? "http://127.0.0.1:8799";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem("pp.lang", "zh"));
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 90)));

const load = async (path) => {
  const q = path.includes("?") ? "&dev=1" : "?dev=1";
  await p.goto(BASE + path + q, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1300);
  const d = p.getByRole("button", { name: /Throwaway local key/ });
  if (await d.count()) { await d.click(); await p.waitForTimeout(2200); }
};

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
    // The signature has to include selection state, not just text length. A filter chip on an
    // empty list changes which chip is lit and nothing else — measured by text alone that reads as
    // a dead button, and four such false positives are enough to stop anybody reading the output.
    const sig = () => p.evaluate(() => [
      location.href,
      document.body.innerText.length,
      document.querySelectorAll("dialog[open]").length,
      [...document.querySelectorAll("button")].map((b) =>
        `${b.getAttribute("aria-pressed") ?? ""}${b.className.includes("bg-accent/15") ? "1" : "0"}`).join(""),
    ].join("|"));
    const before = await sig();
    await el.click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(450);
    const after = await sig();
    if (before === after) dead.push(label || "(无标签)");
  }
  console.log(`${path}  按钮 ${n}  链接 ${links.length}  无反应 ${dead.length}${dead.length ? " → " + dead.join(" / ") : ""}${badLinks.length ? "  空href " + badLinks.length : ""}`);
}
if (errs.length) { console.log("--- 页面异常 ---"); [...new Set(errs)].slice(0,5).forEach(e => console.log("  " + e)); }
await b.close();
