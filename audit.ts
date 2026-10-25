/** Offline, independently runnable outcome checker. JSON is not a chain proof. */
import { readFileSync } from 'node:fs';
import { auditRound } from './src/lib/audit.ts';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: node audit.ts <public-audit.json>\nChecks supplied records only. Use the native `verify` command for independent chain retrieval.');
  process.exit(2);
}
try {
  const bytes = readFileSync(filename);
  if (bytes.length > 5_000_000) throw new Error('Audit file exceeds 5 MB.');
  const result = await auditRound(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify({ notice: 'Outcome check against supplied records, not independent proof of chain completeness.', ...result }, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid audit file.');
  process.exitCode = 1;
}
