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

/// Payload rendered into the attendee's rotating QR.
export async function makePeerCode(
  account: LocalAccount,
  escrow: Address,
  eventId: bigint,
  epoch: bigint,
): Promise<string> {
  const sig = await signInner(account, codeInner(escrow, eventId, account.address, epoch));
  return `pp1:${eventId}:${account.address}:${epoch}:${sig}`;
}

/// Payload rendered on the venue display.
export async function makeBeaconCode(
  account: LocalAccount,
  escrow: Address,
  eventId: bigint,
  beaconEpoch: bigint,
): Promise<string> {
  const sig = await signInner(account, beaconInner(escrow, eventId, beaconEpoch));
  return `ppb1:${eventId}:${beaconEpoch}:${sig}`;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SIG_RE = /^0x[0-9a-fA-F]{130}$/;

export function parsePeerCode(raw: string): PeerCode | null {
  const p = raw.trim().split(":");
  if (p.length !== 5 || p[0] !== "pp1") return null;
  if (!ADDRESS_RE.test(p[2]) || !SIG_RE.test(p[4])) return null;
  try {
    return {
      eventId: BigInt(p[1]),
      subject: p[2] as Address,
      epoch: BigInt(p[3]),
      sig: p[4] as Hex,
    };
  } catch {
    return null;
  }
}

export function parseBeaconCode(raw: string): BeaconCode | null {
  const p = raw.trim().split(":");
  if (p.length !== 4 || p[0] !== "ppb1") return null;
  if (!SIG_RE.test(p[3])) return null;
  try {
    return { eventId: BigInt(p[1]), beaconEpoch: BigInt(p[2]), sig: p[3] as Hex };
  } catch {
    return null;
  }
}
