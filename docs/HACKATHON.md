# ZECATHON compliance checklist

Reverified against the official site's published content on **26 October 2026**:

- [Event rules, dates and criteria](https://thezecathon.com/darkpool/data.js)
- [Submission form requirements](https://thezecathon.com/darkpool/forms.js)
- [Event website](https://thezecathon.com/)

The form's authenticated submission checklist requires **both** a working demo
URL and a two-minute video, even though its older unauthenticated checklist says
"a demo link or a two-minute video". Follow the stricter requirement.

## Rules

| Official requirement | Project action |
| --- | --- |
| One person registers and submits; collaborators are allowed | David submits from their own registered account. No automatic submissions. |
| Current authenticated form requires a team, including for a solo builder | David creates or joins one team; the form allows up to five members. One controlled wallet demo is not evidence of multiple people participating. |
| All code written during the build window; libraries are allowed, existing products are not | Existing project commits begin in October 2026. Continued work is inside the Sep 28–Oct 28 window. Document third-party libraries. |
| Open source at submission | Keep the repository private while building; make it public **before submitting**, with David's approval. Never publish `.local/`, seeds, recovery phrases or private receipts. |
| One submission per account, exactly one track | Enter **Private Markets** only. Do not submit a second variant. |
| Submissions sealed until judging; editable until deadline | Submit through the official form. Do not claim a local draft is submitted. |
| Organisers and judges cannot enter | David must confirm eligibility. |

**Deadline: 28 October 2026, 23:59 UTC.** Submit before the last-minute cutoff.

## Required submission material

- [x] Project name and description prepared in `docs/SUBMISSION.md` (form limit: 2,000 characters).
- [x] Exactly one track for NextTurn: Private Markets. This is a prepared choice, not a submitted form.
- [x] Public repository URL; verified public on 25 October:
      https://github.com/Daveboss123/next-turn.
- [x] Public demo deployed with approval: https://nextturn-pro.vercel.app/.
      An unauthenticated HTTP check on 26 October returned 200 with the production
      no-connect CSP and no-referrer policy. Practice needs no account/payment/wallet.
      A fresh isolated browser passed 64 generated-fixture flow checks and 30 layout/motion checks on this URL.
- [x] Final 120-second practice-only video rendered, fully decoded and checked
      locally: 1920×1080, 30 fps, H.264 High, AAC stereo 48 kHz, 120.000 s,
      captioned, with a "Try it yourself" end card. See `docs/SUBMISSION.md`.
- [ ] Public video URL: David uploads the MP4 and supplies the link. No video is
      embedded in or deployed with the app.
- [x] Description distinguishes browser simulation, tested logic and the single
      checked live anchor from the uncompleted full real-wallet round.
- [ ] Registered account and eligibility confirmed by David.
- [ ] Team created/joined in the official form, including a one-person team for a solo entry.
- [ ] David explicitly submits and checks confirmation in the official form.

## Build to the judging criteria

**Privacy — leaks disqualify.** No wallet relay, analytics, remote fonts, tracking,
accounts or bid API. Real bidders use their own shielded wallet. Private receipt
files are never part of public audit exports. Production CSP blocks network
connections from application code. The static host still sees page requests;
wallet light-client servers and timing patterns remain outside our protection.
Do not claim perfect network anonymity or hidden losing bid values after reveal.

**Usefulness.** Serve bidding savings circles, not every fixed-order savings
group. Explain the pot, discount, cap, payout illustration and tie-break in plain
language. This is an audit instrument, not a regulated savings service, custody
system, automatic payout system or eligibility authority.

**Execution.** Ship one complete round and a memorable test: a correct outcome
passes; a deliberately changed winner fails. Never dress simulated transactions
up as live Zcash evidence. Run tests and both builds before describing a feature
as working. Get a real-wallet testnet round on record before calling the live
commit/reveal flow proven.

**Originality.** Explain the narrow use case and Zcash's actual contribution:
shielded submission with later incoming-view disclosure. Do not claim nobody
else has built a similar product; that has not been established.

## Real user feedback

Collect feedback voluntarily and outside bid submission. No embedded tracking or
identifying feedback forms. Record only consented, anonymised observations in
`docs/FEEDBACK.md`, with dates and resulting changes. Never invent users or
feedback. A browser-only practice round is a simulation, not evidence of a real
group's participation.

## Release gate

Local technical preparation completed on 25 October:

- [x] MIT original-code licence confirmed by David and added as `LICENSE`.
- [x] Copied dependency/font/artwork notices prepared; reviewed dependency report
      has no missing licence declarations/texts. This is not a legal audit.
- [x] Build/source/distribution guards and local release-artifact checks added;
      these do not replace a complete privacy review.
- [x] Description and the final 120-second practice-only video prepared locally;
      no URLs, video upload or submission have been fabricated. The video is not
      uploaded and no public video URL exists yet.

Do not call this submission-ready until the checklist above is complete. A green
unit-test suite is not a privacy audit, a deployed demo, a live wallet proof, or a
submitted hackathon entry.
