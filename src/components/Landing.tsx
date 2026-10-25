import { Icon } from './Icon.tsx';
import { Brand } from './Brand.tsx';
import { OfferIllustration } from './OfferIllustration.tsx';
import { SiteFooter } from './SiteFooter.tsx';
import { ExampleOfferChart, ExamplePotChart } from './ExampleCharts.tsx';
import { ScrollEntrance } from './ScrollEntrance.tsx';
import { useScrollEntrance } from '../hooks/useScrollEntrance.ts';

export function Landing() {
  const preview = useScrollEntrance();
  return <div className="landing">
    <header className="site-header">
      <div className="header-inner landing-header">
        <Brand />
        <nav className="landing-nav" aria-label="Website navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#check-results">Results</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <a className="button button-dark" href="#app">Open app<Icon name="arrow" size={16} /></a>
      </div>
    </header>

    <main id="main-content" className="landing-content" tabIndex={-1}>
      <section className="nextturn-hero" aria-labelledby="landing-title">
        <div className="nextturn-hero-copy">
          <p className="hero-category"><span className="status-dot" />For bidding savings groups</p>
          <h1 id="landing-title">Private bids for your next savings payout.</h1>
          <p className="hero-description">Want the pot this round? Offer an amount you’d leave for the other members. Bids stay hidden until close, and everyone can check the result.</p>
          <div className="button-row">
            <a className="button button-primary" href="#app">Try a practice round<Icon name="arrow" size={17} /></a>
            <a className="button button-secondary" href="#how-it-works">How it works</a>
          </div>
          <p className="hero-proof"><Icon name="shield" size={15} />No account, wallet or payment needed to practice.</p>
        </div>
        <OfferIllustration scrollOnly />
      </section>

      <section className="landing-preview nextturn-preview" aria-label="Example savings round">
        <div ref={preview} data-scroll-entrance="copy">
        <div className="landing-preview-bar"><span><Icon name="circle" size={16} />A round in NextTurn</span><span className="mini-pill">Practice example</span></div>
        <div className="landing-preview-grid">
          <div className="landing-round-summary">
            <span className="preview-label">The pot this round</span><strong>NGN 600,000</strong>
            <p>8 members. Offer up to NGN 150,000.</p>
            <div className="landing-offer-list">
              {[1, 2, 3].map((offer) => <div key={offer}><span className="preview-envelope-icon"><Icon name="lock" size={15} /></span><span>Offer {offer}</span><small>Amount hidden</small></div>)}
            </div>
            <p className="landing-preview-note"><Icon name="shield" size={14} />Amounts stay private while bidding is open.</p>
          </div>
          <div className="landing-ticket">
            <h2>What would you leave for the group?</h2><p>If you win, you take the pot minus your offer.</p>
            <div className="landing-example-input"><span>NGN</span><strong>65,000</strong></div>
            <div className="offer-summary"><span>You would receive</span><strong>NGN 535,000</strong></div>
            <a className="button button-primary button-full" href="#app">Try this round<Icon name="arrow" size={17} /></a>
            <span className="landing-ticket-note">An example, not a live group or a payment.</span>
          </div>
        </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <ScrollEntrance>
        <div className="landing-section-heading"><h2 id="how-title">The group sets the round.<br />Members choose their offers.</h2><p>You keep collecting contributions and paying members as usual. NextTurn handles the bids and the result—not the money.</p></div>
        <div className="landing-steps">
          <article><span className="step-number">01</span><h3>Agree on the rules.</h3><p>Set the pot, maximum offer and deadline before anyone bids.</p></article>
          <article><span className="step-number">02</span><h3>Place a private offer.</h3><p>Choose how much you’d leave for the others. Keep your bid file so you can open the offer later.</p></article>
          <article><span className="step-number">03</span><h3>Open and compare.</h3><p>After close, members open their bids. The highest offer within the limit wins, and the group handles the payout.</p></article>
        </div>
        </ScrollEntrance>
      </section>

      <section className="nextturn-results-section" id="check-results" aria-labelledby="check-title">
        <ScrollEntrance className="results-section-heading"><div><h2 id="check-title">A result you can check yourself.</h2><p>The app compares opened offers with the original rules. If someone announces the wrong winner, the check rejects it.</p></div><a className="text-button" href="#app/audit">Check a result<Icon name="arrow" size={16} /></a></ScrollEntrance>
        <div className="example-charts-section"><ExampleOfferChart /><ExamplePotChart /></div>
        <p className="result-scope-note">Example amounts, not live activity. The browser checks the result file; the independent checker retrieves the round from testnet.</p>
      </section>

      <section className="landing-section landing-privacy" id="privacy" aria-labelledby="privacy-title">
        <div className="landing-section-heading"><h2 id="privacy-title">What stays private—and what doesn’t.</h2><p>Offer amounts are hidden before opening. Names are not added to bid memos. That doesn’t hide every trace of activity.</p></div>
        <div className="landing-faq">
          <details><summary>What can the organiser see before the deadline?<span>+</span></summary><p>They can see that a bid arrived, its block and the fixed testnet payment. Properly salted commitments do not reveal its amount. Voluntarily opening early can expose that amount; the checker rejects the early opening.</p></details>
          <details><summary>What becomes public when offers are opened?<span>+</span></summary><p>All opened amounts become readable after the incoming viewing key is published, including losing offers and salts. The protocol does not add bidder names or sender fields to the memos.</p></details>
          <details><summary>Does NextTurn manage money or membership?<span>+</span></summary><p>No. Your group collects contributions, confirms membership and pays the winner outside the app. This prototype does not prevent fake members, collusion or missed payouts.</p></details>
          <details><summary>What other privacy limits should I know?<span>+</span></summary><p>The static host can see page requests and IPs, and wallet servers can see network metadata. A compromised frontend could read what you type. NextTurn has no accounts, transaction relay, analytics or remotely loaded fonts. Use a trusted local copy for sensitive testing.</p></details>
        </div>
        <a className="text-button" href="#app/privacy">Read the full privacy notes<Icon name="arrow" size={15} /></a>
      </section>
      <SiteFooter />
    </main>
  </div>;
}
