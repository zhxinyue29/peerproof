"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/// Shared chrome for all five screens, so the visual language changes in one place.
///
/// Two constraints drive the choices here. The floor screen is used standing up, one-handed, in a
/// dim room with a camera open — so touch targets are 44px, the safe-area inset is respected, and
/// nothing important sits at the very bottom of the viewport. And the whole app gets filmed, so
/// type sizes are chosen to read on camera rather than to fit more in.

/* ------------------------------------------------------------------ */
/*                              Layout                                */
/* ------------------------------------------------------------------ */

/// Two shapes, deliberately.
///
/// `handheld` is for the screens somebody actually holds — the floor and the venue display. Those
/// stay a phone-width column even on a desktop, because widening them would only stretch a QR
/// code and a countdown across a monitor.
///
/// The default is a real page: it grows to a readable measure and lets its children go
/// multi-column. A 430px strip centred in a 1920px window is the tell of a mobile-only build, and
/// judges will open this on a laptop.
export function Shell({
  children,
  handheld,
  stage,
  center,
}: {
  children: React.ReactNode;
  /** Phone width at every breakpoint. For screens only ever held in a hand. */
  handheld?: boolean;
  /** Phone width, then grows — for the venue display, which runs on whatever screen is at the
   *  door: a spare phone, a laptop, or a projector. A QR nobody can scan from across the room is
   *  the same as no beacon at all. */
  stage?: boolean;
  center?: boolean;
}) {
  const width = handheld
    ? "max-w-[440px] gap-5"
    : stage
      ? "max-w-[440px] gap-5 md:max-w-2xl md:gap-7 lg:max-w-3xl"
      : "max-w-[440px] gap-5 md:max-w-5xl md:gap-7";
  return (
    <main
      className={`mx-auto flex min-h-dvh flex-col px-5 sm:px-8 ${width} ${
        center ? "items-center justify-center" : ""
      }`}
      style={{
        paddingTop: "max(1.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </main>
  );
}

/// Desktop-only two-column split. Collapses to a single column on phones, which is why every page
/// can use one layout instead of two.
export function Split({
  main,
  side,
  even,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
  /// Near-equal columns. The public record puts the proof graph and the settlement arithmetic
  /// beside each other, and neither is the subordinate of the other — the graph is the evidence and
  /// the arithmetic is what it adds up to.
  even?: boolean;
}) {
  return (
    <div className={`grid gap-5 md:items-start md:gap-7 ${even ? "md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : "md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"}`}>
      <div className="flex flex-col gap-5">{main}</div>
      <div className="flex flex-col gap-5 md:sticky md:top-8">{side}</div>
    </div>
  );
}

/// A slim, consistent bar so the five screens read as one product rather than five pages.
export function AppHeader({
  title,
  back,
  right,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="-mx-5 flex items-center gap-3 border-b border-line px-5 pb-3.5 sm:-mx-8 sm:px-8">
      {back ? (
        <Link
          href={back}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-dim active:bg-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      ) : (
        <span className="flex h-11 items-center text-[15px] font-medium tracking-[0.14em] text-faint">
          PEERPROOF
        </span>
      )}
      {/* A root screen shows the brand, a sub-screen shows where you came from — but both show
          the title. It used to be dropped on root screens, which left the directory with no
          heading at all and made the prop look optional when it is not. */}
      <span className="flex-1 truncate text-[16px] font-medium">{title}</span>
      {right}
    </header>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-accent-2">{children}</p>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-5 md:p-[22px] ${className}`}>
      {children}
    </section>
  );
}

export function Footer({ children }: { children: React.ReactNode }) {
  return (
    <footer className="mt-auto space-y-3 border-t border-line pt-5 text-[15px] leading-relaxed text-dim">
      {children}
    </footer>
  );
}

export function FooterLinks({ items }: { items: Array<{ href: string; label: string }> }) {
  return (
    <div className="flex gap-4 text-xs text-faint">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="underline decoration-line-2">
          {i.label}
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                             Feedback                               */
/* ------------------------------------------------------------------ */

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-line-2 bg-raised text-dim",
    warn: "border-warn/30 bg-warn/10 text-warn",
    bad: "border-bad/30 bg-bad/10 text-bad",
    ok: "border-ok/30 bg-ok/10 text-ok",
  } as const;
  return (
    <p role={tone === "bad" ? "alert" : undefined} className={`rounded-xl border px-4 py-3.5 text-[15px] leading-relaxed ${tones[tone]}`}>
      {children}
    </p>
  );
}

/// Transient confirmation. A transaction landing needs to feel like something happened, not just
/// leave a new row somewhere below the fold.
export function Flash({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 2600);
    return () => clearTimeout(id);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-5"
      style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-full border border-ok/40 bg-ok/15 px-4 py-2.5 text-[15px] font-medium text-ok backdrop-blur">
        {message}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`inline-block animate-pulse rounded bg-line-2 ${className}`} />;
}

/* ------------------------------------------------------------------ */
/*                             Controls                               */
/* ------------------------------------------------------------------ */

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "warn";
  className?: string;
}) {
  const styles = {
    primary: "bg-accent text-white shadow-[0_0_0_1px_rgba(142,123,255,0.35)] active:bg-accent/80",
    ghost: "border border-line-2 text-dim active:bg-panel",
    warn: "bg-warn text-ink active:bg-warn/80",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[46px] rounded-xl px-4 text-[16px] font-medium transition-[background-color,transform] duration-100 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-35 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-[46px] items-center justify-center rounded-xl bg-accent px-4 text-[16px] font-medium text-white transition-transform duration-100 active:scale-[0.985]"
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  value,
  onChange,
  hint,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium uppercase tracking-wider text-faint">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        inputMode={mono ? "text" : "numeric"}
        className={`mt-1.5 min-h-[46px] w-full rounded-xl border border-line-2 bg-ink px-3.5 text-fg outline-none focus:border-accent ${mono ? "font-mono text-xs" : ""}`}
      />
      {hint && <span className="mt-1 block text-[13px] text-faint">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*                              Data                                  */
/* ------------------------------------------------------------------ */

/// The one number a screen is about. Large enough to read at arm's length and on camera.
export function BigNumber({
  value,
  label,
  sub,
  loading,
}: {
  value?: React.ReactNode;
  label?: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div>
      {label && <Eyebrow>{label}</Eyebrow>}
      <p className="mt-2 text-[46px] font-medium leading-none tracking-[-0.03em] tabular-nums md:text-[54px]">
        {loading ? <Skeleton className="h-11 w-40 align-middle" /> : value}
      </p>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-dim">{sub}</p>}
    </div>
  );
}

/// Page title. Monad's own surfaces set these very large and very tight; at 27px ours read as a
/// form label rather than a headline.
export function Display({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h1 className="text-[34px] font-medium leading-[1.06] tracking-[-0.035em] md:text-[56px]">
        {children}
      </h1>
      {sub && (
        <p className="text-[15px] leading-relaxed text-dim md:max-w-[52ch] md:text-[17px]">{sub}</p>
      )}
    </div>
  );
}

export function Stat({
  value,
  label,
  loading,
}: {
  value?: string;
  label: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel/70 py-4 text-center backdrop-blur-sm">
      <div className="text-[27px] font-semibold leading-none tabular-nums">
        {loading ? <Skeleton className="h-7 w-14 align-middle" /> : value}
      </div>
      {/* `dim`, not `faint`. These labels say what the number is; the spec's rule is that essential
          information never sits in low-contrast grey, and a number without its unit is not
          information. */}
      <div className="mt-1.5 text-[13px] text-dim">{label}</div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-[15px] leading-relaxed">
      <dt className="w-24 shrink-0 text-faint">{label}</dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}

export function KeyValue({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[15px]">
      <span className="text-faint">{label}</span>
      <span className={strong ? "text-xl font-medium tabular-nums text-fg" : "tabular-nums text-dim"}>
        {value}
      </span>
    </div>
  );
}

/// A dot row that reads at a glance from a metre away — the floor screen's core state.
export function Dots({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="flex gap-1.5" aria-label={`${filled} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full transition-colors ${i < filled ? "bg-accent" : "bg-line-2"}`}
        />
      ))}
    </span>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    // Violet into green, left to right. The gradient is not decoration: these bars fill as a room
    // proves itself, and ending on the colour this app uses for "confirmed" makes a bar that is
    // nearly full look like what it is.
    <div className="h-2 overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent to-ok transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/// Copy-to-clipboard for addresses and keys, with the confirmation people expect.
export function CopyableCode({ value, tone = "fg" }: { value: string; tone?: "fg" | "ok" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={`block w-full break-all rounded-xl border border-line bg-ink p-3 text-left font-mono text-[13px] leading-relaxed ${tone === "ok" ? "text-ok" : "text-dim"}`}
    >
      {value}
      <span className="mt-1.5 block font-sans text-[13px] text-faint">
        {copied ? "copied" : "tap to copy"}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*                        Progressive disclosure                      */
/* ------------------------------------------------------------------ */

/// Explanation that is available without being in the way.
///
/// The event page used to state its entire case before the deposit: how attendance is decided, why
/// the codes rotate, what the organizer cannot do. All of it true, all of it load-bearing, and all
/// of it between somebody and the one decision they came to make. It is the same words, one tap
/// away.
export function Accordion({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-line">
      <summary className="flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-4 py-3">
        <span>
          <span className="block text-[16px] font-medium">{title}</span>
          {sub && <span className="mt-0.5 block text-[14px] text-dim">{sub}</span>}
        </span>
        <span className="shrink-0 text-faint transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-2.5 pb-4 text-[15px] leading-relaxed text-dim">{children}</div>
    </details>
  );
}

/// A bottom sheet on a phone, a centred dialog on a desktop.
///
/// Used where a choice only becomes relevant at the moment it is made — sign-in belongs to pressing
/// Join, not to reading about an event.
export function Sheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[520px] space-y-4 rounded-[22px] border border-line-2 bg-raised p-5 shadow-[0_-24px_70px_rgba(0,0,0,.45)] md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 className="text-[22px] font-medium tracking-tight md:text-[24px]">{title}</h2>
          {sub && <p className="text-[15px] leading-relaxed text-dim">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
