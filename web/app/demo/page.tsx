"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion } from "motion/react";
import TopNav from "@/components/TopNav";
import DemoGraph from "@/components/demo/DemoGraph";
import DemoSettlement from "@/components/demo/DemoSettlement";
import { Button, LinkButton } from "@/components/ui";
import { DEMO_DEPOSIT, DEMO_PEOPLE, DEMO_SCANS, demoSettlement } from "@/lib/demo";
import { mon } from "@/lib/format";
import { useMotionPrefs } from "@/lib/motion";
import { useT } from "@/lib/i18n";

/// The walkthrough: the whole loop — join, meet, vouch, settle — for somebody with no wallet, no
/// second account and no room full of people. A judge, usually, with ninety seconds.
///
/// A product tour, not a tutorial. Nothing is masked, nothing has to be clicked in order, no control
/// is spotlit: four tabs, any of which can be opened at any time, and the page around them is the
/// app's own — its top bar, its type, its hairlines. The pictures are the app's screens drawn as
/// schematics, and every one of them says on its face that it is illustrative.
///
/// Nothing here touches a wallet or a chain. There is no transaction to send and none is implied:
/// the people are letters, and no address, hash, block or explorer link appears anywhere. The
/// scenario itself (`lib/demo.ts`) is one the escrow could actually produce, and the figures are
/// computed the way the contract computes them.

const STEPS = [1, 2, 3, 4] as const;
type Step = (typeof STEPS)[number];

/// Spelled out as four `t()` calls rather than assembled from the number, so every key is a literal
/// that both the type checker and `scripts/i18n-audit.mjs` can see.
function useStepNames(): Record<Step, string> {
  const t = useT();
  return { 1: t("demo.s1"), 2: t("demo.s2"), 3: t("demo.s3"), 4: t("demo.s4") };
}

export default function DemoPage() {
  const t = useT();
  const names = useStepNames();
  const m = useMotionPrefs();
  const [step, setStep] = useState<Step>(1);
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  // From the buttons under the step, somebody has usually scrolled down to reach them; the next
  // step starts at its top, so take them back up to it — but only if they are below it.
  const turn = (to: Step) => {
    setStep(to);
    const el = panel.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: "start", behavior: m.reduced ? "auto" : "smooth" });
    }
  };

  // The tab row is a real tablist: arrows move along it, Home and End jump to the ends.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = step - 1;
    const to =
      e.key === "ArrowRight" ? (i + 1) % 4 : e.key === "ArrowLeft" ? (i + 3) % 4 : e.key === "Home" ? 0 : e.key === "End" ? 3 : null;
    if (to === null) return;
    e.preventDefault();
    setStep(STEPS[to]);
    tabs.current[to]?.focus();
  };

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 md:px-[17px]">
        <TopNav page={t("demo.navTitle")} />

        <main className="pb-24 pt-6 md:pt-10">
          <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-accent-2">{t("demo.eyebrow")}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line pb-5">
            <div className="min-w-0 max-w-[720px]">
              <h1
                className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] text-fg md:text-[34px]"
                style={{ fontFamily: '"Montserrat", var(--font-sans)' }}
              >
                {t("demo.title")}
              </h1>
              <p className="mt-3 text-[16px] leading-relaxed text-dim">{t("demo.lead")}</p>
            </div>
            <DemoDisclaimer />
          </div>

          {/* ── the four steps ─────────────────────────────────────────────────
              Four columns at every width: the labels are one short word in either language, so
              they fit a phone without scrolling sideways, and the row never reflows between steps. */}
          <div className="mt-6">
            <div
              role="tablist"
              aria-label={t("demo.stepsLabel")}
              className="grid grid-cols-4 gap-1 sm:gap-2"
              onKeyDown={onTabKey}
            >
              {STEPS.map((s) => {
                const on = s === step;
                const passed = s < step;
                return (
                  <button
                    key={s}
                    ref={(el) => {
                      tabs.current[s - 1] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`demo-tab-${s}`}
                    aria-selected={on}
                    aria-controls="demo-panel"
                    tabIndex={on ? 0 : -1}
                    onClick={() => setStep(s)}
                    className={`flex min-h-[52px] min-w-0 flex-col items-start justify-center gap-0.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 sm:flex-row sm:items-center sm:gap-2.5 sm:px-3.5 ${
                      on ? "bg-accent/15 text-fg" : "text-dim hover:bg-panel hover:text-fg"
                    }`}
                  >
                    <span
                      className={`text-[13px] font-semibold tabular-nums ${
                        on ? "text-accent-2" : passed ? "text-ok" : "text-faint"
                      }`}
                    >
                      {String(s).padStart(2, "0")}
                    </span>
                    <span className="max-w-full truncate text-[15px] font-semibold sm:text-[16px]">
                      {names[s]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                  style={{ width: `${(step / STEPS.length) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-[13px] tabular-nums text-faint" aria-live="polite">
                {t("demo.progress", { n: step, total: STEPS.length })}
              </span>
            </div>
          </div>

          <div
            ref={panel}
            id="demo-panel"
            role="tabpanel"
            aria-labelledby={`demo-tab-${step}`}
            className="mt-8 scroll-mt-28"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: m.reduced ? 0.1 : 0.18, ease: "easeOut" }}
              >
                {step === 1 && <StepJoin />}
                {step === 2 && <StepMeet />}
                {step === 3 && <StepVouch />}
                {step === 4 && <StepSettle />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* On a phone the last step's way out takes its own full-width row: beside "Previous" at
              390px both labels broke onto two lines inside their buttons. */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button
              variant="ghost"
              className="whitespace-nowrap"
              disabled={step === 1}
              onClick={() => turn((step - 1) as Step)}
            >
              ← {t("demo.prev")}
            </Button>
            {step < 4 ? (
              <Button className="whitespace-nowrap" onClick={() => turn((step + 1) as Step)}>
                {t("demo.next")} →
              </Button>
            ) : (
              <div className="w-full whitespace-nowrap sm:w-auto">
                <LinkButton href="/verify?demo=1">{t("demo.proofCta")} →</LinkButton>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                              Steps                                 */
/* ------------------------------------------------------------------ */

function StepJoin() {
  const t = useT();
  const s = demoSettlement();
  return (
    <StepLayout
      n={1}
      title={t("demo.s1Title")}
      body={t("demo.s1Body")}
      points={[t("demo.s1Point1"), t("demo.s1Point2"), t("demo.s1Point3")]}
    >
      <Mock label={t("demo.mockEventPage")}>
        <p className="text-[20px] font-semibold leading-tight tracking-[-0.015em]">{t("demo.eventName")}</p>
        <dl className="mt-4">
          <Fact term={t("demo.labelTime")} value={t("demo.eventTime")} />
          <Fact term={t("demo.labelPlace")} value={t("demo.eventPlace")} />
          <Fact term={t("demo.labelDeposit")} value={mon(DEMO_DEPOSIT)} />
          <Fact term={t("demo.labelRule")} value={t("demo.rule")} />
          <Fact term={t("demo.labelRegistered")} value={t("demo.registeredCount", { n: s.registered })} last />
        </dl>
        {/* A picture of the button, not a button: it is drawn at the weight of a disabled control
            and cannot be focused or pressed, and the line under it says what the real one does. */}
        <div
          aria-hidden
          className="mt-5 flex min-h-[46px] items-center justify-center rounded-lg bg-accent/35 px-4 text-[16px] font-medium text-white/75"
        >
          {t("demo.registerCta", { amount: mon(DEMO_DEPOSIT) })}
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-faint">{t("demo.registerNote")}</p>
      </Mock>
    </StepLayout>
  );
}

function StepMeet() {
  const t = useT();
  return (
    <StepLayout
      n={2}
      title={t("demo.s2Title")}
      body={t("demo.s2Body")}
      points={[t("demo.s2Point1"), t("demo.s2Point2"), t("demo.s2Point3")]}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Mock label={t("demo.mockVenue")}>
          <div className="flex flex-col items-center gap-4 text-center sm:items-start sm:text-left">
            <DemoQr />
            <div className="min-w-0">
              <p className="text-[17px] font-semibold">{t("demo.eventName")}</p>
              <p className="mt-1 text-[15px] text-dim">{t("demo.venueScan")}</p>
              <p className="mt-2 text-[13px] text-faint">{t("demo.venueRotates")}</p>
            </div>
          </div>
        </Mock>
        <Mock label={t("demo.mockPhone")}>
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold text-ok">{t("demo.phoneCheckedIn")}</p>
              <p className="mt-0.5 text-[15px] text-dim">{t("demo.eventName")}</p>
              <p className="mt-2 text-[14px] text-faint">
                {t("demo.phoneWho", { who: t("demo.participant", { id: "A" }), time: DEMO_PEOPLE[0].arrived ?? "" })}
              </p>
            </div>
          </div>
        </Mock>
      </div>

      <div className="mt-6">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-faint">{t("demo.arrivals")}</p>
        <ul className="mt-1 grid gap-x-10 sm:grid-cols-2">
          {DEMO_PEOPLE.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2.5 text-[15px]">
              <span className={p.arrived ? "text-dim" : "text-faint"}>{t("demo.participant", { id: p.id })}</span>
              <span className={`tabular-nums ${p.arrived ? "text-fg" : "text-faint"}`}>
                {p.arrived ?? t("demo.notArrived")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </StepLayout>
  );
}

function StepVouch() {
  const t = useT();
  const absent = DEMO_PEOPLE.filter((p) => !p.arrived);
  return (
    <StepLayout
      n={3}
      title={t("demo.s3Title")}
      body={t("demo.s3Body")}
      points={[t("demo.s3Point1"), t("demo.s3Point2"), t("demo.s3Point3")]}
    >
      <DemoGraph />
      <ul className="mt-5 grid gap-x-10 sm:grid-cols-2">
        {DEMO_SCANS.map(({ from, to }) => (
          <li key={`${from}${to}`} className="border-b border-line/70 py-2.5 text-[15px] text-dim">
            {t("demo.scanned", { from: t("demo.participant", { id: from }), to: t("demo.participant", { id: to }) })}
          </li>
        ))}
        {absent.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2.5 text-[15px]">
            <span className="min-w-0 text-faint">{t("demo.participant", { id: p.id })}</span>
            <span className="shrink-0 text-[14px] text-faint">{t("demo.notArrived")}</span>
          </li>
        ))}
      </ul>
    </StepLayout>
  );
}

function StepSettle() {
  const t = useT();
  const s = demoSettlement();
  return (
    <StepLayout
      n={4}
      title={t("demo.s4Title")}
      body={t("demo.s4Body")}
      points={[
        t("demo.s4Point1", { amount: mon(s.forfeited), n: s.confirmed }),
        t("demo.s4Point2"),
        t("demo.s4Point3"),
      ]}
    >
      <div className="border-b border-line pb-3">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-faint">{t("verify.settlement")}</h3>
      </div>
      <div className="pt-6">
        <DemoSettlement size="md" />
      </div>
    </StepLayout>
  );
}

/* ------------------------------------------------------------------ */
/*                              Pieces                                */
/* ------------------------------------------------------------------ */

/// Always on screen above the steps, in both languages' own words: what this is and what it is not.
function DemoDisclaimer() {
  const t = useT();
  return (
    <p className="inline-flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full border border-warn/30 bg-warn/10 px-3.5 py-2 text-[14px] font-medium text-warn">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 11v5.5M12 7.6v.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{t("demo.illustrative")}</span>
      <span aria-hidden>·</span>
      <span>{t("demo.noTx")}</span>
    </p>
  );
}

/// Copy on the left, the picture on the right; stacked on a phone with the copy first, because the
/// picture only makes sense once you know what it is of.
function StepLayout({
  n,
  title,
  body,
  points,
  children,
}: {
  n: Step;
  title: string;
  body: string;
  points: string[];
  children: React.ReactNode;
}) {
  const names = useStepNames();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold tabular-nums text-accent-2">
          {String(n).padStart(2, "0")} · {names[n]}
        </p>
        <h2 className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.02em] md:text-[28px]">{title}</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-dim">{body}</p>
        <ul className="mt-5 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-dim">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-2" />
              <span className="min-w-0">{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/// A screen of the app, drawn as a schematic. The one frame on the page, and it says on its face
/// that it is illustrative, so a screenshot of it cannot pass for the real thing.
function Mock({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="min-w-0 truncate text-[13px] font-medium text-faint">{label}</span>
        <span className="shrink-0 rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[13px] font-medium text-warn">
          {t("demo.illustrativeTag")}
        </span>
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  );
}

function Fact({ term, value, last = false }: { term: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 py-2.5 ${last ? "" : "border-b border-line/70"}`}>
      <dt className="shrink-0 text-[14px] text-faint">{term}</dt>
      <dd className="min-w-0 text-right text-[15px] text-fg">{value}</dd>
    </div>
  );
}

/// The venue screen's code, drawn by the same encoder as the real one — but what it encodes is a
/// sentence saying it is a demo. Scanned, it checks nobody in; it tells the scanner so.
function DemoQr() {
  const t = useT();
  const payload = t("demo.qrPayload");
  const [rendered, setRendered] = useState<{ payload: string; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    // The venue screen's own settings (see RotatingCode), at the size this picture needs.
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 360,
      color: { dark: "#0a0713", light: "#ffffff" },
    })
      .then((url) => live && setRendered({ payload, url }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [payload]);

  const url = rendered?.payload === payload ? rendered.url : null;
  return (
    <span className="block h-[140px] w-[140px] shrink-0 overflow-hidden rounded-xl bg-white p-1.5">
      {url && (
        <span
          role="img"
          aria-label={t("demo.qrAlt")}
          className="block h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${url})` }}
        />
      )}
    </span>
  );
}
