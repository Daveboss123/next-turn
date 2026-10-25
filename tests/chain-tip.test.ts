import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TIP_FORMAT, validateChainTip } from '../src/lib/chain-tip.ts';
import { buildPaymentUri, paymentRequestDetails } from '../src/lib/zip321.ts';
import { TEST_ADDRESS } from './fixtures.ts';

const tip = { format: TIP_FORMAT, network: 'test', source: 'https://testnet.zec.rocks:443', height: 4_530_000, blockHash: 'a'.repeat(64), fetchedAtUnixSeconds: 1000 };
test('fresh public chain readings validate while stale/future ones fail', () => {
  assert.equal(validateChainTip(tip, 1050).height, tip.height);
  assert.throws(() => validateChainTip(tip, 1121));
  assert.throws(() => validateChainTip(tip, 969));
});
test('wrong-network and secret-bearing chain files are rejected', () => {
  assert.throws(() => validateChainTip({ ...tip, network: 'main' }, 1050));
  assert.throws(() => validateChainTip({ ...tip, seed: 'not permitted' }, 1050));
  assert.throws(() => validateChainTip({ ...tip, source: 'https://server/?token=secret' }, 1050));
});
test('malformed server URLs and invalid clocks fail closed', () => {
  for (const source of ['https://', 'https://host\\path', 'https://host\n', 'https://user:password@host', 'http://host']) {
    assert.throws(() => validateChainTip({ ...tip, source }, 1050));
  }
  assert.throws(() => validateChainTip(tip, NaN));
  assert.throws(() => validateChainTip({ ...tip, fetchedAtUnixSeconds: -1 }, 1050));
  assert.equal(validateChainTip(tip, 1120).height, tip.height);
  assert.equal(validateChainTip(tip, 970).height, tip.height);
});
test('manual wallet fields match the exact locally encoded payment request', () => {
  const memo = { kind: 'commit' as const, tenderId: 'a'.repeat(16), rulesHash: 'b'.repeat(64), commitmentHex: 'c'.repeat(64), claimPublicKeyHex: 'd'.repeat(64) };
  const details = paymentRequestDetails(buildPaymentUri(TEST_ADDRESS, 100000n, memo));
  assert.equal(details.address, TEST_ADDRESS); assert.equal(details.amount, '0.001');
  assert.equal(details.memo, `ZT3C ${memo.tenderId} ${memo.rulesHash} ${memo.commitmentHex} ${memo.claimPublicKeyHex}`);
});
