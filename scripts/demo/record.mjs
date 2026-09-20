// 录制演示视频里"浏览器"那几段。每一段都是真的:本机 anvil 上的真交易,真的链上读取。
//
//   anvil --block-time 1 &
//   scripts/dev-chain.sh && (cd web && NEXT_PUBLIC_CHAIN=local npm run build)
//   node scripts/demo/record.mjs
//
// 输出 /tmp/demo/shot-*.webm,再由 assemble.sh 接成片子。
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync } from "node:fs";

const OUT = "/tmp/demo";
const APP = process.env.APP ?? "http://127.0.0.1:8799";
const RPC = "http://127.0.0.1:8545";
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const W = 1280, H = 720;

mkdirSync(OUT, { recursive: true });
const cast = (args) => execSync(`cast ${args} --rpc-url ${RPC}`, { stdio: "ignore" });

/// One shot = one browser context, so each lands in its own file.
async function shot(name, seedEntropy, body) {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT, size: { width: W, height: H } },
    locale: "zh-CN",
    deviceScaleFactor: 1,
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`  ${name} 页面报错:`, String(e).slice(0, 80)));
  await p.addInitScript(
    ([lang, ent]) => {
      localStorage.setItem("peerproof.lang", lang);
      if (ent) sessionStorage.setItem("peerproof.dev.entropy", ent);
    },
    ["zh", seedEntropy ?? ""],
  );
  const signIn = async () => {
    const d = p.getByRole("button", { name: /Throwaway local key/ });
    if (await d.count()) {
      await d.click();
      await p.waitForTimeout(2200);
    }
  };
  const fund = async (eth = 40) => {
    const a = await p.evaluate(
      () =>
        document.querySelector('button[title^="0x"]')?.getAttribute("title") ||
        (document.body.innerText.match(/0x[0-9a-fA-F]{40}/) || [])[0],
    );
    if (a) cast(`send ${a} --value ${eth}ether --private-key ${FUNDER}`);
    return a;
  };
  await body({ p, signIn, fund });
  await ctx.close();
  await b.close();
  // Playwright names the file after an internal id; rename to the shot.
  const latest = readdirSync(OUT)
    .filter((f) => f.endsWith(".webm") && !f.startsWith("shot-"))
    .map((f) => `${OUT}/${f}`)
    .sort()
    .pop();
  if (latest) renameSync(latest, `${OUT}/shot-${name}.webm`);
  console.log("录好", name);
}

// ── 1. 首页 ────────────────────────────────────────────────────────────────
await shot("01-home", null, async ({ p }) => {
  await p.goto(APP + "/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(4200);
  // 慢慢滚到四条特性
  for (let i = 0; i < 26; i++) {
    await p.mouse.wheel(0, 40);
    await p.waitForTimeout(70);
  }
  await p.waitForTimeout(2600);
});

// ── 2. 主办方建活动 ────────────────────────────────────────────────────────
await shot("02-create", "aa".repeat(32), async ({ p, signIn, fund }) => {
  await p.goto(APP + "/organizer/?dev=1&tab=create", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1600);
  await signIn();
  await fund(60);
  await p.waitForTimeout(1200);
  await p.getByRole("textbox", { name: /^标题/ }).click();
  await p.keyboard.type("周四读书会", { delay: 90 });
  await p.getByRole("textbox", { name: /^地点/ }).click();
  await p.keyboard.type("市图书馆 · 三楼", { delay: 70 });
  const addTag = p.getByRole("button", { name: /添加标签/ });
  if (await addTag.count()) {
    await addTag.click();
    for (const tg of ["读书会", "线下"]) {
      await p.keyboard.type(tg, { delay: 80 });
      await p.keyboard.press("Enter");
    }
    await p.keyboard.press("Escape");
  }
  await p.waitForTimeout(900);
  for (let i = 0; i < 3; i++) {
    await p.getByRole("button", { name: /下一步/ }).click();
    await p.waitForTimeout(1500);
  }
  await p.waitForTimeout(1400);
  await p.getByRole("button", { name: /^创建活动$/ }).click();
  await p.waitForTimeout(15000);
});

console.log("浏览器段落录完:", readdirSync(OUT).filter((f) => f.startsWith("shot-")).join(", "));

// ── 3. 活动出现在列表里 ────────────────────────────────────────────────────
await shot("03-listing", null, async ({ p }) => {
  await p.goto(APP + "/events/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(4500);
  for (let i = 0; i < 14; i++) {
    await p.mouse.wheel(0, 40);
    await p.waitForTimeout(80);
  }
  await p.waitForTimeout(2600);
});

// ── 4. 参与者报名 ──────────────────────────────────────────────────────────
await shot("04-join", "bb".repeat(32), async ({ p, signIn, fund }) => {
  await p.goto(APP + "/event/?dev=1", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  await p.getByRole("button", { name: /押金并报名/ }).first().click();
  await p.waitForTimeout(1400);
  await signIn();
  await fund(80);
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /押金并报名/ }).first().click();
  await p.waitForTimeout(14000);
});

// ── 5. 判定到场 ────────────────────────────────────────────────────────────
// 把链推进到签到窗口,让固定的那几个参与者互相作证,再录现场页从 0/3 走到 3/3。
await shot("05-confirmed", "bb".repeat(32), async ({ p, signIn }) => {
  cast("rpc evm_increaseTime 700");
  cast("rpc evm_mine");
  await p.goto(APP + "/floor/?dev=1", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1600);
  await signIn();
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await p.waitForTimeout(600);
  const checkIn = p.getByRole("button", { name: "check in" });
  if (await checkIn.count()) {
    await checkIn.click();
    await p.waitForTimeout(7000);
  }
  for (let i = 0; i < 3; i++) {
    const btn = p.getByRole("button", { name: "attest scripted peer" });
    if (!(await btn.count())) break;
    await btn.click();
    await p.waitForTimeout(6500);
  }
  await p.waitForTimeout(3500);
});

// ── 6. 公开记录 ────────────────────────────────────────────────────────────
await shot("06-verify", null, async ({ p }) => {
  await p.goto(APP + "/verify/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6000);
  for (let i = 0; i < 16; i++) {
    await p.mouse.wheel(0, 40);
    await p.waitForTimeout(80);
  }
  await p.waitForTimeout(3000);
});
