/// The four beats of the storyboard, played over the scene, on an eight-second loop.
///
///   0–2s  the room                       nothing from here; the picture is the picture
///   2–4s  a phone resolves               checklist appears, three rows tick one at a time
///   4–6s  the light crosses              the ring lights up, phone to phone, all the way round
///   6–8s  the claim                      "Proof comes from peers." and the tick
///
/// Why this is drawn rather than filmed. Run against the machine's Wan2.2 image-to-video model, the
/// same picture came back at 0.09% mean frame-to-frame difference: a slow zoom and edge shimmer on
/// the lettering, with the ring's brightest point moving nine pixels in 3.4 seconds. A diffusion
/// model has no idea which pixels are "a card", "the second person", or "a tick being drawn", so it
/// cannot be given an order of events — and an order of events is the entire content of this
/// sequence. It can be given here because every coordinate below was measured off the artwork.
///
/// Three things follow from drawing it, and they are why it is worth the code:
///   · the words are translated, where lettering baked into a frame is English for ever
///   · it is vector, so it stays sharp on a retina screen and costs no bytes over the still
///   · the loop closes exactly, with no seam to hide
///
/// CSS keyframes, not Motion. Motion cannot animate until React hydrates, about two seconds from
/// cold on this page — the whole first beat, gone, on the one visit where somebody is deciding
/// whether to stay. CSS runs from the first painted frame.

/// The ring the three of them stand on, in the picture's own 1460×838 space.
///
/// Measured, not assumed. The version before this drew its arcs as bows off a circle at (525, 470)
/// r=224 and they came out as an almond laid over the scene — another shape that belonged to
/// nothing, which is the same fault as the triangle before it. The painted ring is not a circle: a
/// RANSAC fit over the bright purple pixels (72 of 127 sampled points as inliers) gives an ellipse
/// centred (473, 488) with semi-axes 205 and 339.5, rolled 79.2° — wide and flat, seen from above.
/// Drawn from those numbers the arc sits on the painted light instead of near it.
const RING = { cx: 473, cy: 488, rx: 205, ry: 339.5, rot: (79.2 * Math.PI) / 180 };

/// Where each phone is in the picture. The right girl's sits on the ring within 6px; the other two
/// are 43px and 76px inside it, because the artist drew people rather than points on a curve.
const PHONES = {
  top: { x: 505, y: 235 },
  right: { x: 710, y: 600 },
  left: { x: 365, y: 630 },
};

function onRing(u: number) {
  const ct = Math.cos(RING.rot);
  const st = Math.sin(RING.rot);
  const X = RING.rx * Math.cos(u);
  const Y = RING.ry * Math.sin(u);
  return { x: RING.cx + X * ct - Y * st, y: RING.cy + X * st + Y * ct };
}

/// The ring parameter nearest a given point — how a phone is placed on the curve.
function ringAngleOf(p: { x: number; y: number }) {
  const ct = Math.cos(RING.rot);
  const st = Math.sin(RING.rot);
  const dx = p.x - RING.cx;
  const dy = p.y - RING.cy;
  return Math.atan2((-dx * st + dy * ct) / RING.ry, (dx * ct + dy * st) / RING.rx);
}

/// One leg of the circuit: along the painted ring, but pinned to the two phones at its ends.
///
/// Riding the ellipse alone would start and finish up to 76px away from the phone it is supposed to
/// be leaving, which reads as a light that misses. Riding a straight line between the phones would
/// cut across the middle, where the card and the closing line live. So the curve is the ellipse plus
/// each endpoint's own offset, weighted by (1−s)² and s² — full correction at the ends, a quarter of
/// it at the midpoint, and no corner anywhere.
function leg(a: { x: number; y: number }, b: { x: number; y: number }) {
  let ua = ringAngleOf(a);
  let ub = ringAngleOf(b);
  while (ub < ua) ub += Math.PI * 2;

  const pa = onRing(ua);
  const pb = onRing(ub);
  const ax = a.x - pa.x;
  const ay = a.y - pa.y;
  const bx = b.x - pb.x;
  const by = b.y - pb.y;

  const STEPS = 36;
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const s = i / STEPS;
    const p = onRing(ua + (ub - ua) * s);
    const wa = (1 - s) * (1 - s);
    const wb = s * s;
    pts.push(`${(p.x + ax * wa + bx * wb).toFixed(1)} ${(p.y + ay * wa + by * wb).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

/// Her phone is the one that resolves, so the circuit starts there and comes back to it: round the
/// right side to the right girl, along the bottom to the left boy, up the left side and home. The
/// three legs together are the whole ring.
const LEGS = [
  leg(PHONES.top, PHONES.right),
  leg(PHONES.right, PHONES.left),
  leg(PHONES.left, PHONES.top),
];

/// Longer than any leg, so one dash hides a whole path and then lets it out.
const DASH = 1400;

/// Inside the ring and clear of all three of them.
///
/// Placed by measurement rather than by centring it: the left boy's head reaches x=290, the right
/// girl's face starts at x=745, and the top girl's hand is above y=290. The scene also renders about
/// 680px wide for a 1460 viewBox — a 0.465 scale, so readable 14px type has to be written at 30 here
/// and the box has to be this size to hold four lines of it.
const CARD = { x: 330, y: 352, w: 372, h: 236, r: 20 };

type Props = {
  className?: string;
  label: string;
  detected: string;
  rows: [string, string, string];
  line: string;
  verified: string;
};

export default function HeroProofAnimation({
  className = "",
  label,
  detected,
  rows,
  line,
  verified,
}: Props) {
  return (
    // The caller owns the position; this owns only the stacking context. Two position utilities on
    // one element are settled by stylesheet order rather than the order they were written, which has
    // already put this component in the wrong corner once.
    <div className={className}>
      <div className="relative h-full w-full">
        <svg viewBox="0 0 1460 838" className="h-full w-full" role="img" aria-label={label}>
          <defs>
            <linearGradient id="pp-arc" x1="0" y1="0" x2="1460" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#6f56d8" />
              <stop offset="45%" stopColor="#a68bff" />
              <stop offset="100%" stopColor="#6f56d8" />
            </linearGradient>

            {/* The picture is masked transparent over its left 28% and below 62% of its height, so it
                has no edge anywhere it meets something that is not a picture. The arcs run right
                through both of those zones — round the left of the ring and along its bottom — and
                without the same treatment they would carry on glowing over bare page after the
                artwork underneath them had faded out. An SVG mask is safe here where it was not on
                the banner: that one was cropped away by `preserveAspectRatio="slice"`, and this
                viewBox matches its box's aspect exactly, so nothing is cropped. */}
            <linearGradient id="pp-fade-x" x1="0" y1="0" x2="1460" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#000" />
              <stop offset="28%" stopColor="#fff" />
            </linearGradient>
            <linearGradient id="pp-fade-y" x1="0" y1="0" x2="0" y2="838" gradientUnits="userSpaceOnUse">
              <stop offset="62%" stopColor="#fff" />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>
            <mask id="pp-scene-fade">
              <rect width="1460" height="838" fill="url(#pp-fade-x)" />
              <rect width="1460" height="838" fill="url(#pp-fade-y)" style={{ mixBlendMode: "multiply" }} />
            </mask>

            {/* Haze, and the beam it hangs in. Soft radial falloffs rather than a noise filter:
                `feTurbulence` with an animated `baseFrequency` re-renders the filter every frame and
                costs more than everything else on this page put together, while two blurred blobs
                drifting across each other are indistinguishable from smoke at this size. */}
            <radialGradient id="pp-haze">
              <stop offset="0%" stopColor="#8f7ce8" stopOpacity="0.42" />
              <stop offset="60%" stopColor="#6a57bb" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="pp-beam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cdbcff" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#cdbcff" stopOpacity="0" />
            </linearGradient>
            {/* A beam is a solid of light in smoke; a polygon is a shape with edges. Unblurred, this
                one drew a hard pale quadrilateral straight across the stage banner and read as a
                rendering fault rather than as a lamp. 30 units of blur is roughly 14px on screen,
                which is wider than any real edge in the artwork. */}
            <filter id="pp-soften" x="-30%" y="-20%" width="160%" height="150%">
              <feGaussianBlur stdDeviation="30" />
            </filter>
          </defs>

          {/* Beat 1's room, kept alive. Underneath everything, because it is air.
              This is what the video was for and did not deliver: the clip that came back had a
              0.14 mean frame difference over the whole stage third — less motion than the rest of
              the frame, for 250KB. Drawn, it is free, it never stops, and it is slow enough to be
              deniable, which is what atmosphere has to be.
              Periods of 13s and 17s against the sequence's 8s. Anything that divides evenly would
              re-align with the beats every few cycles and start reading as one mechanism. */}
          <g mask="url(#pp-scene-fade)" style={{ mixBlendMode: "screen" }}>
            <polygon className="pp-hero-beam" points="1338,258 1392,258 1250,690 1060,690" fill="url(#pp-beam)" filter="url(#pp-soften)" />
            <ellipse className="pp-hero-haze1" cx="1120" cy="430" rx="300" ry="150" fill="url(#pp-haze)" />
            <ellipse className="pp-hero-haze2" cx="900" cy="330" rx="240" ry="120" fill="url(#pp-haze)" />
          </g>

          {/* Beat 3 — under everything, because the card and the closing line both sit inside the
              ring these arcs draw. */}
          {/* `screen`, not normal. The painted ring passes *behind* the right girl's head; an
              overlay drawn on top of her cut across her face, which is the tell that this is a
              sticker rather than the room's own light. Screened, the stroke adds to what is under it
              — bright where the scene is dark, invisible where the scene is already bright — so it
              passes over her the way light does instead of covering her. */}
          <g
            mask="url(#pp-scene-fade)"
            fill="none"
            stroke="url(#pp-arc)"
            strokeWidth="5"
            strokeLinecap="round"
            style={{ mixBlendMode: "screen" }}
          >
            {LEGS.map((d, i) => (
              <path
                key={d}
                d={d}
                className={`pp-hero-arc pp-hero-arc${i + 1}`}
                strokeDasharray={DASH}
                strokeDashoffset={DASH}
                style={{ filter: "drop-shadow(0 0 12px rgba(150,125,255,.75))" }}
              />
            ))}
          </g>

          {/* Beat 2 — her phone resolving. Hers because it is the one phone in the picture that the
              left-edge fade does not touch. */}
          <circle
            className="pp-hero-pulse"
            cx={PHONES.top.x}
            cy={PHONES.top.y}
            r="30"
            fill="none"
            stroke="#c9f7dd"
            strokeWidth="4"
          />

          <g className="pp-hero-card">
            {/* Tether from her phone down to the card, so the card reads as what her phone is saying
                rather than as a fourth object floating in the room. */}
            <path
              d={`M${PHONES.top.x} ${PHONES.top.y + 28} L${PHONES.top.x} ${CARD.y}`}
              stroke="rgba(180,168,255,.5)"
              strokeWidth="3"
              fill="none"
            />
            <rect
              x={CARD.x}
              y={CARD.y}
              width={CARD.w}
              height={CARD.h}
              rx={CARD.r}
              fill="rgba(20,17,50,.9)"
              stroke="rgba(160,145,255,.45)"
              strokeWidth="2.5"
            />
            <text
              x={CARD.x + 28}
              y={CARD.y + 54}
              fill="#e6e0ff"
              fontSize="30"
              fontWeight="600"
              letterSpacing="-0.5"
            >
              {detected}
            </text>
            {rows.map((r, i) => (
              <g key={r} className={`pp-hero-row pp-hero-row${i + 1}`}>
                <path
                  d={`M${CARD.x + 30} ${CARD.y + 100 + i * 48} l11 12 l20 -24`}
                  stroke="#4ade80"
                  strokeWidth="5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text x={CARD.x + 76} y={CARD.y + 106 + i * 48} fill="#bdb4e6" fontSize="27">
                  {r}
                </text>
              </g>
            ))}
          </g>

          {/* The green point leaving her phone once all three rows have ticked — the attestation
              going out to the room, which is what the ring then carries. */}
          <circle
            className="pp-hero-spark"
            cx={PHONES.top.x}
            cy={PHONES.top.y}
            r="12"
            fill="#4ade80"
            style={{ filter: "drop-shadow(0 0 22px rgba(74,222,128,.95))" }}
          />

          {/* Beat 4 — the claim, where the artwork's own handwriting used to be. */}
          <g className="pp-hero-line">
            <text
              x={RING.cx + 30}
              y={RING.cy - 6}
              textAnchor="middle"
              fill="#eee9ff"
              fontSize="40"
              fontWeight="600"
              letterSpacing="-0.8"
            >
              {line}
            </text>
            {/* Tick and word set from the left rather than both centred on the same point. Centred,
                the English "Verified" is 130 units wide and ran straight into the tick; anchoring the
                word and placing the tick ahead of it keeps the gap fixed whatever the word is, and
                the pair still reads as centred in both languages. */}
            <path
              d={`M${RING.cx - 84} ${RING.cy + 46} l13 14 l24 -28`}
              stroke="#4ade80"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text x={RING.cx - 30} y={RING.cy + 54} fill="#4ade80" fontSize="34" fontWeight="600">
              {verified}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
