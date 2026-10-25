import { Brand } from './Brand.tsx';
import { Icon } from './Icon.tsx';

export function SiteFooter() {
  return <footer className="nextturn-footer">
    <div className="footer-intro">
      <div><h2>Try one practice round.</h2><p>Place an offer. Open it after close. Check the result.</p></div>
      <a className="button button-dark" href="#app">Open app<Icon name="arrow" size={16} /></a>
    </div>
    <div className="footer-body">
      <div className="footer-wordmark" aria-hidden="true">NextTurn</div>
      <div className="footer-grid">
      <div className="footer-about"><Brand /><p>Private bidding for your savings group’s next payout.</p><span className="footer-prototype"><span className="status-dot" />Practice and testnet only</span></div>
      <nav aria-label="Footer product links"><h3>Use NextTurn</h3><a href="#app">Practice round</a><a href="#app/testnet">Use a testnet wallet</a><a href="#app/audit">Check a result</a></nav>
      <nav aria-label="Footer help links"><h3>Understand the round</h3><a href="#how-it-works">How bidding works</a><a href="#privacy">What stays private</a><a href="#app/privacy">Privacy and safety</a></nav>
      <nav aria-label="Footer project links"><h3>About this build</h3><a href="https://thezecathon.com/" target="_blank" rel="noopener noreferrer">ZECATHON<Icon name="external" size={12} /></a><a href="/illustration-credits.txt" target="_blank" rel="noopener noreferrer">Illustration credits</a><span>No accounts or tracking</span></nav>
      </div>
    </div>
    <div className="footer-bottom"><span>Built for ZECATHON 2026. Private Markets.</span><span>The group handles the money, not NextTurn.</span><a href="#">Back to top ↑</a></div>
  </footer>;
}
