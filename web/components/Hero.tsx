/// The banner at the top of the listing.
///
/// It exists because a page of text on flat panels is a document, not a product — and because the
/// first thing anybody sees on a fresh deployment is a listing with nothing in it. An empty page
/// that still looks like something was designed is the difference between "not started yet" and
/// "broken".
///
/// The artwork is a signal travelling through a room: several strands crossing between two edges,
/// with light where they meet. It is the same idea the rest of the app draws — people connected,
/// nothing in the middle — at the scale of a banner rather than a thumbnail. Drawn in SVG for the
/// same reason as everything else here: no request, nothing to 404, and it scales from a phone to a
/// projector without a second asset.

function strand(i: number, total: number): string {
  // Each strand is one cubic curve across the full width, fanned vertically and phase-shifted so
  // the bundle reads as motion rather than as a stack of parallel lines.
  const t = i / (total - 1);
  const y = 40 + t * 120;
  const lift = 46 - t * 24;
  const c1 = 150 + i * 14;
  const c2 = 430 - i * 11;
  return `M -20 ${y} C ${c1} ${y - lift}, ${c2} ${y + lift}, 640 ${y - 16 + t * 30}`;
}

const STRANDS = 7;
/// Where the light sits on each strand — roughly the middle, staggered so they do not line up.
const NODES = [
  [196, 78], [305, 96], [412, 70], [258, 128], [366, 140], [468, 112],
] as const;

export default function Hero({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-line-2">
      {/* The wash, the artwork and the content are three layers rather than one background image,
          so the text never sits on top of whichever part of a picture happened to be bright. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(112deg, #241a63 0%, #4c37c9 44%, #6d55ff 72%, #2a1f7a 100%)",
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 640 200"
        preserveAspectRatio="xMaxYMid slice"
        className="absolute inset-y-0 right-0 h-full w-[68%] opacity-90"
      >
        <defs>
          <linearGradient id="hero-strand" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="42%" stopColor="#c9beff" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
          </linearGradient>
          <radialGradient id="hero-node">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* Fades the artwork out where the words are, so the two never compete. */}
          <linearGradient id="hero-mask" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000000" stopOpacity="1" />
            <stop offset="34%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
          <mask id="hero-clip">
            <rect width="640" height="200" fill="#ffffff" />
            <rect width="640" height="200" fill="url(#hero-mask)" />
          </mask>
        </defs>

        <g mask="url(#hero-clip)">
          {Array.from({ length: STRANDS }, (_, i) => (
            <path
              key={i}
              d={strand(i, STRANDS)}
              fill="none"
              stroke="url(#hero-strand)"
              strokeWidth={i % 3 === 0 ? 1.4 : 0.9}
            />
          ))}
          {NODES.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="18" fill="url(#hero-node)" />
              <circle cx={x} cy={y} r="2.6" fill="#ffffff" fillOpacity="0.95" />
            </g>
          ))}
        </g>
      </svg>

      <div className="relative max-w-[42ch] px-6 py-7 md:px-9 md:py-11">
        {eyebrow && (
          <p className="text-[14px] font-medium uppercase tracking-[0.14em] text-[#cfc4ff]">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 text-[26px] font-semibold leading-[1.12] tracking-[-0.02em] text-white md:text-[34px]">
          {title}
        </h2>
        {body && <p className="mt-2.5 text-[16px] leading-relaxed text-[#ded6ff]">{body}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </section>
  );
}
