"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Participant, Vouch } from "@/lib/logs";
import { shortAddress } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useMotionPrefs } from "@/lib/motion";

/// The proof network, drawn at the size of the argument it is making.
///
/// This used to be a 400px ring inside a panel, which is the size you give a diagram that
/// illustrates a page. It does not illustrate this page — it *is* the page: every edge is one
/// transaction somebody sent standing in a room, and the whole product's claim is that you can
/// check them yourself. So it gets the canvas, the panel is gone, and the evidence list below is
/// wired to it in both directions: hover a line, the row lights; hover a row, the line lights.
///
/// Nothing here is decoration with a crypto accent. The edges are real vouches in the order the
/// chain accepted them, the draw-on is that order made visible once, and the travelling dot is on
/// the same paths — it is proof moving between people, not a glow.

export type EdgeKey = string;

export function edgeKey(v: Vouch): EdgeKey {
  return `${v.hash}-${v.from}-${v.to}`;
}

const VB_W = 1000;
const VB_H = 560;


/// Narrow-screen switch, shared by the graph and by its skeleton so the two never render at
/// different scales and make the hand-off look like a jump.
///
/// Measured after mount rather than guessed during render: this is a static export with no idea
/// what is asking for it, and a viewport-dependent first render would hydrate into a mismatch.
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return compact;
}

export default function ProofNetwork({
  participants,
  vouches,
  selected,
  onSelect,
  onHover,
}: {
  participants: Participant[];
  vouches: Vouch[];
  /// The edge currently under inspection — hovered anywhere, or pinned by a click. Resolved by
  /// the page, because the vouch list hovers the same edges and both have to agree.
  selected: EdgeKey | null;
  onSelect: (key: EdgeKey | null) => void;
  onHover: (key: EdgeKey | null) => void;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();

  // A phone is not a small desktop here. The SVG scales to its container, so on a 375px screen a
  // 15px address label renders at about five and a half physical pixels — present, unreadable, and
  // worse than absent because it fills the space where the picture should be. On narrow screens
  // the labels go (the roster underneath says who is who anyway) and the view crops to the ring,
  // which is the only part that carries meaning at that size.
  const compact = useCompact();

  // Ids are scoped per instance: the travelling dots reference their edge by `href`, and two
  // networks on one document with the same ids would both animate along the first one's paths.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Which edges this browser has already watched arrive.
  //
  // The page re-reads the chain every fifteen seconds, and an edge that was on screen last tick is
  // not news. Only the ones that were not in the previous read get the arrival signal — otherwise
  // every poll would replay the whole room and the one thing the motion is supposed to mean
  // ("somebody just vouched, seconds ago") would mean nothing.
  const everSeen = useRef<Set<string> | null>(null);

  const cx = VB_W / 2;
  const cy = VB_H / 2;
  // Room for the address label that sits outside each node. Labels are dropped in a crowd (below),
  // so the ring can use that space back when there is nobody to name.
  const named = !compact && participants.length <= 14;
  const r = named ? 196 : 232;

  // The ring gets crowded before it gets empty. Past about a dozen people the discs start
  // colliding and the count inside them stops being readable — shrink them rather than let them
  // overlap.
  const spacing = (2 * Math.PI * r) / participants.length;
  const nodeR = Math.max(7, Math.min(22, spacing / 2 - 6));

  const pos = new Map<string, { x: number; y: number; a: number }>();
  participants.forEach((p, i) => {
    // Start at the top and go clockwise, so the layout is stable as people register — somebody
    // watching the page while a room fills should never see the ring reshuffle.
    const a = (i / participants.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(p.address.toLowerCase(), { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), a });
  });

  const degree = new Map<string, number>();
  for (const v of vouches) degree.set(v.to.toLowerCase(), (degree.get(v.to.toLowerCase()) ?? 0) + 1);

  // Two people can vouch for each other, and on a straight chord those two transactions land on
  // exactly the same pixels — two pieces of evidence rendered as one. Bowing each pair a different
  // amount keeps both visible and, incidentally, stops the ring reading as a wireframe.
  const seen = new Map<string, number>();
  const edges = vouches
    .map((v, i) => {
      const a = pos.get(v.from.toLowerCase());
      const b = pos.get(v.to.toLowerCase());
      if (!a || !b) return null;
      const pair = [v.from.toLowerCase(), v.to.toLowerCase()].sort().join("|");
      const nth = seen.get(pair) ?? 0;
      seen.set(pair, nth + 1);
      const bow = 0.3 + nth * 0.16;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      return {
        key: edgeKey(v),
        order: i,
        from: v.from.toLowerCase(),
        to: v.to.toLowerCase(),
        d: `M ${a.x} ${a.y} Q ${mx + (cx - mx) * bow} ${my + (cy - my) * bow} ${b.x} ${b.y}`,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  // Six at most, spread across the whole set. A signal on every edge is a light show; a signal on
  // a few is a room where something is happening.
  const carriers = reduced
    ? []
    : edges.filter((_, i) => i % Math.max(1, Math.ceil(edges.length / 6)) === 0).slice(0, 6);

  // First read is not an arrival: everything in it happened before you opened the page, and
  // flashing forty transactions at once would be a fireworks display, not evidence.
  //
  // Derived during render but *recorded* in an effect below. Marking them as seen here instead —
  // which is what this did first — silently produced nothing at all: React renders a component
  // twice in development, so by the second pass every "new" edge had already been written into the
  // set by the first, and the arrival never fired. A render that mutates state it also reads is a
  // render that behaves differently depending on how many times it runs.
  const fresh =
    everSeen.current === null
      ? new Set<string>()
      : new Set(edges.filter((e) => !everSeen.current!.has(e.key)).map((e) => e.key));

  const edgeKeys = edges.map((e) => e.key).join("|");
  useEffect(() => {
    everSeen.current = new Set(edgeKeys ? edgeKeys.split("|") : []);
  }, [edgeKeys]);

  const activeNodes = new Set<string>();
  const active = edges.find((e) => e.key === selected);
  if (active) {
    activeNodes.add(active.from);
    activeNodes.add(active.to);
  }

  // Checked here rather than at the top of the function: every hook in this component has to run
  // on every render, and an early return above them means the set of hooks changes the moment the
  // first person registers — which React treats, correctly, as a different component.
  if (participants.length === 0) {
    return <p className="py-16 text-center text-[16px] text-dim">{t("graph.nobodyRegistered")}</p>;
  }

  return (
    <svg
      viewBox={compact ? "235 15 530 530" : `0 0 ${VB_W} ${VB_H}`}
      // Capped, and centred in what is left. Stretched across a 1380px column the ring came out
      // 770px tall — the whole viewport for nine people, which reads as a rendering fault rather
      // than as a room. A network does not get more legible by getting bigger; past a point the
      // lines are just longer and the eye has to travel further to follow one.
      className="mx-auto w-full max-w-[1040px] touch-manipulation select-none"
      role="img"
      aria-label={t("verify.graphLabel", { people: participants.length, proofs: vouches.length })}
      // Clicking the canvas itself clears the selection. Without it the only way out of a selected
      // edge is to find that exact 2px line again.
      onClick={() => onSelect(null)}
      // Hover leaves nothing behind. A selection that survives the pointer walking away is a page
      // stuck dimming itself around a line nobody is looking at any more.
      onMouseLeave={() => onHover(null)}
    >
      <defs>
        {/* The stage light. One source, same hue as the app's own ambient wash — the network sits
            in the room's light rather than carrying a light of its own. */}
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0%" stopColor="#6e54ff" stopOpacity="0.2" />
          <stop offset="55%" stopColor="#6e54ff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#6e54ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx={cx} cy={cy} rx={VB_W * 0.44} ry={VB_H * 0.46} fill={`url(#${uid}-halo)`} />

      {/* The ring the people stand on. Barely there on purpose: it explains the layout to the eye
          in a fraction of a second and then stops competing with the edges, which are the evidence. */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#242e5a"
        strokeWidth={1}
        strokeDasharray="2 10"
      />

      {edges.map((e) => {
        const isActive = e.key === selected;
        return (
          <g key={e.key}>
            <path id={`${uid}-e${e.order}`} d={e.d} fill="none" stroke="none" />
            {/* A 2px line is not a click target. This one is invisible, 18px wide, and carries the
                pointer events for the line underneath it. */}
            <path
              d={e.d}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              className="cursor-pointer"
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(isActive ? null : e.key);
              }}
              onMouseEnter={() => onHover(e.key)}
            />
            <path
              d={e.d}
              fill="none"
              pathLength={1}
              stroke={isActive ? "#9a88ff" : "#6e54ff"}
              strokeWidth={isActive ? 3 : 1.6}
              strokeOpacity={isActive ? 1 : selected ? 0.18 : 0.5}
              strokeLinecap="round"
              className={`pointer-events-none ${
                fresh.has(e.key) && !reduced ? "pp-edge-arrive" : "pp-edge"
              }`}
              // In the order the chain accepted them, capped so a busy room still finishes
              // drawing before anyone could have read the numbers above it.
              style={{ animationDelay: `${Math.min(e.order * 0.085, 2.2)}s` }}
            />
          </g>
        );
      })}

      {/* A signal on an edge that has just been accepted, once. This is the only motion on the page
          tied to something that happened while you were watching, so it is not allowed to repeat:
          a loop would turn "this just landed" into wallpaper. */}
      {!reduced &&
        edges
          .filter((e) => fresh.has(e.key))
          .map((e) => (
            <circle key={`n${e.key}`} r={5} fill="#c9bcff" opacity={0}>
              <animate attributeName="opacity" values="0;1;1;0" dur="1.5s" begin="0.15s" repeatCount="1" fill="freeze" />
              <animateMotion dur="1.5s" begin="0.15s" repeatCount="1" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                <mpath href={`#${uid}-e${e.order}`} />
              </animateMotion>
            </circle>
          ))}

      {carriers.map((e, i) => (
        <circle key={`c${e.key}`} r={3.5} fill="#9a88ff" opacity={selected ? 0.25 : 0.9}>
          {/* SMIL rather than Motion or `offset-path`: it runs from the first painted frame, needs
              no hydration on a page served as static files, and follows the very path the edge is
              drawn on — so the signal can never drift off its own line. */}
          <animateMotion
            dur="2.8s"
            begin={`${2.4 + i * 0.95}s`}
            repeatCount="indefinite"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          >
            <mpath href={`#${uid}-e${e.order}`} />
          </animateMotion>
        </circle>
      ))}

      {participants.map((p) => {
        const key = p.address.toLowerCase();
        const pt = pos.get(key)!;
        const n = degree.get(key) ?? 0;
        const dim = selected !== null && !activeNodes.has(key);
        // Mint is spent here and nowhere else on this page: it means the contract confirmed
        // this person present, which is the one thing on screen that is not an opinion.
        //
        // A ring and a wash rather than a solid disc. Six filled mint circles read as the loudest
        // thing in the picture, and the loudest thing in this picture has to be the proofs — the
        // confirmation is what the lines *produced*, so it glows where the person stands instead
        // of shouting over them.
        return (
          <g key={p.address} opacity={dim ? 0.3 : 1} className="pp-node">
            {p.confirmed && (
              <>
                <circle cx={pt.x} cy={pt.y} r={nodeR + 9} fill="#02d2a1" opacity={0.08} />
                <circle cx={pt.x} cy={pt.y} r={nodeR + 4} fill="#02d2a1" opacity={0.12} />
              </>
            )}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={nodeR}
              fill="#09162a"
              stroke={p.confirmed ? "#02d2a1" : "#242e5a"}
              strokeWidth={p.confirmed ? 2.5 : 2}
            />
            {/* Below about 11px the numeral is smaller than the stroke around it, so the disc alone
                carries the state and the count lives in the roster underneath. */}
            {nodeR >= 11 && (
              <text
                x={pt.x}
                y={pt.y + 6}
                textAnchor="middle"
                fontSize={17}
                className="tabular-nums"
                fill={p.confirmed ? "#02d2a1" : "#b2becf"}
                fontWeight={600}
              >
                {n}
              </text>
            )}
            {named && (
              <text
                // Pushed outward along the node's own radius, so a label never crosses the ring
                // and never sits on the edges inside it.
                x={cx + (r + nodeR + 20) * Math.cos(pt.a)}
                y={cy + (r + nodeR + 20) * Math.sin(pt.a) + 5}
                textAnchor={Math.abs(Math.cos(pt.a)) < 0.25 ? "middle" : Math.cos(pt.a) > 0 ? "start" : "end"}
                fontSize={15}
                fill={p.confirmed ? "#cdd7e5" : "#b2becf"}
                fontFamily="var(--font-mono)"
              >
                {shortAddress(p.address)}
              </text>
            )}
          </g>
        );
      })}

      {/* A ring of circles with no lines looks exactly like a graph that failed to draw its lines.
          Say which one it is, in the middle, where the lines would have been. */}
      {vouches.length === 0 && (
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize={17} fill="#b2becf">
          {t("graph.noVouchesYet")}
        </text>
      )}

    </svg>
  );
}

/// What the stage holds while the chain is still being read.
///
/// The placeholder here was a 200px grey disc, which is the shape of a page that has not been
/// designed for its own slowest moment — and on this page the slowest moment is the common one,
/// because rebuilding a graph from logs takes as long as it takes. A faint ring of nodes with a
/// few edges between them says the same thing the spinner said ("not yet") while looking like the
/// picture it is about to become, so the composition never collapses.
///
/// Deliberately not drawn from real addresses: there is no data yet, and inventing nodes that
/// resolve into real people would be the one lie this page cannot tell. It is grey, it breathes,
/// and it is replaced wholesale the moment the logs land.
export function NetworkSkeleton() {
  const compact = useCompact();
  const cx = VB_W / 2;
  const cy = VB_H / 2;
  const r = 196;
  const n = 8;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const links: Array<[number, number]> = [
    [0, 3],
    [1, 4],
    [2, 6],
    [3, 5],
    [5, 7],
    [6, 1],
  ];

  return (
    <svg
      viewBox={compact ? "235 15 530 530" : `0 0 ${VB_W} ${VB_H}`}
      className="mx-auto w-full max-w-[1040px]"
      aria-hidden="true"
    >
      <g className="pp-skeleton">
        {links.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={pts[a].x}
            y1={pts[a].y}
            x2={pts[b].x}
            y2={pts[b].y}
            stroke="#242e5a"
            strokeWidth={1.5}
            strokeDasharray="5 9"
          />
        ))}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={13} fill="#09162a" stroke="#242e5a" strokeWidth={2} />
        ))}
      </g>
    </svg>
  );
}
