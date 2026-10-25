/** Challenge-response ownership proof. It proves a bid key, not membership/identity. */
import { auditRound, validateBundle } from './audit.ts';
import { commit, generateSalt } from './commitment.ts';
import { signClaimMessage, verifyClaimMessage } from './claim-key.ts';
import { isHex, requireKeys, requireObject, validateReceipt } from './round.ts';

export const CHALLENGE_FORMAT = 'nextturn-claim-challenge-v1';
export const PROOF_FORMAT = 'nextturn-winner-proof-v1';

export interface WinnerChallenge {
  format: typeof CHALLENGE_FORMAT;
  tenderId: string;
  rulesHash: string;
  commitmentHex: string;
  nonceHex: string;
}

export interface WinnerProof {
  format: typeof PROOF_FORMAT;
  tenderId: string;
  rulesHash: string;
  commitmentHex: string;
  nonceHex: string;
  claimPublicKeyHex: string;
  signatureHex: string;
}

export function validateChallenge(value: unknown): WinnerChallenge {
  const object = requireObject(value, 'Claim challenge');
  requireKeys(object, ['format', 'tenderId', 'rulesHash', 'commitmentHex', 'nonceHex'], 'Claim challenge');
  if (object.format !== CHALLENGE_FORMAT || !isHex(object.tenderId, 16)
    || !isHex(object.rulesHash, 64) || !isHex(object.commitmentHex, 64) || !isHex(object.nonceHex, 64)) {
    throw new Error('Invalid claim challenge. Use a fresh challenge from the person checking the winner.');
  }
  return object as unknown as WinnerChallenge;
}

export function validateWinnerProof(value: unknown): WinnerProof {
  const object = requireObject(value, 'Winner proof');
  requireKeys(object, ['format', 'tenderId', 'rulesHash', 'commitmentHex', 'nonceHex', 'claimPublicKeyHex', 'signatureHex'], 'Winner proof');
  if (object.format !== PROOF_FORMAT || !isHex(object.tenderId, 16)
    || !isHex(object.rulesHash, 64) || !isHex(object.commitmentHex, 64)
    || !isHex(object.nonceHex, 64) || !isHex(object.claimPublicKeyHex, 64) || !isHex(object.signatureHex, 128)) {
    throw new Error('Invalid public winner proof. Do not share a private bid file here.');
  }
  return object as unknown as WinnerProof;
}

/** Shared exact UTF-8 preimage, reproducible by an independent verifier. */
export function claimPreimage(challenge: WinnerChallenge): string {
  return JSON.stringify(['NEXTTURN-WINNER-CLAIM-v1', challenge.tenderId, challenge.rulesHash,
    challenge.commitmentHex, challenge.nonceHex]);
}

export async function createWinnerChallenge(value: unknown): Promise<WinnerChallenge> {
  const bundle = await validateBundle(value);
  const outcome = await auditRound(bundle);
  if (!outcome.ok || !outcome.winner?.claimPublicKeyHex || bundle.manifest.rules.version !== 2) {
    throw new Error('A valid version-2 winning offer is needed before creating an ownership challenge.');
  }
  return { format: CHALLENGE_FORMAT, tenderId: bundle.manifest.rules.tenderId,
    rulesHash: bundle.manifest.rulesHash, commitmentHex: outcome.winner.commitmentHex, nonceHex: generateSalt() };
}

export async function signWinnerClaim(receiptValue: unknown, challengeValue: unknown): Promise<WinnerProof> {
  const receipt = validateReceipt(receiptValue);
  const challenge = validateChallenge(challengeValue);
  if (!receipt.claimPrivateKeyHex || !receipt.claimPublicKeyHex) throw new Error('This legacy bid file has no ownership-proof key.');
  if (receipt.rulesHash !== challenge.rulesHash || receipt.tenderId !== challenge.tenderId || receipt.commitmentHex !== challenge.commitmentHex) {
    throw new Error('This private bid file is not the winning offer named in the challenge.');
  }
  const sealed = await commit(receipt.tenderId, receipt.priceMinor, receipt.saltHex, receipt.rulesHash, receipt.claimPublicKeyHex);
  if (sealed.commitmentHex !== receipt.commitmentHex) throw new Error('This private bid file has been changed.');
  const message = claimPreimage(challenge);
  const signatureHex = await signClaimMessage(receipt.claimPrivateKeyHex, message);
  if (!await verifyClaimMessage(receipt.claimPublicKeyHex, message, signatureHex)) throw new Error('The private proof key does not belong to this bid.');
  return { ...challenge, format: PROOF_FORMAT, claimPublicKeyHex: receipt.claimPublicKeyHex, signatureHex };
}

export async function verifyWinnerClaim(bundleValue: unknown, expectedChallengeValue: unknown, proofValue: unknown): Promise<boolean> {
  try {
    const bundle = await validateBundle(bundleValue);
    const outcome = await auditRound(bundle);
    const challenge = validateChallenge(expectedChallengeValue);
    const proof = validateWinnerProof(proofValue);
    const winner = outcome.winner;
    if (!outcome.ok || bundle.manifest.rules.version !== 2 || !winner?.claimPublicKeyHex
      || challenge.tenderId !== bundle.manifest.rules.tenderId || challenge.rulesHash !== bundle.manifest.rulesHash
      || challenge.commitmentHex !== winner.commitmentHex
      || proof.tenderId !== challenge.tenderId || proof.rulesHash !== challenge.rulesHash
      || proof.commitmentHex !== challenge.commitmentHex || proof.nonceHex !== challenge.nonceHex
      || proof.claimPublicKeyHex !== winner.claimPublicKeyHex) return false;
    return await verifyClaimMessage(winner.claimPublicKeyHex, claimPreimage(challenge), proof.signatureHex);
  } catch { return false; }
}
