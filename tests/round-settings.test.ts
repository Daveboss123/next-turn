import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoundSettings, roundSettingsDraft } from '../src/lib/round-settings.ts';

const valid = { title: 'Friday savings circle', currency: 'NGN', pot: '600000', members: '4', cap: '20' };

test('public round settings use exact decimals and whole participants', () => {
  assert.deepEqual(parseRoundSettings(valid), {
    title: 'Friday savings circle', currency: 'NGN', potMinor: '60000000', memberCount: 4, discountCapBps: 2000,
  });
  assert.equal(parseRoundSettings({ ...valid, cap: '12.5' }).discountCapBps, 1250);
  assert.equal(parseRoundSettings({ ...valid, cap: '0.01' }).discountCapBps, 1);
  assert.deepEqual(roundSettingsDraft({ title: 'K', currency: 'USD', potMinor: '1250', memberCount: 3, discountCapBps: 1250 }),
    { title: 'K', currency: 'USD', pot: '12.5', members: '3', cap: '12.5' });
});

test('public round settings reject private-looking or impossible rules', () => {
  for (const draft of [
    { ...valid, title: '  ' },
    { ...valid, title: 'Control\u0000name' },
    { ...valid, title: 'x'.repeat(81) },
    { ...valid, currency: 'ngn' },
    { ...valid, members: '1' },
    { ...valid, members: '101' },
    { ...valid, members: '3.5' },
    { ...valid, pot: '0' },
    { ...valid, pot: '1,000' },
    { ...valid, cap: '0' },
    { ...valid, cap: '100.01' },
  ]) assert.throws(() => parseRoundSettings(draft));
});
