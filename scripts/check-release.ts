/** Local release-file check, never deployment or wallet access. */
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertCurrentLicenceInventory, assertNoPrivateSourcePaths, assertReviewedPublicAssets, assertSafeBuildOutput, assertSafeDistribution } from './release-policy.ts';

const root = resolve('.');
const flag = process.argv[2];
if (process.argv.length > 3 || (flag !== undefined && flag !== '--licences-only')) throw new Error('Usage: node scripts/check-release.ts [--licences-only]');
assertCurrentLicenceInventory(root);
const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
if (git.error || git.status !== 0) throw new Error('Could not inspect release source path metadata. No publication check was completed.');
const sourcePaths = git.stdout.split('\0').filter(Boolean);
assertNoPrivateSourcePaths(sourcePaths);
if (flag === '--licences-only') {
  console.log(JSON.stringify({ licenceInventoryCurrent: true, sourcePathMetadataChecked: sourcePaths.length, scope: 'local locked dependency notices and source filenames', noPrivateFilesRead: true }, null, 2));
} else {
  const publicAssets = assertReviewedPublicAssets(join(root, 'public'));
  assertSafeBuildOutput(root, 'dist');
  const distributionFiles = assertSafeDistribution(join(root, 'dist'));
  console.log(JSON.stringify({ artifactChecksPass: true, publicAssets, distributionFiles, sourcePathMetadataChecked: sourcePaths.length,
    scope: 'reviewed file metadata and public licence inventory only',
    notice: 'Not a deployment, completed real-wallet round, complete security audit or hackathon submission.',
    noPrivateFilesRead: true }, null, 2));
}
