"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

/// Tags as chips, the way the create sheet draws them: each one a pill with an ×, and a "+ 添加标签"
/// that turns into a field.
///
/// The value going in and out is still one comma-separated string, because that is what the
/// contract stores. Splitting into a token list on the way in would mean deciding what a tag is,
/// and the moment that decision lives on chain it cannot be revised without a migration. This is a
/// way of typing the same string, not a different data model.
///
/// Commas are stripped from what somebody types, since a comma inside a tag would silently become
/// two tags on the next read. Duplicates are dropped case-insensitively — "Monad" and "monad"
/// filter identically on the events page, so keeping both would put two chips on the card that do
/// the same thing.
export default function TagInput({
  value,
  onChange,
  max = 8,
}: {
  /// Comma-separated, exactly as it will be stored.
  value: string;
  onChange: (v: string) => void;
  max?: number;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const tags = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const commit = () => {
    const clean = draft.replace(/,/g, " ").trim();
    setDraft("");
    if (!clean) return;
    if (tags.some((v) => v.toLowerCase() === clean.toLowerCase())) return;
    if (tags.length >= max) return;
    onChange([...tags, clean].join(", "));
  };

  return (
    <div>
      <span className="mb-1.5 block text-[14px] uppercase tracking-wide text-faint">
        {t("listing.tags")}
      </span>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 pl-3.5 pr-1.5 text-[14px] text-fg"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((v) => v !== tag).join(", "))}
              aria-label={t("listing.tagRemove", { tag })}
              className="grid h-8 w-8 place-items-center rounded-full text-dim transition-colors hover:text-fg"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}

        {open ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              commit();
              setOpen(false);
            }}
            onKeyDown={(e) => {
              // Enter and comma both commit — comma because that is what somebody types when they
              // have been told the field is comma-separated, and it used to end up inside the tag.
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setDraft("");
                setOpen(false);
              } else if (e.key === "Backspace" && !draft && tags.length) {
                onChange(tags.slice(0, -1).join(", "));
              }
            }}
            placeholder={t("listing.tagPlaceholder")}
            className="min-h-[38px] w-[9rem] rounded-full border border-line-2 bg-ink px-3.5 text-[14px] text-fg outline-none placeholder:text-faint focus:border-accent"
          />
        ) : (
          tags.length < max && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-dashed border-line-2 px-3.5 text-[14px] text-dim transition-colors hover:border-accent hover:text-fg"
            >
              <span aria-hidden>+</span> {t("listing.tagAdd")}
            </button>
          )
        )}
      </div>
      <p className="mt-1.5 text-[14px] text-faint">{t("listing.tagsHint")}</p>
    </div>
  );
}
