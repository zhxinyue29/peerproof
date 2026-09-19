/// The mechanism, in three frames.
///
/// "How it works" was three grey panels of prose with a large translucent numeral behind each one.
/// The numeral gives them a reading order and nothing else — below the fold the landing page had no
/// picture at all, on a product whose entire argument is a shape: money goes into a contract, the
/// room draws lines between itself, and the contract pays out along those lines.
///
/// So the three cards share one drawing and differ only in its state. Same four people in the same
/// places, same bar underneath them, three moments. Reading across, the sequence *is* the
/// explanation — and the fourth person, who never gets a line, is the whole reason the deposit
/// exists.
///
/// Same vocabulary as the rest of the app on purpose: dots for people, lines for attestations,
/// nothing in the middle. EventCover, VouchGraph and ProofArt all draw the same two primitives, so
/// a reader who has seen one has already learned how to read this.

const W = 220;
const H = 96;

/// Four, not three: the settlement frame needs somebody who did not turn up, and with three the
/// no-show is a third of the room, which misrepresents what this is for.
const PEERS = [30, 80, 130, 180].map((x) => ({ x, y: 22 }));

/// The contract. A bar rather than a box because it is a floor everything rests on, not a container
/// somebody owns — and it is deliberately the full width of the people above it.
const BAR = { x: 22, y: 72, w: 176, h: 11, r: 5.5 };

const ACCENT = "#9a88ff";
const OK = "#39d98a";
const FAINT = "#b2becf";

/// An arc between two peers, bowed upward so parallel pairs stay distinguishable.
function arc(a: { x: number; y: number }, b: { x: number; y: number }, lift: number): string {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} Q ${mx} ${a.y - lift}, ${b.x} ${b.y}`;
}

/// Four frames, not three.
///
/// The third used to be settlement and the second carried both the door and the vouching. Those are
/// two different transactions on two different clocks — a beacon signature spent at the door, then
/// peer attestations all evening — and that separation is the load-bearing idea in this product:
/// it is what makes an attestation mean presence rather than mean a forwarded screenshot. A figure
/// that merges them is a figure that hides the mechanism.
export default function StepFigure({ step }: { step: 1 | 2 | 3 | 4 }) {
  // Who is confirmed at settlement. The last peer is the no-show in every frame that has one, so
  // the eye can follow the same person across all three cards.
  const confirmed = (i: number) => i < PEERS.length - 1;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      className="h-[96px] w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* ---------------------------------------------------------------- 01 · deposits in --- */}
      {step === 1 && (
        <>
          {PEERS.map((p, i) => (
            <g key={i}>
              {/* Dashed, because the money is in transit in this frame and settled in none of it. */}
              <line
                x1={p.x}
                y1={p.y + 9}
                x2={p.x}
                y2={BAR.y - 6}
                stroke={ACCENT}
                strokeWidth="1.4"
                strokeDasharray="3 4"
                strokeOpacity="0.75"
              />
              <path
                d={`M ${p.x - 3.5} ${BAR.y - 10} L ${p.x} ${BAR.y - 4} L ${p.x + 3.5} ${BAR.y - 10}`}
                fill="none"
                stroke={ACCENT}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.9"
              />
            </g>
          ))}
        </>
      )}

      {/* ------------------------------------------------------------- 02 · peers vouch ------ */}
      {step === 2 && (
        <>
          {/* The pairs that already exist, and then the one being made — which is brighter and
              thicker, because every one of these is a separate transaction and the point of the
              frame is that they arrive one at a time. */}
          <path d={arc(PEERS[0], PEERS[1], 16)} fill="none" stroke={ACCENT} strokeWidth="1.3" strokeOpacity="0.4" />
          <path d={arc(PEERS[1], PEERS[2], 16)} fill="none" stroke={ACCENT} strokeWidth="1.3" strokeOpacity="0.4" />
          <path d={arc(PEERS[0], PEERS[2], 30)} fill="none" stroke={ACCENT} strokeWidth="1.3" strokeOpacity="0.28" />
          <path d={arc(PEERS[2], PEERS[3], 16)} fill="none" stroke={ACCENT} strokeWidth="2.1" strokeOpacity="0.95" />
        </>
      )}

      {/* ------------------------------------------------------------ 03 · contract pays ----- */}
      {step === 4 && (
        <>
          {PEERS.map((p, i) =>
            confirmed(i) ? (
              <g key={i}>
                <line
                  x1={p.x}
                  y1={BAR.y - 4}
                  x2={p.x}
                  y2={p.y + 9}
                  stroke={OK}
                  strokeWidth="1.6"
                  strokeOpacity="0.85"
                />
                <path
                  d={`M ${p.x - 3.5} ${p.y + 15} L ${p.x} ${p.y + 9} L ${p.x + 3.5} ${p.y + 15}`}
                  fill="none"
                  stroke={OK}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ) : null,
          )}
        </>
      )}

      {/* The bar is in every frame, and only its weight changes: waiting, holding, paying. */}
      <rect
        x={BAR.x}
        y={BAR.y}
        width={BAR.w}
        height={BAR.h}
        rx={BAR.r}
        fill={step === 4 ? OK : ACCENT}
        fillOpacity={step === 2 || step === 3 ? 0.1 : 0.22}
        stroke={step === 4 ? OK : ACCENT}
        strokeWidth="1.2"
        strokeOpacity={step === 2 || step === 3 ? 0.35 : 0.8}
      />

      {PEERS.map((p, i) => {
        // Frame 3 is the only one that has a verdict; before it, nobody is confirmed or refused.
        const filled = step === 3 && confirmed(i);
        const absent = step === 3 && !confirmed(i);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="6"
            fill={filled ? OK : "#16233c"}
            stroke={filled ? OK : absent ? FAINT : ACCENT}
            strokeWidth="1.8"
            strokeOpacity={absent ? 0.45 : 1}
          />
        );
      })}
    </svg>
  );
}
