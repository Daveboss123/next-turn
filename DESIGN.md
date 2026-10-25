# NextTurn UI direction

Audience: members of bidding savings groups. The primary task is offering to take
less of the group pot in exchange for taking this round's payout, then checking
the result. The group still handles money and membership outside this prototype.

## Visual system

- White `#FFFFFF`: main canvas and form surfaces.
- Ink `#14221A`: headings, labels and text.
- Forest `#174C35`: primary actions, the turn mark, winning-offer emphasis.
- Mint `#EDF6EF`: quiet support surfaces and status backgrounds.
- Line `#E0E7E2`: meaningful divisions and input boundaries.
- Muted `#55645C`: readable secondary text, never tiny low-contrast decoration.

Manrope is hosted locally; use the same family throughout with deliberate size
and weight changes. Headlines should describe the job, not use abstract slogans.
No remote fonts, assets, tracking widgets or chart services.

## Structure

```text
Logo          How it works / Results / Privacy          Open app

Plain-language headline               Local isometric offer illustration
One explanation + Open app

Sample round preview -> How a round works -> Example results -> Privacy

Useful grouped footer / large NextTurn wordmark
```

Use Roster's readable product hierarchy, not its code or assets. Illos free SVGs
provide the illustration style; the reviewed originals and licence are recorded
in `docs/ASSET-CREDITS.md`. Illustrations never receive live bid data. Illustration
motion plays once/replays on request; section/chart entrances repeat on viewport
re-entry. Respect reduced motion and do not hijack scrolling.

Landing header scrolls away in document flow; it must not float over the footer.
The footer wordmark is a faint 5.5%-opacity background layer behind the lower
footer navigation, not a separate large text row. It is capped at 146px on desktop,
cannot intercept pointer events, and is hidden from screen readers.
No page-load fades. Content already visible at entry stays still. Lower content
fades and slides up after scrolling to it: 12–20px travel, 450–600ms. The same
entrance repeats in either scroll direction after the target fully leaves and
re-enters the viewport, not on small edge movements. Bars grow from zero and the
pot ring draws on each re-entry (600–800ms). The hero illustration waits for scroll
or replay. No blur/parallax or scroll hijacking. Privacy notes and app forms stay
static. Cancel effects on reduced motion/hidden tabs and keep a visible fallback.

In the practice offers card, keep the illustration beside the description, in a
compact summary row. Do not restore a wide empty illustration band between the
heading and offer list. Queue artwork uses a tighter local SVG viewBox.

Inside the app, the current task and offer amount take priority. Show progress,
remaining actions and saved-file status clearly. Technical fields belong behind
details. Keep practice labels and intentional disclosure warnings visible.
Pending user actions may show a small inline spinner and disabled button; reduced
motion leaves the indicator static. The practice action is simply **Ownership
check**, with **Checking ownership…** while its local verification is running.

The protocol, private-file formats and native command retain their existing
sealed-tender names for compatibility; **NextTurn** is the user-facing name.
