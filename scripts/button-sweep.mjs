// 把每条路线上每一个看得见的按钮都按一遍,报告哪些按了没反应,以及哪些链接的
// href 是空的。
//
//   APP=https://zhxinyue29.github.io/peerproof node scripts/button-sweep.mjs
//   DEV=1 node scripts/button-sweep.mjs        # 本机 out/,顺便用 dev key 登录
//
// 两个坑,都踩过:
//
// 1. 判「有没有反应」不能只看正文长度。空列表上的筛选胶囊只改变哪一个被点亮,
//    正文一个字都不变——一轮报出四个假阳性,这份报告就没人读了。所以签名里带上
//    aria-pressed 和选中态。
// 2. 每次点击之后要把模态清掉。登录按钮会拉起 Privy 的弹窗,它要好几秒才出现,
//    比一次页面加载还慢——不清的话,它后面每一个按钮测的都是遮罩,不是页面。
//
// 剩下的「无反应」如果是按已经选中的那一项(账户页的「概览」、主办方的「全部」),
// 那本来就不该有反应。

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
  // Privy's dialog can still be arriving from the previous button's press — it takes several
  // seconds to appear, which is longer than one page load. Clear it before measuring, or every
  // button after the sign-in button is tested against an overlay rather than against the page.
  for (let i = 0; i < 3; i++) {
    const open = await p.evaluate(() => {
      const r = document.getElementById("headlessui-portal-root");
      return !!(r && r.innerText.trim());
    });
    if (!open) break;
    await p.keyboard.press("Escape");
    await p.waitForTimeout(600);
  }
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
