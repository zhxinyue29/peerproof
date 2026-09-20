"use client";

import { useT, type TFn } from "@/lib/i18n";
import { Skeleton } from "@/components/ui";

/// "My roles", from the profile sheet: the same person as an attendee and as an organizer, side by
/// side, with two numbers each.
///
/// Every one of the four is already on this page — they are the same values the tiles above show,
/// regrouped. That is the point of the block rather than a reason to skip it: the tiles answer
/// "how much", this answers "as what", and somebody deciding whether to trust an account reads the
/// second question first.
///
/// The sheet also draws an illustration and a swap arrow between the cards. The arrow is dropped:
/// it implies the two sides can be toggled, and they cannot — they are both true at once.
///
/// Turnout is `null`, not `0%`, before anything has been joined. A turnout of zero is a record of
/// not showing up; having no record is a different claim, and this is the screen where that
/// difference is the whole product.
export default function ProfileRoles({
  joined,
  turnout,
  hosted,
  reach,
  loading,
}: {
  joined: number;
  /// Percent, or null when nothing has been joined yet.
  turnout: number | null;
  hosted: number;
  /// Everyone who registered for an event this account ran.
  reach: number;
  loading: boolean;
}) {
  const t = useT();
  return (
    <section className="flex h-full flex-col rounded-2xl border border-line bg-panel p-5 md:p-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t("me.roles")}</h2>
      {/* `flex-1` so the pair fills the height the calendar beside it sets, instead of
          leaving a panel-coloured gap under a half-height card. */}
      <div className="mt-4 grid flex-1 gap-4 sm:grid-cols-2">
        <RoleCard
          tone="accent"
          title={t("me.roleAttendee")}
          body={t("me.roleAttendeeBody")}
          stats={[
            [loading ? null : String(joined), t("me.roleJoined")],
            [loading ? null : turnout === null ? "—" : `${turnout}%`, t("me.turnout")],
          ]}
          t={t}
        />
        <RoleCard
          tone="ok"
          title={t("me.roleOrganizer")}
          body={t("me.roleOrganizerBody")}
          stats={[
            [loading ? null : String(hosted), t("me.roleHosted")],
            [loading ? null : String(reach), t("me.reach")],
          ]}
          t={t}
        />
      </div>
    </section>
  );
}

function RoleCard({
  tone,
  title,
  body,
  stats,
  t,
}: {
  tone: "accent" | "ok";
  title: string;
  body: string;
  /// `null` while the chain read is in flight.
  stats: [string | null, string][];
  t: TFn;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border p-4 md:p-5 ${
        tone === "accent" ? "border-accent/35 bg-accent/[0.07]" : "border-ok/30 bg-ok/[0.06]"
      }`}
    >
      <p className="text-[17px] font-medium">{title}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-dim">{body}</p>
      <dl className="mt-auto grid grid-cols-2 gap-3 pt-4">
        {stats.map(([value, label]) => (
          <div key={label}>
            <dd className="text-[24px] font-semibold tabular-nums leading-none tracking-[-0.02em]">
              {value ?? <Skeleton className="h-6 w-10 align-middle" />}
            </dd>
            <dt className="mt-1.5 text-[13px] text-faint">{label}</dt>
          </div>
        ))}
      </dl>
      {/* Screen readers get the pairing spelled out; sighted readers get it from the layout. */}
      <span className="sr-only">{t("me.rolesAria", { role: title })}</span>
    </div>
  );
}
