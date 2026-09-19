import { chromium } from "playwright";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:950}});
await ctx.addInitScript(()=>localStorage.setItem("peerproof.lang","zh"));
const p=await ctx.newPage();
await p.goto("http://127.0.0.1:8779/",{waitUntil:"networkidle"});
await p.waitForTimeout(2500);
const v = await p.evaluate(()=>{
  const el=document.querySelector('video');
  if(!el) return "没有 video 元素";
  return {已播放到: el.currentTime.toFixed(2)+"s", 时长: el.duration?.toFixed(2)+"s",
          尺寸: el.videoWidth+"x"+el.videoHeight, 暂停中: el.paused};
});
console.log(JSON.stringify(v));
await p.screenshot({path:process.argv[2]+"/首屏_视频.png"});
await b.close();
