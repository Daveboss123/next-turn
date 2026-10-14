/**
 * Memo payloads and ZIP-321 payment requests.
 *
 * Why this file has no Zcash dependency: a bidder never needs a Zcash library
 * to submit. We build a `zcash:` payment request (ZIP 321) as a plain string,
 * render it as a QR code, and the bidder's own wallet does the signing and
 * sending. Their keys never reach us.
 *
 * Memo budget: a Zcash shielded memo is 512 bytes and is always padded to that
 * length, so a short payload leaks nothing by being short. Both payloads below
 * are under 110 bytes.
 *
 * Hard rule enforced here: a memo never contains an identity. Everything sent
 * to the tender address becomes publicly readable once the organiser publishes
 * the viewing key after the deadline, so a company name in a memo would be a
 * permanent deanonymisation.
 */

/** Zatoshis per ZEC. */
const ZATOSHIS_PER_ZEC = 100_000_000n;

export type MemoPayload =
  | { kind: 'commit'; tenderId: string; commitmentHex: string }
  | { kind: 'reveal'; tenderId: string; priceMinor: string; saltHex: string };

/**
 * Serialise a payload for the memo field. Space-separated, fixed tag first, so
 * the verifier can reject anything it does not recognise instead of guessing.
 */
export function encodeMemo(payload: MemoPayload): string {
  switch (payload.kind) {
    case 'commit':
      return `ZT1C ${payload.tenderId} ${payload.commitmentHex}`;
    case 'reveal':
      return `ZT1R ${payload.tenderId} ${payload.priceMinor} ${payload.saltHex}`;
  }
}

/**
 * Parse a memo back out. Returns null for anything malformed, because the
 * tender address can receive arbitrary memos from anyone - including junk and
 * deliberate noise - and the verifier must skip those rather than fail.
 */
export function decodeMemo(memo: string): MemoPayload | null {
  // Shielded memos arrive zero-padded to 512 bytes; drop the padding.
  const parts = memo.replace(/\0+$/, '').trim().split(' ');

  if (parts[0] === 'ZT1C' && parts.length === 3) {
    const [, tenderId, commitmentHex] = parts;
    if (/^[0-9a-f]{16}$/.test(tenderId) && /^[0-9a-f]{64}$/.test(commitmentHex)) {
      return { kind: 'commit', tenderId, commitmentHex };
    }
    return null;
  }

  if (parts[0] === 'ZT1R' && parts.length === 4) {
    const [, tenderId, priceMinor, saltHex] = parts;
    if (
      /^[0-9a-f]{16}$/.test(tenderId) &&
      /^(0|[1-9][0-9]{0,17})$/.test(priceMinor) &&
      /^[0-9a-f]{64}$/.test(saltHex)
    ) {
      return { kind: 'reveal', tenderId, priceMinor, saltHex };
    }
    return null;
  }

  return null;
}

/**
 * base64url without padding, per ZIP 321. The spec forbids '+', '/' and '='
 * outright, so we translate the standard alphabet and strip padding.
 */
export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 512) {
    throw new Error(`memo is ${bytes.length} bytes; the limit is 512`);
  }

  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Format zatoshis as a ZIP 321 `amount`. The spec requires a period separator,
 * both sides non-empty, at most 8 fractional digits and no grouping separators,
 * so "0.001" is valid while ".001" and "0.0010000000" are not.
 */
export function formatZecAmount(zatoshis: bigint): string {
  if (zatoshis < 0n) throw new Error('amount cannot be negative');

  const whole = zatoshis / ZATOSHIS_PER_ZEC;
  const fraction = zatoshis % ZATOSHIS_PER_ZEC;
  if (fraction === 0n) return whole.toString();

  const fractionDigits = fraction.toString().padStart(8, '0').replace(/0+$/, '');
  return `${whole}.${fractionDigits}`;
}

/**
 * Build the `zcash:` URI a bidder scans.
 *
 * Every submission for a given tender uses an identical `amount`. That is a
 * privacy requirement, not a detail: the organiser can see the value of each
 * incoming shielded note, so varying amounts would let them distinguish
 * bidders before the deadline.
 */
export function buildPaymentUri(
  address: string,
  zatoshis: bigint,
  payload: MemoPayload,
): string {
  if (!/^[a-z0-9]+$/i.test(address)) {
    throw new Error(`implausible Zcash address: ${JSON.stringify(address)}`);
  }

  const amount = formatZecAmount(zatoshis);
  const memo = toBase64Url(encodeMemo(payload));

  return `zcash:${address}?amount=${amount}&memo=${memo}`;
}
