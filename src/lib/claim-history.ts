import { claimPreimage, validateChallenge } from './claim.ts';

/** Public challenge references only, in memory. Reloading loses this history. */
export function createClaimHistory() {
  const accepted = new Set<string>();
  const reference = (value: unknown) => claimPreimage(validateChallenge(value));
  return {
    isAccepted(value: unknown): boolean { return accepted.has(reference(value)); },
    accept(value: unknown): boolean {
      const key = reference(value);
      if (accepted.has(key)) return false;
      accepted.add(key);
      return true;
    },
  };
}
