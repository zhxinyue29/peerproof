// Does the chain guard actually stop a transaction going to the wrong chain?
//
// It was written after a deploy button put a contract creation in front of a MetaMask sitting on
// Ethereum mainnet, quoting US$13.72 of real ETH. That was caught by a person reading the dialog.
// The guard exists so the next one is caught by the code — and until this ran, the guard had never
// been executed once.
//
// A fake EIP-1193 provider is injected before the app loads. It reports whichever chain the case
// under test wants, records every method the app calls, and — this is the point — refuses to let
// eth_sendTransaction through silently: if one arrives while the wallet is on the wrong chain, that
// is the bug, and the test says so.
//
//   (cd web && npm run dev)     # any chain config; nothing is ever broadcast
//   node scripts/chain-guard-test.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const APP = process.env.APP ?? "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(new URL("../web/.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const WANT_CHAIN = env.NEXT_PUBLIC_CHAIN === "local" ? 31337 : env.NEXT_PUBLIC_CHAIN === "mainnet" ? 143 : 10143;
const WANT = WANT_CHAIN;

/// Installs a provider that answers like a wallet parked on `startChainId`.
///
/// `switchBehaviour` decides what happens when the app asks it to move:
///   "accept"  — switches, as a cooperative wallet does
///   "unknown" — throws 4902, which is what a wallet that has never seen Monad returns
///   "refuse"  — resolves the request but does not actually move, which is the case the guard's
///               re-read exists for and the one a trusting implementation would miss
function providerScript(startChainId, switchBehaviour) {
  return `
    window.__calls = [];
    window.__sent = [];
    let chainId = ${startChainId};
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method, params }) => {
        window.__calls.push(method);
        if (method === "eth_chainId") return "0x" + chainId.toString(16);
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return ["0x4cb6B0E49Fd04DBAC6671D0d7e21ba2b46f1DF7D"];
        if (method === "wallet_switchEthereumChain") {
          const behaviour = ${JSON.stringify(switchBehaviour)};
          if (behaviour === "unknown") { const e = new Error("Unrecognized chain ID"); e.code = 4902; throw e; }
          if (behaviour === "accept") chainId = parseInt(params[0].chainId, 16);
          return null;
        }
        if (method === "wallet_addEthereumChain") { chainId = ${WANT}; return null; }
        if (method === "personal_sign") return "0x" + "11".repeat(65);
        if (method === "eth_sendTransaction") {
          window.__sent.push({ chainId, data: (params[0].data || "").slice(0, 10) });
          return "0x" + "ab".repeat(32);
        }
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
  `;
}

async function run(name, startChainId, switchBehaviour, expect) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(providerScript(startChainId, switchBehaviour));
  await ctx.addInitScript(() => {
    localStorage.setItem("peerproof.lang", "en");
    sessionStorage.setItem("peerproof.dev.entropy", "bb".repeat(32));
  });
  const page = await ctx.newPage();
  await page.goto(`${APP}/organizer/?dev=1`, { waitUntil: "domcontentloaded", timeout: 60000 });

  await page.getByRole("button", { name: /throwaway local key/i }).click({ timeout: 30000 });
  await page.getByRole("button", { name: /^deploy a new escrow$/i }).click({ timeout: 30000 });
  await page.getByRole("button", { name: /yes, deploy/i }).click({ timeout: 30000 });
  await page.waitForTimeout(3500);

  const sent = await page.evaluate(() => window.__sent);
  const calls = await page.evaluate(() => window.__calls);
  const askedToSwitch = calls.includes("wallet_switchEthereumChain");
  const askedToAdd = calls.includes("wallet_addEthereumChain");
  const onWrongChain = sent.filter((s) => s.chainId !== WANT_CHAIN);

  const notice = await page
    .locator("[class*=bad], [class*=warn]")
    .filter({ hasText: /./ })
    .first()
    .innerText()
    .catch(() => "");

  const pass =
    onWrongChain.length === 0 &&
    (expect.sends ? sent.length > 0 : sent.length === 0) &&
    (!expect.switch || askedToSwitch) &&
    (!expect.add || askedToAdd);

  console.log(`${pass ? "✓" : "✗"} ${name}`);
  console.log(`    asked to switch: ${askedToSwitch}   asked to add: ${askedToAdd}`);
  console.log(`    transactions sent: ${sent.length}${sent.length ? ` (chain ${sent.map((s) => s.chainId).join(",")})` : ""}`);
  if (onWrongChain.length) console.log(`    !! ${onWrongChain.length} SENT ON THE WRONG CHAIN`);
  if (notice) console.log(`    on screen: ${notice.split("\n")[0].slice(0, 90)}`);

  await browser.close();
  return pass;
}

console.log(`app expects chain ${WANT}\n`);
const results = [];
results.push(await run("wallet on Ethereum mainnet, switches when asked", 1, "accept", { switch: true, sends: true }));
results.push(await run("wallet has never seen Monad (4902)", 1, "unknown", { switch: true, add: true, sends: true }));
results.push(await run("wallet says yes but does not move", 1, "refuse", { switch: true, sends: false }));
results.push(await run("wallet already on the right chain", WANT, "accept", { sends: true }));

console.log(results.every(Boolean) ? "\nall cases pass" : "\nFAILED");
process.exit(results.every(Boolean) ? 0 : 1);
