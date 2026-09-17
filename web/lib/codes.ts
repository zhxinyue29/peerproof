import {
  encodeAbiParameters,
  hashMessage,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";

/// The unprefixed hash the contract builds before applying EIP-191.
function codeInner(escrow: Address, eventId: bigint, subject: Address, epoch: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, address, uint64"), [
      escrow,
      eventId,
      subject,
      epoch,
    ]),
  );
}

function beaconInner(escrow: Address, eventId: bigint, beaconEpoch: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, string, uint64"), [
      escrow,
      eventId,
      "beacon",
      beaconEpoch,
    ]),
  );
}

/// Digest a subject's attest key must sign for `epoch`, i.e. what the contract feeds to
/// `ecrecover`. Mirrors AttendanceEscrow.codeDigest — DigestParity.t.sol pins the two together.
export function codeDigest(
  escrow: Address,
  eventId: bigint,
  subject: Address,
  epoch: bigint,
): Hex {
  return hashMessage({ raw: codeInner(escrow, eventId, subject, epoch) });
}

/// Digest the venue beacon key must sign. Mirrors AttendanceEscrow.beaconDigest.
export function beaconDigest(escrow: Address, eventId: bigint, beaconEpoch: bigint): Hex {
  return hashMessage({ raw: beaconInner(escrow, eventId, beaconEpoch) });
}

/// Signs the *inner* hash via signMessage, so viem applies the EIP-191 prefix exactly once and
/// the result verifies against `codeDigest`. Shows no passkey prompt: the Mera session holds the
/// derived key in memory, which is what makes a 15-second rotation tolerable.
async function signInner(account: LocalAccount, inner: Hex): Promise<Hex> {
  return account.signMessage({ message: { raw: inner } });
}

export type PeerCode = {
  eventId: bigint;
  subject: Address;
  epoch: bigint;
  sig: Hex;
};

export type BeaconCode = {
  eventId: bigint;
  beaconEpoch: bigint;
  sig: Hex;
};

/// Hex is two characters per byte and a QR code pays for every one of them. The attendee's payload
/// is mostly a 65-byte signature and a 20-byte address; in hex that is 174 characters of the 191,
/// and base64url carries the same bytes in 115.
///
/// It matters because of where these codes are read. The venue display is large and scans first
/// time; an attendee's code is on a phone screen being photographed by another phone, through
/// glare and moiré, and that is the one that would not scan. Shorter payload, same physical size,
/// bigger modules — or, as chosen here, the same module count at a higher error-correction level.
function toB64(hex: string): string {
  const b = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(b.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(b.slice(i * 2, i * 2 + 2), 16);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(s: string): string | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    let hex = "0x";
    for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}

/// Payload rendered into the attendee's rotating QR.
export async function makePeerCode(
  account: LocalAccount,
  escrow: Address,
  eventId: bigint,
  epoch: bigint,
): Promise<string> {
  const sig = await signInner(account, codeInner(escrow, eventId, account.address, epoch));
  return `pp2:${eventId}:${toB64(account.address)}:${epoch}:${toB64(sig)}`;
}

/// Payload rendered on the venue display.
export async function makeBeaconCode(
  account: LocalAccount,
  escrow: Address,
  eventId: bigint,
  beaconEpoch: bigint,
): Promise<string> {
  const sig = await signInner(account, beaconInner(escrow, eventId, beaconEpoch));
  return `ppb2:${eventId}:${beaconEpoch}:${toB64(sig)}`;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SIG_RE = /^0x[0-9a-fA-F]{130}$/;

/// Both encodings are accepted. A venue display and the phones in front of it are separate devices
/// that update separately, and a code somebody is holding up right now must not stop being readable
/// because the other screen reloaded first.
export function parsePeerCode(raw: string): PeerCode | null {
  const p = raw.trim().split(":");
  if (p.length !== 5) return null;
  const subject = p[0] === "pp2" ? fromB64(p[2]) : p[0] === "pp1" ? p[2] : null;
  const sig = p[0] === "pp2" ? fromB64(p[4]) : p[0] === "pp1" ? p[4] : null;
  if (!subject || !sig) return null;
  if (!ADDRESS_RE.test(subject) || !SIG_RE.test(sig)) return null;
  try {
    return {
      eventId: BigInt(p[1]),
      subject: subject as Address,
      epoch: BigInt(p[3]),
      sig: sig as Hex,
    };
  } catch {
    return null;
  }
}

export function parseBeaconCode(raw: string): BeaconCode | null {
  const p = raw.trim().split(":");
  if (p.length !== 4) return null;
  const sig = p[0] === "ppb2" ? fromB64(p[3]) : p[0] === "ppb1" ? p[3] : null;
  if (!sig || !SIG_RE.test(sig)) return null;
  try {
    return { eventId: BigInt(p[1]), beaconEpoch: BigInt(p[2]), sig: sig as Hex };
  } catch {
    return null;
  }
}
