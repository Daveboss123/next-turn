/** Public files only. No wallet access, key reads, bid generation or spending. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createDemoManifest } from '../src/lib/demo.ts';
import { validateChainTip } from '../src/lib/chain-tip.ts';
import { encodeMemo } from '../src/lib/zip321.ts';

const [receiverPath, tipPath, directory] = process.argv.slice(2);
if (!receiverPath || !tipPath || !directory || process.argv.length !== 5) {
  throw new Error('Usage: node scripts/prepare-demo.ts <public-receiver.json> <public-tip.json> <new-public-output-folder>');
}
function publicJson(path: string): unknown {
  const bytes = readFileSync(path);
  if (bytes.length > 50_000) throw new Error('Public setup JSON exceeds the size limit.');
  try { return JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { throw new Error('Use public receiver/tip JSON only. File contents are never echoed.'); }
}
const reading = validateChainTip(publicJson(tipPath));
const manifest = await createDemoManifest(publicJson(receiverPath), reading);
const memo = encodeMemo({ kind: 'anchor', tenderId: manifest.rules.tenderId, rulesHash: manifest.rulesHash });
const output = resolve(directory);
mkdirSync(output); // Must be new: never overwrite an earlier round or user file.
function write(name: string, value: unknown) {
  writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
}
write('round.json', manifest);
write('tip.json', reading);
write('demo-plan.json', { format: 'nextturn-testnet-demo-plan-v1', network: 'test',
  scope: 'single-operator-two-offer-test', participantsProven: false, protocolTransactionCount: 5,
  totalProtocolPaymentsZatoshis: '500000', fees: 'additional, reviewed in the user wallet',
  firstRequest: { purpose: 'anchor-rules', address: manifest.rules.address, amountTaz: '0.001', memo },
  rules: manifest.rules, rulesHash: manifest.rulesHash });
writeFileSync(join(output, 'first-request.txt'), [
  'NEXTTURN — TESTNET RULES REQUEST ONLY',
  'No payment has been sent. Review and send this yourself in Zingo Testnet.',
  '', 'ADDRESS — copy the next line only:', manifest.rules.address,
  '', 'AMOUNT: 0.001 TAZ, plus the wallet fee',
  '', 'MEMO — copy the next line only, without this label:', memo,
  'Do not add a name, reply-to address or extra note.', '', `Must be mined BEFORE block ${manifest.rules.startHeight}.`,
  'The fiat pot is an illustration; this does not pay a savings-group pot.',
  'Use a fresh public tip file before preparing a request. Do not send a late anchor.',
  'The seed and incoming key are NOT in this public folder.', '',
].join('\n'), { flag: 'wx', encoding: 'utf8' });
console.log(JSON.stringify({ publicOutput: output, roundFile: join(output, 'round.json'),
  chainTipFile: join(output, 'tip.json'), roundId: manifest.rules.tenderId, rulesHash: manifest.rulesHash,
  biddingStart: manifest.rules.startHeight, commitmentDeadline: manifest.rules.commitDeadlineHeight,
  openingDeadline: manifest.rules.revealDeadlineHeight, firstRequest: join(output, 'first-request.txt'),
  noFundsSent: true }, null, 2));
