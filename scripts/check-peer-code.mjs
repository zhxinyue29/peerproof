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
// 正是能把它盖住的那种形状。所以这个检查刻意让两个地址不同。
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";

const { makePeerCode, parsePeerCode } = await import("../web/lib/codes.ts").catch(async () => {
  // codes.ts 是 TS。没有构建产物时用 tsx/ts-node 都要额外依赖,所以退回到源码正则检查:
  // 至少保证签名与载荷用的是同一个变量,而那个变量不是 account.address。
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../web/lib/codes.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function makePeerCode"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(
    /subject:\s*Address/.test(body),
    "makePeerCode 必须单独收一个 subject 参数(报名地址),不能只靠 account.address",
  );
  assert.ok(
    !/account\.address/.test(body),
    "makePeerCode 里不能再出现 account.address —— 那是作证密钥地址,不是报名地址",
  );
  assert.ok(
    /codeInner\(escrow,\s*eventId,\s*subject,\s*epoch\)/.test(body),
    "摘要必须对 subject 求,合约就是这么算的",
  );
  assert.ok(
    /toB64\(subject\)/.test(body),
    "载荷里放的必须是 subject",
  );
  console.log("✓ makePeerCode 的 subject 与签名者是两个独立参数(源码检查)");
  process.exit(0);
});

const wallet = privateKeyToAccount(`0x${"11".repeat(32)}`);
const attest = privateKeyToAccount(`0x${"22".repeat(32)}`);
assert.notEqual(wallet.address, attest.address, "这个检查必须让两个地址不同,否则查不出任何东西");

const raw = await makePeerCode(attest, wallet.address, wallet.address, 1n, 100n);
const p = parsePeerCode(raw);
assert.ok(p, "码解析不出来");
assert.equal(
  p.subject.toLowerCase(),
  wallet.address.toLowerCase(),
  "码里的 subject 必须是报名地址,不是作证密钥地址",
);
console.log("✓ 码里的 subject 是报名地址");
