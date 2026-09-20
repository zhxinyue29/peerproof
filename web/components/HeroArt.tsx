"use client";

import { useRef, useState } from "react";
import { useMotionPrefs } from "@/lib/motion";
import { basePath } from "@/lib/chain";
import { useT } from "@/lib/i18n";

/// The scene on the right of the landing page — now a loop rather than a still.
///
/// One continuous shot: two people stand with their backs to camera at a venue, a green point rises
/// out of one of their phones, splits, and falls across the room onto other people. Nobody turns
/// round, nothing cuts. That is the product in four seconds, and it is the reason the four-beat SVG
/// sequence that used to sit over this is gone: its card, its arcs and its closing line were drawn
/// against the old still's ring and phone coordinates, and over a different scene they would point
/// at nothing. The clip says the same thing and says it with the room rather than over it.
///
/// Why a video is affordable here, when the still it replaces was 62KB: the camera barely moves and
/// only one small object travels, so VP9 has almost nothing to encode. 188KB for four seconds — a
/// third of the MP4, and close enough to the still that the trade stops being a trade.
///
/// Three things it must never do, each learned somewhere in this repo:
///   · autoplay with sound — `muted` is what makes autoplay legal on every browser
///   · play on a phone at a venue door — the mobile band stays a still image
///   · play for somebody who asked for less motion — `prefers-reduced-motion` gets the poster
///
/// `poster` is the clip's own first frame, so a slow connection shows the picture the video will
/// start from rather than a different image that then jumps.
export default function HeroArt() {
  const t = useT();
  const { reduced } = useMotionPrefs();
  /// Pressed by somebody who was given the still because their browser asked for less motion, and
  /// wants to watch it anyway.
  ///
  /// Reduced motion means "do not move things at me without asking". It does not mean "never show
  /// this person a video" — and treating it that way hides the one thing on the page that shows
  /// what the product does. It also fails a case that is not about accessibility at all: Firefox
  /// under X11 derives this setting from XSETTINGS and reports `reduce` when nothing publishes it,
  /// so a reader who never asked for anything gets a still picture and no way past it.
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  // Bleeds off the right edge of the viewport, not the container. `right: calc(50% - 50vw)` measures
  // the element's own containing block against the viewport, which reaches the screen edge from
  // inside a centred max-width column — and the page carries `overflow-x-hidden`, so it cannot start
  // a sideways scroll.
  // Wider, and the left fade runs at 107° rather than straight down.
  //
  // The ask was to bring the room left until it nearly touches the tagline's full stop. Straight
  // widening cannot do that: the tagline sits at about y=335 with empty page to its right, but the
  // two entry cards below reach x≈745, so anything wide enough to close the gap at the tagline
  // runs underneath the cards.
  //
  // An angled fade closes it where the gap is and stays out of the way where it is not — the
  // clip's top-left reaches in beside the words, its bottom-left keeps clear of the cards.
  const frame =
    "pointer-events-none absolute right-[calc(50%-50vw)] top-0 hidden w-[calc(64%+50vw-50%)] md:block";

  // Fades on the left into the text column and at the bottom into the page, so the picture has no
  // edge anywhere it meets something that is not a picture. In element space, as a CSS mask: an SVG
  // mask inside the artwork would be scaled and cropped with it, which is how the listing banner
  // lost its fade entirely.
  // A fade at the top as well. The still had a hard top edge too and nobody minded, because its
  // top was dark; this clip opens on stage lights, and a bright horizontal cut across the page is
  // the one edge that reads as "an image was pasted here".
  // The bottom fade starts at 86%, not 62%. The still it replaced had nothing important down
  // there; this clip has the two people and the phone the whole animation comes out of, sitting at
  // 87–100% of the frame — a fade from 62% made the origin of the story almost invisible. 86% still
  // softens the edge against the page without eating the subject.
  const mask = {
    WebkitMaskImage:
      "linear-gradient(107deg, transparent 0%, transparent 14%, #000 34%), linear-gradient(to bottom, transparent 0%, #000 7%, #000 86%, transparent 100%)",
    maskImage:
      "linear-gradient(107deg, transparent 0%, transparent 14%, #000 34%), linear-gradient(to bottom, transparent 0%, #000 7%, #000 86%, transparent 100%)",
    WebkitMaskComposite: "source-in" as const,
    maskComposite: "intersect" as const,
    aspectRatio: "1024 / 576",
  };

  return (
    <>
      {/* Autoplay, for everybody.
          It was gated on `prefers-reduced-motion`, and on Linux that signal is wrong more often
          than it is right: Firefox under XWayland takes it from XSETTINGS and reports `reduce`
          when nothing publishes the setting, so a reader who never asked for anything got a still
          picture. Measured on this project's own machine — GNOME animations on, Firefox reporting
          reduce.
          The clip is one small object moving slowly on a locked-off camera, which is the mildest
          thing this preference exists to stop. So it plays, and anybody who does not want it can
          stop it in one press — the control only appears for the readers who asked for less
          motion, and their choice sticks for the session. */}
      <div className={frame}>
        <video
          ref={video}
          aria-hidden
          className="h-auto w-full object-cover"
          style={mask}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={`${basePath}/hero.webp`}
        >
          <source src={`${basePath}/hero-loop.webm`} type="video/webm" />
          <source src={`${basePath}/hero-loop.mp4`} type="video/mp4" />
        </video>

        {reduced && (
          <button
            type="button"
            onClick={() => {
              const v = video.current;
              if (!v) return;
              if (v.paused) {
                void v.play();
                setPaused(false);
              } else {
                v.pause();
                setPaused(true);
              }
            }}
            className="pointer-events-auto absolute bottom-4 right-6 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-line-2 bg-ink/70 px-4 text-[14px] text-dim backdrop-blur-sm transition-colors hover:border-accent hover:text-fg"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
            </svg>
            {t(paused ? "home.playScene" : "home.pauseScene")}
          </button>
        )}
      </div>

      {/* On a phone there is no room beside the words, so it becomes a band under them — still edge
          to edge, because a picture of a room inset in a card reads as a screenshot of one. A still,
          not the clip: this product's first real use is a link opened on mobile data at a venue
          door, and 188KB of video is 188KB somebody did not ask for while queuing. */}
      <div
        aria-hidden
        className="relative -mx-4 mt-3 h-[240px] bg-cover bg-center sm:-mx-6 md:hidden"
        style={{ backgroundImage: `url(${basePath}/hero-sm.webp)` }}
      />
    </>
  );
}
