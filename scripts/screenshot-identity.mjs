import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "/home/liyakun/文档/Monad_Circle/docs/screens";
const LOCAL = "http://localhost:3000";
// The email path needs real Privy, which needs an app id and an allowed origin — neither exists on
// the local fixture. The deployed site has both, so that one screen is captured from there.
const LIVE = "https://zhxinyue29.github.io/peerproof";

const SIZES = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

/// A minimal EIP-1193 stand-in. It is enough to make hasInjectedWallet() true, which is all the
/// identity gate checks before offering the wallet route — so the screenshot shows the state
/// somebody with MetaMask installed actually meets.
const FAKE_WALLET = () => {
  Object.defineProperty(window, "ethereum", {
    value: {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts")
          return ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"];
        if (method === "eth_chainId") return "0x7a69";
        return null;
      },
      on: () => {},
      removeListener: () => {},
    },
    configurable: true,
  });
};

const SHOTS = [
  {
    id: "11-identity-wallet",
    base: LOCAL,
    path: "/?event=4",
    wallet: true,
    marks: [
      { n: 1, text: "can't hold a passkey key" },
      { n: 2, text: "Continue with my wallet" },
      { n: 3, text: "why?" },
    ],
  },
  {
    id: "12-identity-none",
    base: LOCAL,
    path: "/?event=4",
    marks: [
      { n: 1, text: "Open this on a phone" },
    ],
  },
  {
    id: "13-identity-email",
    base: LIVE,
    // Event 1 is the one still open on testnet; the identity gate only renders while registration
    // is open, so pointing at a closed event captures the wrong branch.
    path: "/?event=1",
    marks: [
      { n: 1, text: "Sign in with your email" },
      { n: 2, text: "Continue with email" },
      { n: 3, text: "Use a browser wallet" },
    ],
  },
  {
    id: "14-privy-modal",
    base: LIVE,
    // Event 1 is the one still open on testnet; the identity gate only renders while registration
    // is open, so pointing at a closed event captures the wrong branch.
    path: "/?event=1",
    clickEmail: true,
    marks: [],
  },
];

const BADGE_CSS = `
.pp-badge{position:absolute;z-index:2147483000;width:26px;height:26px;border-radius:999px;
background:#ff3d71;color:#fff;font:700 14px/26px -apple-system,system-ui,sans-serif;
text-align:center;box-shadow:0 0 0 3px rgba(255,61,113,.28);pointer-events:none}
.pp-ring{position:absolute;z-index:2147482999;border:2px solid rgba(255,61,113,.65);
border-radius:10px;pointer-events:none}
`;

const browser = await chromium.launch();
fs.mkdirSync(OUT, { recursive: true });

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });

  for (const shot of SHOTS) {
    const page = await ctx.newPage();
    if (shot.wallet) await page.addInitScript(FAKE_WALLET);
    try {
      await page.goto(shot.base + shot.path, { waitUntil: "networkidle", timeout: 40000 });
      await page.addStyleTag({
        content: "nextjs-portal,[data-nextjs-toast]{display:none!important}" + BADGE_CSS,
      });
      await page.waitForTimeout(3500);

      if (shot.clickEmail) {
        const b = page.getByRole("button", { name: /continue with email/i });
        if (await b.count()) {
          await b.first().click();
          // Privy's modal is an iframe; give it room to load rather than racing it.
          await page.waitForTimeout(6000);
        }
      }

      const missing = await page.evaluate((marks) => {
        const out = [];
        for (const m of marks) {
          const needle = m.text.toLowerCase();
          const has = (el) => (el?.textContent || "").toLowerCase().includes(needle);
          const el = [...document.querySelectorAll("body *")].filter(
            (e) => has(e) && ![...e.children].some(has),
          )[0];
          if (!el) { out.push(m.n + ":" + m.text); continue; }
          const b = el.getBoundingClientRect();
          const t = b.top + scrollY, l = b.left + scrollX;
          const ring = document.createElement("div");
          ring.className = "pp-ring";
          Object.assign(ring.style, {
            top: `${t - 6}px`, left: `${l - 8}px`,
            width: `${b.width + 16}px`, height: `${b.height + 12}px`,
          });
          document.body.appendChild(ring);
          const badge = document.createElement("div");
          badge.className = "pp-badge";
          badge.textContent = String(m.n);
          Object.assign(badge.style, { top: `${t - 18}px`, left: `${Math.max(2, l - 20)}px` });
          document.body.appendChild(badge);
        }
        return out;
      }, shot.marks);

      const file = `${OUT}/${shot.id}-${size.name}.png`;
      await page.screenshot({ path: file, fullPage: !shot.clickEmail });
      console.log(
        `  ${shot.id}-${size.name}  ${Math.round(fs.statSync(file).size / 1024)}KB` +
          (missing.length ? `  MISSING ${missing.join(", ")}` : ""),
      );
    } catch (e) {
      console.log(`  ${shot.id}-${size.name}  FAILED: ${String(e).slice(0, 90)}`);
    }
    await page.close();
  }
  await ctx.close();
}

await browser.close();
