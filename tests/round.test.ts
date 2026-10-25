import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeShieldedAddress, unjumble } from '../src/lib/address.ts';
import { commit } from '../src/lib/commitment.ts';
import { buildPaymentUri, decodeMemo, encodeMemo } from '../src/lib/zip321.ts';
import { createManifest, hashRules, moneyToMinor, formatMoney, roundPhase, validateManifest, validateReceipt } from '../src/lib/round.ts';
import { auditRound } from '../src/lib/audit.ts';
import { createPracticeRound, sealPracticeBid, closePracticeBidding, revealPracticeBid, finishPracticeRound, practiceBundle } from '../src/lib/practice.ts';
import { TEST_ADDRESS } from './fixtures.ts';

async function finishedRound() {
  let round = await createPracticeRound();
  round = await sealPracticeBid(round, '6500000');
  round = await closePracticeBidding(round);
  round = await revealPracticeBid(round);
  return finishPracticeRound(round);
}

test('address decoder checks real checksum and extracts shielded receivers', () => {
  const address = decodeShieldedAddress(TEST_ADDRESS);
  assert.equal(address.network, 'test');
  assert.equal(address.sapling?.length, 86);
  assert.equal(address.orchard?.length, 86);
  assert.throws(() => decodeShieldedAddress(TEST_ADDRESS.slice(0, -1) + 'q'));
  assert.throws(() => decodeShieldedAddress('t1transparent'));
  assert.throws(() => decodeShieldedAddress('tex1transparent'));
  assert.throws(() => decodeShieldedAddress('utest1notarealaddress'));
});

test('F4Jumble inverse matches two published reference vectors', () => {
  for (const [encoded, expected] of [
    ['861c51ee746b0313476967a3483e7e1ff77a2952a17d3ed9e0ab0f502e1179430322da9967b613545b1c36353046ca27', 'The package from Alice arrives tomorrow morning.'],
    ['af1d55f2695aea02440867bbbfae3b08e8da55b625de3fa91432ab7b2c0a7dff9033ee666db1513ba5761ef482919fb8', 'The package from Sarah arrives tomorrow morning.'],
  ]) assert.equal(new TextDecoder().decode(unjumble(new Uint8Array(Buffer.from(encoded, 'hex')))), expected);
});

test('memo encoder refuses malformed fields and identity injection', () => {
  assert.throws(() => encodeMemo({ kind: 'commit', tenderId: 'Dave', commitmentHex: 'a'.repeat(64) }));
  assert.throws(() => encodeMemo({ kind: 'reveal', tenderId: 'a'.repeat(16), priceMinor: '123 Dave', saltHex: 'b'.repeat(64) }));
  assert.equal(decodeMemo('ZT1C ' + 'a'.repeat(16) + ' ' + 'b'.repeat(64) + ' Dave'), null);
  assert.equal(decodeMemo('x'.repeat(513)), null);
});

test('rules anchor memo round-trips and invalid payment addresses are refused', () => {
  const anchor = { kind: 'anchor' as const, tenderId: 'a'.repeat(16), rulesHash: 'b'.repeat(64) };
  assert.deepEqual(decodeMemo(encodeMemo(anchor)), anchor);
  assert.throws(() => buildPaymentUri('t1transparent', 100000n, anchor));
  assert.throws(() => buildPaymentUri(TEST_ADDRESS, 0n, anchor));
  assert.throws(() => buildPaymentUri(TEST_ADDRESS, 2100000000000001n, anchor));
});

test('money formatting and parsing never use floating point', () => {
  assert.equal(moneyToMinor('600000.25'), '60000025');
  assert.equal(moneyToMinor('0.01'), '1');
  assert.equal(formatMoney('60000025', 'NGN'), 'NGN 600,000.25');
  for (const bad of ['01', '-1', '1e6', '1,000', '.50', '1.001', 'Infinity']) assert.throws(() => moneyToMinor(bad));
});

test('changed rules, mainnet, unexpected fields and control characters are refused', async () => {
  const round = await createPracticeRound();
  await assert.rejects(() => validateManifest({ ...round.manifest, rules: { ...round.manifest.rules, discountCapBps: 5000 } }));
  await assert.rejects(() => createManifest({ ...round.manifest.rules, network: 'main' as 'test' }));
  await assert.rejects(() => hashRules({ ...round.manifest.rules, title: 'bad\nround' }));
  await assert.rejects(() => validateManifest({ ...round.manifest, seed: 'never allowed' }));
});

test('phase boundaries include deadlines and a five-block confirmation wait', async () => {
  const { manifest: { rules } } = await createPracticeRound();
  for (const [height, phase] of [[99, 'scheduled'], [100, 'bidding'], [112, 'bidding'], [113, 'reveal'], [124, 'reveal'], [125, 'confirming'], [129, 'complete']] as const) {
    assert.equal(roundPhase(rules, height), phase);
  }
});

test('complete practice round verifies highest discount and rejects a dishonest declared winner', async () => {
  const round = await finishedRound();
  const bundle = practiceBundle(round);
  const result = await auditRound(bundle);
  assert.equal(result.ok, true);
  assert.equal(result.scope, 'practice');
  assert.equal(result.winner?.priceMinor, '6500000');
  assert.equal(result.bids.length, 3);
  const loser = result.bids.find((bid) => bid.commitmentHex !== result.winner?.commitmentHex)!;
  const dishonest = await auditRound({ ...bundle, declaredWinnerCommitment: loser.commitmentHex });
  assert.equal(dishonest.ok, false);
  assert.equal(dishonest.winner, null);
  assert(dishonest.errors.some((error) => error.code === 'wrong-winner'));
});

test('public exports never include private receipt objects or unrevealed price/salt', async () => {
  const round = await sealPracticeBid(await createPracticeRound(), '6500000');
  const exported = JSON.stringify(practiceBundle(round));
  assert(!exported.includes(round.receipt!.saltHex));
  assert(!exported.includes('"priceMinor"'));
  assert(!exported.includes('"receipt"'));
  assert(!exported.includes('"peers"'));
});

test('altered or cross-round private receipts cannot reveal', async () => {
  let round = await sealPracticeBid(await createPracticeRound(), '6500000');
  assert.throws(() => validateReceipt({ ...round.receipt, phrase: 'wallet secrets forbidden' }));
  round = await closePracticeBidding(round);
  await assert.rejects(() => revealPracticeBid(round, { ...round.receipt, priceMinor: '6500001' }));
  await assert.rejects(() => revealPracticeBid(round, { ...round.receipt, tenderId: 'f'.repeat(16) }));
});

test('incomplete, early, duplicate-output and missing-anchor audits fail closed', async () => {
  const bundle = practiceBundle(await finishedRound());
  for (const variant of [
    { ...bundle, scan: { ...bundle.scan, complete: false } },
    { ...bundle, scan: { ...bundle.scan, tipHeight: 124 } },
    { ...bundle, scan: { ...bundle.scan, records: [...bundle.scan.records, bundle.scan.records[1]] } },
    { ...bundle, scan: { ...bundle.scan, records: bundle.scan.records.slice(1) } },
  ]) {
    const result = await auditRound(variant);
    assert.equal(result.ok, false);
    assert.equal(result.winner, null);
  }
});

test('late commitments, wrong amounts and transparent source payments do not count', async () => {
  const bundle = practiceBundle(await finishedRound());
  const commitment = bundle.scan.records[1];
  for (const changed of [
    { ...commitment, height: 113 },
    { ...commitment, valueZatoshis: '100001' },
    { ...commitment, shieldedSource: false },
  ]) {
    const result = await auditRound({ ...bundle, scan: { ...bundle.scan, records: bundle.scan.records.map((record) => record === commitment ? changed : record) } });
    assert.equal(result.bids.length, 2);
    assert(result.rejected.length > 0);
  }
});

test('altered, early and late reveals do not win', async () => {
  const bundle = practiceBundle(await finishedRound());
  const ownReveal = bundle.scan.records.at(-1)!;
  const memo = decodeMemo(ownReveal.memo);
  assert(memo?.kind === 'reveal');
  for (const changed of [
    { ...ownReveal, height: 112 },
    { ...ownReveal, height: 125 },
    { ...ownReveal, memo: encodeMemo({ ...memo, priceMinor: '6500001' }) },
  ]) {
    const toHeight = Math.max(bundle.scan.toHeight, changed.height);
    const result = await auditRound({ ...bundle, scan: { ...bundle.scan, toHeight, records: bundle.scan.records.map((record) => record === ownReveal ? changed : record) } });
    assert.equal(result.winner?.priceMinor, '5500000');
    assert(result.rejected.length > 0);
  }
});

test('discount cap is enforced and unrevealed commitments are void', async () => {
  let round = await sealPracticeBid(await createPracticeRound(), '15000001');
  round = await closePracticeBidding(round);
  const unrevealed = await auditRound(practiceBundle(finishPracticeRound(round)));
  assert(unrevealed.bids.some((bid) => bid.status === 'unrevealed'));
  round = await revealPracticeBid(round);
  const capped = await auditRound(practiceBundle(finishPracticeRound(round)));
  assert(capped.bids.some((bid) => bid.status === 'above-cap'));
  assert.equal(capped.winner?.priceMinor, '5500000');
});

test('more commitments than members is flagged; duplicate commitments count once', async () => {
  const round = await finishedRound();
  const bundle = practiceBundle(round);
  let small = await sealPracticeBid(await createPracticeRound({ memberCount: 2 }), '6500000');
  small = await closePracticeBidding(small); small = await revealPracticeBid(small); small = finishPracticeRound(small);
  const smallBundle = practiceBundle(small);
  const extra = await commit(small.manifest.rules.tenderId, '100', 'c'.repeat(64), small.manifest.rulesHash);
  const extraCommit = { ...smallBundle.scan.records[1], txid: 'c'.repeat(64), height: 104, memo: encodeMemo({ kind: 'commit', tenderId: extra.tenderId, rulesHash: small.manifest.rulesHash, commitmentHex: extra.commitmentHex }) };
  const extraReveal = { ...extraCommit, txid: 'd'.repeat(64), height: 115, memo: encodeMemo({ kind: 'reveal', tenderId: extra.tenderId, rulesHash: small.manifest.rulesHash, priceMinor: extra.priceMinor, saltHex: extra.saltHex }) };
  const result = await auditRound({ ...smallBundle, scan: { ...smallBundle.scan, records: [...smallBundle.scan.records, extraCommit, extraReveal] } });
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === 'too-many-bids'));
  const duplicate = { ...bundle.scan.records[1], txid: 'e'.repeat(64) };
  const deduped = await auditRound({ ...bundle, scan: { ...bundle.scan, records: [...bundle.scan.records, duplicate] } });
  assert.equal(deduped.ok, true);
  assert.equal(deduped.bids.length, 3);
});

test('tie break uses earliest block, then lexicographic commitment', async () => {
  const bundle = practiceBundle(await finishedRound());
  const bids = await Promise.all(['1', '2', '3'].map((salt) => commit(bundle.manifest.rules.tenderId, '100', salt.repeat(64), bundle.manifest.rulesHash)));
  const records = [bundle.scan.records[0], ...bids.flatMap((bid, i) => [
    { ...bundle.scan.records[1], txid: String(i + 1).repeat(64), height: i === 0 ? 104 : 101, memo: encodeMemo({ kind: 'commit', tenderId: bid.tenderId, rulesHash: bundle.manifest.rulesHash, commitmentHex: bid.commitmentHex }) },
    { ...bundle.scan.records[1], txid: String(i + 4).repeat(64), height: 114, memo: encodeMemo({ kind: 'reveal', tenderId: bid.tenderId, rulesHash: bundle.manifest.rulesHash, priceMinor: bid.priceMinor, saltHex: bid.saltHex }) },
  ])];
  const result = await auditRound({ ...bundle, scan: { ...bundle.scan, records } });
  assert.equal(result.winner?.commitmentHex, [bids[1].commitmentHex, bids[2].commitmentHex].sort()[0]);
});

test('a bid cannot be reinterpreted under different rules for the same round ID', async () => {
  const round = await finishedRound();
  const otherHash = 'f'.repeat(64);
  const sealed = await commit(round.receipt!.tenderId, round.receipt!.priceMinor, round.receipt!.saltHex, otherHash);
  assert.notEqual(sealed.commitmentHex, round.receipt!.commitmentHex);
  const bundle = practiceBundle(round);
  const original = bundle.scan.records[1];
  const memo = decodeMemo(original.memo);
  assert(memo?.kind === 'commit');
  const changed = { ...original, memo: encodeMemo({ ...memo, rulesHash: otherHash }) };
  const result = await auditRound({ ...bundle, scan: { ...bundle.scan, records: bundle.scan.records.map((record) => record === original ? changed : record) } });
  assert.equal(result.ok, false);
  assert(result.errors.some((issue) => issue.code === 'rules-conflict'));
});
