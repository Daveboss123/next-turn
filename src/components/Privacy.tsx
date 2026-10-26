import { Icon } from './Icon.tsx';

export function Privacy() {
  return <section>
    <div className="page-heading"><span className="eyebrow">Privacy and limits</span><h1>Privacy and safety.</h1><p>Your offer stays hidden until you open it. Once offers are opened, anyone with the round data can read the amounts. The app never adds your name to a bid memo. Here is what it protects, and where the limits are.</p></div>
    <div className="privacy-grid">
      <div className="card"><div className="card-icon"><Icon name="lock" /></div><h2>Before the deadline</h2><p>The organiser can see that an offer arrived, its block, and the fixed testnet payment. A correctly sealed offer does not reveal its amount. Competitors without the viewing key cannot read the notes.</p></div>
      <div className="card"><div className="card-icon"><Icon name="shield" /></div><h2>When offers are opened</h2><p>Publishing the incoming viewing key makes every opened offer readable, including losing amounts and salts. No names or sender fields are added to the memos. Timing and outside information can still connect activity to a person.</p></div>
      <div className="card"><div className="card-icon"><Icon name="code" /></div><h2>On this device</h2><p>Offers and wallet requests are prepared locally. There are no accounts, bid APIs, wallet relays, analytics, or remote fonts. Save your private bid file before leaving or refreshing. QR codes are generated on your device.</p></div>
      <div className="card"><div className="card-icon"><Icon name="alert" /></div><h2>Network visibility</h2><p>The static host can see page requests and IPs. Wallet servers and network observers may see metadata, and the organiser sees arrival timing. A compromised frontend could read what you type. Use a trusted local build and consider Tor for sensitive testing.</p></div>
    </div>
    <div className="card">
      <h2>What this build can and cannot check.</h2>
      <div className="table-wrap"><table className="threat-table"><thead><tr><th>Concern</th><th>Actual protection</th></tr></thead><tbody>
        <tr><td>An offer is changed afterwards</td><td>The amount and salt must reproduce an on-time commitment. A changed offer does not count.</td></tr>
        <tr><td>The group changes the rules</td><td>The rules fingerprint must be in the advertised anchor before bidding starts. Changed or unanchored rules fail.</td></tr>
        <tr><td>A late bid or an early opening</td><td>The checker uses mined block heights. Out-of-window records are rejected. Voluntarily opening early can expose that amount to the recipient; it cannot be undone.</td></tr>
        <tr><td>Bids are left out of the result</td><td>The independent checker retrieves incoming notes from a public server. Missing blocks or unreadable transactions stop the check. A result file alone does not prove that every bid was included.</td></tr>
        <tr><td>Someone copies the opened winning offer</td><td>New rounds bind a one-off proof key to each bid. The winner must answer a fresh challenge with the private key; copying the public amount and salt is not enough. This proves a bid key, not a person’s identity.</td></tr>
        <tr><td>Fake members or repeat bidders</td><td><strong>Not prevented.</strong> Too many distinct bids are flagged, but staying below the member count does not prove eligibility. Membership and real-world identity remain outside the app.</td></tr>
        <tr><td>Members collude or a payout is missed</td><td><strong>Not prevented.</strong> Public opened amounts can help colluders check one another. The app does not hold, pay or recover money.</td></tr>
        <tr><td>The key is withheld or a bid file is lost</td><td>A withheld incoming key prevents public checking. A lost salt prevents opening the bid. Neither has a recovery mechanism.</td></tr>
        <tr><td>A reorganisation or dishonest server</td><td>Five confirmation blocks and consistency checks reduce mistakes, but they are not finality or full-node verification. Compare independent servers when possible.</td></tr>
      </tbody></table></div>
    </div>
    <div className="notice"><Icon name="shield" /><span><strong>Use testnet only.</strong> This is not a production savings service. Do not run a real-money group with this build. Membership, local regulation, payout authority and a dedicated security review remain outside this prototype.</span></div>
  </section>;
}
