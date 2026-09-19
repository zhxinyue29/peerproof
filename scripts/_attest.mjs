import { chromium } from "playwright";
import { execSync } from "node:child_process";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
p.on("pageerror",e=>console.log("页面报错:",e.message));
await p.addInitScript(()=>localStorage.setItem("pp.lang","zh"));
const body = async()=> (await p.evaluate(()=>document.body.innerText)).replace(/\n+/g," ");
const vis = async()=> (await p.evaluate(()=>[...document.querySelectorAll("button")].filter(e=>e.offsetParent).map(e=>e.textContent.trim()))).join(" / ");

await p.goto("http://127.0.0.1:8799/event/?dev=1",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
await p.getByRole("button",{name:/报名/}).first().click();
await p.waitForTimeout(1200);
await p.getByRole("button",{name:/Throwaway local key/}).click();
await p.waitForTimeout(1800);
const a=await p.evaluate(()=>(document.body.innerText.match(/0x[0-9a-fA-F]{40}/)||[])[0]);
execSync(`cast send ${a} --value 200ether --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545`,{stdio:"ignore"});
await p.waitForTimeout(1200);
await p.getByRole("button",{name:/报名/}).first().click();
await p.waitForTimeout(11000);
execSync(`cast rpc evm_increaseTime 700 --rpc-url http://127.0.0.1:8545`,{stdio:"ignore"});
execSync(`cast rpc evm_mine --rpc-url http://127.0.0.1:8545`,{stdio:"ignore"});

await p.goto("http://127.0.0.1:8799/floor/?dev=1",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1200);
await p.getByRole("button",{name:/Throwaway local key/}).click();
await p.waitForTimeout(3000);
await p.evaluate(()=>document.querySelectorAll("details").forEach(d=>d.open=true));
await p.waitForTimeout(500);
await p.getByRole("button",{name:"check in"}).click();
console.log("签到中…"); await p.waitForTimeout(9000);
console.log("签到后:", (await body()).slice(0,240));
for (let i=0;i<3;i++){
  await p.getByRole("button",{name:"attest scripted peer"}).click();
  await p.waitForTimeout(8000);
  console.log(`第 ${i+1} 个同伴作证后:`, (await body()).match(/人为你作证[^全]*/)?.[0] ?? "(没抓到)");
}
await p.screenshot({path:"/tmp/f-attested.png",fullPage:true});
await p.goto("http://127.0.0.1:8799/verify/?dev=1",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(4000);
console.log("公开记录:", (await body()).slice(0,300));
await p.screenshot({path:"/tmp/f-verify.png",fullPage:true});
await b.close();
