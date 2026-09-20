import { chromium } from "playwright";
const APP=process.env.APP ?? "http://127.0.0.1:8799";
const b = await chromium.launch();
for (const [tag,route] of [["ev-list","/events/"],["ev-detail","/event/?event=1"]]) {
  const p = await (await b.newContext({viewport:{width:1500,height:1100},deviceScaleFactor:2,locale:"zh-CN"})).newPage();
  p.on("pageerror",e=>console.log(tag,"报错:",String(e).slice(0,90)));
  await p.addInitScript(()=>localStorage.setItem("peerproof.lang","zh"));
  await p.goto(APP+route,{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(4000);
  await p.screenshot({path:`/tmp/${tag}.png`,fullPage:true});
  await p.close();
}
await b.close();
console.log("ok");
