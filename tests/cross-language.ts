/** Compare the independently implemented TypeScript and Rust outcome checks. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditRound } from '../src/lib/audit.ts';
import type { AuditBundle } from '../src/lib/audit.ts';
import { createPracticeRound, sealPracticeBid, closePracticeBidding, revealPracticeBid, finishPracticeRound, practiceBundle } from '../src/lib/practice.ts';
import { decodeMemo, encodeMemo } from '../src/lib/zip321.ts';
import { createWinnerChallenge, signWinnerClaim, verifyWinnerClaim } from '../src/lib/claim.ts';

const executable = process.argv[2];
if (!executable) {
  console.error('Usage: node tests/cross-language.ts <path-to-tender-verify>');
  process.exit(2);
}
let round = await sealPracticeBid(await createPracticeRound(), '6500000');
round = await closePracticeBidding(round);
round = await revealPracticeBid(round);
round = finishPracticeRound(round);
const original = practiceBundle(round);
const clone = () => structuredClone(original);
const cases: { name: string; bundle: AuditBundle }[] = [{ name: 'honest round', bundle: clone() }];
let changed = clone(); changed.declaredWinnerCommitment = 'f'.repeat(64);
cases.push({ name: 'dishonest winner', bundle: changed });
changed = clone(); changed.declaredWinnerCommitment = null;
cases.push({ name: 'incorrect no-winner declaration', bundle: changed });
changed = clone(); changed.scan.complete = false;
cases.push({ name: 'incomplete scan', bundle: changed });
changed = clone(); changed.scan.records.shift();
cases.push({ name: 'missing anchor', bundle: changed });
changed = clone(); changed.scan.records.push(changed.scan.records[1]);
cases.push({ name: 'duplicate output', bundle: changed });
changed = clone(); changed.scan.records[1].shieldedSource = false;
cases.push({ name: 'transparent-source bid', bundle: changed });
changed = clone(); changed.scan.records[1].height = 113;
cases.push({ name: 'late commitment', bundle: changed });
changed = clone();
const reveal = decodeMemo(changed.scan.records.at(-1)!.memo);
assert(reveal?.kind === 'reveal');
changed.scan.records.at(-1)!.memo = encodeMemo({ ...reveal, priceMinor: '6500001' });
cases.push({ name: 'changed offer', bundle: changed });
changed = clone();
const memo = decodeMemo(changed.scan.records[1].memo);
assert(memo?.kind === 'commit');
changed.scan.records[1].memo = encodeMemo({ ...memo, rulesHash: 'e'.repeat(64) });
cases.push({ name: 'conflicting round rules', bundle: changed });

let ownedRound = await sealPracticeBid(await createPracticeRound({ version: 2 }), '6500000');
ownedRound = await closePracticeBidding(ownedRound);
ownedRound = await revealPracticeBid(ownedRound);
ownedRound = finishPracticeRound(ownedRound);
const owned = practiceBundle(ownedRound);
cases.push({ name: 'ownership-bound version-2 round', bundle: owned });
let corrupted = structuredClone(owned);
const ownedReveal = decodeMemo(corrupted.scan.records.at(-1)!.memo);
assert(ownedReveal?.kind === 'reveal');
corrupted.scan.records.at(-1)!.memo = encodeMemo({ ...ownedReveal, claimPublicKeyHex: 'e'.repeat(64) });
cases.push({ name: 'changed ownership key in opening', bundle: corrupted });
corrupted = structuredClone(owned);
const ownedCommit = decodeMemo(corrupted.scan.records[1].memo);
assert(ownedCommit?.kind === 'commit');
corrupted.scan.records[1].memo = encodeMemo({ kind: 'commit', tenderId: ownedCommit.tenderId, rulesHash: ownedCommit.rulesHash, commitmentHex: ownedCommit.commitmentHex });
cases.push({ name: 'downgraded ownership memo rejected', bundle: corrupted });

const parent = join(tmpdir(), 'opencode');
mkdirSync(parent, { recursive: true });
const directory = mkdtempSync(join(parent, 'sealed-tender-cross-'));
for (const [i, item] of cases.entries()) {
  const path = join(directory, `${i}.json`);
  writeFileSync(path, JSON.stringify(item.bundle), { flag: 'wx' });
  const expected = await auditRound(item.bundle);
  const run = spawnSync(resolve(executable), ['check', path], { encoding: 'utf8', timeout: 30_000 });
  if (run.error) throw run.error;
  const actual = JSON.parse(run.stdout);
  assert.equal(actual.ok, expected.ok, item.name);
  assert.equal(actual.winner?.commitmentHex ?? null, expected.winner?.commitmentHex ?? null, item.name);
  assert.equal(actual.claim, expected.claim, item.name);
  assert.equal(actual.winner?.claimPublicKeyHex ?? null, expected.winner?.claimPublicKeyHex ?? null, item.name);
  assert.equal(run.status, expected.ok ? 0 : 1, item.name);
  console.log(`ok ${item.name}`);
}

const challenge = await createWinnerChallenge(owned);
const proof = await signWinnerClaim(ownedRound.receipt, challenge);
const fresh = await createWinnerChallenge(owned);
const proofCases = [
  { name: 'winning ownership proof', challenge, proof },
  { name: 'forged ownership signature', challenge, proof: { ...proof, signatureHex: '0'.repeat(128) } },
  { name: 'proof replayed against a fresh challenge', challenge: fresh, proof },
  { name: 'changed public ownership key', challenge, proof: { ...proof, claimPublicKeyHex: 'e'.repeat(64) } },
];
const roundPath = join(directory, 'owned-round.json');
writeFileSync(roundPath, JSON.stringify(owned), { flag: 'wx' });
for (const [i, item] of proofCases.entries()) {
  const challengePath = join(directory, `challenge-${i}.json`);
  const proofPath = join(directory, `proof-${i}.json`);
  writeFileSync(challengePath, JSON.stringify(item.challenge), { flag: 'wx' });
  writeFileSync(proofPath, JSON.stringify(item.proof), { flag: 'wx' });
  const expected = await verifyWinnerClaim(owned, item.challenge, item.proof);
  const run = spawnSync(resolve(executable), ['check-claim', roundPath, challengePath, proofPath], { encoding: 'utf8', timeout: 30_000 });
  if (run.error) throw run.error;
  assert.equal(JSON.parse(run.stdout).valid, expected, item.name);
  assert.equal(run.status, expected ? 0 : 1, item.name);
  console.log(`ok ${item.name}`);
}
console.log(`${cases.length + proofCases.length} cross-language cases passed. Only generated public practice records and public proofs were used.`);
