/** Public rules for David's explicitly approved single-operator wallet test. */
import { validateChainTip } from './chain-tip.ts';
import { createManifest, newRoundId, requireKeys, requireObject } from './round.ts';
import type { RoundManifest } from './round.ts';

export async function createDemoManifest(receiverValue: unknown, tipValue: unknown, now = Math.floor(Date.now() / 1000)): Promise<RoundManifest> {
  const receiver = requireObject(receiverValue, 'Public receiver');
  requireKeys(receiver, ['format', 'network', 'address'], 'Public receiver');
  if (receiver.format !== 'nextturn-round-receiver-v1' || receiver.network !== 'test' || typeof receiver.address !== 'string') {
    throw new Error('Use the dedicated public testnet receiver file, not wallet keys.');
  }
  const tip = validateChainTip(tipValue, now);
  return createManifest({ version: 2, tenderId: newRoundId(), network: 'test', address: receiver.address,
    title: 'NextTurn two-offer wallet test', currency: 'NGN', potMinor: '60000000', memberCount: 2,
    discountCapBps: 2500, startHeight: tip.height + 1000, commitDeadlineHeight: tip.height + 1600,
    revealDeadlineHeight: tip.height + 2200, submissionZatoshis: '100000', tieBreak: 'earliest-block-then-commitment' });
}
