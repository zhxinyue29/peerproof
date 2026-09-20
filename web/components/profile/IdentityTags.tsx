"use client";

import { SectionTitle } from "@/components/SectionTitle";
import { useT } from "@/lib/i18n";

/// "我的身份标签", the panel beside the figures on the profile sheet.
///
/// The sheet shows free tags somebody typed — Builder, Event Organizer, Monad, AI — with an edit
/// link. This product cannot store them: the profile struct is fixed and the contract it lives in
/// is frozen, because its address is derived from its bytecode and an organizer has already
/// deployed and written to it.
///
/// So the tags are derived from what the chain already knows, and every one of them is checkable
/// by anybody holding the address. That is a smaller panel than the drawing and a truer one — and
/// on a page whose whole subject is what an account can substantiate, a row of self-declared words
/// would be the one block nobody could verify.
export default function IdentityTags({
  joined,
  hosted,
  confirmed,
  loading,
}: {
  joined: number;
  hosted: number;
  /// Events where the room vouched this account present.
  confirmed: number;
  loading: boolean;
}) {
  const t = useT();
  const tags = [
    joined > 0 && "me.tagAttendee",
    hosted > 0 && "me.tagOrganizer",
    confirmed >= 3 && "me.tagRegular",
    hosted >= 3 && "me.tagCommunity",
    joined > 0 && confirmed === joined && "me.tagPerfect",
  ].filter(Boolean) as string[];

  return (
    <section className="flex h-full flex-col rounded-2xl border border-line bg-panel p-5">
      <SectionTitle zh={t("me.identityTags")} en="Identity" />
      {loading ? (
        <p className="mt-3 text-[15px] text-faint">{t("common.loading")}</p>
      ) : tags.length === 0 ? (
        // Not "no tags yet" as decoration — the sentence says what would earn one.
        <p className="mt-3 text-[15px] leading-relaxed text-faint">{t("me.identityEmpty")}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((k) => (
            <span
              key={k}
              className="inline-flex min-h-[32px] items-center rounded-full border border-accent/40 bg-accent/12 px-3 text-[14px] text-fg"
            >
              {t(k)}
            </span>
          ))}
        </div>
      )}
      <p className="mt-auto pt-3 text-[13px] leading-relaxed text-faint">{t("me.identityNote")}</p>
    </section>
  );
}
