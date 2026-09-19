/// Photograph every participant screen at one width, in one language.
///
///   node scripts/page-shots.mjs <outDir>
///
/// Exists because "I changed the design" and "the design changed" are different claims, and only
/// one of them survives being looked at. Every restyling pass in this repo that skipped this step
/// shipped something that looked right in the diff and wrong on the page.
import { chromium } from "playwright";
const OUT=process.argv[2];
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto("http://127.0.0.1:8779/",{waitUntil:"networkidle"});
await p.evaluate(()=>localStorage.setItem("peerproof.lang","zh"));
for (const [path,name] of [["/","00-主页"],["/events/","01-活动列表"],["/organizer/","02-主办方"],["/verify/","03-验证"],["/event/","04-活动详情"]]) {
  await p.goto("http://127.0.0.1:8779"+path,{waitUntil:"networkidle"});
  await p.waitForTimeout(1400);
  await p.screenshot({path:`${OUT}/${name}.png`});
  console.log(name);
}
await b.close();
import { chromium } from "playwright";
const OUT=process.argv[2];
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto("http://127.0.0.1:8779/",{waitUntil:"networkidle"});
await p.evaluate(()=>localStorage.setItem("peerproof.lang","zh"));
for (const [path,name] of [["/","00-主页"],["/events/","01-活动列表"],["/organizer/","02-主办方"],["/verify/","03-验证"],["/event/","04-活动详情"]]) {
  await p.goto("http://127.0.0.1:8779"+path,{waitUntil:"networkidle"});
  await p.waitForTimeout(1400);
  await p.screenshot({path:`${OUT}/${name}.png`});
  console.log(name);
}
await b.close();
