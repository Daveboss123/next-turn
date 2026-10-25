/** Fresh bid-proof keys only: these are not Zcash wallet/spending keys. */
import { bytesToHex } from './address.ts';
import { isHex } from './round.ts';

export interface ClaimKeyPair { publicKeyHex: string; privateKeyHex: string }

export function claimBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) throw new Error('Invalid proof-key encoding.');
  return Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
}

export async function generateClaimKey(): Promise<ClaimKeyPair> {
  try {
    const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    return { publicKeyHex: bytesToHex(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
      privateKeyHex: bytesToHex(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))) };
  } catch { throw new Error('This browser cannot create bid-proof keys. Use a current browser on HTTPS or localhost.'); }
}

export async function signClaimMessage(privateKeyHex: string, message: string): Promise<string> {
  try {
    const key = await crypto.subtle.importKey('pkcs8', claimBytes(privateKeyHex), 'Ed25519', false, ['sign']);
    return bytesToHex(new Uint8Array(await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(message))));
  } catch { throw new Error('The private bid file does not contain a usable proof key. Never import a wallet recovery phrase.'); }
}

export async function verifyClaimMessage(publicKeyHex: string, message: string, signatureHex: string): Promise<boolean> {
  if (!isHex(publicKeyHex, 64) || !isHex(signatureHex, 128)) return false;
  try {
    const key = await crypto.subtle.importKey('raw', claimBytes(publicKeyHex), 'Ed25519', false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, claimBytes(signatureHex), new TextEncoder().encode(message));
  } catch { return false; }
}
