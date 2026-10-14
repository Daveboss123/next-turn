/**
 * Core commitment logic for sealed tenders.
 *
 * Design notes (these matter for the security argument, not just the code):
 *
 * 1. A bid is sealed by publishing SHA-256(tender, price, salt) instead of the
 *    price. The salt is 32 random bytes. Without it the commitment would be
 *    trivially breakable: tender prices are low-entropy (round numbers in a
 *    narrow range), so an organiser could hash every plausible price and match.
 *
 * 2. The tender id is inside the hashed input ("domain separation"). This stops
 *    a commitment from one tender being replayed into another.
 *
 * 3. Prices are handled as integer minor units (e.g. cents) in a decimal
 *    string. Floating point is never used, so a commitment can never fail to
 *    reproduce because of a rounding difference.
 *
 * 4. Nothing here touches the network, and no salt ever leaves the bidder's
 *    device. That is what keeps a server breach from unsealing bids.
 */

/** Prefix binding every commitment to this scheme and version. */
const COMMITMENT_DOMAIN = 'ZTENDER-v1';

/** Bytes of randomness per salt. 32 bytes puts brute force out of reach. */
const SALT_BYTES = 32;

export interface SealedBid {
  tenderId: string;
  /** Price in integer minor units, as a decimal string. */
  priceMinor: string;
  /** 64 lowercase hex characters (32 bytes). */
  saltHex: string;
  /** 64 lowercase hex characters (SHA-256). */
  commitmentHex: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fresh salt from the platform CSPRNG. Available in browsers and in Node >= 18.
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * The exact byte string that gets hashed. Kept as its own function so the
 * verifier and the bidder provably agree on the encoding; if these two ever
 * disagree, every commitment fails to reproduce and the bug is loud.
 *
 * Fields are joined with ':' and none of them may contain ':' - enforced by
 * the validation in `commit`.
 */
export function commitmentPreimage(
  tenderId: string,
  priceMinor: string,
  saltHex: string,
): string {
  return `${COMMITMENT_DOMAIN}:${tenderId}:${priceMinor}:${saltHex}`;
}

function assertValidField(name: string, value: string, pattern: RegExp): void {
  if (!pattern.test(value)) {
    throw new Error(`invalid ${name}: ${JSON.stringify(value)}`);
  }
}

/**
 * Seal a bid. Returns the commitment plus the salt the bidder must keep in
 * order to reveal later - losing the salt makes the bid unrevealable and void.
 */
export async function commit(
  tenderId: string,
  priceMinor: string,
  saltHex: string = generateSalt(),
): Promise<SealedBid> {
  assertValidField('tenderId', tenderId, /^[0-9a-f]{16}$/);
  assertValidField('priceMinor', priceMinor, /^(0|[1-9][0-9]{0,17})$/);
  assertValidField('saltHex', saltHex, /^[0-9a-f]{64}$/);

  const preimage = commitmentPreimage(tenderId, priceMinor, saltHex);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(preimage),
  );

  return {
    tenderId,
    priceMinor,
    saltHex,
    commitmentHex: toHex(new Uint8Array(digest)),
  };
}

/**
 * Recompute a commitment from a revealed price and salt and compare it to what
 * was committed on-chain. This is the single check that makes a reveal binding:
 * a bidder who changes their price after seeing others produces a different
 * hash and is rejected.
 *
 * Returns false rather than throwing on malformed input, because the verifier
 * must treat an unparseable reveal as "invalid bid", not as a crash.
 */
export async function verifyReveal(
  commitmentHex: string,
  tenderId: string,
  priceMinor: string,
  saltHex: string,
): Promise<boolean> {
  try {
    const recomputed = await commit(tenderId, priceMinor, saltHex);
    return constantTimeEquals(recomputed.commitmentHex, commitmentHex.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Length-independent comparison. Commitments are public so timing is not
 * really a concern here, but comparing digests this way is the habit to keep.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
