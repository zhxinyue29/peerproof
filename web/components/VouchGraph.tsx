"use client";

import type { Participant, Vouch } from "@/lib/logs";
import { shortAddress } from "@/lib/format";

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
  if (participants.length === 0) {
    return <p className="text-sm text-dim">Nobody has registered yet.</p>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 42;

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
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Attestation graph">
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
                r={13}
                fill={p.confirmed ? "currentColor" : "#0a0713"}
                stroke="currentColor"
                strokeWidth={2}
                className={p.confirmed ? "text-ok" : "text-faint"}
              />
              <text
                x={pt.x}
                y={pt.y + 4}
                textAnchor="middle"
                className={`text-[11px] tabular-nums ${p.confirmed ? "fill-ink" : "fill-faint"}`}
              >
                {n}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-ok" /> confirmed present
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-faint bg-ink" />{" "}
          registered, never confirmed
        </span>
        <span>number = vouches received</span>
      </div>

      <ul className="space-y-0.5 font-mono text-[11px] text-faint">
        {participants.map((p) => (
          <li key={p.address} className="flex items-center gap-2">
            <span className={p.confirmed ? "text-fg" : ""}>{shortAddress(p.address)}</span>
            <span className="text-faint">
              {p.confirmed
                ? p.viaOrganizer
                  ? "present (organizer fallback)"
                  : "present"
                : "forfeited"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
