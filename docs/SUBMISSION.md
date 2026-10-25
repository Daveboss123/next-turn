# ZECATHON submission draft — not submitted

**Project:** NextTurn  
**Exactly one track:** Private Markets  
**Deadline:** 28 October 2026, 23:59 UTC; aim to submit October 27.

This document is a local draft, not an entry, public release or deployed demo.
David reviews and submits from his own eligible registered account/team.

## Description draft (under 2,000 characters)

> NextTurn helps bidding savings groups choose who receives the next pot. Members offer a discount: the highest valid offer wins under rules fixed before bidding. Membership, contributions and payouts remain outside the app.
>
> The browser creates salted, rules-bound commitments and a fresh bid-proof key. Members send fixed-value protocol memos from their own shielded Zcash wallets; there are no accounts, analytics, bid API or transaction relay. Offers open only in the declared block window. A dedicated incoming viewing key is disclosed after bidding closes, allowing a native checker to retrieve the full range, reject incomplete data and recompute the result. A fresh challenge proves control of the winning bid key, not a real-world identity or payout entitlement.
>
> Current demo: browser practice is explicitly simulated. Cryptographic logic, local ownership proofs, request builders and native retrieval are tested. One real testnet rules anchor has passed recipient, payment, source, memo and timing checks; a completed single-operator two-offer commit/open round is still pending. That planned test is not evidence of two participants or a real group's use.
>
> All opened values and salts, including losing offers, intentionally become public. Network metadata, frontend integrity, light-client server trust, eligibility, planted bids and payout enforcement remain limitations. The native checker is not full-node consensus validation. No real-money group or mainnet financial use is claimed.

Update the evidence paragraph only after actual bid/opening transactions and final
retrieval pass. Do not replace “pending” with “proven” based on a simulation or
the anchor alone. No genuine user feedback has been collected.

## Required URLs — pending approval/material

| Field | Status |
| --- | --- |
| Repository | Currently private; publication requires separate approval and a privacy review. |
| Working demo | Not deployed. Judges must be able to use practice without a wallet/account/payment. |
| Two-minute video | Not recorded or uploaded. Keep private bid contents and recovery screens off-camera. |

MIT original-code licence is approved. Copied library/font/artwork notices retain
their own terms. Build/artifact checks are not a full legal or security audit.

## Two-minute storyboard

| Time | What to show | Honest narration |
| --- | --- | --- |
| 0:00–0:15 | Landing and fictional pot example | A bidding group offers to take less of a pot to receive this turn. NextTurn checks the round; it does not hold or pay the pot. |
| 0:15–0:40 | Clearly labelled practice: make an offer, save file, close/open | This is simulation. Keys and offers are local; do not open the private JSON file on camera. |
| 0:40–1:00 | Correct result, deliberately wrong winner rejected | The same fixed rules produce a deterministic result. Imported files alone cannot prove bids were not omitted. |
| 1:00–1:25 | Actual native evidence available at recording time | Show only checks actually completed. At present, the real anchor passed; the complete live round is pending. If completed later, show its real retrieved records and result, not fabricated transactions. |
| 1:25–1:45 | Ownership check and a fresh challenge/public proof | This proves a one-off bid key, not membership or identity. Public proof excludes the private key. Never reuse an accepted challenge. |
| 1:45–2:00 | Privacy/limits and Open app | Losing prices become public after opening. No custody, eligibility or payout enforcement; server/network/frontend risks remain. Practice is usable without installing a wallet. |

Use local licensed artwork/font and original charts. Do not show wallet backups,
private file contents, private bid values before opening, identifying memo text or
an invented participant count. Exactly one track: Private Markets.

## Final human release gate

- [ ] David confirms eligibility and registration; creates/joins the required team.
- [ ] Privacy review of the exact source/public evidence intended for release.
- [ ] Complete real-wallet round, or retain an explicit unfinished-live-flow disclosure.
- [ ] Approve the public repository and verify its actual visibility.
- [ ] Approve static hosting of `dist/` only; verify equivalent CSP/security headers.
- [ ] Working public demo tested from a fresh browser.
- [ ] Two-minute video recorded, reviewed for leaks and uploaded with approval.
- [ ] Review the final description, licences/notices and exact URL fields.
- [ ] David submits through the official form and checks its confirmation.

See `docs/HACKATHON.md`. A saved draft is not a submitted project. No assistant
submission, publication, deployment or wallet spending is authorised.
