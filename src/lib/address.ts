/**
 * ZIP-316 R0 / Sapling address decoding, with no network access.
 * A prefix is not a privacy check: a Unified Address can contain a transparent
 * fallback. Decode its receivers and reject that fallback before building a URI.
 * F4Jumble uses the maintained @noble/hashes BLAKE2b implementation.
 */
import { blake2b } from '@noble/hashes/blake2.js';

const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

export interface ShieldedAddress {
  network: 'main' | 'test';
  sapling?: string;
  orchard?: string;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function polymod(values: number[]): number {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) checksum ^= GENERATORS[i];
    }
  }
  return checksum >>> 0;
}

function decodeBech32(address: string): { hrp: string; bytes: Uint8Array; checksum: number } {
  if (typeof address !== 'string' || address.length > 512 || address !== address.toLowerCase()) {
    throw new Error('Use a lowercase shielded address, at most 512 characters.');
  }
  const separator = address.lastIndexOf('1');
  if (separator < 1 || separator + 7 > address.length) throw new Error('Invalid shielded address.');
  const hrp = address.slice(0, separator);
  const words = Array.from(address.slice(separator + 1), (char) => ALPHABET.indexOf(char));
  if (words.some((word) => word < 0)) throw new Error('Invalid address character.');
  const expanded = [...Array.from(hrp, (c) => c.charCodeAt(0) >>> 5), 0,
    ...Array.from(hrp, (c) => c.charCodeAt(0) & 31)];
  const checksum = polymod([...expanded, ...words]);
  let accumulator = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const word of words.slice(0, -6)) {
    accumulator = ((accumulator << 5) | word) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 255);
    }
  }
  if (bits >= 5 || ((accumulator << (8 - bits)) & 255) !== 0) {
    throw new Error('Invalid address padding.');
  }
  return { hrp, bytes: new Uint8Array(bytes), checksum };
}

/** Exported for comparison with the published Rust F4Jumble test vectors. */
export function unjumble(input: Uint8Array): Uint8Array {
  if (input.length < 48 || input.length > 320) throw new Error('Unsupported Unified Address length.');
  const bytes = input.slice();
  const split = Math.min(64, Math.floor(bytes.length / 2));
  const left = bytes.subarray(0, split);
  const right = bytes.subarray(split);
  const xor = (target: Uint8Array, source: Uint8Array) => {
    for (let i = 0; i < Math.min(target.length, source.length); i++) target[i] ^= source[i];
  };
  const h = (round: number) => xor(left, blake2b(right, {
    dkLen: left.length,
    personalization: new Uint8Array([...new TextEncoder().encode('UA_F4Jumble_H'), round, 0, 0]),
  }));
  const g = (round: number) => {
    for (let block = 0; block * 64 < right.length; block++) {
      xor(right.subarray(block * 64), blake2b(left, {
        dkLen: 64,
        personalization: new Uint8Array([
          ...new TextEncoder().encode('UA_F4Jumble_G'), round, block & 255, block >>> 8,
        ]),
      }));
    }
  };
  h(1); g(1); h(0); g(0);
  return bytes;
}

export function decodeShieldedAddress(address: string): ShieldedAddress {
  const { hrp, bytes, checksum } = decodeBech32(address);
  if (hrp === 'zs' || hrp === 'ztestsapling') {
    if (checksum !== 1 || bytes.length !== 43) throw new Error('Invalid Sapling address checksum or length.');
    return { network: hrp === 'zs' ? 'main' : 'test', sapling: bytesToHex(bytes) };
  }
  if (hrp !== 'u' && hrp !== 'utest') {
    throw new Error('Use a shielded-only ZIP-316 R0 Unified Address or a Sapling address. Transparent and unsupported address formats are refused.');
  }
  if (checksum !== 0x2bc830a3) throw new Error('Invalid Unified Address checksum.');
  const decoded = unjumble(bytes);
  const padding = new Uint8Array(16);
  padding.set(new TextEncoder().encode(hrp));
  if (!decoded.slice(-16).every((byte, i) => byte === padding[i])) {
    throw new Error('Invalid Unified Address network padding.');
  }
  const receivers = decoded.subarray(0, -16);
  const result: ShieldedAddress = { network: hrp === 'u' ? 'main' : 'test' };
  let cursor = 0;
  let previousType = -1;
  while (cursor < receivers.length) {
    // This deliberately supports only known 43-byte receivers. All their
    // CompactSize values fit in one byte; unknown/metadata items fail closed.
    const type = receivers[cursor++];
    const length = receivers[cursor++];
    if (type === 0 || type === 1) throw new Error('This address has a transparent receiver. Generate a shielded-only round address.');
    if ((type !== 2 && type !== 3) || type <= previousType || length !== 43 || cursor + length > receivers.length) {
      throw new Error('Unsupported, duplicate or malformed Unified Address receiver.');
    }
    result[type === 2 ? 'sapling' : 'orchard'] = bytesToHex(receivers.slice(cursor, cursor + length));
    previousType = type;
    cursor += length;
  }
  if (!result.sapling && !result.orchard) throw new Error('Address has no supported shielded receiver.');
  return result;
}
