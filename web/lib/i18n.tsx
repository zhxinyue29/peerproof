"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, type Dict } from "@/lib/dict/en";
import { zh } from "@/lib/dict/zh";

/// Two languages, both shipped in the bundle.
///
/// No route segments, no `next-intl`, no per-locale build. This is a static export served from one
/// directory, and half the traffic arrives by QR code at a venue — a language prefix would turn
/// every printed link into a link that guesses wrong for somebody. The dictionaries are a few
/// kilobytes of text; carrying both is cheaper than routing around them.

export type Lang = "en" | "zh";

const LANGS: Record<Lang, Dict> = { en, zh };

/// Namespaced like every other key this app puts in localStorage (`peerproof.session.*`).
const STORAGE_KEY = "peerproof.lang";

/// What the server renders, and therefore what the client's first render must also produce.
const SSR_LANG: Lang = "en";

type Vars = Record<string, string | number>;

/// `keyof Dict` gives autocomplete and catches typos; the `string` arm keeps keys assembled at
/// runtime — `t(\`organizer.${status}\`)` — from needing a cast. Anything unknown falls back to
/// itself at runtime, so the loose arm costs a wrong-looking label, never a crash.
export type TKey = keyof Dict | (string & NonNullable<unknown>);

export type TFn = (key: TKey, vars?: Vars) => string;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
};

const LanguageContext = createContext<Ctx | null>(null);

/// `{n}` → `3`. Deliberately not a format library: the only thing any string here needs is a
/// number or an already-formatted amount dropped into a slot, and `fiat()`/`mon()` in lib/format
/// have done the formatting long before the string gets here.
///
/// An unmatched placeholder is left as written rather than replaced with "undefined" — a stray
/// `{n}` reads as a bug to us and as noise to a user; `undefined` reads as broken to everyone.
function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

function lookup(lang: Lang, key: string, vars?: Vars): string {
  const hit = LANGS[lang][key as keyof Dict] ?? LANGS.en[key as keyof Dict];
  // The key itself is the last resort. It is ugly, which is the point: "floor.checkIn" on screen
  // is a missing translation somebody will report, and a blank space or "undefined" is not.
  return interpolate(hit ?? key, vars);
}

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "en" || v === "zh" ? v : null;
  } catch {
    // Private browsing throws on access. Losing the preference is fine; crashing the app is not.
    return null;
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Starts at the prerendered language and settles on the client. Resolving the real preference in
  // a `useState` initialiser would read localStorage during render — which does not exist at export
  // time, and which on the client produces markup that disagrees with the HTML React is hydrating.
  // A hydration mismatch here would blow away the whole tree on the one screen that has a camera
  // open in a dim room.
  const [lang, setLangState] = useState<Lang>(SSR_LANG);

  useEffect(() => {
    // Stored choice first: an explicit pick outranks what the browser reports, forever.
    const resolved = readStored() ?? (navigator.language?.startsWith("zh") ? "zh" : "en");
    // Mount is the earliest point localStorage and navigator are knowable, which is exactly the
    // case this rule cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resolved !== SSR_LANG) setLangState(resolved);
  }, []);

  // `<html lang>` is baked as "en" by the static export. Left wrong it picks the wrong CJK font on
  // a system that has both Japanese and Chinese installed, and makes a screen reader pronounce the
  // page in English — so it is corrected here rather than left to layout.tsx, which cannot know.
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Same as above — the switch still works for this session.
    }
  }, []);

  const t = useCallback<TFn>((key, vars) => lookup(lang, key as string, vars), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const FALLBACK: Ctx = {
  lang: "en",
  setLang: () => {},
  t: (key, vars) => lookup("en", key as string, vars),
};

let warned = false;

/// Falls back to English instead of throwing when no provider is above it.
///
/// The sibling `useIdentity` throws, and for identity that is right — a screen that cannot sign is
/// broken and should say so. Copy is not like that: a provider missed in one corner of the tree
/// should cost that corner its Chinese, not white-screen a venue display mid-event. The warning is
/// there so it still gets fixed.
export function useLang(): Ctx {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;

  if (process.env.NODE_ENV !== "production" && !warned) {
    warned = true;
    console.warn("useLang outside LanguageProvider — falling back to English.");
  }
  return FALLBACK;
}

/// For the common case, where a component wants the strings and not the switch.
export function useT(): TFn {
  return useLang().t;
}
