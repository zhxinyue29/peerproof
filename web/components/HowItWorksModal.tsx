"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import StepFigure from "@/components/StepFigure";
import { useMotionPrefs } from "@/lib/motion";
import { useT } from "@/lib/i18n";

/// "How does this work?" — the whole mechanism, on demand rather than down the page.
///
/// This used to be a section every visitor scrolled past whether or not they wanted it, which made
/// the landing page long and pushed the thing somebody came for — the events — below three panels
/// of explanation. Behind a link it costs nothing to the people who already understand and is one
/// tap away for the people who do not.
///
/// A real `<dialog>`, not a div with a high z-index. `showModal()` is what gives inertness to the
/// page behind it, focus trapping, Escape, and a top-layer that no stacking context can defeat —
/// all things a hand-rolled overlay gets wrong in a way that only shows up with a keyboard.
export default function HowItWorksModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const m = useMotionPrefs();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const steps = [
    { title: t("home.step1Title"), body: t("home.step1Body") },
    { title: t("home.step2Title"), body: t("home.step2Body") },
    { title: t("home.step3Title"), body: t("home.step3Body") },
  ];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop closes it. The dialog element's own box is the whole viewport, so the
      // test is whether the click landed outside the panel rather than on the element itself.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(92vw,900px)] rounded-2xl border border-line-2 bg-panel p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <motion.div
        initial={m.reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: m.reduced ? 0.15 : 0.28, ease: "easeOut" }}
        className="p-6 md:p-8"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 space-y-2">
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] md:text-[28px]">
              {t("home.howItWorks")}
            </h2>
            <p className="max-w-[58ch] text-[16px] leading-relaxed text-dim">
              {t("home.howItWorksSub")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-2 text-dim transition-colors hover:border-accent hover:text-fg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="min-w-0 overflow-hidden rounded-2xl border border-line bg-ink/40 p-4"
            >
              <div className="rounded-xl border border-line bg-ink/40 px-3 py-4">
                <StepFigure step={(i + 1) as 1 | 2 | 3} />
              </div>
              <span className="mt-3 block text-[14px] font-medium tabular-nums text-accent-2">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1.5 text-[17px] font-semibold tracking-[-0.01em]">{s.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-dim">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid gap-4 border-t border-line pt-5 md:grid-cols-2">
          {[
            { key: "home.custodyNote", tone: "ok" as const },
            { key: "home.bothRoles", tone: "accent" as const },
          ].map(({ key, tone }) => (
            <div key={key} className="relative overflow-hidden rounded-xl border border-line bg-ink/30 p-4">
              <span
                aria-hidden
                className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${
                  tone === "ok" ? "bg-ok/60" : "bg-accent/60"
                }`}
              />
              <p className="pl-3 text-[15px] leading-relaxed text-dim">{t(key)}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </dialog>
  );
}
