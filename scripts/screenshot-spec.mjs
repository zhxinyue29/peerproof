import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "/home/liyakun/文档/Monad_Circle/docs/screens";
const BASE = "http://localhost:3000";

/// Event ids used to come from literals here, and fixture events age: a window that was open the
/// day the pictures were taken is closed the next, so a re-run quietly produced the wrong screen
/// for three frames and the spec described states the images no longer showed. scripts/dev-shots.sh
/// builds the states and writes their ids; this file asks for a state by name.
const FIX = JSON.parse(fs.readFileSync(`${OUT}/fixture.json`, "utf8"));

const SIZES = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

/// Each entry marks a module with a number that matches the table in the spec, so a designer reads
/// "③ PAYOUTS" and can see exactly which block that is instead of hunting for it.
///
/// Anchors are text the module contains, because text survives a layout change in a way that
/// coordinates do not.
const SHOTS = [
  {
    id: "01-events",
    path: "/events/",
    marks: [
      { n: 1, text: "PEERPROOF" },
      { n: 2, text: "OPEN NOW" },
      { n: 3, text: "Web3 设计工作坊" },
      { n: 4, text: "to join" },
      { n: 5, text: "finished" },
      { n: 6, text: "Titles come from a contract" },
    ],
  },
  {
    id: "02-event",
    path: `/?event=${FIX.open}`,
    marks: [
      { n: 1, text: "Web3 设计工作坊" },
      { n: 2, text: "Put a deposit down" },
      { n: 3, text: "REGISTERED" },
      { n: 4, text: "DEPOSIT TO HOLD A PLACE" },
      { n: 5, text: "can't hold a passkey key" },
      { n: 6, text: "Attendance is decided by the people" },
    ],
  },
  {
    id: "03-event-signed-in",
    path: `/?event=${FIX.open}&dev=1`,
    devKey: true,
    // Funded but registered nowhere, so the call to action is what renders.
    entropy: "ef",
    marks: [
      { n: 1, text: "and register" },
      { n: 2, text: "you never see a gas prompt" },
    ],
  },
  {
    id: "04-organizer-dashboard",
    path: "/organizer/?dev=1",
    devKey: true,
    marks: [
      { n: 1, text: "Dashboard" },
      { n: 2, text: "Registered" },
      { n: 3, text: "Held in escrow" },
      { n: 4, text: "Deposit per attendee" },
      { n: 5, text: "PAYOUTS" },
    ],
  },
  {
    id: "05-organizer-new",
    path: "/organizer/?dev=1",
    devKey: true,
    tab: "new event",
    marks: [
      { n: 1, text: "1 · ABOUT THE EVENT" },
      { n: 2, text: "TITLE" },
      { n: 3, text: "2 · THE RULES" },
      { n: 4, text: "DEPOSIT (MON)" },
      { n: 5, text: "DOORS OPEN IN (MINS)" },
      { n: 6, text: "RUNS FOR (MINS)" },
      { n: 7, text: "Take walk-ins" },
      { n: 8, text: "Create event" },
    ],
  },
  {
    // The check-in screen before the doors open. It was a screen of disabled buttons at 35%
    // opacity, which read as "this feature does not exist" rather than "not yet" — so it is now
    // a state of its own, and a state of its own needs a frame of its own.
    id: "06b-floor-locked",
    path: `/floor/?event=${FIX.locked}&dev=1`,
    devKey: true,
    marks: [
      { n: 1, text: "refreshes in" },
      { n: 2, text: "Doors open in" },
      { n: 3, text: "it unlocks on its own" },
    ],
  },
  {
    id: "06-floor",
    path: `/floor/?event=${FIX.live}&dev=1`,
    devKey: true,
    marks: [
      { n: 1, text: "refreshes in" },
      { n: 2, text: "Scan someone" },
      { n: 3, text: "Scan venue" },
      { n: 4, text: "VOUCHED FOR YOU" },
      { n: 5, text: "confirmed present" },
    ],
  },
  {
    id: "07-venue",
    path: "/venue/",
    // The fixture supplies a beacon key through the environment, so this is the running display —
    // which is the state that matters anyway: it is what gets projected at the door.
    marks: [
      { n: 1, text: "Scan me to check in" },
      { n: 2, text: "refreshes in" },
      { n: 3, text: "beacon 0x" },
      { n: 4, text: "forget this key" },
    ],
  },
  {
    id: "08-verify",
    path: `/verify/?event=${FIX.settled}`,
    marks: [
      { n: 1, text: "confirmed present" },
      { n: 2, text: "vouches received" },
      { n: 3, text: "settlement arithmetic" },
      { n: 4, text: "every vouch" },
    ],
  },
  {
    id: "09-funding",
    path: `/?event=${FIX.open}&dev=1`,
    devKey: true,
    // A different derived identity, deliberately unfunded — this screen only exists for somebody
    // who has just signed in and has nothing.
    entropy: "cd",
    marks: [
      { n: 1, text: "Not enough MON" },
      { n: 2, text: "cannot be covered for you" },
      { n: 3, text: "fund this address" },
    ],
  },
  {
    id: "10-payout",
    path: `/floor/?event=${FIX.settled}&dev=1`,
    devKey: true,
    marks: [
      { n: 1, text: "PAID OUT" },
      { n: 2, text: "MON" },
      { n: 3, text: "from the people who didn" },
      { n: 4, text: "Nobody approved this" },
    ],
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
    const entropy = (shot.entropy ?? "ab").repeat(32);
    await page.addInitScript((e) => {
      sessionStorage.setItem("peerproof.dev.entropy", e);
    }, entropy);
    try {
      await page.goto(BASE + shot.path, { waitUntil: "networkidle", timeout: 30000 });
      if (shot.clearBeacon) {
        // localStorage has no origin before the first navigation, so this cannot be an init
        // script — clear it and reload to get the state an organizer meets first.
        await page.evaluate(() => localStorage.removeItem("peerproof.beacon.pk"));
        await page.reload({ waitUntil: "networkidle" });
      }
      await page.addStyleTag({
        content: "nextjs-portal,[data-nextjs-toast]{display:none!important}" + BADGE_CSS,
      });

      if (shot.devKey) {
        const btn = page.getByRole("button", { name: /throwaway local key/i });
        if (await btn.count()) {
          await btn.first().click();
          await page.waitForTimeout(2500);
        }
      }
      if (shot.tab) {
        const t = page.getByRole("button", { name: new RegExp(shot.tab, "i") });
        if (await t.count()) {
          await t.first().click();
          await page.waitForTimeout(800);
        }
      }
      await page.waitForTimeout(3000);

      const missing = await page.evaluate((marks) => {
        const notFound = [];
        for (const m of marks) {
          // Deepest element containing the text, so the ring hugs the module rather than the page.
          // CSS uppercases several labels, so the DOM text is not what the screenshot shows.
          const needle = m.text.toLowerCase();
          const has = (el) => (el?.textContent || "").toLowerCase().includes(needle);
          const all = [...document.querySelectorAll("body *")].filter(
            (el) => has(el) && ![...el.children].some(has),
          );
          const el = all[0];
          if (!el) {
            notFound.push(m.n + ":" + m.text);
            continue;
          }
          const box = el.getBoundingClientRect();
          const top = box.top + window.scrollY;
          const left = box.left + window.scrollX;

          const ring = document.createElement("div");
          ring.className = "pp-ring";
          Object.assign(ring.style, {
            top: `${top - 6}px`,
            left: `${left - 8}px`,
            width: `${box.width + 16}px`,
            height: `${box.height + 12}px`,
          });
          document.body.appendChild(ring);

          const badge = document.createElement("div");
          badge.className = "pp-badge";
          badge.textContent = String(m.n);
          Object.assign(badge.style, {
            top: `${top - 18}px`,
            left: `${Math.max(2, left - 20)}px`,
          });
          document.body.appendChild(badge);
        }
        return notFound;
      }, shot.marks);

      const file = `${OUT}/${shot.id}-${size.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(
        `  ${shot.id}-${size.name}  ${kb}KB` + (missing.length ? `  MISSING ${missing.join(", ")}` : ""),
      );
    } catch (e) {
      console.log(`  ${shot.id}-${size.name}  FAILED: ${String(e).slice(0, 80)}`);
    }
    await page.close();
  }
  await ctx.close();
}

await browser.close();
