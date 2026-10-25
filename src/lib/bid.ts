import { commit } from './commitment.ts';
import { generateClaimKey, signClaimMessage, verifyClaimMessage } from './claim-key.ts';
import { RECEIPT_FORMAT, validateManifest, validateReceipt } from './round.ts';
import type { PrivateReceipt, RoundManifest } from './round.ts';
import type { MemoPayload } from './zip321.ts';

export async function createPrivateBid(manifest: RoundManifest, priceMinor: string): Promise<PrivateReceipt> {
  await validateManifest(manifest);
  const keys = manifest.rules.version === 2 ? await generateClaimKey() : null;
  const bid = await commit(manifest.rules.tenderId, priceMinor, undefined, manifest.rulesHash, keys?.publicKeyHex);
  return { format: RECEIPT_FORMAT, rulesHash: manifest.rulesHash, ...bid,
    ...(keys ? { claimPrivateKeyHex: keys.privateKeyHex } : {}) };
}

export function bidMemo(kind: 'commit' | 'reveal', receipt: PrivateReceipt): MemoPayload {
  const common = { tenderId: receipt.tenderId, rulesHash: receipt.rulesHash,
    ...(receipt.claimPublicKeyHex ? { claimPublicKeyHex: receipt.claimPublicKeyHex } : {}) };
  return kind === 'commit' ? { kind, ...common, commitmentHex: receipt.commitmentHex }
    : { kind, ...common, priceMinor: receipt.priceMinor, saltHex: receipt.saltHex };
}

export async function receiptForRound(value: unknown, manifest: RoundManifest): Promise<PrivateReceipt> {
  const receipt = validateReceipt(value);
  if (receipt.tenderId !== manifest.rules.tenderId || receipt.rulesHash !== manifest.rulesHash) {
    throw new Error('This bid file belongs to a different round or different rules.');
  }
  const hasProof = receipt.claimPublicKeyHex !== undefined && receipt.claimPrivateKeyHex !== undefined;
  if ((manifest.rules.version === 2) !== hasProof) throw new Error('This bid file does not match the round’s proof-key requirements.');
  const sealed = await commit(receipt.tenderId, receipt.priceMinor, receipt.saltHex, receipt.rulesHash, receipt.claimPublicKeyHex);
  if (sealed.commitmentHex !== receipt.commitmentHex) throw new Error('The private bid file has been changed.');
  if (hasProof) {
    const message = `NextTurn-key-check-v1:${receipt.rulesHash}:${receipt.commitmentHex}`;
    const signature = await signClaimMessage(receipt.claimPrivateKeyHex!, message);
    if (!await verifyClaimMessage(receipt.claimPublicKeyHex!, message, signature)) throw new Error('The private proof key does not match this bid.');
  }
  return receipt;
}
