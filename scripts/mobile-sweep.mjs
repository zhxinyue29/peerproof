// 手机版体检:每条路线在 390×844 下量三件事 —— 横向溢出、44px 以下的点击目标、
// 13px 以下的正文。跑完全部路线,不在第一条出错就停。
//
//   node scripts/mobile-sweep.mjs                      # 本机 out/,根路径
//   APP=https://zhxinyue29.github.io/peerproof node scripts/mobile-sweep.mjs
//
// /floor 上那几个 26px 的按钮是 dev 工具条(只有 ?dev=1 才有),线上不存在。
import { chromium } from "playwright";
const APP = process.env.APP ?? "http://127.0.0.1:8799";
const DEV = process.env.DEV === "1";
const ROUTES = ["/", "/events/", "/event/", "/me/", "/organizer/", "/floor/", "/venue/", "/verify/"];
const b = await chromium.launch();
let bad = 0;
for (const r of ROUTES) {
  const p = await b.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 70)));
  await p.goto(APP + r + (DEV ? "?dev=1" : ""), { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  if (DEV) {
    const d = p.getByRole("button", { name: /Throwaway local key/ });
    if (await d.count()) { await d.click(); await p.waitForTimeout(2200); }
  }
  const m = await p.evaluate(() => {
    const doc = document.documentElement;
    const small = [...document.querySelectorAll("button,a,input,select")]
      .filter((e) => { const b = e.getBoundingClientRect(); return e.offsetParent && b.height > 0 && b.height < 44; })
      .map((e) => `${(e.textContent || "").trim().slice(0, 12)}(${Math.round(e.getBoundingClientRect().height)}px)`);
    const tiny = [...document.querySelectorAll("p,span,li,div")]
      .filter((e) => e.offsetParent && !e.children.length && (e.textContent || "").trim() &&
        parseFloat(getComputedStyle(e).fontSize) < 13)
      .map((e) => (e.textContent || "").trim().slice(0, 18));
    return { over: doc.scrollWidth - doc.clientWidth, small: [...new Set(small)], tiny: [...new Set(tiny)] };
  });
  const ok = m.over === 0 && !m.small.length && !m.tiny.length && !errs.length;
  if (!ok) bad++;
  console.log(
    `${ok ? "✓" : "✗"} ${r.padEnd(12)} 溢出 ${String(m.over).padStart(3)}` +
    ` | <44px ${m.small.length ? m.small.join(" ") : "无"}` +
    ` | <13px ${m.tiny.length ? m.tiny.join("/") : "无"}` +
    (errs.length ? ` | 报错 ${errs[0]}` : ""),
  );
  await p.close();
}
await b.close();
console.log(bad ? `${bad} 条路线有问题` : "八条路线全过");
process.exit(bad ? 1 : 0);
