"use client";

import { useId } from "react";
import { DEMO_CONFIRMED, DEMO_PEOPLE, DEMO_SCANS, type DemoId } from "@/lib/demo";
import { useT } from "@/lib/i18n";

/// The walkthrough's vouch graph: four people who vouched for each other, one who never came.
///
/// Drawn in `ProofNetwork`'s vocabulary — the same dashed ring, the same violet for a vouch, mint
/// spent only on "confirmed present" — so a judge who has seen this has already learned to read the
/// live `/verify` page. It is not `ProofNetwork` itself: that component is keyed by addresses and
/// transaction hashes, and feeding it invented ones would be exactly the forgery this demo must not
/// commit. Here the people are letters and a line is a scan, with nothing behind either.
///
/// Letters rather than names inside the picture: the SVG scales to its column, and on a phone a
/// name set in it shrinks to a smudge. The names are in HTML, under it, at a size that stays
/// readable anywhere.

const W = 640;
const H = 440;
const CX = 270;
const CY = 220;
const RING = 150;
const NODE_R = 26;

/// Clockwise from the top, in the order they scanned. E stands outside the ring: never in the room.
const AT: Record<DemoId, { x: number; y: number }> = {
  A: { x: CX, y: CY - RING },
  B: { x: CX + RING, y: CY },
  C: { x: CX, y: CY + RING },
  D: { x: CX - RING, y: CY },
  E: { x: 548, y: 92 },
};

/// A scan, bowed a little toward the middle like the live graph's edges, and trimmed at both ends
/// so the arrowhead lands on the rim of the person scanned rather than under their disc.
///
/// The arrowhead is its own shape, not an SVG marker: a marker ignores the line's draw-on and would
/// sit at the far end before the line had got there.
function scanPath(from: DemoId, to: DemoId) {
  const a = AT[from];
  const b = AT[to];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const c = { x: mx + (CX - mx) * 0.22, y: my + (CY - my) * 0.22 };
  const trim = (p: { x: number; y: number }, toward: { x: number; y: number }, by: number) => {
    const dx = toward.x - p.x;
    const dy = toward.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * by, y: p.y + (dy / len) * by };
  };
  const s = trim(a, c, NODE_R + 6);
  const e = trim(b, c, NODE_R + 7);
  // The curve arrives along (e - c); the head points that way, its base a few px back.
  const len = Math.hypot(e.x - c.x, e.y - c.y) || 1;
  const ux = (e.x - c.x) / len;
  const uy = (e.y - c.y) / len;
  const head = [
    `${e.x + ux * 2} ${e.y + uy * 2}`,
    `${e.x - ux * 9 - uy * 5} ${e.y - uy * 9 + ux * 5}`,
    `${e.x - ux * 9 + uy * 5} ${e.y - uy * 9 - ux * 5}`,
  ];
  return { d: `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${e.x - ux * 6} ${e.y - uy * 6}`, head: `M ${head.join(" L ")} Z` };
}

export default function DemoGraph() {
  const t = useT();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto w-full max-w-[560px] select-none"
        role="img"
        aria-label={t("demo.graphLabel")}
      >
        <defs>
          <radialGradient id={`${uid}-halo`}>
            <stop offset="0%" stopColor="#6e54ff" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#6e54ff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#6e54ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx={CX} cy={CY} rx={RING + 90} ry={RING + 70} fill={`url(#${uid}-halo)`} />
        <circle cx={CX} cy={CY} r={RING} fill="none" stroke="#242e5a" strokeWidth={1} strokeDasharray="2 10" />

        {DEMO_SCANS.map(({ from, to }, i) => {
          const { d, head } = scanPath(from, to);
          const delay = 0.15 + i * 0.22;
          return (
            <g key={`${from}${to}`}>
              <path
                d={d}
                fill="none"
                pathLength={1}
                stroke="#9a88ff"
                strokeWidth={2.2}
                strokeOpacity={0.85}
                strokeLinecap="round"
                // The live graph's draw-on, in the order the scans happened.
                className="pp-edge"
                style={{ animationDelay: `${delay}s` }}
              />
              <path d={head} fill="#9a88ff" className="pp-node" style={{ animationDelay: `${delay + 0.4}s` }} />
            </g>
          );
        })}

        {DEMO_PEOPLE.map(({ id }) => {
          const p = AT[id];
          const ok = DEMO_CONFIRMED.has(id);
          return (
            <g key={id} className="pp-node">
              {ok && (
                <>
                  <circle cx={p.x} cy={p.y} r={NODE_R + 10} fill="#02d2a1" opacity={0.07} />
                  <circle cx={p.x} cy={p.y} r={NODE_R + 4} fill="#02d2a1" opacity={0.1} />
                </>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={NODE_R}
                fill="#09162a"
                stroke={ok ? "#02d2a1" : "#3a4470"}
                strokeWidth={ok ? 2.4 : 1.6}
                // Absence drawn as absence: a broken outline, not a colour of its own.
                strokeDasharray={ok ? undefined : "4 5"}
              />
              <text
                x={p.x}
                y={p.y + 7}
                textAnchor="middle"
                fontSize={21}
                fontWeight={600}
                fill={ok ? "#eef3fa" : "#8a97b8"}
              >
                {id}
              </text>
            </g>
          );
        })}
      </svg>

      {/* The key, and who each letter is, as type. */}
      <figcaption className="mt-3">
        <span className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[14px] text-dim">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 rounded-full border-2 border-ok" />
            {t("demo.legendConfirmed")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 rounded-full border border-dashed border-faint" />
            {t("demo.legendNot")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="text-accent-2">→</span>
            {t("demo.legendScan")}
          </span>
        </span>
        {/* The live record's legend, said about invented data — it opens by saying so, because
            this figure also appears on /verify?demo=1 and a crop of it must not pass for a chain
            record. */}
        <span className="mx-auto mt-3 block max-w-[60ch] text-center text-[14px] leading-relaxed text-faint">
          {t("demo.arrowLegend")}
        </span>
      </figcaption>
    </figure>
  );
}
