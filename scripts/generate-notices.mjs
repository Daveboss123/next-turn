// Public package manifests/licence texts only. No wallet, .local or bid files.
// Output must be a NEW directory so generated notices cannot overwrite user work.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [flag, destination] = process.argv.slice(2);
if (flag !== '--out-dir' || !destination || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/generate-notices.mjs --out-dir <new-notices-directory>');
}
const root = resolve('.');
const output = resolve(destination);
if (existsSync(output)) throw new Error('Notice output directory must be new; refusing to overwrite.');
const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const texts = new Map();
const packages = [];

function licenceFiles(directory, explicitFile) {
  const found = new Set();
  function scan(path, depth = 0) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isFile() && /^(?:licen[cs]e|copying|copyright|notice)(?:[._-]|$)/i.test(entry.name)) found.add(file);
      else if (entry.isDirectory() && depth < 2 && /^licen[cs]es?$/i.test(entry.name)) scan(file, depth + 1);
    }
  }
  scan(directory);
  if (explicitFile && /^(?:licen[cs]e|copying|copyright|notice|authors)(?:[._-]|$)/i.test(basename(explicitFile))) {
    const file = resolve(directory, explicitFile);
    if (existsSync(file)) found.add(file);
  }
  return [...found].sort();
}

function addPackage(ecosystem, metadata, directory, explicitFile) {
  const references = [];
  for (const file of licenceFiles(directory, explicitFile)) {
    const text = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
    const id = hash(text);
    if (!texts.has(id)) texts.set(id, text);
    references.push({ file: relative(directory, file).replaceAll('\\', '/'), textSha256: id });
  }
  packages.push({ ecosystem, name: metadata.name, version: metadata.version,
    licence: typeof metadata.license === 'string' ? metadata.license : metadata.license?.type ?? null,
    licenceTexts: references });
}

const seen = new Set();
function npmDirectory(name, from) {
  const require = createRequire(join(from, 'package.json'));
  for (const parent of require.resolve.paths(name) ?? []) {
    const directory = join(parent, name);
    if (existsSync(join(directory, 'package.json'))) return directory;
  }
  return null;
}
function npmPackage(name, from) {
  const directory = npmDirectory(name, from);
  if (!directory) throw new Error('An installed runtime dependency is missing; run the locked npm install before generating notices.');
  if (seen.has(directory)) return;
  seen.add(directory);
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  addPackage('npm-runtime', metadata, directory);
  for (const dependency of Object.keys(metadata.dependencies ?? {})) npmPackage(dependency, directory);
  for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) {
    if (npmDirectory(dependency, directory)) npmPackage(dependency, directory);
  }
}
for (const name of Object.keys(project.dependencies ?? {})) npmPackage(name, root);

const cargo = spawnSync(process.platform === 'win32' ? 'cargo.exe' : 'cargo',
  ['metadata', '--locked', '--offline', '--format-version', '1'],
  { cwd: join(root, 'verifier'), encoding: 'utf8', maxBuffer: 10_000_000, timeout: 120_000 });
if (cargo.error || cargo.status !== 0) throw new Error('Locked offline Cargo metadata was unavailable. Build the existing Cargo cache first; no private files were read.');
const native = JSON.parse(cargo.stdout);
for (const metadata of native.packages) {
  if (metadata.name === 'tender-verify') continue; // Original project licence is separate.
  // r-efi keeps its full MIT notice and copyright list in AUTHORS.
  addPackage('cargo-manifest-graph', metadata, dirname(metadata.manifest_path), metadata.license_file ?? (metadata.name === 'r-efi' ? 'AUTHORS' : undefined));
}
const supplemental = JSON.parse(readFileSync(join(root, 'scripts/licence-sources.json'), 'utf8'));
const fetched = new Map();
for (const source of supplemental.sources) {
  const repository = source.repository.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/)?.[1];
  if (!repository || !/^[0-9a-f]{40}$/.test(source.revision)) throw new Error('Supplemental licence source must name a public repository and pinned revision.');
  for (const id of source.packages) {
    const metadata = native.packages.find(p => `${p.name}@${p.version}` === id);
    const record = packages.find(p => p.ecosystem === 'cargo-manifest-graph' && `${p.name}@${p.version}` === id);
    if (!metadata || !record || record.licenceTexts.length) continue;
    const vcs = JSON.parse(readFileSync(join(dirname(metadata.manifest_path), '.cargo_vcs_info.json'), 'utf8'));
    if (metadata.repository !== source.repository || vcs.git?.sha1 !== source.revision) throw new Error('Upstream licence revision does not match the installed locked crate.');
    for (const file of source.files) {
      if (!/^(?:LICENSE(?:-[A-Z0-9]+)?|COPYING\.md|COPYRIGHT)$/.test(file)) throw new Error('Only reviewed upstream licence/notice filenames may be fetched.');
      const url = `https://raw.githubusercontent.com/${repository}/${source.revision}/${file}`;
      if (!fetched.has(url)) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('A pinned public licence text was unavailable; do not claim a complete notice bundle.');
        const text = (await response.text()).replaceAll('\r\n', '\n');
        if (!text || text.length > 200_000) throw new Error('Unexpected upstream licence text size.');
        fetched.set(url, text);
      }
      const text = fetched.get(url), textSha256 = hash(text);
      if (!texts.has(textSha256)) texts.set(textSha256, text);
      record.licenceTexts.push({ file: `upstream/${file}`, textSha256, source: url });
    }
  }
}
packages.sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const missingMetadata = packages.filter(p => !p.licence).map(p => `${p.ecosystem}:${p.name}@${p.version}`);
const missingTexts = packages.filter(p => p.licenceTexts.length === 0).map(p => `${p.ecosystem}:${p.name}@${p.version}`);
const notice = 'Generated from installed runtime npm packages and locked Cargo manifest metadata. Cargo includes optional/target-specific dependencies; this is not proof of binary composition or a legal review. Original code, artwork and fonts retain separate notices. Missing texts remain a release review item.';

function bundle(ecosystem) {
  const included = packages.filter(p => p.ecosystem === ecosystem);
  const ids = [...new Set(included.flatMap(p => p.licenceTexts.map(t => t.textSha256)))].sort();
  return [
    `NextTurn third-party licences — ${ecosystem}`, notice, '',
    ...included.flatMap(p => [`${p.name}@${p.version} — ${p.licence ?? 'LICENCE METADATA MISSING'}`,
      ...p.licenceTexts.map(t => `  ${t.file} → licence text ${t.textSha256}`),
      ...(p.licenceTexts.length ? [] : ['  LICENCE TEXT NOT PRESENT IN INSTALLED PACKAGE — REVIEW REQUIRED']), '']),
    ...ids.flatMap(id => [`===== ORIGINAL LICENCE TEXT ${id} =====`, texts.get(id), '']),
  ].join('\n');
}
mkdirSync(output);
writeFileSync(join(output, 'dependency-licences.json'), `${JSON.stringify({
  format: 'nextturn-dependency-licences-v1',
  lockHashNormalization: 'utf8-lf',
  npmLockSha256: hash(readFileSync(join(root, 'package-lock.json'), 'utf8').replaceAll('\r\n', '\n')),
  cargoLockSha256: hash(readFileSync(join(root, 'verifier/Cargo.lock'), 'utf8').replaceAll('\r\n', '\n')),
  packages, missingLicenceMetadata: missingMetadata, missingLicenceTexts: missingTexts, notice,
}, null, 2)}\n`, { flag: 'wx' });
writeFileSync(join(output, 'npm-licences.txt'), bundle('npm-runtime'), { flag: 'wx' });
writeFileSync(join(output, 'native-licences.txt'), bundle('cargo-manifest-graph'), { flag: 'wx' });
console.log(JSON.stringify({ output, npmRuntimePackages: packages.filter(p => p.ecosystem === 'npm-runtime').length,
  cargoManifestPackages: packages.filter(p => p.ecosystem === 'cargo-manifest-graph').length,
  copiedUniqueLicenceTexts: texts.size, missingLicenceMetadata: missingMetadata, missingLicenceTexts: missingTexts,
  noWalletOrBidFilesRead: true }, null, 2));
