// 验收条件 e:截图存档。八条路线 × 中英 × 桌面/手机,登录态。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "docs/screens-v4";
mkdirSync(OUT, { recursive: true });
const ROUTES = [["00-home","/"],["01-events","/events/"],["02-event","/event/"],
  ["03-me","/me/"],["04-organizer","/organizer/"],["05-create","/organizer/?tab=create"],
  ["06-floor","/floor/"],["07-venue","/venue/"],["08-verify","/verify/"]];
const b = await chromium.launch();
let n = 0;
for (const [name, route] of ROUTES) {
  for (const lang of ["zh","en"]) {
    for (const [tag,w,h] of [["desktop",1440,900],["mobile",390,844]]) {
      // `peerproof.lang`, and a matching browser locale. The key is namespaced like every other
      // one this app stores; `pp.lang` was a no-op, and the pages only looked Chinese because this
      // machine's LANG is zh_CN and the app reads navigator.language when nothing is stored.
      const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2,
        isMobile:w<500, hasTouch:w<500, locale: lang === "zh" ? "zh-CN" : "en-GB" });
      await p.addInitScript((l)=>localStorage.setItem("peerproof.lang",l), lang);
      const q = route.includes("?") ? "&dev=1" : "?dev=1";
      await p.goto("http://127.0.0.1:8799"+route+q,{waitUntil:"domcontentloaded"});
      await p.waitForTimeout(1300);
      const d=p.getByRole("button",{name:/Throwaway local key/});
      if (await d.count()) { await d.click(); await p.waitForTimeout(2200); }
      await p.screenshot({path:`${OUT}/${name}-${tag}-${lang}.png`, fullPage:true});
      n++;
      await p.close();
    }
  }
}
await b.close();
console.log("存了", n, "张 →", OUT);
