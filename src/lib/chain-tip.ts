/** Public chain reading imported locally; never accepts keys or bid data. */
import { isHeight, isHex, requireKeys, requireObject } from './round.ts';
export const TIP_FORMAT = 'nextturn-chain-tip-v1';
export const TIP_MAX_AGE_SECONDS = 120;

export interface ChainTip {
  format: typeof TIP_FORMAT;
  network: 'test';
  source: string;
  height: number;
  blockHash: string;
  fetchedAtUnixSeconds: number;
}

function publicSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200 || !value.startsWith('https://') || /[\s\\@?#]/.test(value)) return false;
  try {
    const source = new URL(value);
    return source.protocol === 'https:' && source.hostname.length > 0 && !source.username && !source.password && !source.search && !source.hash;
  } catch { return false; }
}

export function validateChainTip(value: unknown, now = Math.floor(Date.now() / 1000)): ChainTip {
  const object = requireObject(value, 'Public chain tip');
  requireKeys(object, ['format', 'network', 'source', 'height', 'blockHash', 'fetchedAtUnixSeconds'], 'Public chain tip');
  if (object.format !== TIP_FORMAT || object.network !== 'test' || !isHeight(object.height)
    || !isHex(object.blockHash, 64) || !publicSource(object.source)
    || typeof object.fetchedAtUnixSeconds !== 'number' || !Number.isSafeInteger(object.fetchedAtUnixSeconds) || object.fetchedAtUnixSeconds < 0
    || !Number.isSafeInteger(now) || now < 0) {
    throw new Error('Use a testnet chain-tip file from the native checker. This file must not contain wallet keys.');
  }
  const age = now - object.fetchedAtUnixSeconds;
  if (age < -30 || age > TIP_MAX_AGE_SECONDS) throw new Error('The chain reading is stale or the clock is inconsistent. Fetch a fresh tip file before preparing a request.');
  return object as unknown as ChainTip;
}
