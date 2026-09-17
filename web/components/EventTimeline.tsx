"use client";

import { countdown } from "@/lib/format";

/// What the three numbers add up to, drawn.
///
/// The rules step asks for "doors open in", "runs for" and a walk-ins switch, and the relationship
/// between them had to be assembled in the reader's head. The spec has flagged this as the form's
/// weakest point since the first draft: three fields describing one shape, and no picture of the
/// shape.
///
/// The bar is the event. The fill is when people can still register, which is the part the switch
/// changes — and seeing it stretch to the end when walk-ins are on says more than either of the
/// two sentences under the checkbox.
export default function EventTimeline({
  doorsMins,
  runsMins,
  walkIns,
}: {
  doorsMins: number;
  runsMins: number;
  walkIns: boolean;
}) {
  const total = Math.max(1, doorsMins + runsMins);
  const doorsAt = (doorsMins / total) * 100;
  const registrationEndsAt = walkIns ? 100 : doorsAt;

  return (
    <div className="rounded-[13px] border border-line-2 bg-ink/60 p-4">
      <p className="text-[15px] font-medium">What participants will experience</p>

      <div className="relative mx-2 mb-3 mt-7 h-2 rounded-full bg-line">
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-accent to-ok"
          style={{ left: 0, width: `${registrationEndsAt}%` }}
        />
        <Tick at={doorsAt} tone="accent" />
        <Tick at={100} tone="ok" />
      </div>

      <div className="flex justify-between gap-2 text-[13px] text-dim">
        <span>Now · registration</span>
        <span className="text-center">
          Doors open
          {doorsMins > 0 && <span className="block text-faint">in {countdown(doorsMins * 60)}</span>}
        </span>
        <span className="text-right">
          Event ends
          <span className="block text-faint">after {countdown(runsMins * 60)}</span>
        </span>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-faint">
        {walkIns
          ? "The bar is filled for as long as people can still register — with walk-ins on, that is the whole event."
          : "Registration closes the moment the doors open. Nobody joins after that."}
      </p>
    </div>
  );
}

function Tick({ at, tone }: { at: number; tone: "accent" | "ok" }) {
  return (
    <span
      className={`absolute -top-[7px] h-5 w-5 -translate-x-1/2 rounded-full border-4 bg-ink ${
        tone === "ok" ? "border-ok" : "border-accent"
      }`}
      style={{ left: `${at}%` }}
    />
  );
}
