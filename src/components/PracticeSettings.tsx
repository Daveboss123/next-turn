import { useState } from 'react';
import { Icon } from './Icon.tsx';
import { ErrorNotice } from './shared.tsx';
import { RoundSettingsFields } from './RoundSettingsFields.tsx';
import { parseRoundSettings, roundSettingsDraft } from '../lib/round-settings.ts';
import type { EditableRoundSettings } from '../lib/round-settings.ts';
import type { RoundRules } from '../lib/round.ts';

export function PracticeSettings({ rules, open, onOpenChange, locked, busy, onApply }: {
  rules: RoundRules;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locked: boolean;
  busy: boolean;
  onApply: (settings: EditableRoundSettings) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => roundSettingsDraft(rules));
  const [error, setError] = useState<string | null>(null);
  async function apply() {
    setError(null);
    try {
      const settings = parseRoundSettings(draft);
      if (await onApply(settings)) onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your round settings and try again.'); }
  }
  return <div className={`card practice-settings ${open && !locked ? 'practice-settings-open' : ''}`}>
    <div className="settings-heading"><div><h2>Round settings</h2><p>{locked ? 'These rules are fixed for this round. Start a new practice round to change them.' : open ? 'Set your participants, pot, currency and offer limit before making an offer.' : 'Participants, pot and offer limit are set. You can change them before you bid.'}</p></div>
      {locked ? <span className="mini-pill"><Icon name="lock" size={13} />Rules fixed</span> : <button className="button button-secondary" type="button" disabled={busy} aria-expanded={open} aria-controls="practice-settings-form" onClick={() => onOpenChange(!open)}>{open ? 'Keep current rules' : 'Edit round settings'}<Icon name={open ? 'check' : 'circle'} size={15} /></button>}
    </div>
    {open && !locked && <form id="practice-settings-form" onSubmit={(event) => { event.preventDefault(); void apply(); }}>
      <fieldset className="form-grid settings-fields" disabled={busy}><legend className="sr-only">Practice round rules</legend><RoundSettingsFields draft={draft} onChange={setDraft} prefix="practice-rules" /></fieldset>
      <ErrorNotice message={error} />
      <p className="field-hint">This is a local simulation with up to two sample offers, not real participants. Deadlines advance when you click <strong>Close bidding</strong>. For a wallet round, set actual testnet block deadlines under <a href="#app/testnet">Wallet rounds → Create a round</a>.</p>
      <button className="button button-primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Preparing your round…' : 'Use these practice rules'}<Icon name="arrow" size={16} /></button>
    </form>}
  </div>;
}
