/**
 * Self-checks for the sealing logic. Run with: node selftest.ts
 *
 * These are deliberately about security properties, not just "does it run".
 * The one that matters most is `reveal with a changed price is rejected` -
 * if that ever passes, the whole sealed-bid guarantee is gone.
 */

import {
  commit,
  generateSalt,
  verifyReveal,
  commitmentPreimage,
} from './src/lib/commitment.ts';
import {
  encodeMemo,
  decodeMemo,
  toBase64Url,
  formatZecAmount,
  buildPaymentUri,
} from './src/lib/zip321.ts';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`);
  }
}

const TENDER = 'a1b2c3d4e5f60718';

console.log('\ncommitments');

const salt = generateSalt();
const sealed = await commit(TENDER, '125000', salt);

check('salt is 32 bytes of hex', /^[0-9a-f]{64}$/.test(salt));
check('commitment is sha-256 sized', /^[0-9a-f]{64}$/.test(sealed.commitmentHex));
check(
  'honest reveal verifies',
  await verifyReveal(sealed.commitmentHex, TENDER, '125000', salt),
);

// The core security property: you cannot restate your price after the fact.
check(
  'reveal with a changed price is rejected',
  !(await verifyReveal(sealed.commitmentHex, TENDER, '124000', salt)),
);
check(
  'reveal with a wrong salt is rejected',
  !(await verifyReveal(sealed.commitmentHex, TENDER, '125000', generateSalt())),
);

// Replay protection: the same bid sealed for a different tender must not match.
const otherTender = await commit('0000000000000001', '125000', salt);
check(
  'same price and salt under a different tender gives a different commitment',
  otherTender.commitmentHex !== sealed.commitmentHex,
);

// Salt must actually enter the hash.
const reSalted = await commit(TENDER, '125000', generateSalt());
check('a fresh salt changes the commitment', reSalted.commitmentHex !== sealed.commitmentHex);

check(
  'preimage is domain separated',
  commitmentPreimage(TENDER, '1', '00').startsWith('ZTENDER-v1:'),
);

// Malformed input must be refused loudly rather than hashed into nonsense.
let rejectedBadPrice = false;
try {
  await commit(TENDER, '12.50', salt);
} catch {
  rejectedBadPrice = true;
}
check('a non-integer price is refused', rejectedBadPrice);

console.log('\nmemos');

const commitMemo = encodeMemo({
  kind: 'commit',
  tenderId: TENDER,
  commitmentHex: sealed.commitmentHex,
});
const revealMemo = encodeMemo({
  kind: 'reveal',
  tenderId: TENDER,
  priceMinor: '125000',
  saltHex: salt,
});

check('commit memo fits in 512 bytes', new TextEncoder().encode(commitMemo).length <= 512);
check('reveal memo fits in 512 bytes', new TextEncoder().encode(revealMemo).length <= 512);

const decodedCommit = decodeMemo(commitMemo);
check(
  'commit memo round-trips',
  decodedCommit?.kind === 'commit' && decodedCommit.commitmentHex === sealed.commitmentHex,
);

const decodedReveal = decodeMemo(revealMemo);
check(
  'reveal memo round-trips',
  decodedReveal?.kind === 'reveal' &&
    decodedReveal.priceMinor === '125000' &&
    decodedReveal.saltHex === salt,
);

// Real memos arrive padded to 512 bytes with zeros.
check(
  'zero-padded memo still parses',
  decodeMemo(commitMemo + '\0'.repeat(512 - commitMemo.length))?.kind === 'commit',
);

// The tender address is public, so anyone can send junk to it.
check('junk memo is skipped, not fatal', decodeMemo('hello world') === null);
check('empty memo is skipped', decodeMemo('') === null);
check('truncated commit memo is skipped', decodeMemo('ZT1C deadbeef') === null);
check(
  'commit memo with a bad hex commitment is skipped',
  decodeMemo(`ZT1C ${TENDER} nothex`) === null,
);

console.log('\nzip-321 encoding');

const b64 = toBase64Url(commitMemo);
check('base64url omits + / and =', !/[+/=]/.test(b64));

check('1 zec formats as "1"', formatZecAmount(100_000_000n) === '1');
check('0.001 zec formats correctly', formatZecAmount(100_000n) === '0.001');
check('one zatoshi keeps 8 dp', formatZecAmount(1n) === '0.00000001');
check('amount has no trailing zeros', formatZecAmount(10_000_000n) === '0.1');

const uri = buildPaymentUri(
  'utest1zkd5k7w9m2x8vq4n6p3r7t5y8u2i4o6a8s0d2f4g6h8j0k2l4m6n8p0q2r4s6t8',
  100_000n,
  { kind: 'commit', tenderId: TENDER, commitmentHex: sealed.commitmentHex },
);

check('uri uses the zcash scheme', uri.startsWith('zcash:'));
check('uri carries a fixed amount', uri.includes('amount=0.001'));
check('uri carries a memo', uri.includes('&memo='));
check('uri has no forbidden base64 characters', !/[+=]/.test(uri.split('memo=')[1]));

// Decode the memo straight back out of the URI, the way a wallet would.
const memoParam = uri.split('memo=')[1];
const restored = Buffer.from(
  memoParam.replace(/-/g, '+').replace(/_/g, '/'),
  'base64',
).toString('utf8');
check('memo survives the round trip through the uri', decodeMemo(restored)?.kind === 'commit');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
