import { createPrivateBid, bidMemo, receiptForRound } from './bid.ts';
import { encodeMemo } from './zip321.ts';
import { AUDIT_FORMAT, createManifest, newRoundId, sha256 } from './round.ts';
import type { PrivateReceipt, RoundManifest, RoundRules } from './round.ts';
import type { AuditBundle, ChainMemo } from './audit.ts';

export interface PracticeRound {
  manifest: RoundManifest;
  records: ChainMemo[];
  peers: PrivateReceipt[];
  receipt: PrivateReceipt | null;
  revealed: boolean;
  height: number;
}

async function record(manifest: RoundManifest, height: number, memo: string, serial: number): Promise<ChainMemo> {
  return { txid: await sha256(`LOCAL-SIMULATION:${manifest.rules.tenderId}:${serial}:${memo}`),
    height, pool: 'practice', outputIndex: 0, recipientHex: 'practice',
    valueZatoshis: manifest.rules.submissionZatoshis, shieldedSource: true, memo };
}

export async function createPracticeRound(overrides: Partial<Pick<RoundRules, 'version' | 'title' | 'currency' | 'potMinor' | 'memberCount' | 'discountCapBps'>> = {}): Promise<PracticeRound> {
  const manifest = await createManifest({ version: 1, tenderId: newRoundId(), network: 'practice',
    address: 'local-practice-only', title: 'Sample savings group', currency: 'NGN', potMinor: '60000000',
    memberCount: 8, discountCapBps: 2500, startHeight: 100, commitDeadlineHeight: 112,
    revealDeadlineHeight: 124, submissionZatoshis: '100000', tieBreak: 'earliest-block-then-commitment', ...overrides });
  const anchor = await record(manifest, 99, encodeMemo({ kind: 'anchor', tenderId: manifest.rules.tenderId, rulesHash: manifest.rulesHash }), 0);
  manifest.anchorTxid = anchor.txid;
  const cap = BigInt(manifest.rules.potMinor) * BigInt(manifest.rules.discountCapBps) / 10_000n;
  const peers = await Promise.all([cap * 4n / 15n, cap * 11n / 30n].slice(0, Math.min(2, manifest.rules.memberCount - 1)).map((amount) => createPrivateBid(manifest, amount.toString())));
  const records = [anchor, ...await Promise.all(peers.map((bid, i) => record(manifest, 100 + i,
    encodeMemo(bidMemo('commit', bid)), i + 1)))];
  return { manifest, records, peers, receipt: null, revealed: false, height: 104 };
}

export async function sealPracticeBid(round: PracticeRound, priceMinor: string): Promise<PracticeRound> {
  if (round.receipt || round.height > round.manifest.rules.commitDeadlineHeight) throw new Error('This practice bid is already sealed or bidding has closed.');
  const receipt = await createPrivateBid(round.manifest, priceMinor);
  const output = await record(round.manifest, round.height, encodeMemo(bidMemo('commit', receipt)), round.records.length);
  return { ...round, receipt, records: [...round.records, output] };
}

export async function closePracticeBidding(round: PracticeRound): Promise<PracticeRound> {
  if (round.height > round.manifest.rules.commitDeadlineHeight) throw new Error('Bidding is already closed.');
  const height = round.manifest.rules.commitDeadlineHeight + 1;
  const reveals = await Promise.all(round.peers.map((bid, i) => record(round.manifest, height + i,
    encodeMemo(bidMemo('reveal', bid)), round.records.length + i)));
  return { ...round, height: height + 2, records: [...round.records, ...reveals] };
}

export async function revealPracticeBid(round: PracticeRound, value: unknown = round.receipt): Promise<PracticeRound> {
  const receipt = await receiptForRound(value, round.manifest);
  if (round.height <= round.manifest.rules.commitDeadlineHeight || round.height > round.manifest.rules.revealDeadlineHeight) throw new Error('Not inside the reveal window.');
  if (!round.records.some((item) => item.memo === encodeMemo(bidMemo('commit', receipt)))) throw new Error('Receipt cannot reproduce an existing commitment.');
  if (round.revealed) throw new Error('Your practice bid has already been revealed.');
  const output = await record(round.manifest, round.height, encodeMemo(bidMemo('reveal', receipt)), round.records.length);
  return { ...round, revealed: true, records: [...round.records, output] };
}

export function finishPracticeRound(round: PracticeRound): PracticeRound {
  if (round.height <= round.manifest.rules.commitDeadlineHeight) throw new Error('Close bidding before finishing.');
  return { ...round, height: round.manifest.rules.revealDeadlineHeight + 5 };
}

export function practiceBundle(round: PracticeRound): AuditBundle {
  return { format: AUDIT_FORMAT, manifest: round.manifest, scan: { network: 'practice', source: 'local browser simulation',
    fromHeight: 99, toHeight: Math.min(round.height, round.manifest.rules.revealDeadlineHeight), tipHeight: round.height,
    complete: true, records: round.records } };
}
