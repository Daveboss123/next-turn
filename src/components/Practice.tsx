import { useEffect, useState } from 'react';
import { Icon } from './Icon.tsx';
import { OfferIllustration } from './OfferIllustration.tsx';
import { PracticeWinnerClaim } from './WinnerClaim.tsx';
import { AuditOutcome, ErrorNotice, ReceiptDownload, RulesDetails } from './shared.tsx';
import { auditRound } from '../lib/audit.ts';
import type { AuditResult } from '../lib/audit.ts';
import { downloadJson } from '../lib/files.ts';
import { formatMoney, moneyToMinor, discountCapMinor, roundPhase } from '../lib/round.ts';
import { closePracticeBidding, createPracticeRound, finishPracticeRound, practiceBundle, revealPracticeBid, sealPracticeBid } from '../lib/practice.ts';
import type { PracticeRound } from '../lib/practice.ts';

export function Practice({ round, onChange, receiptSaved, onReceiptSaved }: { round: PracticeRound; onChange: (round: PracticeRound) => void; receiptSaved: boolean; onReceiptSaved: () => void }) {
  const [amount, setAmount] = useState('65000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [tampered, setTampered] = useState<AuditResult | null>(null);
  const { rules } = round.manifest;
  const phase = roundPhase(rules, round.height);
  const stage = phase === 'complete' ? 3 : phase === 'reveal' ? 2 : round.receipt ? 1 : 0;
  const commitments = round.records.filter((record) => /^ZT[23]C /.test(record.memo));
  let offered: bigint | null = null;
  try { const value = BigInt(moneyToMinor(amount)); if (value <= discountCapMinor(rules)) offered = value; } catch { /* Show validation on submit, not every keystroke. */ }
  useEffect(() => {
    let active = true;
    if (phase === 'complete') auditRound(practiceBundle(round)).then((value) => { if (active) setResult(value); }).catch(() => { if (active) setError('We couldn’t check this practice result. Start a new round and try again.'); });
    return () => { active = false; };
  }, [round, phase]);
  async function run(action: () => Promise<PracticeRound> | PracticeRound) {
    setBusy(true); setError(null); setResult(null); setTampered(null);
    try { onChange(await action()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'We couldn’t complete this step. Please try again.'); }
    finally { setBusy(false); }
  }
  async function seal() {
    await run(async () => {
      const minor = moneyToMinor(amount);
      if (BigInt(minor) > discountCapMinor(rules)) throw new Error(`Your offer can’t be more than ${formatMoney(discountCapMinor(rules), rules.currency)}.`);
      return sealPracticeBid(round, minor);
    });
  }
  async function demonstrateTampering() {
    if (!result?.winner) return;
    const losing = result.bids.find((bid) => bid.status === 'valid' && bid.commitmentHex !== result.winner?.commitmentHex);
    if (losing) setTampered(await auditRound({ ...practiceBundle(round), declaredWinnerCommitment: losing.commitmentHex }));
  }
  return <section className="practice-section" id="practice-round" aria-labelledby="practice-title">
    <div className="section-heading practice-page-heading"><div><span className="eyebrow">Sample savings group</span><h1 id="practice-title">Your practice round</h1><p className="section-subtitle">Choose an offer, open it after close, and check the result.</p></div><span className="mode-pill"><span className="status-dot" />Practice only</span></div>
    <div className="notice notice-practice"><Icon name="shield" size={18} /><span><strong>This is a practice round.</strong> The other offers are examples. Nothing is sent or paid, and refreshing clears this round.</span></div>
    <div className="round-stats"><div><span>Available pot</span><strong>{formatMoney(rules.potMinor, rules.currency)}</strong></div><div><span>Group members</span><strong>{rules.memberCount}</strong></div><div><span>Maximum offer</span><strong>{formatMoney(discountCapMinor(rules), rules.currency)}<small>{rules.discountCapBps / 100}% of the pot</small></strong></div></div>
    <div className="stepper" aria-label="Round progress">{['Make an offer', 'Save your bid file', 'Open your offer', 'Check the result'].map((step, i) => <div className={`step ${i === stage ? 'step-current' : i < stage ? 'step-done' : ''}`} key={step}><span>{i < stage ? <Icon name="check" size={13} /> : `0${i + 1}`}</span><p>{step}</p></div>)}</div>
    <div className="round-workspace">
      <div className="card bid-card">
        <div className="card-heading"><div className="card-icon"><Icon name={phase === 'complete' ? 'check' : 'lock'} /></div><div><h3>{phase === 'complete' ? 'The round is complete.' : phase === 'reveal' ? 'Bidding has closed.' : round.receipt ? 'Your offer is recorded.' : 'What would you leave for the group?'}</h3><p>{phase === 'bidding' ? 'Offer to take less than the full pot. The highest offer within the limit wins.' : phase === 'reveal' ? 'Open the offer you saved so it can be compared with the others.' : 'Your result and the opened offers are shown below.'}</p></div></div>
        <ErrorNotice message={error} />
        {phase === 'bidding' && !round.receipt && <form onSubmit={(event) => { event.preventDefault(); void seal(); }}>
          <label className="field-label" htmlFor="practice-discount">Amount you’d leave for the other members</label>
          <div className="amount-input"><span>{rules.currency}</span><input id="practice-discount" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby="practice-cap" /></div>
          <p className="field-hint" id="practice-cap">You can offer up to {formatMoney(discountCapMinor(rules), rules.currency)}.</p>
          {offered !== null && <div className="offer-summary"><span>If your offer wins, you’d take</span><strong>{formatMoney(BigInt(rules.potMinor) - offered, rules.currency)}</strong></div>}
          <button className="button button-primary button-full" disabled={busy} type="submit">{busy ? 'Saving your offer…' : 'Place practice offer'}<Icon name="arrow" size={17} /></button>
          <div className="privacy-footnote"><Icon name="lock" size={14} />Your offer amount stays hidden until you open it.</div>
        </form>}
        {phase === 'bidding' && round.receipt && <>
          <div className="sealed-confirmation"><span className="mini-pill"><Icon name="check" size={12} />Offer recorded</span><p>You offered <strong>{formatMoney(round.receipt.priceMinor, rules.currency)}</strong>. Other members can’t see this amount yet.</p></div>
          <ReceiptDownload receipt={round.receipt} onSaved={onReceiptSaved} saved={receiptSaved} />
          {receiptSaved && <p className="saved-file-status" role="status"><Icon name="check" size={15} />Bid file saved or confirmed. Keep the file until your offer is opened.</p>}
          <button className="button button-primary button-full" type="button" disabled={busy || !receiptSaved} onClick={() => void run(() => closePracticeBidding(round))}>Close bidding<Icon name="arrow" size={17} /></button>
          <p className="field-hint">Save your bid file first. For this practice round, you can close bidding yourself.</p>
        </>}
        {phase === 'reveal' && !round.revealed && <>
          <div className="reveal-value"><span>Your saved offer</span><strong>{round.receipt ? formatMoney(round.receipt.priceMinor, rules.currency) : 'No offer saved'}</strong></div>
          <p className="field-hint">Opening your offer makes its amount visible for checking. Your name is not attached to it. In a real round, all opened amounts become public when the group shares the incoming viewing key.</p>
          <button className="button button-primary button-full" type="button" disabled={busy || !round.receipt} onClick={() => void run(() => revealPracticeBid(round))}>Open my offer<Icon name="arrow" size={17} /></button>
        </>}
        {phase === 'reveal' && round.revealed && <>
          <div className="notice notice-success"><Icon name="check" /><span>Your opened offer matches the one you placed. It hasn’t been changed.</span></div>
          <button className="button button-primary button-full" type="button" disabled={busy} onClick={() => void run(() => finishPracticeRound(round))}>Show the result<Icon name="arrow" size={17} /></button>
        </>}
        {phase === 'complete' && result && <>
          <p className="result-intro">The app checked the offers again to find the winner. You can also try announcing the wrong winner and see whether it catches the mistake.</p>
          <div className="button-row"><button className="button button-secondary" type="button" onClick={demonstrateTampering}>Try the wrong winner<Icon name="alert" size={16} /></button><button className="button button-quiet" type="button" onClick={() => downloadJson(`nextturn-public-practice-${rules.tenderId}.json`, practiceBundle(round))}><Icon name="download" size={16} />Download result file</button></div>
          <p className="field-hint">This result file contains the opened sample offers. It is separate from your private bid file.</p>
        </>}
        {phase !== 'bidding' && round.receipt && <ReceiptDownload receipt={round.receipt} onSaved={onReceiptSaved} saved={receiptSaved} />}
      </div>
      <aside className="card evidence-card">
        <div className="card-topline"><span className="eyebrow">This round</span><span className="mini-pill">{commitments.length} offers received</span></div>
        <div className={`offers-summary ${phase !== 'bidding' ? 'offers-summary-text-only' : ''}`}>
          <div className="offers-description"><h3>{phase === 'bidding' ? 'Other offers stay private.' : 'Offers are ready to compare.'}</h3><p>{phase === 'bidding' ? 'You can see that offers were received, but not what anyone offered. Amounts are only opened after bidding closes.' : 'Each opened offer is checked against the one that was placed earlier. An offer can’t be changed to beat someone else.'}</p></div>
          {phase === 'bidding' && <OfferIllustration variant="queue" compact />}
        </div>
        <div className="envelope-list">{commitments.map((record, i) => <div className="envelope" key={record.txid}><span className="envelope-number">0{i + 1}</span><Icon name="lock" size={15} /><span className="offer-row-label">Offer {i + 1}</span><span>{phase === 'bidding' ? 'Amount hidden' : 'Recorded'}</span></div>)}</div>
        <div className="round-status"><span className="status-dot" /><strong>{phase === 'bidding' ? 'Bidding is open' : phase === 'reveal' ? 'Bidding closed · opening offers' : 'Round complete'}</strong><p>In a real round, the deadline is fixed before anyone bids. You can’t change the rules after seeing the offers.</p></div>
        <RulesDetails manifest={round.manifest} />
      </aside>
    </div>
    {phase === 'complete' && result && <div className="card results-card"><div className="section-heading"><div><h2>This round’s result</h2></div></div><AuditOutcome result={result} manifest={round.manifest} />{rules.version === 2 && round.receipt && result.winner?.commitmentHex === round.receipt.commitmentHex && <PracticeWinnerClaim key={rules.tenderId} bundle={practiceBundle(round)} receipt={round.receipt} />}{tampered && <div className="tamper-demo"><h3>What if the wrong winner was announced?</h3><AuditOutcome result={tampered} manifest={round.manifest} /></div>}</div>}
    <div className="reset-row"><p>Try another amount with a new set of sample offers.</p><button className="button button-quiet" type="button" disabled={busy} onClick={() => void run(() => createPracticeRound({ version: rules.version }))}>Start a new practice round<Icon name="circle" size={15} /></button></div>
  </section>;
}
