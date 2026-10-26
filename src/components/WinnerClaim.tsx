import { useState } from 'react';
import { Icon } from './Icon.tsx';
import { ButtonSpinner, ErrorNotice } from './shared.tsx';
import { downloadJson, readJsonFile } from '../lib/files.ts';
import { createWinnerChallenge, signWinnerClaim, validateChallenge, verifyWinnerClaim } from '../lib/claim.ts';
import type { WinnerChallenge, WinnerProof } from '../lib/claim.ts';
import { validateReceipt } from '../lib/round.ts';
import type { PrivateReceipt } from '../lib/round.ts';
import type { AuditBundle } from '../lib/audit.ts';
import { createClaimHistory } from '../lib/claim-history.ts';
import { useLocalOperation } from '../hooks/useLocalOperation.ts';

// Survives screen navigation within this page, never refresh or another tab.
const acceptedChallenges = createClaimHistory();

export function PracticeWinnerClaim({ bundle, receipt }: { bundle: AuditBundle; receipt: PrivateReceipt }) {
  const [proof, setProof] = useState<WinnerProof | null>(null);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startOperation = useLocalOperation();
  async function demonstrate() {
    const current = startOperation();
    setBusy(true); setError(null); setProof(null); setValid(false);
    try {
      // Paint the real pending state before starting the local cryptography.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const challenge = await createWinnerChallenge(bundle);
      const generated = await signWinnerClaim(receipt, challenge);
      const checked = await verifyWinnerClaim(bundle, challenge, generated);
      if (current()) { setValid(checked); setProof(generated); }
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Could not prove this bid’s ownership.'); }
    finally { if (current()) setBusy(false); }
  }
  return <div className="winner-claim-panel">
    <h3>Prove this winning offer is yours.</h3>
    <p>Your private bid file contains a one-off proof key. It can answer a fresh challenge without sharing the file or a wallet key.</p>
    <button className="button button-secondary" type="button" disabled={busy} aria-busy={busy} onClick={demonstrate}>{busy ? 'Checking ownership…' : 'Ownership check'}{busy ? <ButtonSpinner /> : <Icon name="shield" size={16} />}</button>
    <ErrorNotice message={error} />
    {proof && <div className={`notice ${valid ? 'notice-success' : 'notice-error'}`} role="status"><Icon name={valid ? 'check' : 'alert'} /><span>{valid ? 'The proof matches the winning bid’s key. No private bid file was shared.' : 'Ownership proof did not match.'}</span></div>}
    <p className="field-hint">Practice only: you play both roles here. This proves control of the bid key, not a person’s identity, membership or right to a payout.</p>
  </div>;
}

export function WinnerProofCheck({ bundle }: { bundle: AuditBundle }) {
  const [challenge, setChallenge] = useState<WinnerChallenge | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startOperation = useLocalOperation();
  async function freshChallenge() {
    const current = startOperation();
    setBusy(true); setChallenge(null); setError(null); setValid(null);
    try {
      const created = await createWinnerChallenge(bundle);
      if (current()) setChallenge(created);
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Could not create a challenge.'); }
    finally { if (current()) setBusy(false); }
  }
  async function inspect(file: File) {
    if (!challenge || acceptedChallenges.isAccepted(challenge)) return;
    const current = startOperation();
    setBusy(true); setError(null); setValid(null);
    try {
      const matches = await verifyWinnerClaim(bundle, challenge, await readJsonFile(file, 10_000));
      if (current()) setValid(matches && acceptedChallenges.accept(challenge));
    } catch { if (current()) setError('Use a public winner-proof file, not a private bid file.'); }
    finally { if (current()) setBusy(false); }
  }
  async function restoreChallenge(file: File) {
    const current = startOperation();
    setBusy(true); setChallenge(null); setError(null); setValid(null);
    try {
      const expected = validateChallenge(await readJsonFile(file, 10_000));
      if (acceptedChallenges.isAccepted(expected)) throw new Error('This challenge was already accepted in this page. Create a fresh challenge instead.');
      const winner = await createWinnerChallenge(bundle);
      if (expected.rulesHash !== winner.rulesHash || expected.tenderId !== winner.tenderId || expected.commitmentHex !== winner.commitmentHex) throw new Error('This challenge belongs to a different winning bid.');
      if (current()) setChallenge(expected);
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Could not restore the expected challenge.'); }
    finally { if (current()) setBusy(false); }
  }
  const consumed = challenge !== null && acceptedChallenges.isAccepted(challenge);
  return <div className="winner-claim-panel">
    <h3>Check who controls the winning bid.</h3>
    <p>Create a fresh challenge and send it to the winner. They return a public proof, not their private bid file.</p>
    <div className="button-row"><button className="button button-secondary" type="button" disabled={busy} aria-busy={busy} onClick={freshChallenge}>Create a fresh challenge{busy ? <ButtonSpinner /> : <Icon name="circle" size={16} />}</button><label className="button button-quiet file-button">Open my saved challenge<input type="file" accept=".json,application/json" aria-label="Open my saved challenge" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreChallenge(file); event.target.value = ''; }} /></label></div>
    {busy && <p className="field-hint" role="status">Checking the local files and ownership proof…</p>}
    <p className="field-hint">Only restore a challenge you issued and have not already accepted. Do not use the claimant’s nonce instead. Accepted challenges are remembered only in this page; refreshing or using another tab loses that history.</p>
    <ErrorNotice message={error} />
    {challenge && <>
      <div className="button-row claim-file-actions"><button className="button button-quiet" type="button" disabled={busy || consumed} onClick={() => downloadJson(`nextturn-challenge-${challenge.tenderId}.json`, challenge)}><Icon name="download" size={16} />Download challenge</button><label className="button button-secondary file-button">Open winner proof<input type="file" accept=".json,application/json" aria-label="Open winner proof" disabled={busy || consumed} onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspect(file); event.target.value = ''; }} /></label></div>
      <p className="field-hint">{consumed ? 'This challenge has been accepted. Create a fresh one before checking again.' : 'Use this challenge for one check only. Generate a new one for another claimant; an old signature does not answer a new challenge.'}</p>
    </>}
    {valid !== null && <div className={`notice ${valid ? 'notice-success' : 'notice-error'}`} role="status"><Icon name={valid ? 'check' : 'alert'} /><span>{valid ? 'This proof controls the winning bid’s key and answers your current challenge.' : 'Proof rejected. It does not answer this challenge for the winning bid.'}</span></div>}
    <p className="field-hint">This checks supplied records and a signature. It does not independently verify the chain, establish membership, identify the person or move money.</p>
  </div>;
}

export function SignWinnerProof() {
  const [receipt, setReceipt] = useState<PrivateReceipt | null>(null);
  const [challenge, setChallenge] = useState<WinnerChallenge | null>(null);
  const [proof, setProof] = useState<WinnerProof | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startOperation = useLocalOperation();
  async function open(file: File, kind: 'bid' | 'challenge') {
    const current = startOperation();
    setBusy(true); setError(null); setProof(null);
    if (kind === 'bid') setReceipt(null); else setChallenge(null);
    try {
      const value = await readJsonFile(file, 10_000);
      if (kind === 'bid') {
        const opened = validateReceipt(value);
        if (current()) setReceipt(opened);
      } else {
        const opened = validateChallenge(value);
        if (current()) setChallenge(opened);
      }
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Could not open the selected file.'); }
    finally { if (current()) setBusy(false); }
  }
  async function sign() {
    if (!receipt || !challenge) return;
    const current = startOperation();
    setBusy(true); setError(null); setProof(null);
    try {
      const created = await signWinnerClaim(receipt, challenge);
      if (current()) setProof(created);
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'This bid could not answer the challenge.'); }
    finally { if (current()) setBusy(false); }
  }
  return <div className="card">
    <h2>Prove a winning offer is yours.</h2>
    <p>Open your private bid file and the fresh challenge sent by the person checking the winner. Signing happens on this device. It never uses your wallet’s recovery phrase.</p>
    <div className="button-row"><label className="button button-secondary file-button">Open my private bid file<input type="file" accept=".json,application/json" aria-label="Open my private bid file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void open(file, 'bid'); event.target.value = ''; }} /></label><label className="button button-secondary file-button">Open claim challenge<input type="file" accept=".json,application/json" aria-label="Open claim challenge" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void open(file, 'challenge'); event.target.value = ''; }} /></label></div>
    <p className="field-hint">{receipt ? 'Private bid file loaded locally. ' : ''}{challenge ? 'Challenge loaded. ' : ''}Do not send the private file to the organiser.</p>
    <button className="button button-primary" type="button" disabled={busy || !receipt || !challenge} aria-busy={busy} onClick={sign}>{busy ? 'Working locally…' : 'Create public winner proof'}{busy ? <ButtonSpinner /> : <Icon name="check" size={16} />}</button>
    <ErrorNotice message={error} />
    {proof && <div className="notice notice-success"><Icon name="check" /><span>Public proof is ready. It contains a signature and public round references, not your private bid key.<button className="button button-quiet" type="button" onClick={() => downloadJson(`nextturn-winner-proof-${proof.tenderId}.json`, proof)}><Icon name="download" size={16} />Download public proof</button></span></div>}
    <p className="field-hint">Only new version-2 rounds support this check. Ownership of a bid key is not a membership or real-world identity check.</p>
  </div>;
}
