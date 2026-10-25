import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateClaimKey, verifyClaimMessage } from '../src/lib/claim-key.ts';
import { createWinnerChallenge, signWinnerClaim, verifyWinnerClaim, validateWinnerProof } from '../src/lib/claim.ts';
import { createPracticeRound, sealPracticeBid, closePracticeBidding, revealPracticeBid, finishPracticeRound, practiceBundle } from '../src/lib/practice.ts';
import { auditRound } from '../src/lib/audit.ts';
import { decodeMemo, encodeMemo } from '../src/lib/zip321.ts';
import { receiptForRound } from '../src/lib/bid.ts';

async function proofRound() {
  let round = await sealPracticeBid(await createPracticeRound({ version: 2 }), '6500000');
  round = await closePracticeBidding(round);
  round = await revealPracticeBid(round);
  return finishPracticeRound(round);
}

test('fresh per-bid keys are generated and v3 memos fit the memo limit', async () => {
  const first = await generateClaimKey(); const second = await generateClaimKey();
  assert.notEqual(first.publicKeyHex, second.publicKeyHex);
  const round = await proofRound();
  assert(round.receipt?.claimPrivateKeyHex);
  assert(round.records.some((record) => record.memo.startsWith('ZT3C ')));
  assert(round.records.some((record) => record.memo.startsWith('ZT3R ')));
  assert(round.records.every((record) => new TextEncoder().encode(record.memo).length <= 512));
  const result = await auditRound(practiceBundle(round));
  assert.equal(result.winner?.claimPublicKeyHex, round.receipt.claimPublicKeyHex);
});

test('the winning private bid can answer a fresh ownership challenge', async () => {
  const round = await proofRound(); const bundle = practiceBundle(round);
  const challenge = await createWinnerChallenge(bundle);
  const proof = await signWinnerClaim(round.receipt, challenge);
  assert.equal(await verifyWinnerClaim(bundle, challenge, proof), true);
  assert(!JSON.stringify(proof).includes(round.receipt!.claimPrivateKeyHex!));
  assert(!JSON.stringify(bundle).includes(round.receipt!.claimPrivateKeyHex!));
  assert(!JSON.stringify(bundle).includes('claimPrivateKeyHex'));
});

test('public opening data cannot forge the winner proof', async () => {
  const round = await proofRound(); const bundle = practiceBundle(round);
  const challenge = await createWinnerChallenge(bundle);
  const attacker = await generateClaimKey();
  await assert.rejects(() => signWinnerClaim({ ...round.receipt, claimPrivateKeyHex: attacker.privateKeyHex }, challenge));
  await assert.rejects(() => signWinnerClaim(round.peers[0], challenge));
});

test('old proofs and changed signatures are rejected against a new challenge', async () => {
  const round = await proofRound(); const bundle = practiceBundle(round);
  const challenge = await createWinnerChallenge(bundle); const proof = await signWinnerClaim(round.receipt, challenge);
  const fresh = await createWinnerChallenge(bundle);
  assert.equal(await verifyWinnerClaim(bundle, fresh, proof), false);
  assert.equal(await verifyWinnerClaim(bundle, challenge, { ...proof, signatureHex: '0'.repeat(128) }), false);
  assert.equal(await verifyWinnerClaim(bundle, challenge, { ...proof, nonceHex: 'e'.repeat(64) }), false);
  assert.throws(() => validateWinnerProof({ ...proof, claimPrivateKeyHex: 'never public' }));
});

test('ownership key is bound to the original offer and private file', async () => {
  const round = await proofRound(); const attacker = await generateClaimKey();
  await assert.rejects(() => receiptForRound({ ...round.receipt, claimPublicKeyHex: attacker.publicKeyHex }, round.manifest));
  const bundle = practiceBundle(round); const output = bundle.scan.records.at(-1)!; const memo = decodeMemo(output.memo);
  assert(memo?.kind === 'reveal');
  const changed = { ...output, memo: encodeMemo({ ...memo, claimPublicKeyHex: attacker.publicKeyHex }) };
  const result = await auditRound({ ...bundle, scan: { ...bundle.scan, records: bundle.scan.records.map((record) => record === output ? changed : record) } });
  assert.notEqual(result.winner?.commitmentHex, round.receipt!.commitmentHex);
});

test('legacy rounds remain readable but cannot pretend to prove ownership', async () => {
  let round = await sealPracticeBid(await createPracticeRound(), '6500000');
  round = await closePracticeBidding(round); round = await revealPracticeBid(round); round = finishPracticeRound(round);
  assert.equal((await auditRound(practiceBundle(round))).ok, true);
  await assert.rejects(() => createWinnerChallenge(practiceBundle(round)));
});

test('identity-point and zero public keys cannot validate an ownership signature', async () => {
  const identity = '01' + '00'.repeat(31);
  assert.equal(await verifyClaimMessage(identity, 'test challenge', identity + '00'.repeat(32)), false);
  assert.equal(await verifyClaimMessage('0'.repeat(64), 'test challenge', '0'.repeat(128)), false);
});
