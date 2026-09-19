import { chromium } from "playwright";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addInitScript(()=>localStorage.setItem("peerproof.lang","zh"));
const p=await ctx.newPage();
for (const path of ["/","/venue/","/verify/"]) {
  await p.goto("http://127.0.0.1:8779"+path,{waitUntil:"networkidle"});
  await p.waitForTimeout(1200);
  const before = await p.evaluate(()=>document.body.innerText.slice(0,60).replace(/\n/g,' '));
  await p.getByRole('button',{name:'English',exact:true}).first().click({timeout:2000}).catch(e=>console.log(path,"点EN失败"));
  await p.waitForTimeout(800);
  const after = await p.evaluate(()=>document.body.innerText.slice(0,60).replace(/\n/g,' '));
  const stored = await p.evaluate(()=>localStorage.getItem("peerproof.lang"));
  console.log(`${path}\n   前: ${before}\n   后: ${after}\n   存储=${stored}  ${before!==after?"✓ 切换了":"✗ 没变"}`);
}
await b.close();
