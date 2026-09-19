import { chromium } from "playwright";
const APP=process.env.APP ?? "https://zhxinyue29.github.io/peerproof";
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:1440,height:900},locale:"en-GB"});
const p = await ctx.newPage();
await p.addInitScript(()=>localStorage.setItem("peerproof.lang","en"));
const state = async(tag)=>console.log(tag, "| 弹窗:", await p.evaluate(()=>{
  const r=document.getElementById("headlessui-portal-root");
  return r && r.innerText.trim() ? r.innerText.trim().slice(0,40).replace(/\n+/g,"/") : "没有";
}));
await p.goto(APP+"/",{waitUntil:"domcontentloaded"}); await p.waitForTimeout(3000);
await state("刚打开首页");
await p.getByRole("button",{name:/Sign in/}).first().click();
await p.waitForTimeout(6000);
await state("按了登录");
// 关闭:Esc
await p.keyboard.press("Escape"); await p.waitForTimeout(1200);
await state("按 Esc 之后");
// 关闭:点 ×
const x = p.locator("#headlessui-portal-root button").first();
if (await x.count()) { await x.click().catch(()=>{}); await p.waitForTimeout(1500); }
await state("点了第一个按钮(×?)之后");
// 刷新
await p.reload({waitUntil:"domcontentloaded"}); await p.waitForTimeout(4000);
await state("刷新之后");
// 换一页
await p.goto(APP+"/events/",{waitUntil:"domcontentloaded"}); await p.waitForTimeout(4000);
await state("去 /events 之后");
await p.screenshot({path:"/tmp/modal.png"});
await b.close();
