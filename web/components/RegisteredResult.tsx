"use client";

import Link from "next/link";
import type { Hex } from "viem";
import CoverImage from "@/components/CoverImage";
import { basePath, explorerTxUrl } from "@/lib/chain";
import { countdown, mon } from "@/lib/format";
import { useLang } from "@/lib/i18n";

/// What somebody sees the moment their deposit lands: panel 04 of the participant sheet, with one
/// substitution.
///
/// The sheet calls it 验证成功 — the screen for having been confirmed present. That screen belongs
/// at the end of the evening, after the room has vouched for you, and it is not what has just
/// happened here. What has just happened is registration: the deposit moved, a seat is held, and
/// nothing has been proved yet. So the shape is the sheet's — illustration, congratulation, the
/// event as a card, the facts beneath it, two ways out — and every word in it is about registering.
///
/// Calling it "verified" here would be the one lie this product cannot afford: it would tell
/// somebody they had been confirmed present at an event they have not yet walked into.
export default function RegisteredResult({
  eventId,
  title,
  venue,
  cover,
  startsAt,
  deposit,
  hash,
  opensIn,
  vouchesNeeded,
  onContinue,
}: {
  eventId: bigint;
  title: string;
  venue: string;
  cover: string;
  /// Unix seconds when the doors open.
  startsAt: bigint;
  deposit: bigint;
  hash: Hex;
  /// Seconds until check-in opens; zero or less when it already has.
  opensIn: number;
  vouchesNeeded: number;
  onContinue: () => void;
}) {
  const { t, lang } = useLang();
  const when = new Date(Number(startsAt) * 1000);

  return (
    <div className="overflow-hidden rounded-2xl border border-line-2 bg-raised">
      {/* The sheet opens on the illustration, edge to edge. It is the only screen in the product
          that is allowed to celebrate, and it earns it: somebody has just put money on turning up. */}
      <div
        aria-hidden
        className="relative h-[168px] bg-cover bg-center md:h-[196px]"
        style={{ backgroundImage: `url(${basePath}/joined-banner.webp)` }}
      >
        <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-raised to-transparent" />
      </div>

      <div className="space-y-4 p-5 md:p-6">
        <div className="space-y-2">
          <h3 className="text-[24px] font-semibold leading-[1.2] tracking-tight md:text-[28px]">
            {t("registered.title")}
          </h3>
          <p className="text-[16px] leading-relaxed text-dim">
            {t("registered.sub", { amount: mon(deposit) })}
          </p>
        </div>

        {/* The event, as a card — the sheet's way of saying "this is the thing you just joined",
            which a line of text cannot do as quickly. */}
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
          <CoverImage id={eventId} src={cover} nodes={5} className="h-[52px] w-[52px] shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15.5px] font-medium">{title}</p>
            <p className="mt-0.5 truncate text-[13.5px] text-faint">
              {venue ? `${venue} · ` : ""}
              {when.toLocaleString(lang === "zh" ? "zh-CN" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-ok/15 px-2.5 py-1 text-[13px] font-medium text-ok">
            {t("organizer.registered")}
          </span>
        </div>

        {/* The sheet puts 验证方式 and 奖励 here. Those are the end of the story; this is the
            start of it, so the same slot carries what is true now: when the doors open, and how
            many people have to vouch before any of it counts. */}
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-panel p-3.5">
            <dt className="text-[13px] text-faint">{t("registered.doorsLabel")}</dt>
            <dd className="mt-1 text-[16px] font-medium">
              {opensIn > 0 ? countdown(opensIn) : t("registered.openNow")}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-panel p-3.5">
            <dt className="text-[13px] text-faint">{t("registered.vouchesLabel")}</dt>
            <dd className="mt-1 text-[16px] font-medium tabular-nums">{vouchesNeeded}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-accent px-5 text-[16px] font-medium text-white transition-transform duration-100 active:scale-[0.985]"
          >
            {t("event.openMyCode")}
          </button>
          <Link
            href="/events"
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-line-2 px-5 text-[16px] text-dim transition-colors hover:border-accent hover:text-fg"
          >
            {t("registered.keepBrowsing")}
          </Link>
        </div>

        {explorerTxUrl(hash) && (
          <a
            href={explorerTxUrl(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[15px] text-accent-2"
          >
            {t("registered.viewTx")}
          </a>
        )}
      </div>
    </div>
  );
}
