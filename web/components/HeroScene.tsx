"use client";

import { useT } from "@/lib/i18n";

/// The right half of the landing page.
///
/// The design this follows puts a rendered 3D scene here — three people holding phones, speech
/// bubbles, a dashed triangle of light between them. The artwork itself cannot be drawn from code,
/// so this builds everything around it that can be: the triangle, the nodes where the light sits,
/// the two bubbles, the line that names what the picture is about, and the three chips that float
/// over it.
///
/// Drop the rendered artwork at `web/public/hero.png` and it appears underneath, with this SVG
/// sitting on top of it as the overlay it was always meant to be. Until then the SVG carries the
/// scene on its own, which is a weaker picture but an honest one — nothing here is a placeholder
/// box with a filename in it.

/// The three people, as the design places them: two facing in from the sides, one with their back
/// to us at the bottom. The triangle between them is the whole subject.
const NODES = [
  { x: 300, y: 118, key: "top" },
  { x: 132, y: 286, key: "left" },
  { x: 452, y: 286, key: "right" },
];

function Chip({
  label,
  className,
  icon,
}: {
  label: string;
  className: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={`pointer-events-none absolute flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#141c30]/85 px-4 py-3 backdrop-blur-sm ${className}`}
      style={{ boxShadow: "0 12px 32px -18px rgba(0,0,0,0.9)" }}
    >
      <span className="shrink-0 text-accent-2">{icon}</span>
      <span className="text-[13px] font-medium uppercase leading-[1.25] tracking-[0.06em] text-fg">
        {label}
      </span>
    </span>
  );
}

const PeopleIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="9" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.7" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
    <path d="M15 18.5a4.6 4.6 0 0 1 5.8-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
  </svg>
);

const LinkIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M10 13.5a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const CoinsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <ellipse cx="12" cy="6.6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5 6.6v4.4c0 1.66 3.13 3 7 3s7-1.34 7-3V6.6" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5 11v4.4c0 1.66 3.13 3 7 3s7-1.34 7-3V11" stroke="currentColor" strokeWidth="1.7" opacity="0.6" />
  </svg>
);

export default function HeroScene() {
  const t = useT();

  return (
    <div className="relative min-h-[380px] w-full md:min-h-[520px]">
      {/* The artwork, when there is one — as a background, not an <img>.
          An <img> whose file is missing draws the browser's broken-image glyph and a 1px frame
          around the whole panel, and `onError` cannot prevent it: the request fails while the
          static HTML is still parsing, long before React attaches the handler. So the landing page
          showed a torn-picture icon in the middle of the hero until hydration caught up. A
          background-image that 404s paints nothing, silently, from the first frame. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url(hero.png)" }}
      />

      <svg
        viewBox="0 0 584 420"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={t("scene.proofFromPeers")}
      >
        <defs>
          <radialGradient id="hs-node">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="24%" stopColor="#c8bcff" />
            <stop offset="60%" stopColor="#6d55ff" />
            <stop offset="100%" stopColor="#6d55ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Dashed, because an attestation is a thing that happens rather than a wire that exists. */}
        <path
          d={`M ${NODES[0].x} ${NODES[0].y} L ${NODES[1].x} ${NODES[1].y} L ${NODES[2].x} ${NODES[2].y} Z`}
          fill="none"
          stroke="#9a88ff"
          strokeWidth="1.6"
          strokeOpacity="0.55"
          strokeDasharray="7 9"
          strokeLinejoin="round"
        />

        {NODES.map((n) => (
          <g key={n.key}>
            <circle cx={n.x} cy={n.y} r="26" fill="url(#hs-node)" opacity="0.55" />
            <circle cx={n.x} cy={n.y} r="7.5" fill="#ffffff" fillOpacity="0.96" />
          </g>
        ))}

        <text
          x="292"
          y="222"
          textAnchor="middle"
          className="fill-fg"
          style={{ fontSize: 21, fontStyle: "italic", letterSpacing: "0.01em" }}
        >
          {t("scene.proofFromPeers")}
        </text>
      </svg>

      {/* Bubbles and chips are HTML rather than SVG text: they wrap, they take the app's font
          stack, and a Chinese line that runs long grows the pill instead of overflowing it. */}
      <span className="pointer-events-none absolute left-[4%] top-[26%] rounded-2xl rounded-bl-md bg-white/90 px-3.5 py-2 text-[14px] font-medium text-[#1b1436] shadow-lg">
        {t("scene.imHere")}
      </span>
      <span className="pointer-events-none absolute right-[3%] top-[32%] rounded-2xl rounded-br-md bg-white/90 px-3.5 py-2 text-[14px] font-medium text-[#1b1436] shadow-lg">
        {t("scene.meToo")}
      </span>

      <Chip label={t("scene.realPeople")} icon={PeopleIcon} className="left-1/2 top-0 -translate-x-1/2" />
      <Chip label={t("scene.onchain")} icon={LinkIcon} className="bottom-[12%] left-0 max-w-[46%]" />
      <Chip label={t("scene.fairPayouts")} icon={CoinsIcon} className="bottom-[12%] right-0 max-w-[46%]" />
    </div>
  );
}
