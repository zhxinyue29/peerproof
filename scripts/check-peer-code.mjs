#!/usr/bin/env node
// 锁死「二维码里的 subject 必须是报名地址,不是作证密钥地址」。
//
//     node scripts/check-peer-code.mjs
//
// 2026-09-20,两部真手机在现场互扫,双方都报「有一方没有报名活动」——而活动页明明
// 写着两个账号都已报名。根因是 makePeerCode 只收一个 account,拿 account.address
// 同时当「签名者」和「码里的 subject」。
//
// 合约要的是两个不同的地址:
//
//     isRegistered[eventId][subject]                        ← 报名地址(钱包)
//     _recoverSig(codeDigest(…subject…)) == attestKeyOf[…]  ← 作证密钥签的名
//
// passkey 登录时两者恰好是同一个对象(passkeySigner 里 attest: account),
// 邮箱和浏览器钱包登录时不是——钱包是 Privy 账号,作证密钥另行派生。于是码里写的是
// 作证密钥地址,合约去查一个从没报过名的地址,两边都被告知「对方没报名」。
//
// **这个 bug 躲过了全部自动化测试**,因为 `?dev=1` 用一把一次性密钥同时充当两个角色——
// 正是能把它盖住的那种形状。
//
// ## 为什么是读源码而不是真跑一遍
//
// 第一版真的 import 了 codes.ts 并用两把不同的密钥跑。本机过,CI 挂,两个原因叠在一起:
//
//   · `viem` 只装在 `web/` 下,而这个脚本在仓库根目录跑 → ERR_MODULE_NOT_FOUND
//   · CI 用 node 22,默认不剥 TypeScript 类型,`import("codes.ts")` 也进不来
//
// 为了跑一个不变量去给根目录装一份 node_modules、或者引一套测试框架,代价比它值钱。
// 这个不变量是「哪个变量被写进了载荷」,那是**源码层面的事实**,读源码就能判定,
// 而且零依赖、在哪都能跑、比运行时快。
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../web/lib/codes.ts", import.meta.url), "utf8");

const at = src.indexOf("export async function makePeerCode");
assert.ok(at >= 0, "找不到 makePeerCode —— 它被改名或挪走了,这个检查也要跟着改");
const body = src.slice(at, src.indexOf("\n}", at));

assert.ok(
  /\bsubject:\s*Address\b/.test(body),
  "makePeerCode 必须单独收一个 subject 参数(报名地址),不能只靠 account.address",
);
assert.ok(
  !/account\.address/.test(body),
  "码里的 subject 必须是报名地址,不是作证密钥地址 —— makePeerCode 里不该再出现 account.address",
);
assert.ok(
  /codeInner\(\s*escrow\s*,\s*eventId\s*,\s*subject\s*,\s*epoch\s*\)/.test(body),
  "摘要必须对 subject 求 —— 合约的 codeDigest 就是这么算的",
);
assert.ok(
  /toB64\(\s*subject\s*\)/.test(body),
  "载荷里放的必须是 subject",
);

// 调用处也要核:签名者和 subject 必须来自两个不同的东西。
// `signer.attest` 是作证密钥,`signer.address` 是报名地址;把同一个传两遍就等于没修。
const floor = fs.readFileSync(new URL("../web/app/floor/page.tsx", import.meta.url), "utf8");
const call = floor.match(/makePeerCode\(\s*signer\.attest\s*,\s*([^,]+),/);
assert.ok(call, "/floor 里没找到 makePeerCode(signer.attest, …) 的调用");
assert.equal(
  call[1].trim(),
  "signer.address",
  "第二个参数必须是 signer.address(报名地址),不能是 signer.attest.address",
);

console.log("✓ 码里的 subject 是报名地址,签名由作证密钥出");
