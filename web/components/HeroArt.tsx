/// The scene on the right of the landing page.
///
/// It is one image, and everything in it — the three people, the dashed triangle, the light at each
/// corner, the speech bubbles, the three labels — is part of that image rather than drawn on top.
/// An earlier version built the triangle and the labels in SVG and HTML and left a slot underneath
/// for artwork that did not exist; overlaying them on the real artwork would mean two coordinate
/// systems that have to agree about where a chip sits, and they only agree at one aspect ratio.
///
/// Cropped from the design itself, so this is the design's own picture rather than an approximation
/// of it. One repair was needed on the way in: the "REAL PEOPLE" label carried a second line of
/// broken glyphs — a rendering fault in the mockup, not a design decision — and it is painted out
/// by tiling a clean row of the chip's own background over it.
///
/// Not translatable, and that is the trade. The three labels are set in English inside the picture.
/// Lifting them back out into HTML would make them translatable and would also reintroduce the
/// alignment problem, so it is worth doing only if the labels have to speak Chinese.
export default function HeroArt() {
  return (
    <>
      {/* Bleeds off the right edge of the viewport, not the container.
          `right: calc(50% - 50vw)` measures the element's own containing block against the viewport,
          which reaches the screen edge from inside a centred max-width column — and the page already
          carries `overflow-x-hidden`, so it cannot start a sideways scroll.
          The fade is a CSS mask, in element space: an SVG mask inside the artwork would be scaled
          and cropped along with it, which is how the listing banner lost its fade entirely.
          Anchored to the top-right, not the centre. `cover` has to crop something, and centred it
          took the crop off both ends — which cut the top label in half. Pinned to the top, the whole
          crop lands on the bottom of the frame, where the design already cuts the nearest figure
          off at the shoulders. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-[46%] right-[calc(50%-50vw)] hidden bg-cover bg-right-top md:block"
        style={{
          backgroundImage: "url(hero.png)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 30%)",
          maskImage: "linear-gradient(to right, transparent 0%, #000 30%)",
        }}
      />

      {/* On a phone there is no room beside the words, so it becomes a band under them — still
          edge to edge, because a picture of a room inset in a card reads as a screenshot of one. */}
      <div
        aria-hidden
        className="relative -mx-4 mt-8 h-[260px] bg-cover bg-center sm:-mx-6 md:hidden"
        style={{ backgroundImage: "url(hero.png)" }}
      />
    </>
  );
}
