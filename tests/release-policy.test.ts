import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertCurrentLicenceInventory, assertNoPrivateSourcePaths, assertReviewedPublicAssets, assertSafeBuildOutput, assertSafeDistribution, REVIEWED_PUBLIC_ASSETS } from '../scripts/release-policy.ts';

function fixture(t: { after: (callback: () => void) => void }) {
  const parent = join(tmpdir(), 'opencode'); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'nextturn-public-policy-'));
  const directory = join(root, 'public'); mkdirSync(directory);
  for (const name of REVIEWED_PUBLIC_ASSETS) writeFileSync(join(directory, name), 'NONSECRET TEST CANARY', { flag: 'wx' });
  t.after(() => rmSync(root, { recursive: true })); // Only this test's exclusively created folder.
  return { root, directory };
}

test('only the reviewed public assets pass the distribution guard', (t) => {
  const { directory } = fixture(t);
  assert.equal(assertReviewedPublicAssets(directory), 4);
});

test('an unreviewed public file is blocked without reading or echoing it', (t) => {
  const { directory } = fixture(t);
  writeFileSync(join(directory, 'private-bid.json'), 'NONSECRET DO-NOT-READ CANARY', { flag: 'wx' });
  assert.throws(() => assertReviewedPublicAssets(directory), (cause: unknown) => cause instanceof Error
    && cause.message.includes('without reading') && !cause.message.includes('private-bid.json'));
});

test('missing public assets and new directories fail closed', (t) => {
  const { directory } = fixture(t);
  unlinkSync(join(directory, 'favicon.svg'));
  assert.throws(() => assertReviewedPublicAssets(directory));
  writeFileSync(join(directory, 'favicon.svg'), 'NONSECRET TEST CANARY', { flag: 'wx' });
  mkdirSync(join(directory, 'extra'));
  assert.throws(() => assertReviewedPublicAssets(directory));
});

test('public symlinks or junctions cannot bypass the metadata guard', (t) => {
  const { root, directory } = fixture(t);
  const target = join(root, 'canary-target'); mkdirSync(target);
  unlinkSync(join(directory, 'favicon.svg'));
  symlinkSync(target, join(directory, 'favicon.svg'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertReviewedPublicAssets(directory));
});

test('the frontend cannot write into a private folder or redirected output', (t) => {
  const { root } = fixture(t);
  assert.doesNotThrow(() => assertSafeBuildOutput(root, 'dist'));
  assert.throws(() => assertSafeBuildOutput(root, '.local'));
  assert.throws(() => assertSafeBuildOutput(root, 'public'));
  const target = join(root, 'canary-output'); mkdirSync(target);
  symlinkSync(target, join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertSafeBuildOutput(root, 'dist'));
});

test('stale or incomplete licence inventories block a release build', (t) => {
  const { root } = fixture(t);
  const directory = join(root, 'docs/licences/reviewed'); mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, 'verifier'));
  writeFileSync(join(root, 'package-lock.json'), 'PUBLIC NPM CANARY');
  writeFileSync(join(root, 'verifier/Cargo.lock'), 'PUBLIC CARGO CANARY');
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const inventory = { format: 'nextturn-dependency-licences-v1', lockHashNormalization: 'utf8-lf', npmLockSha256: hash('PUBLIC NPM CANARY'),
    cargoLockSha256: hash('PUBLIC CARGO CANARY'), missingLicenceMetadata: [], missingLicenceTexts: [] as string[] };
  const path = join(directory, 'dependency-licences.json');
  writeFileSync(path, JSON.stringify(inventory));
  for (const name of ['npm-licences.txt', 'native-licences.txt']) writeFileSync(join(directory, name), 'PUBLIC LICENCE CANARY');
  assert.doesNotThrow(() => assertCurrentLicenceInventory(root));
  inventory.missingLicenceTexts.push('test-package@0.0.0'); writeFileSync(path, JSON.stringify(inventory));
  assert.throws(() => assertCurrentLicenceInventory(root));
  inventory.missingLicenceTexts = []; writeFileSync(path, JSON.stringify(inventory));
  writeFileSync(join(root, 'package-lock.json'), 'CHANGED PUBLIC NPM CANARY');
  assert.throws(() => assertCurrentLicenceInventory(root));
});

test('licence lock hashes accept Git LF and Windows CRLF without ignoring dependency changes', (t) => {
  const { root } = fixture(t);
  const directory = join(root, 'docs/licences/reviewed'); mkdirSync(directory, { recursive: true }); mkdirSync(join(root, 'verifier'));
  const npm = 'PUBLIC NPM\nLOCK CANARY\n', cargo = 'PUBLIC CARGO\nLOCK CANARY\n';
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  writeFileSync(join(root, 'package-lock.json'), npm.replaceAll('\n', '\r\n'));
  writeFileSync(join(root, 'verifier/Cargo.lock'), cargo.replaceAll('\n', '\r\n'));
  writeFileSync(join(directory, 'dependency-licences.json'), JSON.stringify({ format: 'nextturn-dependency-licences-v1',
    lockHashNormalization: 'utf8-lf', npmLockSha256: hash(npm), cargoLockSha256: hash(cargo), missingLicenceMetadata: [], missingLicenceTexts: [] }));
  for (const name of ['npm-licences.txt', 'native-licences.txt']) writeFileSync(join(directory, name), 'PUBLIC LICENCE CANARY');
  assert.doesNotThrow(() => assertCurrentLicenceInventory(root));
  writeFileSync(join(root, 'package-lock.json'), npm);
  writeFileSync(join(root, 'verifier/Cargo.lock'), cargo);
  assert.doesNotThrow(() => assertCurrentLicenceInventory(root));
  writeFileSync(join(root, 'package-lock.json'), npm + 'CHANGED DEPENDENCY');
  assert.throws(() => assertCurrentLicenceInventory(root));
});

test('distribution metadata rejects extra private-looking artifacts and missing notices', (t) => {
  const { root } = fixture(t);
  const dist = join(root, 'dist'); mkdirSync(join(dist, 'assets'), { recursive: true }); mkdirSync(join(dist, 'licences'));
  const names = ['index.html', 'LICENSE.txt', '_headers', 'favicon.svg', 'icons.svg', 'illustration-credits.txt',
    'licences/THIRD_PARTY_NOTICES.md', 'licences/Manrope-OFL.txt', 'licences/npm-licences.txt',
    'assets/index-canary.js', 'assets/Workspace-canary.js', 'assets/index-canary.css', 'assets/manrope-latin-canary.woff2'];
  for (const name of names) writeFileSync(join(dist, name), 'NONSECRET TEST ARTIFACT', { flag: 'wx' });
  assert.equal(assertSafeDistribution(dist), names.length);
  writeFileSync(join(dist, 'private-receipt.json'), 'NONSECRET DO-NOT-READ CANARY', { flag: 'wx' });
  assert.throws(() => assertSafeDistribution(dist), (cause: unknown) => cause instanceof Error && !cause.message.includes('private-receipt.json'));
  unlinkSync(join(dist, 'private-receipt.json'));
  unlinkSync(join(dist, 'licences/Manrope-OFL.txt'));
  assert.throws(() => assertSafeDistribution(dist));
});

test('private-looking git candidates are rejected using filename metadata only', () => {
  assert.doesNotThrow(() => assertNoPrivateSourcePaths(['src/lib/claim-key.ts', 'LICENSE', 'docs/PROTOCOL.md', '.env.example']));
  for (const path of ['.local/private/seed.bin', 'docs/nextturn-private-test.json', '.env', '.env.production', 'wallet.dat', 'private.key', 'backup/phrase.txt']) {
    assert.throws(() => assertNoPrivateSourcePaths([path]), (cause: unknown) => cause instanceof Error && !cause.message.includes(path));
  }
});
