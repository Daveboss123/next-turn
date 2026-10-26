import { useState } from 'react';
import { Icon } from './Icon.tsx';
import { AuditOutcome, CopyButton, ErrorNotice, RulesDetails } from './shared.tsx';
import { auditRound, validateBundle } from '../lib/audit.ts';
import type { AuditBundle, AuditResult } from '../lib/audit.ts';
import { readJsonFile } from '../lib/files.ts';
import { WinnerProofCheck } from './WinnerClaim.tsx';
import { useLocalOperation } from '../hooks/useLocalOperation.ts';

export function Audit({ onPractice }: { onPractice: () => void }) {
  const [bundle, setBundle] = useState<AuditBundle | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startOperation = useLocalOperation();
  async function inspect(file: File) {
    const current = startOperation();
    setBusy(true); setError(null); setBundle(null); setResult(null);
    try {
      const value = await validateBundle(await readJsonFile(file));
      const checked = await auditRound(value);
      if (current()) { setBundle(value); setResult(checked); }
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'We couldn’t check this file. Use a result file from NextTurn.'); }
    finally { if (current()) setBusy(false); }
  }
  return <section>
    <div className="page-heading">
      <span className="eyebrow">Result check</span>
      <h1>Check your group’s result.</h1>
      <p>Open the result file your group shared. We’ll compare the opened offers with the round’s rules and check which one wins.</p>
    </div>
    <div className="notice"><Icon name="alert" /><span><strong>This checks the file, not the whole chain.</strong> To confirm that no bids were left out, use the independent checker below. No wallet or payment is needed.</span></div>
    <ErrorNotice message={error} />
    <div className="card import-card">
      <span className="import-symbol"><Icon name="check" size={30} /></span>
      <h2>Choose a result file.</h2>
      <p>Use a practice result or a file from the independent checker. It stays on this device and is never uploaded.</p>
      <label className="button button-primary file-button">
        {busy ? 'Checking the offers…' : 'Open result file'}
        <input type="file" accept=".json,application/json" aria-label="Open result file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspect(file); event.target.value = ''; }} />
      </label>
      <button type="button" className="text-button" onClick={onPractice}>Get a result file by trying a round<Icon name="arrow" size={14} /></button>
    </div>
    {bundle && result && <div className="card results-card">
      <div className="section-heading"><h2>{bundle.manifest.rules.title}</h2><span className="mode-pill">{bundle.scan.network === 'practice' ? 'Practice' : 'Result file'}</span></div>
      <AuditOutcome result={result} manifest={bundle.manifest} />
      <RulesDetails manifest={bundle.manifest} />
      {bundle.manifest.rules.version === 2 && result.ok && result.winner && <WinnerProofCheck key={bundle.manifest.rulesHash} bundle={bundle} />}
    </div>}
    <div className="card">
      <h2>Want to check that every bid was included?</h2>
      <p>The independent checker reads the round directly from a Zcash light-client server. It checks the rules, deadlines and winning offer. It stops if a block or transaction is missing. The server is still a trust assumption; this is not full-node validation.</p>
      <details className="technical-details">
        <summary>Run the independent checker</summary>
        <div className="command-box"><div><code>tender-verify verify https://testnet.zec.rocks:443 incoming-key.txt round.json --out result.json</code><CopyButton text="tender-verify verify https://testnet.zec.rocks:443 incoming-key.txt round.json --out result.json" /></div><p>Use the organiser’s published incoming key. It is used on your device, not sent to the server. Run instructions are in the project README.</p></div>
        <p className="field-hint">An offline file check is available with <code>node audit.ts result.json</code>. That checks supplied records only.</p>
      </details>
    </div>
  </section>;
}
