/// The mechanism, drawn.
///
/// A room of people, every pair connected, and a hole where a product like this would normally put
/// its own logo — the arbiter, the escrow agent, the company you have to trust. There is nothing
/// there, and that absence is the entire argument. It says in one image what the page takes two
/// paragraphs to say.
///
/// Pure SVG: no image file to load, nothing to go stale, and it scales to whatever box it is given.
///
/// It was three dots and three lines, which was the idea but not a picture of it. A mechanism whose
/// pitch is "the room proves itself" should look like a room, and the figure should reward the
/// second look — the count of edges is the thing the contract actually counts, and at seven peers
/// there are twenty-one of them.

/// Seven points on a circle, nudged off it. Exactly on the circle reads as a clock face; the nudge
/// is what makes it a room. Fixed values rather than random so the mark is the same every time
/// anybody sees it — this is a logo, not a generative piece.
const R = 118;
const CX = 200;
const CY = 168;
const JITTER = [
  [6, -10], [-12, 5], [9, 8], [-7, -9], [11, -4], [-9, 9], [4, 11],
] as const;

const PEERS = JITTER.map(([dx, dy], i) => {
  const a = (i / JITTER.length) * Math.PI * 2 - Math.PI / 2;
  return { x: CX + Math.cos(a) * R + dx, y: CY + Math.sin(a) * R * 0.82 + dy };
});

export default function ProofArt({ className = "" }: { className?: string }) {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < PEERS.length; i++) {
    for (let j = i + 1; j < PEERS.length; j++) edges.push([i, j]);
  }

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-[28px] border border-line-2 bg-gradient-to-br from-panel to-raised ${className}`}
    >
      <svg viewBox="0 0 400 336" className="absolute inset-0 h-full w-full">
        <defs>
          {/* userSpaceOnUse, not the default. A horizontal line has a zero-height bounding box, and
              a gradient defined in bounding-box units against it renders as nothing — which is
              exactly what happened to the edge between two peers that happened to be level: one of
              the relationships this picture exists to show, silently absent. */}
          <linearGradient id="pa-edge" gradientUnits="userSpaceOnUse" x1="60" y1="0" x2="340" y2="0">
            <stop offset="0%" stopColor="#9a88ff" stopOpacity="0.14" />
            <stop offset="50%" stopColor="#9a88ff" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#9a88ff" stopOpacity="0.14" />
          </linearGradient>
          <radialGradient id="pa-orb">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#c3b6ff" />
            <stop offset="58%" stopColor="#6d55ff" />
            <stop offset="100%" stopColor="#241b6b" />
          </radialGradient>
          <radialGradient id="pa-halo">
            <stop offset="0%" stopColor="#9a88ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#9a88ff" stopOpacity="0" />
          </radialGradient>
          {/* The light the room sits in. Behind the figure, so the edges read against something
              rather than against flat panel colour. */}
          <radialGradient id="pa-room" cx="50%" cy="46%">
            <stop offset="0%" stopColor="#5b46d6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#5b46d6" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="336" fill="url(#pa-room)" />

        {/* Every pair, because every pair is what the contract counts. Twenty-one edges between
            seven people — the density *is* the point, so it is drawn rather than summarised. */}
        {edges.map(([i, j]) => (
          <line
            key={`${i}-${j}`}
            x1={PEERS[i].x}
            y1={PEERS[i].y}
            x2={PEERS[j].x}
            y2={PEERS[j].y}
            stroke="url(#pa-edge)"
            strokeWidth="1"
          />
        ))}

        {/* The hole. Drawn after the edges so it reads as sitting in front of them — a space the
            lines pass behind rather than a shape they connect to. */}
        <circle cx={CX} cy={CY} r="40" fill="var(--color-panel)" fillOpacity="0.72" />
        <circle
          cx={CX}
          cy={CY}
          r="40"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.2"
          strokeDasharray="3 6"
        />

        {PEERS.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="26" fill="url(#pa-halo)" />
            <circle cx={p.x} cy={p.y} r="11" fill="url(#pa-orb)" />
          </g>
        ))}

        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          className="fill-faint"
          style={{ fontSize: 11, letterSpacing: "0.04em" }}
        >
          no central
        </text>
        <text
          x={CX}
          y={CY + 11}
          textAnchor="middle"
          className="fill-faint"
          style={{ fontSize: 11, letterSpacing: "0.04em" }}
        >
          judge
        </text>
      </svg>
    </div>
  );
}
