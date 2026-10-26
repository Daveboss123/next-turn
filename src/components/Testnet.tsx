import { useEffect, useState } from 'react';
import { Icon } from './Icon.tsx';
import { CopyButton, ErrorNotice, PaymentRequest, ReceiptDownload, RulesDetails } from './shared.tsx';
import { createPrivateBid, bidMemo, receiptForRound } from '../lib/bid.ts';
import { SignWinnerProof } from './WinnerClaim.tsx';
import { buildPaymentUri } from '../lib/zip321.ts';
import { downloadJson, readJsonFile } from '../lib/files.ts';
import { createManifest, discountCapMinor, formatMoney, isHeight, isHex, moneyToMinor, newRoundId, roundPhase, validateManifest } from '../lib/round.ts';
import type { PrivateReceipt, RoundManifest } from '../lib/round.ts';
import { validateChainTip } from '../lib/chain-tip.ts';
import type { ChainTip } from '../lib/chain-tip.ts';
import { useLocalOperation } from '../hooks/useLocalOperation.ts';

export function Testnet({ onPractice }: { onPractice: () => void }) {
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [manifest, setManifest] = useState<RoundManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('Community savings round');
  const [address, setAddress] = useState('');
  const [pot, setPot] = useState('600000');
  const [currency, setCurrency] = useState('NGN');
  const [members, setMembers] = useState('8');
  const [cap, setCap] = useState('25');
  const [start, setStart] = useState('');
  const [close, setClose] = useState('');
  const [revealEnd, setRevealEnd] = useState('');
  const [anchorTxid, setAnchorTxid] = useState('');
  const [tip, setTip] = useState<ChainTip | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [bidMode, setBidMode] = useState<'bid' | 'reveal'>('bid');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<PrivateReceipt | null>(null);
  const [saved, setSaved] = useState(false);
  const [consent, setConsent] = useState(false);
  const [revealUri, setRevealUri] = useState<string | null>(null);
  const startOperation = useLocalOperation();
  let phase: ReturnType<typeof roundPhase> | null = null;
  try { if (manifest && tip) phase = roundPhase(manifest.rules, validateChainTip(tip, now).height); } catch { /* Stale snapshots disable requests until refreshed. */ }
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function run(action: (current: () => boolean) => Promise<void> | void) {
    const current = startOperation();
    setBusy(true); setError(null);
    try { await action(current); } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Could not prepare the request.'); }
    finally { if (current()) setBusy(false); }
  }
  function replaceManifest(value: RoundManifest) {
    setManifest(value); setReceipt(null); setSaved(false); setConsent(false); setRevealUri(null);
    setAnchorTxid(value.anchorTxid ?? ''); setTip(null);
    setBidMode('bid'); setAmount('');
  }
  async function importTip(file: File) {
    setTip(null); setRevealUri(null);
    await run(async (current) => {
      const reading = validateChainTip(await readJsonFile(file, 5000));
      if (current()) { setTip(reading); setNow(Math.floor(Date.now() / 1000)); }
    });
  }
  async function importRound(file: File) {
    setManifest(null); setReceipt(null); setTip(null); setSaved(false); setConsent(false); setRevealUri(null);
    await run(async (current) => {
      const value = await validateManifest(await readJsonFile(file, 50_000));
      if (value.rules.network !== 'test') throw new Error('This is a practice file. Use a testnet round file here.');
      if (current()) replaceManifest(value);
    });
  }
  async function createRound() {
    await run(async (current) => {
      if (!/^\d+(\.\d{1,2})?$/.test(cap)) throw new Error('Enter a cap with at most two decimal places.');
      const created = await createManifest({ version: 2, tenderId: newRoundId(), network: 'test', address: address.trim(), title: title.trim(), currency, potMinor: moneyToMinor(pot), memberCount: Number(members), discountCapBps: Number(moneyToMinor(cap)),
        startHeight: Number(start), commitDeadlineHeight: Number(close), revealDeadlineHeight: Number(revealEnd), submissionZatoshis: '100000', tieBreak: 'earliest-block-then-commitment' });
      if (current()) replaceManifest(created);
    });
  }
  async function seal() {
    if (!manifest) return;
    await run(async (current) => {
      if (!tip || roundPhase(manifest.rules, validateChainTip(tip).height) !== 'bidding') throw new Error('A fresh chain reading inside the bidding window is required.');
      const minor = moneyToMinor(amount);
      if (BigInt(minor) > discountCapMinor(manifest.rules)) throw new Error('Discount exceeds the pinned cap.');
      const created = await createPrivateBid(manifest, minor);
      validateChainTip(tip);
      if (current()) { setReceipt(created); setSaved(false); }
    });
  }
  async function importReceipt(file: File) {
    setReceipt(null); setSaved(false); setConsent(false); setRevealUri(null);
    await run(async (current) => {
      if (!manifest) throw new Error('Open the public round file first.');
      const value = await receiptForRound(await readJsonFile(file, 10_000), manifest);
      if (current()) setReceipt(value);
    });
  }
  function prepareReveal() {
    if (!manifest || !receipt || phase !== 'reveal' || !consent) return;
    void run(() => {
      if (!tip || roundPhase(manifest.rules, validateChainTip(tip).height) !== 'reveal') throw new Error('Use a fresh chain reading after bidding closes, before the opening window ends.');
      setRevealUri(buildPaymentUri(manifest.rules.address, 100000n, bidMemo('reveal', receipt)));
    });
  }

  const chainReading = <>
    <div className="command-box"><div><code>tender-verify tip-json test https://testnet.zec.rocks:443 --out tip.json</code><CopyButton text="tender-verify tip-json test https://testnet.zec.rocks:443 --out tip.json" /></div><p>This fetches public chain data only, not your wallet keys. Use a new output filename each time you refresh the two-minute reading.</p></div>
    <label className="button button-secondary file-button">Open public chain reading<input type="file" accept=".json,application/json" aria-label="Open public chain reading" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTip(file); event.target.value = ''; }} /></label>
    <p className="field-hint">{phase && tip ? `Chain reading: block ${tip.height.toLocaleString()}. Round phase: ${phase}. Age: ${Math.max(0, now - tip.fetchedAtUnixSeconds)}s.` : 'A fresh testnet chain-tip file is required. Stale files disable new requests.'} This is a supplied local reading, not a cryptographically authenticated chain proof.</p>
  </>;
  return <section>
    <div className="page-heading"><span className="eyebrow">Real requests, testnet only</span><h1>Your wallet. Your sealed bid.</h1><p>Prepare protocol requests on this device. Your own wallet signs and sends. This app never asks for a recovery phrase or spending key.</p></div>
    <div className="notice"><Icon name="alert" /><span><strong>The full real-wallet round is not yet proven.</strong> These are working request builders, not a hosted live circle. Use free testnet TAZ only. Without a wallet, <button type="button" className="text-button" onClick={onPractice}>try local practice</button>.</span></div>
    <div className="segmented"><button type="button" disabled={busy} className={mode === 'join' ? 'selected' : ''} onClick={() => setMode('join')}>Join a round</button><button type="button" disabled={busy} className={mode === 'create' ? 'selected' : ''} onClick={() => setMode('create')}>Create a round</button></div>
    <ErrorNotice message={error} />
    {!manifest && mode === 'join' && <div className="card import-card"><span className="import-symbol"><Icon name="upload" size={30} /></span><h2>Open the organiser’s public round file.</h2><p>The file contains public rules, the shielded round address, their fingerprint and a claimed anchor transaction. It does not contain wallet secrets.</p><label className="button button-primary file-button">Choose round JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importRound(file); event.target.value = ''; }} /></label><p className="field-hint">The fingerprint is checked locally. On-chain anchoring requires the native verifier, not trust in this selected file.</p></div>}
    {!manifest && mode === 'create' && <div className="card">
      <div className="card-heading"><div className="card-icon"><Icon name="shield" /></div><div><h2>Set the rules before bids exist.</h2><p>Only public round details belong here. Never enter member names or private financial circumstances.</p></div></div>
      <div className="command-box"><span>First, create a dedicated shielded receiver locally:</span><div><code>tender-verify receiver-init test --out-dir .local/round-receiver-1</code><CopyButton text="tender-verify receiver-init test --out-dir .local/round-receiver-1" /></div><p>Use a new folder. Keys go directly to private files; only the public address is printed. Keep the seed private and disclose only the incoming key after bidding closes. Do not use your funded wallet’s viewing key.</p></div>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void createRound(); }}>
        <label className="field field-wide"><span>Public round title</span><input value={title} maxLength={80} autoComplete="off" onChange={(event) => setTitle(event.target.value)} required /></label>
        <label className="field field-wide"><span>Dedicated shielded testnet address</span><textarea value={address} rows={2} spellCheck={false} autoComplete="off" placeholder="utest1… (shielded-only)" onChange={(event) => setAddress(event.target.value)} required /></label>
        <label className="field"><span>Currency label · payouts stay outside this app</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}>{['NGN', 'USD', 'GBP', 'XAF', 'XOF', 'INR'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="field"><span>Shared pot</span><input value={pot} inputMode="decimal" onChange={(event) => setPot(event.target.value)} required /></label>
        <label className="field"><span>Declared members · not eligibility proof</span><input value={members} type="number" min="2" max="100" onChange={(event) => setMembers(event.target.value)} required /></label>
        <label className="field"><span>Maximum discount (%)</span><input value={cap} inputMode="decimal" onChange={(event) => setCap(event.target.value)} required /></label>
        <div className="field-wide command-box"><span>Check today’s height with the native reader:</span><div><code>tender-verify tip test https://testnet.zec.rocks:443</code><CopyButton text="tender-verify tip test https://testnet.zec.rocks:443" /></div><p>Allow time to mine the rules anchor before the bidding start block.</p></div>
        <label className="field"><span>Bidding starts at block</span><input value={start} inputMode="numeric" placeholder="Current tip + a buffer" onChange={(event) => { setStart(event.target.value); const number = Number(event.target.value); if (isHeight(number)) { setClose(String(number + 40)); setRevealEnd(String(number + 80)); } }} required /></label>
        <label className="field"><span>Last commitment block (inclusive)</span><input value={close} inputMode="numeric" onChange={(event) => setClose(event.target.value)} required /></label>
        <label className="field"><span>Last reveal block (inclusive)</span><input value={revealEnd} inputMode="numeric" onChange={(event) => setRevealEnd(event.target.value)} required /></label>
        <div className="field-wide"><button className="button button-primary" type="submit" disabled={busy}>Fingerprint these rules<Icon name="lock" size={16} /></button></div>
      </form>
    </div>}
    {manifest && <>
      <div className="card round-file-card"><div className="section-heading"><div><span className="eyebrow">{manifest.anchorTxid ? 'Anchor provided. Chain check pending.' : 'Round draft. Not yet anchored.'}</span><h2>{manifest.rules.title}</h2><p>{formatMoney(manifest.rules.potMinor, manifest.rules.currency)} pot · {manifest.rules.memberCount} declared members</p></div><button className="button button-quiet" type="button" disabled={busy} onClick={() => { startOperation(); setManifest(null); setReceipt(null); setTip(null); setSaved(false); setConsent(false); setRevealUri(null); }}>Open another round</button></div><RulesDetails manifest={manifest} /><div className="button-row"><button type="button" className="button button-secondary" onClick={() => downloadJson(`nextturn-round-${manifest.rules.tenderId}.json`, manifest)}><Icon name="download" size={16} />Save public round file</button></div></div>
      {!manifest.anchorTxid && <div className="card"><span className="eyebrow">ANCHOR BEFORE BIDDING OPENS</span><h2>Put the rules fingerprint on testnet.</h2><p>The organiser sends this memo to the round address from their own shielded testnet wallet. Memos are recipient-encrypted: the public can check this anchor after the incoming key is disclosed, not before.</p>{chainReading}{!busy && phase === 'scheduled' ? <PaymentRequest uri={buildPaymentUri(manifest.rules.address, 100000n, { kind: 'anchor', tenderId: manifest.rules.tenderId, rulesHash: manifest.rulesHash })} anchor /> : <p className="field-hint">A fresh reading before the bidding start block is required for the rules request. If that block has passed, create a new round instead of sending a late anchor.</p>}<label className="field"><span>After it is mined, enter the transaction ID</span><input value={anchorTxid} spellCheck={false} autoComplete="off" onChange={(event) => setAnchorTxid(event.target.value.trim().toLowerCase())} placeholder="64 lowercase hex characters" /></label><button type="button" className="button button-primary" disabled={busy || !isHex(anchorTxid, 64)} onClick={() => setManifest({ ...manifest, anchorTxid })}>Record the claimed anchor<Icon name="check" size={16} /></button><p className="field-hint">This records your claim. It does not prove mining or correctness. Export the updated public round file for bidders.</p></div>}
      {manifest.anchorTxid && <div className="card"><div className="card-heading"><div className="card-icon"><Icon name="lock" /></div><div><h2>Prepare your wallet request.</h2><p>Import a fresh public chain reading rather than guessing a block number. Actual mined heights still decide whether a bid counts.</p></div></div>{chainReading}
        <div className="segmented"><button type="button" disabled={busy} className={bidMode === 'bid' ? 'selected' : ''} onClick={() => { setBidMode('bid'); setRevealUri(null); }}>Seal a bid</button><button type="button" disabled={busy} className={bidMode === 'reveal' ? 'selected' : ''} onClick={() => { setBidMode('reveal'); setRevealUri(null); setConsent(false); }}>Reveal saved bid</button></div>
        {bidMode === 'bid' && !receipt && <form onSubmit={(event) => { event.preventDefault(); void seal(); }}><label className="field"><span>Your discount ({manifest.rules.currency})</span><input value={amount} inputMode="decimal" autoComplete="off" onChange={(event) => setAmount(event.target.value)} required /></label><p className="field-hint">Cap: {formatMoney(discountCapMinor(manifest.rules), manifest.rules.currency)}. No names, attachments or personal details go in the memo.</p><button className="button button-primary" type="submit" disabled={busy || phase !== 'bidding'}>Seal locally<Icon name="lock" size={16} /></button></form>}
        {bidMode === 'bid' && receipt && <><ReceiptDownload receipt={receipt} onSaved={() => setSaved(true)} saved={saved} />{saved && !busy && phase === 'bidding' && <PaymentRequest uri={buildPaymentUri(manifest.rules.address, 100000n, bidMemo('commit', receipt))} />}<p className="field-hint">Keep your wallet’s transaction receipt too. This page does not know whether you sent or mined a payment.</p></>}
        {bidMode === 'reveal' && <><label className="button button-secondary file-button"><Icon name="upload" size={16} />Open private receipt locally<input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importReceipt(file); event.target.value = ''; }} /></label>{receipt && <><div className="reveal-value"><span>Saved discount</span><strong>{formatMoney(receipt.priceMinor, manifest.rules.currency)}</strong></div><label className="checkbox-field"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => { setConsent(event.target.checked); setRevealUri(null); }} /><span>I understand that reveal intentionally discloses my discount and salt. I will not send it before the bidding deadline.</span></label><button className="button button-primary" type="button" disabled={busy || !consent || phase !== 'reveal'} onClick={prepareReveal}>Prepare reveal request<Icon name="arrow" size={16} /></button>{revealUri && !busy && phase === 'reveal' && <PaymentRequest uri={revealUri} reveal />}</>}</>}
      </div>}
    </>}
    <div className="notice"><Icon name="code" /><span>After bidding closes, the organiser publishes the dedicated <strong>incoming viewing key</strong>. After the reveal window and five confirmations, an auditor runs the native verifier against the chain. Never publish a seed, recovery phrase, or legacy full viewing key.</span></div>
    <SignWinnerProof />
  </section>;
}
