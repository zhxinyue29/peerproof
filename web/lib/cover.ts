/// The colour band at the top of an event card.
///
/// V3 makes the listing visual first, and there is nothing on chain to be visual with: the escrow
/// stores numbers, and the directory stores a title, a blurb and a url (contracts/src/
/// EventDirectory.sol). No image field, and adding one would mean a redeploy plus somewhere to host
/// the files — a second source of truth for a page whose whole argument is that what you see came
/// from the chain. Hot-linking stock photography would be worse: a picture of a room nobody was in.
///
/// So the cover is computed from the id instead of stored. It costs nothing, it needs no network,
/// and it survives the app being served from a static directory behind a QR code. The one property
/// that matters is that it is stable: the same event is the same colour on every device and every
/// reload, so a card is recognisable on the second visit the way a photograph would have been.

/// Six, because that is enough for adjacent cards to look unrelated without the palette turning
/// into a paint chart. Each one is dark at the corners and bright through the middle, which is what
/// keeps white text and a translucent pill legible wherever they land on the band.
///
/// Hand-picked rather than generated from a hue wheel: evenly spaced hues put yellow-green and
/// cyan in the set, and both look like a warning next to this app's purple.
const COVERS = [
  "linear-gradient(135deg, #251a5e 0%, #7b5cff 52%, #191541 100%)", // violet — the brand's own
  "linear-gradient(135deg, #0c2748 0%, #2489c9 55%, #0a1d35 100%)", // deep blue
  "linear-gradient(135deg, #3a1a0d 0%, #cf6a2b 54%, #26120a 100%)", // copper
  "linear-gradient(135deg, #0d2e29 0%, #27a183 55%, #0a2320 100%)", // teal
  "linear-gradient(135deg, #37102e 0%, #bd4796 53%, #240f28 100%)", // magenta
  "linear-gradient(135deg, #141c3d 0%, #4f66db 54%, #0f1530 100%)", // indigo
];

/// A CSS `background` value for one event.
///
/// Modulo rather than a hash of the id: event ids are small and sequential, so this guarantees the
/// six events after each other are six different colours. A hash would collide by luck, and two
/// identical bands side by side read as a rendering bug rather than as coincidence.
export function coverFor(id: bigint): string {
  const n = BigInt(COVERS.length);
  return COVERS[Number(((id % n) + n) % n)];
}
