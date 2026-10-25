# UI assets and design references

## Illos free illustrations

Source: [Illos](https://illos.dev/), created by Naved Alam. The following **free
SVG assets** are incorporated into NextTurn, recoloured to forest green, with
technical vector labels removed. Their CSS is kept in local stylesheets so no
inline-style CSP exception is needed.

- [Email delivery](https://illos.dev/library/isometric/email),
  `https://illos.dev/assets/styles/line-iso/email.svg`.
- [Queue](https://illos.dev/library/isometric/queue),
  `https://illos.dev/assets/styles/line-iso/queue.svg`.

The [Illos free licence](https://illos.dev/license), checked on 24 October 2026,
allows personal/commercial use and modification without mandatory credit. It
does not allow selling/redistributing the assets as a pack or illustration
library. These assets are part of the NextTurn product UI, not an asset library.
**Preview videos/images are not licensed for use and have not been imported.**

There is no Illos runtime, account setup, API call or hosted embed in the app.
Only static, reviewed SVG markup and local CSS are bundled. Illustrations never
receive offer amounts, receipts, keys or bidder identities. Animation plays once
and respects reduced motion; no scroll hijacking is used.

## Typeface

Manrope, Latin WOFF2 subset, hosted locally. SIL Open Font License 1.1; full text
is included at `src/assets/fonts/OFL-Manrope.txt`. Font files are not fetched
from Google or any other external host by the browser.

## Original charts and branding

The offer bar chart, pot split chart and NextTurn mark are original UI code.
Chart amounts are labelled fictional examples, not live bids, growth or user
statistics. Branding does not change the existing sealed-tender protocol names,
file formats or native command names.

## References, not dependencies

- Roster Finance: clear financial hierarchy and landing → app separation.
- footer.design: grouped navigation, a useful footer rather than a thin afterthought.
- scrolltide.co: restrained motion and app-shell examples; no template code imported.
- VoltAgent/awesome-design-md, Anthropic/frontend-design, Leonxlnx/taste-skill,
  pbakaus/impeccable: product-specific hierarchy, plain copy and visual review.

No design-tool installers, hooks or telemetry were installed. Designeer.xyz was
unavailable during this pass and remains an open reference to revisit.

The restrained scroll enhancement is original local code using native
IntersectionObserver/Web Animations and a one-time passive scroll gate. Roster's
blur/stagger principle was reviewed but no blur, per-word animation or external
motion library was added. Lower content fades/slides up after scrolling and repeats
after fully leaving/re-entering view; chart bars grow and the ring draws each time
they are reached. Initial content stays still, the hero artwork waits for scroll/
replay, and privacy notes and app forms remain static. The practice Queue SVG is
cropped more tightly for a compact description/illustration row.
