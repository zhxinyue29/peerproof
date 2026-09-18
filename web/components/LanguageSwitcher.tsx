"use client";

import { useLang, type Lang } from "@/lib/i18n";

/// A segmented pair, not a dropdown.
///
/// With exactly two options a `<select>` costs a tap to find out what the other one even is — and
/// the person who needs this control is by definition the one who cannot read the label on it. Both
/// choices stay visible and one tap apart.
const OPTIONS: Array<{ lang: Lang; short: string; nameKey: string; htmlLang: string }> = [
  // The visible text is the short form so this fits a mobile header, but the accessible name is the
  // language's full self-name from the dictionary — "EN" alone is not something a screen reader
  // should be reading out as a choice of language.
  { lang: "en", short: "EN", nameKey: "lang.en", htmlLang: "en" },
  { lang: "zh", short: "中文", nameKey: "lang.zh", htmlLang: "zh-Hans" },
];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useLang();

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-line-2 bg-raised p-0.5 ${className}`}
    >
      {OPTIONS.map((o) => {
        const active = o.lang === lang;
        return (
          <button
            key={o.lang}
            type="button"
            // `aria-pressed` rather than a radiogroup: this is a toggle that acts immediately, and
            // there is no separate confirm step for a roving-focus radio set to feed.
            aria-pressed={active}
            aria-label={t(o.nameKey)}
            // Marks the label as being in its own language, so a screen reader switches voice and
            // the browser picks a CJK font for 中文 even while the page is still English.
            lang={o.htmlLang}
            onClick={() => setLang(o.lang)}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] px-2.5 text-[14px] font-medium transition-colors ${
              active
                ? // Filled rather than merely brighter: on a phone at arm's length in a dim room a
                  // contrast step alone does not read as "this one is selected".
                  "bg-accent/20 text-accent-2"
                : "text-faint active:bg-panel"
            }`}
          >
            {o.short}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSwitcher;
