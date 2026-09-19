import { chromium } from "playwright";
const OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await ctx.addInitScript(()=>localStorage.setItem("peerproof.lang","zh"));
const p=await ctx.newPage();
for(const [path,name] of [["/","主页"],["/events/","活动"],["/me/","我的证明"],["/organizer/","主办方"],["/floor/","扫码"],["/venue/","二维码"]]){
  await p.goto("http://127.0.0.1:8779"+path,{waitUntil:"networkidle"});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(()=>({
    溢出: document.documentElement.scrollWidth > window.innerWidth+1,
    最小点击区: (()=>{const bs=[...document.querySelectorAll('button,a')].filter(e=>e.offsetParent);
      const small=bs.filter(e=>{const r=e.getBoundingClientRect(); return r.height>0 && r.height<44;});
      return small.length;})(),
    高度: document.body.scrollHeight,
  }));
  console.log(`${name}  溢出=${r.溢出?"⚠":"否"}  低于44px的可点元素=${r.最小点击区}  页高=${r.高度}`);
  await p.screenshot({path:`${OUT}/手机-${name}.png`});
}
await b.close();
