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
/// WebP, and two of them. As a PNG this one image was 877KB of a 1316KB page — two thirds of
/// everything the landing page downloads, on a product whose first real use is somebody opening a
/// link on mobile data at a venue door. The same picture is 65KB as WebP q86: mean per-channel
/// difference 0.69, and the largest difference anywhere is inside the brightest glow.
///
/// The phone gets its own 900px copy at 31KB rather than the full one, because there it is a
/// cropped band about 390px wide and the extra pixels are downloaded to be thrown away.
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
          Left edge at 53% of the column, which is where the design puts it — measured, not judged:
          its scene starts at x=806 of 1536 with a 1216 content column, so 646/1216. At 38% the two
          entry cards sat on top of the artwork, which is the thing that was covering it.
          Left edge at 38%, not 46%. The artwork is 1.74 wide to tall; at 46% the box came out at
          1.54, so `cover` scaled to the height and took the difference off the width — which is the
          side the fourth figure stands on. Matching the box to the picture is what keeps everyone
          in frame.
          Anchored to the right, not the centre. `cover` has to crop something, and centred it
          took the crop off both ends — which cut the top label in half. Pinned to the top, the whole
          crop lands on the bottom of the frame, where the design already cuts the nearest figure
          off at the shoulders. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[calc(50%-50vw)] top-0 hidden w-[calc(47%+50vw-50%)] bg-cover bg-center md:block"
        style={{
          // The box takes the picture's own proportions, so `cover` has nothing to crop. Sized off
          // the width and given the aspect, rather than stretched to the section's height: the left
          // column decides that height, and every time it changed — a longer headline, a taller
          // card — `cover` re-cropped the artwork and took a different figure out of frame.
          aspectRatio: "1460 / 838",
          backgroundImage: "url(hero.webp)",
          // Fades on the left into the text column and on the bottom into the page, so the
          // picture has no edge anywhere it meets something that is not a picture.
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, #000 28%), linear-gradient(to bottom, #000 62%, transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, #000 28%), linear-gradient(to bottom, #000 62%, transparent 100%)",
          WebkitMaskComposite: "source-in",
          maskComposite: "intersect",
        }}
      />

      {/* On a phone there is no room beside the words, so it becomes a band under them — still
          edge to edge, because a picture of a room inset in a card reads as a screenshot of one. */}
      <div
        aria-hidden
        className="relative -mx-4 mt-8 h-[260px] bg-cover bg-center sm:-mx-6 md:hidden"
        style={{ backgroundImage: "url(hero-sm.webp)" }}
      />
    </>
  );
}
