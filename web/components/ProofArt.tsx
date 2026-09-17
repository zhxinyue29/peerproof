/// The mechanism, drawn.
///
/// Three peers, each connected to the other two, and a dashed hole where a product like this would
/// normally put its own logo — the arbiter, the escrow agent, the company you have to trust. There
/// is nothing there, and that absence is the entire argument. It says in one image what the page
/// takes two paragraphs to say.
///
/// Pure CSS and one SVG: no image file to load, nothing to go stale, and it scales to whatever box
/// it is given.
export default function ProofArt({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-[28px] border border-line-2 bg-gradient-to-br from-panel to-raised ${className}`}
    >
      <svg viewBox="0 0 400 320" className="absolute inset-0 h-full w-full">
        <defs>
          {/* userSpaceOnUse, not the default. A horizontal line has a zero-height bounding box, and
              a gradient defined in bounding-box units against it renders as nothing — which is
              exactly what happened to the edge between the two upper peers: one of the three
              relationships this picture exists to show, silently absent. */}
          <linearGradient id="pa-edge" gradientUnits="userSpaceOnUse" x1="60" y1="0" x2="340" y2="0">
            <stop offset="0%" stopColor="#9a88ff" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#9a88ff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#9a88ff" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="pa-orb">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="18%" stopColor="#9b8aff" />
            <stop offset="60%" stopColor="#6048ff" />
            <stop offset="100%" stopColor="#231a68" />
          </radialGradient>
        </defs>

        {/* Every pair, because every pair is what the contract counts. */}
        <line x1="86" y1="96" x2="314" y2="96" stroke="url(#pa-edge)" strokeWidth="2" />
        <line x1="86" y1="96" x2="200" y2="252" stroke="url(#pa-edge)" strokeWidth="2" />
        <line x1="314" y1="96" x2="200" y2="252" stroke="url(#pa-edge)" strokeWidth="2" />

        <circle cx="200" cy="150" r="34" fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeDasharray="4 5" />

        <circle cx="86" cy="96" r="26" fill="url(#pa-orb)" />
        <circle cx="314" cy="96" r="26" fill="url(#pa-orb)" />
        <circle cx="200" cy="252" r="26" fill="url(#pa-orb)" />

        <text
          x="200"
          y="145"
          textAnchor="middle"
          className="fill-faint"
          style={{ fontSize: 11, letterSpacing: "0.02em" }}
        >
          no central
        </text>
        <text
          x="200"
          y="160"
          textAnchor="middle"
          className="fill-faint"
          style={{ fontSize: 11, letterSpacing: "0.02em" }}
        >
          judge
        </text>
      </svg>
    </div>
  );
}
