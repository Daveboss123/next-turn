import { bytesToHex, decodeShieldedAddress } from './address.ts';
import { generateSalt } from './commitment.ts';

export const ROUND_FORMAT = 'sealed-tender-round-v1';
export const AUDIT_FORMAT = 'sealed-tender-audit-v1';
export const RECEIPT_FORMAT = 'sealed-tender-receipt-v1';
export const CONFIRMATION_BLOCKS = 5;
export const MAX_ROUND_BLOCKS = 20_000;
export const FIXED_SUBMISSION_ZATOSHIS = '100000';

export interface RoundRules {
  version: 1 | 2;
  tenderId: string;
  network: 'practice' | 'test';
  address: string;
  title: string;
  currency: string;
  potMinor: string;
  memberCount: number;
  discountCapBps: number;
  startHeight: number;
  commitDeadlineHeight: number;
  revealDeadlineHeight: number;
  submissionZatoshis: string;
  tieBreak: 'earliest-block-then-commitment';
}

export interface RoundManifest {
  format: typeof ROUND_FORMAT;
  rules: RoundRules;
  rulesHash: string;
  anchorTxid: string | null;
}

export interface PrivateReceipt {
  format: typeof RECEIPT_FORMAT;
  rulesHash: string;
  tenderId: string;
  priceMinor: string;
  saltHex: string;
  commitmentHex: string;
  /** Fresh proof key for this bid only. Never export in public result files. */
  claimPublicKeyHex?: string;
  claimPrivateKeyHex?: string;
}

export function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be a JSON object.`);
  return value as Record<string, unknown>;
}

export function requireKeys(object: Record<string, unknown>, keys: string[], name: string): void {
  if (Object.keys(object).some((key) => !keys.includes(key))) throw new Error(`${name} contains unsupported fields. Do not include identities or wallet secrets.`);
}

export function isHex(value: unknown, length: number): value is string {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
}

export function isMinor(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,17})$/.test(value);
}

export function isHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 0xffffffff - CONFIRMATION_BLOCKS;
}

export function validateRules(value: unknown): RoundRules {
  const rules = requireObject(value, 'Round rules');
  requireKeys(rules, ['version', 'tenderId', 'network', 'address', 'title', 'currency', 'potMinor',
    'memberCount', 'discountCapBps', 'startHeight', 'commitDeadlineHeight', 'revealDeadlineHeight',
    'submissionZatoshis', 'tieBreak'], 'Round rules');
  if ((rules.version !== 1 && rules.version !== 2) || !isHex(rules.tenderId, 16)) throw new Error('Unsupported round version or invalid round ID.');
  if (rules.network !== 'practice' && rules.network !== 'test') throw new Error('Only local practice and Zcash testnet are supported.');
  if (typeof rules.address !== 'string') throw new Error('Round address is missing.');
  if (rules.network === 'practice') {
    if (rules.address !== 'local-practice-only') throw new Error('Practice rounds cannot use a wallet address.');
  } else if (decodeShieldedAddress(rules.address).network !== 'test') {
    throw new Error('Use a testnet address. Mainnet funds are not supported.');
  }
  // oxlint-disable-next-line no-control-regex -- Reject controls and lone surrogates in public rule titles.
  if (typeof rules.title !== 'string' || rules.title.trim() !== rules.title || rules.title.length < 1 || rules.title.length > 80 || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(rules.title)) {
    throw new Error('Use a public round title of 1–80 characters without control characters.');
  }
  if (typeof rules.currency !== 'string' || !/^[A-Z]{3}$/.test(rules.currency)) throw new Error('Use a three-letter currency label, such as NGN.');
  if (!isMinor(rules.potMinor) || BigInt(rules.potMinor) <= 0n) throw new Error('Pot must be a positive amount in integer minor units.');
  if (typeof rules.memberCount !== 'number' || !Number.isInteger(rules.memberCount) || rules.memberCount < 2 || rules.memberCount > 100) throw new Error('Round size must be between 2 and 100 members.');
  if (typeof rules.discountCapBps !== 'number' || !Number.isInteger(rules.discountCapBps) || rules.discountCapBps < 1 || rules.discountCapBps > 10_000) throw new Error('Discount cap must be between 0.01% and 100%.');
  if (!isHeight(rules.startHeight) || !isHeight(rules.commitDeadlineHeight) || !isHeight(rules.revealDeadlineHeight)
    || rules.startHeight >= rules.commitDeadlineHeight || rules.commitDeadlineHeight >= rules.revealDeadlineHeight
    || rules.revealDeadlineHeight - rules.startHeight + 1 > MAX_ROUND_BLOCKS - 100) {
    throw new Error('Use increasing block heights within a round window of at most 19,900 blocks.');
  }
  if (rules.submissionZatoshis !== FIXED_SUBMISSION_ZATOSHIS) throw new Error('Every protocol payment must use exactly 0.001 testnet ZEC, plus the wallet fee.');
  if (rules.tieBreak !== 'earliest-block-then-commitment') throw new Error('Unsupported tie-breaking rule.');
  return rules as unknown as RoundRules;
}

/** Exact shared preimage: JSON array in this order, UTF-8, no whitespace. */
export function rulesPreimage(rules: RoundRules): string {
  return JSON.stringify(['ZTENDER-RULES-v1', rules.version, rules.tenderId, rules.network,
    rules.address, rules.title, rules.currency, rules.potMinor, rules.memberCount,
    rules.discountCapBps, rules.startHeight, rules.commitDeadlineHeight,
    rules.revealDeadlineHeight, rules.submissionZatoshis, rules.tieBreak]);
}

export async function sha256(text: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

export async function hashRules(rules: RoundRules): Promise<string> {
  validateRules(rules);
  return sha256(rulesPreimage(rules));
}

export async function createManifest(rules: RoundRules): Promise<RoundManifest> {
  return { format: ROUND_FORMAT, rules: validateRules(rules), rulesHash: await hashRules(rules), anchorTxid: null };
}

export async function validateManifest(value: unknown): Promise<RoundManifest> {
  const object = requireObject(value, 'Round file');
  requireKeys(object, ['format', 'rules', 'rulesHash', 'anchorTxid'], 'Round file');
  if (object.format !== ROUND_FORMAT || !isHex(object.rulesHash, 64)) throw new Error('Not a NextTurn round file.');
  const rules = validateRules(object.rules);
  if (object.anchorTxid !== null && !isHex(object.anchorTxid, 64)) throw new Error('Anchor transaction ID must be 64 lowercase hex characters or null for a draft.');
  if (await hashRules(rules) !== object.rulesHash) throw new Error('Rules fingerprint mismatch. This round file has been changed.');
  return { format: ROUND_FORMAT, rules, rulesHash: object.rulesHash, anchorTxid: object.anchorTxid as string | null };
}

export function validateReceipt(value: unknown): PrivateReceipt {
  const object = requireObject(value, 'Private receipt');
  requireKeys(object, ['format', 'rulesHash', 'tenderId', 'priceMinor', 'saltHex', 'commitmentHex', 'claimPublicKeyHex', 'claimPrivateKeyHex'], 'Private receipt');
  if (object.format !== RECEIPT_FORMAT || !isHex(object.rulesHash, 64) || !isHex(object.tenderId, 16)
    || !isMinor(object.priceMinor) || !isHex(object.saltHex, 64) || !isHex(object.commitmentHex, 64)) {
    throw new Error('Invalid private bid receipt. Never import a wallet recovery phrase or spending key.');
  }
  if (object.claimPublicKeyHex !== undefined || object.claimPrivateKeyHex !== undefined) {
    if (!isHex(object.claimPublicKeyHex, 64) || typeof object.claimPrivateKeyHex !== 'string'
      || object.claimPrivateKeyHex.length < 96 || object.claimPrivateKeyHex.length > 512
      || object.claimPrivateKeyHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(object.claimPrivateKeyHex)) {
      throw new Error('Invalid bid-proof key fields. Keep the private bid file private.');
    }
  }
  return object as unknown as PrivateReceipt;
}

export function newRoundId(): string { return generateSalt().slice(0, 16); }

export function discountCapMinor(rules: RoundRules): bigint {
  return BigInt(rules.potMinor) * BigInt(rules.discountCapBps) / 10_000n;
}

export function moneyToMinor(value: string): string {
  if (!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value)) throw new Error('Enter an amount with at most two decimal places, without commas.');
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
}

export function formatMoney(value: string | bigint, currency: string): string {
  const minor = BigInt(value);
  const whole = (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (minor % 100n).toString().padStart(2, '0');
  return `${currency} ${whole}${fraction === '00' ? '' : `.${fraction}`}`;
}

export function roundPhase(rules: RoundRules, height: number): 'scheduled' | 'bidding' | 'reveal' | 'confirming' | 'complete' {
  if (height < rules.startHeight) return 'scheduled';
  if (height <= rules.commitDeadlineHeight) return 'bidding';
  if (height <= rules.revealDeadlineHeight) return 'reveal';
  if (height < rules.revealDeadlineHeight + CONFIRMATION_BLOCKS) return 'confirming';
  return 'complete';
}
