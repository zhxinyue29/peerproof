// 建一场内容填满的活动:封面、简介、地点、标签。录视频和看版式都用它。
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const APP = process.env.APP ?? "http://127.0.0.1:8799";
const RPC = "http://127.0.0.1:8545";
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SEED = "c7".repeat(32);

const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:1500,height:1100},deviceScaleFactor:2,locale:"zh-CN"});
const p = await ctx.newPage();
p.on("pageerror",e=>console.log("报错:",String(e).slice(0,100)));
// sessionStorage 是每个标签页独立的,每一页都要种
await p.addInitScript((s)=>{localStorage.setItem("peerproof.lang","zh");sessionStorage.setItem("peerproof.dev.entropy",s);}, SEED);
const signIn=async()=>{const d=p.getByRole("button",{name:/Throwaway local key/});if(await d.count()){await d.click();await p.waitForTimeout(2400);}};

await p.goto(APP+"/organizer/?dev=1&tab=create",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500); await signIn();
const q = await ctx.newPage();
await q.addInitScript((s)=>{localStorage.setItem("peerproof.lang","zh");sessionStorage.setItem("peerproof.dev.entropy",s);}, SEED);
await q.goto(APP+"/me/?dev=1",{waitUntil:"domcontentloaded"}); await q.waitForTimeout(1400);
const d2=q.getByRole("button",{name:/Throwaway local key/}); if(await d2.count()){await d2.click();await q.waitForTimeout(2600);}
const addr=await q.evaluate(()=>(document.body.innerText.match(/0x[0-9a-fA-F]{40}/)||[])[0]); await q.close();
execSync(`cast send ${addr} --value 60ether --private-key ${FUNDER} --rpc-url ${RPC}`,{stdio:"ignore"});
console.log("主办方", addr);

await p.goto(APP+"/organizer/?dev=1&tab=create",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1400); await signIn(); await p.waitForTimeout(800);
await p.getByRole("textbox",{name:/活动封面图/}).fill(APP+"/cover-1.webp");
await p.getByRole("textbox",{name:/^标题/}).fill("Monad 社区之夜 · 深圳");
await p.locator("textarea").first().fill(
  "一场面向开发者、创作者和社区成员的线下聚会。\n\n我们会分享 Monad 上的最新进展，展示几个正在做的项目，也留出足够的时间自由交流。不论你是开发者、设计师、投资人还是纯粹好奇，都欢迎来。");
await p.getByRole("textbox",{name:/^地点/}).fill("深圳 · 南山区科兴科学园");
const addTag=p.getByRole("button",{name:/添加标签/});
if (await addTag.count()) {
  await addTag.click();
  for (const tg of ["Monad","开发者","线下活动","社区"]) { await p.keyboard.type(tg); await p.keyboard.press("Enter"); }
  await p.keyboard.press("Escape");
}
await p.waitForTimeout(700);
for(let i=0;i<3;i++){ await p.getByRole("button",{name:/下一步/}).click(); await p.waitForTimeout(700); }
await p.getByRole("button",{name:/^创建活动$/}).click();
await p.waitForTimeout(18000);
console.log("建好了:", (await p.evaluate(()=>document.body.innerText)).replace(/\n+/g," ").match(/活动 #\d+ 已创建/)?.[0] ?? "(没抓到)");
await b.close();
