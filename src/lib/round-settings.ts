import { moneyToMinor } from './round.ts';
import type { RoundRules } from './round.ts';

export const ROUND_CURRENCIES = ['NGN', 'USD', 'GBP', 'XAF', 'XOF', 'INR'];

export type EditableRoundSettings = Pick<RoundRules, 'title' | 'currency' | 'potMinor' | 'memberCount' | 'discountCapBps'>;

export interface RoundSettingsDraft {
  title: string;
  currency: string;
  pot: string;
  members: string;
  cap: string;
}

/** Editable decimal text, without floating-point money or display commas. */
export function minorToInput(value: string | bigint): string {
  const minor = BigInt(value);
  const fraction = (minor % 100n).toString().padStart(2, '0');
  return `${minor / 100n}${fraction === '00' ? '' : `.${fraction.replace(/0$/, '')}`}`;
}

export function roundSettingsDraft(rules: EditableRoundSettings): RoundSettingsDraft {
  return { title: rules.title, currency: rules.currency, pot: minorToInput(rules.potMinor),
    members: String(rules.memberCount), cap: minorToInput(BigInt(rules.discountCapBps)) };
}

export function parseRoundSettings(draft: RoundSettingsDraft): EditableRoundSettings {
  const title = draft.title.trim();
  // oxlint-disable-next-line no-control-regex -- Public titles must not include controls or lone surrogates.
  if (!title || title.length > 80 || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(title)) throw new Error('Use a public round name of 1–80 characters, without personal details.');
  if (!/^[A-Z]{3}$/.test(draft.currency)) throw new Error('Choose a three-letter currency label.');
  if (!/^\d+$/.test(draft.members) || Number(draft.members) < 2 || Number(draft.members) > 100) throw new Error('Set the number of participants to a whole number between 2 and 100.');
  let potMinor: string;
  try { potMinor = moneyToMinor(draft.pot); } catch { throw new Error('Enter the pot amount with up to two decimal places and no commas.'); }
  if (BigInt(potMinor) <= 0n) throw new Error('The pot must be greater than zero.');
  let cap: string;
  try { cap = moneyToMinor(draft.cap); } catch { throw new Error('Enter the maximum offer percentage with up to two decimal places.'); }
  if (BigInt(cap) < 1n || BigInt(cap) > 10_000n) throw new Error('Set the maximum offer between 0.01% and 100% of the pot.');
  return { title, currency: draft.currency, potMinor, memberCount: Number(draft.members), discountCapBps: Number(cap) };
}
