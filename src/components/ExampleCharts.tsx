import { useId } from 'react';
import { useScrollEntrance } from '../hooks/useScrollEntrance.ts';

// Illustrations only, matching the sample round: no live data, identifiers,
// analytics or external chart service. These components never receive bids.
const offers = [40_000, 55_000, 65_000];

export function ExampleOfferChart() {
  const plot = useScrollEntrance('offers');
  const title = useId();
  const description = useId();
  const bottom = 196;
  return <figure className="example-chart-card">
    <div className="chart-card-heading"><h3>The highest valid offer wins.</h3><span className="mini-pill">Example round</span></div>
    <p>Three opened offers from a sample round, all within the group’s limit.</p>
    <div ref={plot} className="chart-entrance" data-scroll-entrance="offers">
    <svg className="offer-chart" viewBox="0 0 440 250" role="img" aria-labelledby={`${title} ${description}`}>
      <title id={title}>Three example offers in Nigerian naira</title>
      <desc id={description}>Offer 1 is 40,000 naira, offer 2 is 55,000 naira, and offer 3 is 65,000 naira. Offer 3 is the highest. All three are below the 150,000 naira limit.</desc>
      {[0, 20_000, 40_000, 60_000, 80_000].map((value) => {
        const y = bottom - value / 80_000 * 164;
        return <g key={value}><line x1="54" x2="418" y1={y} y2={y} className="chart-grid-line" /><text x="44" y={y + 4} textAnchor="end" className="chart-axis-label">{value === 0 ? '0' : `${value / 1000}k`}</text></g>;
      })}
      {offers.map((amount, i) => {
        const height = amount / 80_000 * 164;
        const x = 83 + i * 121;
        return <g key={amount}>
          <rect className={`chart-bar chart-bar-${i} ${i === 2 ? 'chart-bar-winner' : ''}`} x={x} y={bottom - height} width="70" height={height} rx="5"><title>{`Offer ${i + 1}: NGN ${amount.toLocaleString('en-GB')}${i === 2 ? ', winning offer' : ''}`}</title></rect>
          <text x={x + 35} y={bottom - height - 12} textAnchor="middle" className="chart-value">{`${amount / 1000}k`}</text>
          <text x={x + 35} y="222" textAnchor="middle" className="chart-category">Offer {i + 1}</text>
        </g>;
      })}
    </svg>
    </div>
    <figcaption>Sample offers after opening: NGN 40,000, NGN 55,000, and <strong>NGN 65,000 wins</strong>. Not live activity.</figcaption>
  </figure>;
}

export function ExamplePotChart() {
  const plot = useScrollEntrance('pot');
  const title = useId();
  const description = useId();
  const winnerPercent = 535_000 / 600_000 * 100;
  return <figure className="example-chart-card">
    <div className="chart-card-heading"><h3>Where the pot would go.</h3><span className="mini-pill">Example payout</span></div>
    <p>A NGN 65,000 winning offer leaves NGN 535,000 for the winner.</p>
    <div ref={plot} className="pot-chart-layout" data-scroll-entrance="pot">
      <svg className="pot-chart" viewBox="0 0 180 180" role="img" aria-labelledby={`${title} ${description}`}>
        <title id={title}>Example split of a 600,000 naira savings pot</title>
        <desc id={description}>535,000 naira, about 89 percent, would go to the winner. The 65,000 naira offer, about 11 percent, is left for the other members. This app does not move the money.</desc>
        <circle cx="90" cy="90" r="65" fill="none" stroke="#c7e1d0" strokeWidth="19" />
        <circle className="pot-winner-ring" cx="90" cy="90" r="65" fill="none" stroke="#174c35" strokeWidth="19" pathLength="100" strokeDasharray={`${winnerPercent} ${100 - winnerPercent}`} transform="rotate(-90 90 90)" />
        <text x="90" y="84" textAnchor="middle" className="pot-chart-label">Total pot</text>
        <text x="90" y="108" textAnchor="middle" className="pot-chart-amount">600,000</text>
      </svg>
      <div className="pot-chart-legend">
        <div><span className="chart-legend-dot chart-legend-winner" /><div><span>Winner receives</span><strong>NGN 535,000</strong><small>About 89% of the pot</small></div></div>
        <div><span className="chart-legend-dot chart-legend-group" /><div><span>Left for the others</span><strong>NGN 65,000</strong><small>About 11% of the pot</small></div></div>
      </div>
    </div>
    <figcaption>Illustration before group charges. The group agrees how to share the offer and handles the payout outside the app.</figcaption>
  </figure>;
}
