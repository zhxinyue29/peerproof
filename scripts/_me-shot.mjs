import { chromium } from "playwright";
import { execSync } from "node:child_process";
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:1500,height:1200},deviceScaleFactor:2,locale:"zh-CN"})).newPage();
p.on("pageerror",e=>console.log("报错:",String(e).slice(0,110)));
await p.addInitScript(()=>{localStorage.setItem("peerproof.lang","zh");sessionStorage.setItem("peerproof.dev.entropy","b2".repeat(32));});
await p.goto("http://127.0.0.1:8799/me/?dev=1",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
const d=p.getByRole("button",{name:/Throwaway local key/}); if(await d.count()){await d.click();await p.waitForTimeout(4000);}
await p.screenshot({path:"/tmp/me-now.png",fullPage:true});
console.log("侧栏:", await p.evaluate(()=>[...document.querySelectorAll("nav button")].map(e=>e.textContent.trim()).join(" / ")));
console.log("tabs:", await p.evaluate(()=>[...document.querySelectorAll('[aria-current], button')].filter(e=>e.offsetParent&&e.closest("div.overflow-x-auto")).map(e=>e.textContent.trim()).join(" / ").slice(0,120)));
await b.close();
