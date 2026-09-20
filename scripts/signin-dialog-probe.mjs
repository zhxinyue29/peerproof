// 登录弹窗的回归探针:它该在按下按钮时出现,并且在关掉之后不再自己回来。
//
// 2026-09-20 线上四条全过。只能对着线上跑。Privy 的应用只允许线上那个域名,在 127.0.0.1 上它永远停在
// 初始化,弹窗一次都不会出现——也就是说本机跑这个脚本,「修好了」和「彻底按不动了」
// 看起来一模一样。2026-09-20 我就是这样把一个让登录按钮失灵的改动推上线的。
//
//   APP=https://zhxinyue29.github.io/peerproof node scripts/signin-dialog-probe.mjs
import { chromium } from "playwright";
const APP = process.env.APP ?? "https://zhxinyue29.github.io/peerproof";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-GB" })).newPage();
await p.addInitScript(() => localStorage.setItem("peerproof.lang", "en"));
const dialog = () =>
  p.evaluate(() => {
    const r = document.getElementById("headlessui-portal-root");
    return !!(r && r.innerText.trim());
  });
const step = async (tag, want) => {
  const got = await dialog();
  console.log(`${got ? "有弹窗" : "没弹窗"}  ${tag}${want === undefined ? "" : got === want ? "  ✓" : "  ✗ 应该" + (want ? "有" : "没有")}`);
  return got;
};

await p.goto(APP + "/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3500);
await step("刚打开首页", false);

await p.getByRole("button", { name: /Sign in/ }).first().click();
await p.waitForTimeout(8000);
const opened = await step("按了登录 / 注册", true);

await p.keyboard.press("Escape");
await p.waitForTimeout(1500);
await step("按 Esc", false);

await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(5000);
await step("刷新之后", false);

await p.goto(APP + "/events/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(5000);
await step("换一个页面", false);

await b.close();
process.exit(opened ? 0 : 1);
