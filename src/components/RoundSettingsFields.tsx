import { ROUND_CURRENCIES } from '../lib/round-settings.ts';
import type { RoundSettingsDraft } from '../lib/round-settings.ts';

/** Public group rules only. No participant names, identities or bid data. */
export function RoundSettingsFields({ draft, onChange, prefix }: {
  draft: RoundSettingsDraft;
  onChange: (draft: RoundSettingsDraft) => void;
  prefix: string;
}) {
  function change(field: keyof RoundSettingsDraft, value: string) { onChange({ ...draft, [field]: value }); }
  return <>
    <label className="field field-wide" htmlFor={`${prefix}-title`}><span>Public round name</span><input id={`${prefix}-title`} value={draft.title} maxLength={80} autoComplete="off" onChange={(event) => change('title', event.target.value)} required /></label>
    <label className="field" htmlFor={`${prefix}-members`}><span>Number of participants</span><input id={`${prefix}-members`} value={draft.members} type="number" min="2" max="100" step="1" autoComplete="off" onChange={(event) => change('members', event.target.value)} aria-describedby={`${prefix}-members-hint`} required /><small id={`${prefix}-members-hint`}>Include yourself. Your group still confirms who is eligible.</small></label>
    <label className="field" htmlFor={`${prefix}-pot`}><span>Pot for this round</span><input id={`${prefix}-pot`} value={draft.pot} inputMode="decimal" autoComplete="off" onChange={(event) => change('pot', event.target.value)} aria-describedby={`${prefix}-pot-hint`} required /><small id={`${prefix}-pot-hint`}>Use an amount without commas. NextTurn does not hold this money.</small></label>
    <label className="field" htmlFor={`${prefix}-currency`}><span>Currency label</span><select id={`${prefix}-currency`} value={draft.currency} onChange={(event) => change('currency', event.target.value)}>{ROUND_CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="field" htmlFor={`${prefix}-cap`}><span>Maximum offer (% of the pot)</span><input id={`${prefix}-cap`} value={draft.cap} inputMode="decimal" autoComplete="off" onChange={(event) => change('cap', event.target.value)} aria-describedby={`${prefix}-cap-hint`} required /><small id={`${prefix}-cap-hint`}>The highest amount a participant can offer to leave for the others.</small></label>
  </>;
}
