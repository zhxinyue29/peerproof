import { coverFor } from "@/lib/cover";

/// The picture on an event card, drawn rather than fetched.
///
/// There is nothing on chain to be visual with — the escrow stores numbers and the directory stores
/// a title, a blurb and a url. A photograph would have to come from somewhere, and every candidate
/// is worse than none: stock imagery is a picture of a room nobody was in, and an organizer-supplied
/// link is a second source of truth, on a page whose entire argument is that what you see came from
/// the chain. It would also be the only outbound request the app makes, and the one thing on the
/// card that can 404 two weeks after the event.
///
/// So each event gets a constellation instead: peers, and the edges between them, with nothing in
/// the middle. That is the mechanism, and it is the same figure the landing page argues with. It is
/// derived entirely from the event id, so the same event looks the same on every device and every
/// reload — which is the property a photograph was providing, recognition, and the only one worth
/// keeping.
///
/// Deliberately quiet: this sits behind a title and a status pill, so it reads at a glance and then
/// stops asking for attention.

/// Small, fast, and identical in every browser — `Math.random` cannot be used for something that
/// has to look the same on a second visit.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

type Node = { x: number; y: number; r: number };

/// Nodes are pushed apart before they are drawn. Random points clump, and a clump reads as a
/// rendering fault rather than as a room — a few relaxation passes cost nothing and are the
/// difference between a constellation and a smudge.
function layout(seed: number, count: number, w: number, h: number): Node[] {
  const rand = rng(seed);
  const pad = 26;
  const nodes: Node[] = Array.from({ length: count }, () => ({
    x: pad + rand() * (w - pad * 2),
    y: pad + rand() * (h - pad * 2),
    r: 3.5 + rand() * 4.5,
  }));
  const min = Math.min(w, h) * 0.26;
  for (let pass = 0; pass < 14; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < min) {
          const push = ((min - d) / d) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    for (const n of nodes) {
      n.x = Math.max(pad, Math.min(w - pad, n.x));
      n.y = Math.max(pad, Math.min(h - pad, n.y));
    }
  }
  return nodes;
}

export default function EventCover({
  id,
  className = "",
  nodes: nodeCount,
}: {
  id: bigint;
  className?: string;
  /// Larger surfaces carry a denser figure. The event page banner is eight times the area of a
  /// card's band, and the same six points on it read as an accident.
  nodes?: number;
}) {
  const W = 400;
  const H = 180;
  const seed = Number(((id % 100000n) + 100000n) % 100000n) * 2654435761;
  const count = nodeCount ?? 6;
  const pts = layout(seed, count, W, H);

  // Every pair under a threshold, so the figure is a room rather than a chain — which is what the
  // contract actually counts.
  const near = Math.min(W, H) * 0.92;
  const edges: Array<[Node, Node, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (d < near) edges.push([pts[i], pts[j], d]);
    }
  }

  const gid = `cv${id.toString()}`;

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden ${className}`}
      style={{ background: coverFor(id) }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id={`${gid}-n`}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* A wash across the bottom so a title laid over the band keeps its contrast wherever
              the gradient happens to be bright. */}
          <linearGradient id={`${gid}-v`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="45%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.38" />
          </linearGradient>
        </defs>

        {edges.map(([a, b, d], i) => (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#ffffff"
            strokeWidth="1"
            // Closer pairs read as stronger, which is how a graph is normally drawn and stops the
            // longest lines dominating a small band.
            strokeOpacity={Math.max(0.06, 0.3 - (d / near) * 0.24)}
          />
        ))}

        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={p.r * 3.4} fill={`url(#${gid}-n)`} opacity="0.5" />
            <circle cx={p.x} cy={p.y} r={p.r} fill="#ffffff" fillOpacity="0.92" />
          </g>
        ))}

        <rect width={W} height={H} fill={`url(#${gid}-v)`} />
      </svg>
    </div>
  );
}
