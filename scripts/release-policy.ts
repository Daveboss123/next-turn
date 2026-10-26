/** Public-directory metadata only. Never reads a wallet/seed/receipt payload. */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export const REVIEWED_PUBLIC_ASSETS = new Set([
  '_headers', 'favicon.svg', 'icons.svg', 'illustration-credits.txt',
]);

export function assertReviewedPublicAssets(directory: string): number {
  if (!directory || !existsSync(directory)) throw new Error('The reviewed public asset directory is missing.');
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile() || !REVIEWED_PUBLIC_ASSETS.has(entry.name)) {
      throw new Error('Unreviewed public artifact: build stopped without reading it. Never put wallet files, private bids, keys or local records in public/.');
    }
  }
  if (entries.length !== REVIEWED_PUBLIC_ASSETS.size) throw new Error('A reviewed public asset is missing. Restore it before building.');
  return entries.length;
}

export function assertSafeBuildOutput(root: string, output: string): void {
  const destination = resolve(root, output);
  if (destination !== resolve(root, 'dist') || (existsSync(destination) && lstatSync(destination).isSymbolicLink())) {
    throw new Error('Frontend output must be the regular dist/ directory. Refusing to write into a private folder or symlink.');
  }
}

/** Reads only the generated public notice inventory and public lockfiles. */
export function assertCurrentLicenceInventory(root: string): void {
  const directory = join(root, 'docs/licences/reviewed');
  for (const name of ['dependency-licences.json', 'npm-licences.txt', 'native-licences.txt']) {
    const path = join(directory, name);
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
      throw new Error('The reviewed licence inventory is missing or redirected. Generate and review notices before building.');
    }
  }
  const inventory = JSON.parse(readFileSync(join(directory, 'dependency-licences.json'), 'utf8'));
  // Git normalises Windows CRLF text during commit/checkout. The dependency
  // content must match on Linux too; do not mistake line endings for changes.
  const hash = (path: string) => createHash('sha256').update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
  if (inventory.format !== 'nextturn-dependency-licences-v1'
    || inventory.lockHashNormalization !== 'utf8-lf'
    || inventory.npmLockSha256 !== hash(join(root, 'package-lock.json'))
    || inventory.cargoLockSha256 !== hash(join(root, 'verifier/Cargo.lock'))
    || !Array.isArray(inventory.missingLicenceMetadata) || inventory.missingLicenceMetadata.length !== 0
    || !Array.isArray(inventory.missingLicenceTexts) || inventory.missingLicenceTexts.length !== 0) {
    throw new Error('Licence notices are stale or incomplete. Review the dependency inventory before a release build.');
  }
}

/** Distribution filenames only: no unreviewed artifact contents are opened. */
export function assertSafeDistribution(directory: string): number {
  const required = new Set(['index.html', 'LICENSE.txt', '_headers', 'favicon.svg', 'icons.svg',
    'illustration-credits.txt', 'licences/THIRD_PARTY_NOTICES.md', 'licences/Manrope-OFL.txt', 'licences/npm-licences.txt']);
  const found = new Set<string>();
  const generated = /^assets\/(?:index-[A-Za-z0-9_-]+\.(?:js|css)|Workspace-[A-Za-z0-9_-]+\.js|manrope-latin-[A-Za-z0-9_-]+\.woff2)$/;
  function walk(path: string, prefix = '') {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Distribution contains a redirected artifact; release stopped without reading it.');
      if (entry.isDirectory()) {
        if (name !== 'assets' && name !== 'licences') throw new Error('Unreviewed distribution directory; release stopped without reading it.');
        walk(join(path, entry.name), `${name}/`);
      } else if (entry.isFile() && (required.has(name) || generated.test(name))) found.add(name);
      else throw new Error('Unreviewed distribution artifact; release stopped without reading it.');
    }
  }
  walk(directory);
  if ([...required].some(name => !found.has(name))
    || ![...found].some(name => /^assets\/index-.*\.js$/.test(name))
    || ![...found].some(name => /^assets\/Workspace-.*\.js$/.test(name))
    || ![...found].some(name => /^assets\/index-.*\.css$/.test(name))
    || ![...found].some(name => /^assets\/manrope-latin-.*\.woff2$/.test(name))) {
    throw new Error('Required reviewed assets or licence notices are missing from the distribution.');
  }
  return found.size;
}

/** Candidate git paths only; never opens or prints a suspicious file. */
export function assertNoPrivateSourcePaths(paths: string[]): void {
  for (const original of paths) {
    const path = original.replaceAll('\\', '/');
    if (/(^|\/)\.local(\/|$)/.test(path)
      || /(^|\/)\.env(?:$|\.(?!example$|sample$))/.test(path)
      || /\.(?:dat|key|pem|p12|pfx)$/i.test(path)
      || /(^|\/)(?:seed|phrase)\.(?:bin|hex|txt|json)$/i.test(path)
      || /(^|\/)nextturn-private-[^/]+\.json$/i.test(path)) {
      throw new Error('A private-looking source artifact is in the release candidate list. Publication blocked without opening or echoing it.');
    }
  }
}
