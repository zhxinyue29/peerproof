"use client";

import type { Participant, Vouch } from "@/lib/logs";
import { shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";

/// Every line is one transaction: somebody stood in a room and vouched for somebody else.
/// Filled nodes reached quorum; hollow ones registered and were never confirmed present.
export default function VouchGraph({
  participants,
  vouches,
  size = 320,
}: {
  participants: Participant[];
  vouches: Vouch[];
  size?: number;
}) {
  const t = useT();
  if (participants.length === 0) {
    return <p className="text-sm text-dim">{t("graph.nobodyRegistered")}</p>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 42;

  // The ring gets crowded before it gets empty. Nodes sit on a circle of circumference 2πr, so
  // past about a dozen people the 26px discs start overlapping and the count inside them stops
  // being readable — shrink them instead of letting them collide.
  const spacing = (2 * Math.PI * r) / participants.length;
  const nodeR = Math.max(6, Math.min(13, spacing / 2 - 2));

  const pos = new Map<string, { x: number; y: number }>();
  participants.forEach((p, i) => {
    // Start at the top and go clockwise, so the layout is stable as people register.
    const a = (i / participants.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(p.address.toLowerCase(), { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  });

  const degree = new Map<string, number>();
  for (const v of vouches) {
    const k = v.to.toLowerCase();
    degree.set(k, (degree.get(k) ?? 0) + 1);
  }

  return (
    <div className="space-y-3">
      {/* Capped, and centred in whatever is left.
          The svg was `w-full` on a square viewBox, so in the desktop column it drew a ring 880px
          across — five nodes pushed out to the edges of a screen-high void, which reads as a
          rendering fault rather than as a room. A ring does not get more legible by getting
          bigger; past a certain size the lines are just longer. */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto w-full max-w-[400px]"
        role="img"
        aria-label="Attestation graph"
      >
        {vouches.map((v) => {
          const a = pos.get(v.from.toLowerCase());
          const b = pos.get(v.to.toLowerCase());
          if (!a || !b) return null;
          return (
            <line
              key={v.hash + v.from + v.to}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              strokeWidth={1.5}
              /* Each line is one transaction, and the demo says so out loud — they have to read
                 clearly, not sit at the edge of visibility like a hairline border would. */
              className="text-accent-2/60"
            />
          );
        })}

        {participants.map((p) => {
          const pt = pos.get(p.address.toLowerCase())!;
          const n = degree.get(p.address.toLowerCase()) ?? 0;
          return (
            <g key={p.address}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={nodeR}
                fill={p.confirmed ? "currentColor" : "#0a0713"}
                stroke="currentColor"
                strokeWidth={2}
                className={p.confirmed ? "text-ok" : "text-faint"}
              />
              {/* Below about 9px the numeral is smaller than the stroke around it, so the disc
                  alone carries the state and the count lives in the list underneath. */}
              {nodeR >= 9 && (
                <text
                  x={pt.x}
                  y={pt.y + 4}
                  textAnchor="middle"
                  className={`text-[14px] tabular-nums ${p.confirmed ? "fill-ink" : "fill-faint"}`}
                >
                  {n}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Without this, a graph with nobody vouching yet is a ring of circles and no lines — which
          looks exactly like a graph that failed to draw its lines. Say which one it is. */}
      {vouches.length === 0 && (
        <p className="text-center text-[14px] text-dim">{t("graph.noVouchesYet")}</p>
      )}

      {/* 14px,不是 12px。这张图是在会场里、光线不好的时候看的,而 text-xs 在那种
          条件下基本读不出来——整个产品别处的最小字号也是 14。 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-faint">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-ok" /> {t("graph.confirmed")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-faint bg-ink" />{" "}
          {t("graph.neverConfirmed")}
        </span>
        <span>{t("graph.numberMeans")}</span>
      </div>

      <ul className="space-y-0.5 font-mono text-[14px] text-faint">
        {participants.map((p) => (
          <li key={p.address} className="flex items-center gap-2">
            <span className={p.confirmed ? "text-fg" : ""}>{shortAddress(p.address)}</span>
            <span className="text-faint">
              {p.confirmed
                ? p.viaOrganizer
                  ? t("graph.presentFallback")
                  : t("graph.present")
                : t("graph.forfeited")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
