import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHALLENGE_FORMAT } from '../src/lib/claim.ts';
import { createClaimHistory } from '../src/lib/claim-history.ts';

const challenge = { format: CHALLENGE_FORMAT, tenderId: 'a'.repeat(16), rulesHash: 'b'.repeat(64), commitmentHex: 'c'.repeat(64), nonceHex: 'd'.repeat(64) };

test('an accepted public challenge cannot be consumed twice in one history', () => {
  const history = createClaimHistory();
  assert.equal(history.isAccepted(challenge), false);
  assert.equal(history.accept(challenge), true);
  assert.equal(history.accept(structuredClone(challenge)), false);
  assert.equal(history.isAccepted(challenge), true);
  assert.equal(history.isAccepted({ ...challenge, nonceHex: 'e'.repeat(64) }), false);
});

test('challenge history uses public context, never private bid data', () => {
  const history = createClaimHistory();
  assert.throws(() => history.accept({ ...challenge, claimPrivateKeyHex: 'not permitted' }));
  assert.equal(history.isAccepted(challenge), false);
  history.accept(challenge);
  assert.equal(history.isAccepted({ ...challenge, commitmentHex: 'e'.repeat(64) }), false);
});

test('a new page history has no durable replay protection', () => {
  const first = createClaimHistory(); first.accept(challenge);
  const newPage = createClaimHistory();
  assert.equal(newPage.isAccepted(challenge), false);
});
