// 返回按钮到底回哪。三种情况都要对:
//
//   从活动列表进活动详情 → 返回回列表
//   从主办方控制台进活动详情 → 返回回控制台(不是回参与者的列表)
//   直接拿链接打开 → 没有上一页,返回去这一页的固定上层
//
//   APP=https://zhxinyue29.github.io/peerproof node scripts/nav-probe.mjs
import { chromium } from "playwright";
const APP = process.env.APP ?? "http://127.0.0.1:8799";
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:1440,height:1000},locale:"zh-CN"});
const p = await ctx.newPage();
p.on("pageerror",e=>console.log("报错:",String(e).slice(0,90)));
await p.addInitScript(()=>localStorage.setItem("peerproof.lang","zh"));

const back = async () => {
  const l = p.getByRole("link",{name:/返回/}).first();
  if (!(await l.count())) { console.log("   没找到返回按钮"); return; }
  await l.click(); await p.waitForTimeout(1500);
};

console.log("A) 活动列表 → 活动详情 → 返回");
await p.goto(APP+"/events/",{waitUntil:"domcontentloaded"}); await p.waitForTimeout(3000);
const card = p.getByRole("link",{name:/查看/}).first();
if (await card.count()) { await card.click(); await p.waitForTimeout(2500);
  console.log("   现在在:", new URL(p.url()).pathname);
  await back(); console.log("   返回到:", new URL(p.url()).pathname); }

console.log("B) 直接拿链接打开活动详情 → 返回");
const p2 = await ctx.newPage();
await p2.addInitScript(()=>localStorage.setItem("peerproof.lang","zh"));
await p2.goto(APP+"/event/?event=1",{waitUntil:"domcontentloaded"}); await p2.waitForTimeout(3000);
const l2 = p2.getByRole("link",{name:/返回/}).first();
if (await l2.count()) { await l2.click(); await p2.waitForTimeout(1500);
  console.log("   返回到:", new URL(p2.url()).pathname); }

console.log("C) 顶栏左上角");
console.log("   /events:", await p.evaluate(()=>document.querySelector("header")?.innerText.replace(/\n/g," ").slice(0,40)));
await b.close();
