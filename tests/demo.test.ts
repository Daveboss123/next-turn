import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoManifest } from '../src/lib/demo.ts';
import { TEST_ADDRESS } from './fixtures.ts';

const receiver = { format: 'nextturn-round-receiver-v1', network: 'test', address: TEST_ADDRESS };
const tip = { format: 'nextturn-chain-tip-v1', network: 'test', source: 'https://testnet.zec.rocks:443',
  height: 4_530_000, blockHash: 'a'.repeat(64), fetchedAtUnixSeconds: 1000 };

test('the controlled demo pins two slots, ownership keys, fixed payments and buffered deadlines', async () => {
  const round = await createDemoManifest(receiver, tip, 1050);
  assert.equal(round.rules.version, 2);
  assert.equal(round.rules.memberCount, 2);
  assert.equal(round.rules.submissionZatoshis, '100000');
  assert.equal(round.rules.startHeight, tip.height + 1000);
  assert.equal(round.rules.commitDeadlineHeight, tip.height + 1600);
  assert.equal(round.rules.revealDeadlineHeight, tip.height + 2200);
  assert.equal(round.anchorTxid, null);
  assert(!JSON.stringify(round).includes('claimPrivateKeyHex'));
});

test('demo preparation rejects wrong-network and secret-bearing receiver files', async () => {
  await assert.rejects(() => createDemoManifest({ ...receiver, network: 'main' }, tip, 1050));
  await assert.rejects(() => createDemoManifest({ ...receiver, seed: 'not allowed' }, tip, 1050));
  await assert.rejects(() => createDemoManifest({ ...receiver, uivk: 'not public before bidding closes' }, tip, 1050));
});

test('demo preparation rejects stale tips and overflowing block windows', async () => {
  await assert.rejects(() => createDemoManifest(receiver, tip, 1121));
  await assert.rejects(() => createDemoManifest(receiver, { ...tip, height: 0xffffffff - 5 }, 1050));
});
