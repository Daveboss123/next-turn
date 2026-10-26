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
    <header className="site-header landing-site-header">
      <div className="header-inner landing-header">
        <Brand />
        <nav className="landing-nav" aria-label="Website navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#check-results">Results</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <a className="button button-dark header-app-button" href="#app">Open app<span className="button-arrow"><Icon name="arrow" size={15} /></span></a>
      </div>
    </header>

    <main id="main-content" className="landing-content" tabIndex={-1}>
      <section className="nextturn-hero" aria-labelledby="landing-title">
        <div className="nextturn-hero-copy">
          <p className="hero-category"><span className="status-dot" />For savings groups that take turns</p>
          <h1 id="landing-title">A private way to decide who gets the next pot.</h1>
          <p className="hero-description">Each member makes one private offer: how much they’ll leave in the pot for everyone else. When bidding closes, the highest valid offer wins, and any member can check the result.</p>
          <div className="button-row">
            <a className="button button-primary" href="#app">Try a practice round<span className="button-arrow"><Icon name="arrow" size={17} /></span></a>
            <a className="button button-secondary" href="#how-it-works">See how it works</a>
          </div>
          <p className="hero-proof"><Icon name="shield" size={15} />No wallet, account, or payment needed to practice.</p>
        </div>
        <div className="hero-art">
          <div className="hero-art-bar"><span><Icon name="lock" size={14} />Sealed offers</span><span className="mini-pill">Practice example</span></div>
          <OfferIllustration scrollOnly />
        </div>
      </section>

      <section className="landing-preview nextturn-preview" aria-label="Sample savings round">
        <div ref={preview} data-scroll-entrance="copy">
        <div className="landing-preview-bar"><span><Icon name="circle" size={16} />A practice round in NextTurn</span><span className="mini-pill">Sample data</span></div>
        <div className="landing-preview-grid">
          <div className="landing-round-summary">
            <span className="preview-label">Pot for this round</span><strong>NGN 600,000</strong>
            <p>8 members. Offers can go up to NGN 150,000.</p>
            <div className="landing-offer-list">
              {[1, 2, 3].map((offer) => <div key={offer}><span className="preview-envelope-icon"><Icon name="lock" size={15} /></span><span>Offer {offer}</span><small>Amount sealed</small></div>)}
            </div>
            <p className="landing-preview-note"><Icon name="shield" size={14} />Amounts stay hidden until the round closes.</p>
          </div>
          <div className="landing-ticket">
            <span className="preview-label">Your offer</span>
            <h2>What would you leave for the others?</h2><p>If your offer wins, you take the pot minus your offer.</p>
            <div className="landing-example-input"><span>NGN</span><strong>65,000</strong></div>
            <div className="offer-summary"><span>You would take</span><strong>NGN 535,000</strong></div>
            <a className="button button-primary button-full" href="#app">Try this round<span className="button-arrow"><Icon name="arrow" size={17} /></span></a>
            <span className="landing-ticket-note">Example only. No real group or payment.</span>
          </div>
        </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <ScrollEntrance>
        <span className="section-kicker">How a round works</span>
        <div className="landing-section-heading"><h2 id="how-title">The group sets the rules. Members make one private offer.</h2><p>Contributions, membership, and payouts stay with your group. NextTurn handles the offers and the result.</p></div>
        <div className="landing-steps">
          <article><span className="step-number">01</span><h3>Set the rules.</h3><p>Agree the pot, the highest offer allowed, and the closing deadline before anyone bids.</p></article>
          <article><span className="step-number">02</span><h3>Make a private offer.</h3><p>Choose what you would leave for the others. Keep your bid file so you can open the offer later.</p></article>
          <article><span className="step-number">03</span><h3>Open and check.</h3><p>After close, open your offer. The highest valid offer wins, and the app checks the result.</p></article>
        </div>
        </ScrollEntrance>
      </section>

      <section className="nextturn-results-section" id="check-results" aria-labelledby="check-title">
        <ScrollEntrance className="results-section-heading"><div><span className="section-kicker">The check</span><h2 id="check-title">A result you can check yourself.</h2><p>The app compares every opened offer with the rules fixed at the start. If someone announces the wrong winner, the check rejects it.</p></div><a className="text-button" href="#app/audit">Check a result<span className="button-arrow"><Icon name="arrow" size={16} /></span></a></ScrollEntrance>
        <div className="example-charts-section"><ExampleOfferChart /><ExamplePotChart /></div>
        <p className="result-scope-note">Example amounts, not live activity. The browser checks a supplied result file. The independent checker retrieves the round from testnet, but that is not full-node validation.</p>
      </section>

      <section className="landing-section landing-privacy" id="privacy" aria-labelledby="privacy-title">
        <span className="section-kicker">Privacy</span>
        <div className="landing-section-heading"><h2 id="privacy-title">What stays private, and what doesn’t.</h2><p>Offer amounts are hidden before opening. Names are not added to bid memos. That does not hide every trace of activity.</p></div>
        <div className="privacy-facts">
          <div><Icon name="lock" size={20} /><strong>Sealed before close</strong><span>Offer amounts stay hidden while bidding is open.</span></div>
          <div><Icon name="shield" size={20} /><strong>No names in memos</strong><span>The protocol does not add bidder names or sender fields.</span></div>
          <div><Icon name="code" size={20} /><strong>No accounts or trackers</strong><span>Practice files are prepared on your device, not uploaded.</span></div>
        </div>
        <div className="landing-faq">
          <details><summary>What can the organiser see before the deadline?<span>+</span></summary><p>They can see that an offer arrived, its block, and the fixed testnet payment. A correctly sealed offer does not reveal its amount. Opening early can expose it, and the checker rejects the early opening.</p></details>
          <details><summary>What becomes public when offers are opened?<span>+</span></summary><p>The amount and secret behind every opened offer become readable, including losing offers. The protocol does not add bidder names or sender fields, but timing and outside information can still connect activity to a person.</p></details>
          <details><summary>Does NextTurn manage money or membership?<span>+</span></summary><p>No. Your group collects contributions, confirms members, and pays the winner outside this app. This prototype does not prevent fake members, collusion, or missed payouts.</p></details>
          <details><summary>What other privacy limits should I know?<span>+</span></summary><p>The static host can see page requests and IPs. Wallet servers and network observers can see metadata. A compromised site could read what you type. NextTurn has no accounts, trackers, or remotely loaded fonts.</p></details>
        </div>
        <a className="text-button privacy-link" href="#app/privacy">Read the full privacy notes<span className="button-arrow"><Icon name="arrow" size={15} /></span></a>
      </section>
      <SiteFooter />
    </main>
  </div>;
}
