import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from './Icon.tsx';
import { downloadJson, saveJsonAs, SaveAsUnavailableError } from '../lib/files.ts';
import type { PrivateReceipt, RoundManifest } from '../lib/round.ts';
import { formatMoney } from '../lib/round.ts';
import type { AuditResult } from '../lib/audit.ts';
import { paymentRequestDetails } from '../lib/zip321.ts';
import { useLocalOperation } from '../hooks/useLocalOperation.ts';

export function ButtonSpinner() { return <span className="button-spinner" aria-hidden="true" />; }

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [message, setMessage] = useState(label);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMessage('Copied'); }
    catch { setMessage('Select text to copy'); }
  }
  return <button type="button" className="button button-quiet button-small" onClick={copy}><Icon name="copy" size={15} />{message}</button>;
}

export function ErrorNotice({ message }: { message: string | null }) {
  return message ? <div className="notice notice-error" role="alert"><Icon name="alert" /><span>{message}</span></div> : null;
}

export function RulesDetails({ manifest }: { manifest: RoundManifest }) {
  const { rules } = manifest;
  return <details className="rules-details">
    <summary><Icon name="lock" size={15} />Round rules<span>+</span></summary>
    <div className="rules-body">
      <dl className="detail-list">
        <div><dt>Who wins?</dt><dd>The highest offer within the group’s limit</dd></div>
        <div><dt>If offers tie</dt><dd>Earlier bid block first, then the smaller bid reference</dd></div>
        <div><dt>Group size</dt><dd>{rules.memberCount} declared members. This app does not verify membership.</dd></div>
        <div><dt>Bidding window</dt><dd>Blocks {rules.startHeight.toLocaleString()}–{rules.commitDeadlineHeight.toLocaleString()}</dd></div>
        <div><dt>Opening offers</dt><dd>Blocks {(rules.commitDeadlineHeight + 1).toLocaleString()}–{rules.revealDeadlineHeight.toLocaleString()}</dd></div>
        <div><dt>Final result check</dt><dd>Five blocks after the opening window ends</dd></div>
      </dl>
      <details className="technical-details"><summary>Technical reference</summary><p className="field-hint">The rules are hashed together and anchored before bidding starts. This fingerprint can be checked on testnet after the group publishes the incoming viewing key. Every protocol payment uses 0.001 TAZ plus wallet fees.</p><div className="hash-line"><code>{manifest.rulesHash}</code><CopyButton text={manifest.rulesHash} /></div></details>
    </div>
  </details>;
}

export function ReceiptDownload({ receipt, onSaved, saved = false }: { receipt: PrivateReceipt; onSaved?: () => void; saved?: boolean }) {
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startOperation = useLocalOperation();
  const filename = `nextturn-private-${receipt.tenderId}.json`;
  async function saveAs() {
    const current = startOperation();
    setBusy(true); setError(null);
    try {
      const completed = await saveJsonAs(filename, receipt);
      if (completed && current()) onSaved?.();
    } catch (cause) {
      if (current() && cause instanceof SaveAsUnavailableError) {
        try { downloadJson(filename, receipt); setRequested(true); }
        catch { setError('The browser could not save or download the file. Open NextTurn in a normal Edge or Chrome window and try again.'); }
      } else if (current()) setError(cause instanceof Error ? cause.message : 'The file could not be saved.');
    }
    finally { if (current()) setBusy(false); }
  }
  return <div className="private-receipt">
    <div className="receipt-label"><Icon name="lock" size={16} /><span>Your private bid backup</span><span className="mini-pill">Private</span></div>
    <p>This file holds your offer and its secret salt{receipt.claimPrivateKeyHex ? ', plus your one-off proof key' : ''}. You need it to open your offer later{receipt.claimPrivateKeyHex ? ' and prove control of it if it wins' : ''}. Anyone with the file can read your amount. <strong>Keep it to yourself.</strong></p>
    <p className="field-hint">Saving this file does not send a bid or a payment. Practice keeps a temporary copy in memory; a wallet round needs your saved file after you close or reload the page.</p>
    <button type="button" className="button button-secondary" disabled={busy} aria-busy={busy} onClick={saveAs}>{busy ? <ButtonSpinner /> : <Icon name="download" size={17} />}{busy ? 'Saving locally…' : 'download my bid file'}</button>
    <ErrorNotice message={error} />
    {saved ? <p className="field-hint" role="status">Bid file saved or confirmed. Keep it private until you need it.</p> : requested && <div className="file-save-confirmation"><p className="field-hint">Your browser used its normal download flow. Check that the file is accessible in Downloads or your chosen folder. Embedded Review-browser downloads may stay inside its file panel.</p>{onSaved && <label className="checkbox-field"><input type="checkbox" aria-label="I saved my bid file" disabled={busy} onChange={(event) => { if (event.target.checked) onSaved(); }} /><span>I have this bid file saved locally.</span></label>}</div>}
  </div>;
}

export function PaymentRequest({ uri, reveal = false, anchor = false }: { uri: string; reveal?: boolean; anchor?: boolean }) {
  const details = paymentRequestDetails(uri);
  const [qr, setQr] = useState<{ uri: string; image: string } | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(uri, { width: 252, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#172720', light: '#ffffff' } })
      .then((image) => { if (active) setQr({ uri, image }); }).catch(() => { if (active) setQr(null); });
    return () => { active = false; };
  }, [uri]);
  return <div className="payment-request">
    <div className="qr-frame">{qr?.uri === uri ? <img src={qr.image} width="252" height="252" alt={reveal ? 'Wallet request to open the saved offer' : anchor ? 'Wallet request to record the round rules' : 'Wallet request to record the private offer'} /> : <span>Preparing QR code…</span>}</div>
    <div>
      <h3>{reveal ? 'Open your offer from your wallet' : anchor ? 'Record the round rules from your wallet' : 'Send this request from your wallet'}</h3>
      <p>This testnet payment records {anchor ? 'the rules fingerprint' : 'your offer'}. It does not pay the pot. Send 0.001 TAZ plus your wallet’s fee, using a shielded balance.</p>
      {reveal && <p className="warning-text">Sending this request makes your saved offer amount and salt visible for checking.</p>}
      <div className="button-row"><a className="button button-primary" href={uri}>Open my wallet<Icon name="external" size={16} /></a><CopyButton text={uri} label="Copy wallet request" /></div>
      <p className="field-hint">No payment is sent by this page. Confirm it in your own wallet.</p>
      <details className="technical-details"><summary>Send manually in Zingo</summary><p className="field-hint">Use these exact fields in your testnet wallet. Keep the amount fixed and paste the whole memo. Do not add your name.</p><label className="field"><span>Round address</span><textarea readOnly value={details.address} rows={2} spellCheck={false} /></label><CopyButton text={details.address} label="Copy address" /><p className="field-hint">Amount: {details.amount} TAZ, plus the wallet fee.</p><label className="field"><span>Memo</span><textarea readOnly value={details.memo} rows={3} spellCheck={false} /></label><CopyButton text={details.memo} label="Copy memo" /></details>
      <details className="technical-details"><summary>Payment details</summary><textarea readOnly value={uri} rows={4} aria-label="Exact wallet payment request" spellCheck={false} /></details>
    </div>
  </div>;
}

export function AuditOutcome({ result, manifest }: { result: AuditResult; manifest: RoundManifest }) {
  const winner = result.winner;
  const { rules } = manifest;
  const discount = winner?.priceMinor ? BigInt(winner.priceMinor) : 0n;
  const others = BigInt(rules.memberCount - 1);
  const wrongWinner = result.errors.some((issue) => issue.code === 'wrong-winner');
  return <>
    <div className={`outcome-banner ${result.ok ? 'outcome-pass' : 'outcome-fail'}`} role="status">
      <span className="outcome-icon"><Icon name={result.ok ? 'check' : 'alert'} size={24} /></span>
      <div><span className="eyebrow">{result.scope === 'practice' ? 'Practice result · Checked on this device' : 'Result file check · Not an independent chain check'}</span><h3>{result.ok ? 'The result matches the offers.' : wrongWinner ? 'The announced winner doesn’t match.' : 'We can’t confirm this result.'}</h3><p>{result.ok ? `${result.bids.filter((bid) => bid.status === 'valid').length} offers checked. The winning offer follows the round’s rules.` : wrongWinner ? 'A different offer wins under the group’s rules. The result was rejected without changing any bids.' : result.errors.map((issue) => issue.message).join(' ')}</p></div>
    </div>
    {result.ok && winner && <div className="payout-grid">
      <div><span>Winning offer</span><strong>{formatMoney(discount, rules.currency)}</strong></div>
      <div><span>Winner would receive</span><strong>{formatMoney(BigInt(rules.potMinor) - discount, rules.currency)}</strong></div>
      <div><span>Each of the other {rules.memberCount - 1} members</span><strong>{formatMoney(discount / others, rules.currency)}</strong></div>
      <p>Example payout: the offer is split equally between the other members, before any group charges. {discount % others > 0n ? `${formatMoney(discount % others, rules.currency)} remains after rounding. ` : ''}Your group still handles the money; this app does not pay anyone.</p>
    </div>}
    {result.ok && !winner && <p className="notice">No offers were opened within the rules. There is no winner for this round.</p>}
    <div className="table-wrap"><table className="bid-table"><thead><tr><th>Offer</th><th>Amount offered</th><th>Result</th></tr></thead><tbody>
      {result.bids.map((bid, i) => <tr key={bid.commitmentHex}><td>Offer {i + 1}</td><td>{bid.priceMinor === null ? 'Not opened' : formatMoney(bid.priceMinor, rules.currency)}</td><td><span className={`mini-pill ${winner?.commitmentHex === bid.commitmentHex ? 'mini-pill-gold' : ''}`}>{winner?.commitmentHex === bid.commitmentHex ? 'Winning offer' : bid.status === 'valid' ? 'Within limit' : bid.status === 'above-cap' ? 'Over the limit' : 'Not opened'}</span></td></tr>)}
    </tbody></table></div>
    <details className="technical-details"><summary>Technical check details</summary><ul>{result.bids.map((bid) => <li key={bid.commitmentHex}><code>{bid.commitmentHex}</code> · committed at block {bid.commitHeight.toLocaleString()}</li>)}</ul>{result.rejected.length > 0 && <p>{result.rejected.length} record(s) were rejected or counted as duplicates.</p>}{result.errors.map((issue, i) => <p key={`${issue.code}-${i}`}>{issue.message}</p>)}</details>
  </>;
}
