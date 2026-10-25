import { decodeShieldedAddress } from './address.ts';
import { commit } from './commitment.ts';
import { decodeMemo } from './zip321.ts';
import {
  AUDIT_FORMAT, CONFIRMATION_BLOCKS, MAX_ROUND_BLOCKS, discountCapMinor,
  isHeight, isHex, isMinor, requireKeys, requireObject, validateManifest,
} from './round.ts';
import type { RoundManifest } from './round.ts';

export interface ChainMemo {
  txid: string;
  height: number;
  pool: 'practice' | 'sapling' | 'orchard' | 'ironwood';
  outputIndex: number;
  recipientHex: string;
  valueZatoshis: string;
  shieldedSource: boolean;
  memo: string;
}

export interface AuditScan {
  network: 'practice' | 'test';
  source: string;
  fromHeight: number;
  toHeight: number;
  tipHeight: number;
  complete: boolean;
  records: ChainMemo[];
}

export interface AuditBundle {
  format: typeof AUDIT_FORMAT;
  manifest: RoundManifest;
  scan: AuditScan;
  declaredWinnerCommitment?: string | null;
}

export interface AuditedBid {
  commitmentHex: string;
  commitHeight: number;
  revealHeight: number | null;
  priceMinor: string | null;
  status: 'valid' | 'unrevealed' | 'above-cap';
  claimPublicKeyHex: string | null;
}

export interface AuditIssue { code: string; message: string; txid?: string }
export interface AuditResult {
  ok: boolean;
  scope: 'practice' | 'supplied-records';
  winner: AuditedBid | null;
  bids: AuditedBid[];
  errors: AuditIssue[];
  rejected: AuditIssue[];
  ignored: number;
  claim: 'not-provided' | 'matches' | 'mismatch';
}

export async function validateBundle(value: unknown): Promise<AuditBundle> {
  const object = requireObject(value, 'Audit file');
  requireKeys(object, ['format', 'manifest', 'scan', 'declaredWinnerCommitment'], 'Audit file');
  if (object.format !== AUDIT_FORMAT) throw new Error('Not a NextTurn public result file.');
  const manifest = await validateManifest(object.manifest);
  if (object.declaredWinnerCommitment !== undefined && object.declaredWinnerCommitment !== null
    && !isHex(object.declaredWinnerCommitment, 64)) throw new Error('Invalid declared winning commitment.');
  const scan = requireObject(object.scan, 'Scan');
  requireKeys(scan, ['network', 'source', 'fromHeight', 'toHeight', 'tipHeight', 'complete', 'records'], 'Scan');
  if (scan.network !== manifest.rules.network || typeof scan.source !== 'string' || scan.source.length > 200
    || !isHeight(scan.fromHeight) || !isHeight(scan.toHeight) || !isHeight(scan.tipHeight)
    || scan.fromHeight > scan.toHeight || scan.toHeight > scan.tipHeight
    || scan.toHeight - scan.fromHeight + 1 > MAX_ROUND_BLOCKS || typeof scan.complete !== 'boolean') {
    throw new Error('Invalid or inconsistent scan metadata.');
  }
  if (!Array.isArray(scan.records) || scan.records.length > 10_000) throw new Error('Audit file is too large (maximum 10,000 outputs).');
  const records = scan.records.map((value): ChainMemo => {
    const record = requireObject(value, 'Output');
    requireKeys(record, ['txid', 'height', 'pool', 'outputIndex', 'recipientHex', 'valueZatoshis', 'shieldedSource', 'memo'], 'Output');
    if (!isHex(record.txid, 64) || !isHeight(record.height) || typeof record.outputIndex !== 'number'
      || !Number.isInteger(record.outputIndex) || record.outputIndex < 0 || record.outputIndex > 1_000_000
      || !['practice', 'sapling', 'orchard', 'ironwood'].includes(String(record.pool))
      || typeof record.recipientHex !== 'string' || !isMinor(record.valueZatoshis)
      || typeof record.shieldedSource !== 'boolean' || typeof record.memo !== 'string'
      || new TextEncoder().encode(record.memo).length > 512
      || record.height < (scan.fromHeight as number) || record.height > (scan.toHeight as number)) {
      throw new Error('Malformed or out-of-range output in audit file.');
    }
    if (manifest.rules.network === 'practice') {
      if (record.pool !== 'practice' || record.recipientHex !== 'practice') throw new Error('Practice records must be explicitly simulated.');
    } else if (record.pool === 'practice' || !isHex(record.recipientHex, 86)) {
      throw new Error('Testnet records must identify a real shielded receiver.');
    }
    return record as unknown as ChainMemo;
  });
  return {
    format: AUDIT_FORMAT, manifest, scan: { ...scan, records } as unknown as AuditScan,
    ...(object.declaredWinnerCommitment === undefined ? {} : { declaredWinnerCommitment: object.declaredWinnerCommitment as string | null }),
  };
}

/**
 * Recompute the outcome from SUPPLIED records. This does not authenticate chain
 * data or prove completeness of an imported JSON file. The native verifier must
 * fetch the full range independently; the UI must always explain this boundary.
 */
export async function auditRound(value: unknown): Promise<AuditResult> {
  const bundle = await validateBundle(value);
  const { manifest, scan } = bundle;
  const { rules } = manifest;
  const errors: AuditIssue[] = [];
  const rejected: AuditIssue[] = [];
  let ignored = 0;
  const error = (code: string, message: string) => errors.push({ code, message });
  if (!scan.complete) error('incomplete-scan', 'The scan is incomplete. No award can be verified.');
  if (scan.fromHeight >= rules.startHeight || scan.toHeight < rules.revealDeadlineHeight) error('incomplete-window', 'The scan must include the rules anchor and the entire bidding and reveal windows.');
  if (scan.tipHeight < rules.revealDeadlineHeight + CONFIRMATION_BLOCKS) error('not-final', 'Wait for the reveal deadline and five additional blocks before checking a final outcome.');
  if (!manifest.anchorTxid) error('missing-anchor', 'This is a draft: no rules anchor transaction is specified.');
  const receivers = rules.network === 'test' ? decodeShieldedAddress(rules.address) : null;
  const identities = new Set<string>();
  const commitments = new Map<string, ChainMemo>();
  const reveals: { record: ChainMemo; priceMinor: string; saltHex: string; claimPublicKeyHex?: string }[] = [];
  let anchorFound = false;
  for (const record of scan.records) {
    const identity = `${record.txid}:${record.pool}:${record.outputIndex}`;
    if (identities.has(identity)) {
      error('duplicate-output', 'The same transaction output appears twice in the supplied data.');
      continue;
    }
    identities.add(identity);
    if (receivers) {
      const expected = record.pool === 'sapling' ? receivers.sapling : receivers.orchard;
      if (!expected || expected !== record.recipientHex) { ignored++; continue; }
    }
    const memo = decodeMemo(record.memo);
    if (!memo || memo.tenderId !== rules.tenderId) { ignored++; continue; }
    const reject = (code: string, message: string) => rejected.push({ code, message, txid: record.txid });
    if (record.valueZatoshis !== rules.submissionZatoshis) {
      reject('wrong-amount', 'Protocol payment does not use the pinned fixed amount.'); continue;
    }
    if (!record.shieldedSource) {
      reject('transparent-source', 'Payment has transparent inputs and is not accepted as a private bid.'); continue;
    }
    if (memo.kind !== 'anchor') {
      if (memo.rulesHash === undefined) { reject('legacy-memo', 'This round requires rules-bound bids, not legacy memos.'); continue; }
      if (memo.rulesHash !== manifest.rulesHash) {
        error('rules-conflict', 'A bid refers to different rules for the same round. No award can be verified.'); continue;
      }
      if ((rules.version === 2) !== (memo.claimPublicKeyHex !== undefined)) {
        reject('proof-policy', 'Bid memo does not match this round’s ownership-proof policy.'); continue;
      }
    }
    if (memo.kind === 'anchor') {
      if (record.txid === manifest.anchorTxid && memo.rulesHash === manifest.rulesHash && record.height < rules.startHeight) anchorFound = true;
      else reject('invalid-anchor', 'Rules anchor is late, has a different hash, or is not the advertised transaction.');
    } else if (memo.kind === 'commit') {
      if (record.height < rules.startHeight || record.height > rules.commitDeadlineHeight) {
        reject('late-commit', 'Commitment is outside the pinned bidding window.'); continue;
      }
      const existing = commitments.get(memo.commitmentHex);
      if (existing) {
        const original = decodeMemo(existing.memo);
        if (original?.kind === 'commit' && original.claimPublicKeyHex !== memo.claimPublicKeyHex) {
          error('conflicting-proof-keys', 'Duplicate commitment records refer to different ownership keys.'); continue;
        }
      }
      if (!existing || record.height < existing.height) commitments.set(memo.commitmentHex, record);
      if (existing) reject('duplicate-commit', 'Duplicate commitment counts once, at its earliest valid block.');
    } else {
      if (record.height <= rules.commitDeadlineHeight || record.height > rules.revealDeadlineHeight) {
        reject('reveal-window', 'Reveal is outside the pinned reveal window.'); continue;
      }
      reveals.push({ record, priceMinor: memo.priceMinor, saltHex: memo.saltHex, claimPublicKeyHex: memo.claimPublicKeyHex });
    }
  }
  if (!anchorFound) error('unverified-rules', 'The advertised rules hash was not anchored before bidding opened.');
  if (commitments.size > rules.memberCount) error('too-many-bids', 'There are more distinct valid commitments than the advertised member count. This flags an invalid round, not verified membership.');
  const bids = new Map<string, AuditedBid>();
  for (const [commitmentHex, record] of commitments) {
    const memo = decodeMemo(record.memo);
    bids.set(commitmentHex, { commitmentHex, commitHeight: record.height, revealHeight: null, priceMinor: null, status: 'unrevealed',
      claimPublicKeyHex: memo?.kind === 'commit' ? memo.claimPublicKeyHex ?? null : null });
  }
  for (const reveal of reveals) {
    const sealed = await commit(rules.tenderId, reveal.priceMinor, reveal.saltHex, manifest.rulesHash, reveal.claimPublicKeyHex);
    const bid = bids.get(sealed.commitmentHex);
    if (!bid) {
      rejected.push({ code: 'unmatched-reveal', message: 'Reveal does not reproduce a valid on-time commitment.', txid: reveal.record.txid }); continue;
    }
    if (bid.claimPublicKeyHex !== (reveal.claimPublicKeyHex ?? null)) {
      rejected.push({ code: 'proof-key-mismatch', message: 'Opening uses a different ownership key from the committed bid.', txid: reveal.record.txid }); continue;
    }
    if (bid.revealHeight !== null && bid.revealHeight <= reveal.record.height) continue;
    bid.revealHeight = reveal.record.height;
    bid.priceMinor = reveal.priceMinor;
    bid.status = BigInt(reveal.priceMinor) <= discountCapMinor(rules) ? 'valid' : 'above-cap';
  }
  const allBids = Array.from(bids.values()).sort((a, b) => a.commitHeight - b.commitHeight || (a.commitmentHex < b.commitmentHex ? -1 : a.commitmentHex > b.commitmentHex ? 1 : 0));
  const valid = allBids.filter((bid) => bid.status === 'valid').sort((a, b) => {
    const prices = BigInt(b.priceMinor!) - BigInt(a.priceMinor!);
    return prices > 0n ? 1 : prices < 0n ? -1 : a.commitHeight - b.commitHeight || (a.commitmentHex < b.commitmentHex ? -1 : a.commitmentHex > b.commitmentHex ? 1 : 0);
  });
  const calculatedWinner = valid[0] ?? null;
  let claim: AuditResult['claim'] = 'not-provided';
  if (bundle.declaredWinnerCommitment !== undefined) {
    claim = bundle.declaredWinnerCommitment === (calculatedWinner?.commitmentHex ?? null) ? 'matches' : 'mismatch';
    if (claim === 'mismatch') error('wrong-winner', 'The declared winner does not follow from the pinned rules and valid revealed bids.');
  }
  return { ok: errors.length === 0, scope: rules.network === 'practice' ? 'practice' : 'supplied-records',
    winner: errors.length === 0 ? calculatedWinner : null, bids: allBids, errors, rejected, ignored, claim };
}
