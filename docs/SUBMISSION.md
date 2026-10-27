# ZECATHON submission pack: not submitted

**Project:** NextTurn  
**Exactly one track:** Private Markets  
**Deadline:** 28 October 2026, 23:59 UTC; aim to submit October 27.

This document is a submission draft, not a submitted hackathon entry. Source and
the public practice demo are published with approval. David reviews and submits
from his own eligible registered account/team.

## Description draft (under 2,000 characters)

> NextTurn helps bidding savings groups choose who receives the next pot. Members offer a discount: the highest valid offer wins under rules fixed before bidding. Membership, contributions and payouts remain outside the app.
>
> The browser creates salted, rules-bound commitments and a fresh bid-proof key. Members send fixed-value protocol memos from their own shielded Zcash wallets; there are no accounts, analytics, bid API or transaction relay. Offers open only in the declared block window. A dedicated incoming viewing key is disclosed after bidding closes, allowing a native checker to retrieve the full range, reject incomplete data and recompute the result. A fresh challenge proves control of the winning bid key, not a real-world identity or payout entitlement.
>
> Current demo: browser practice is explicitly simulated. Cryptographic logic, local ownership proofs, request builders and native retrieval are tested. One real testnet rules anchor has passed recipient, payment, source, memo and timing checks; the full two-offer commit/open round has not been completed and is omitted from the quick demo. No two-participant or real-group use is claimed.
>
> All opened values and salts, including losing offers, intentionally become public. Network metadata, frontend integrity, light-client server trust, eligibility, planted bids and payout enforcement remain limitations. The native checker is not full-node consensus validation. No real-money group or mainnet financial use is claimed.

Update the evidence paragraph only after actual bid/opening transactions and final
retrieval pass. Do not replace “pending” with “proven” based on a simulation or
the anchor alone. No genuine user feedback has been collected.

## Required URLs

| Field | Status |
| --- | --- |
| Repository | Public and verified: https://github.com/Daveboss123/next-turn. |
| Working demo | Public: https://nextturn-pro.vercel.app/. Practice needs no wallet/account/payment. |
| Two-minute video | Final 120-second practice-only cut rendered and checked locally. Not uploaded or deployed with the app; add its public URL after David uploads it. Details below. |

MIT original-code licence is approved. Copied library/font/artwork notices retain
their own terms. Build/artifact checks are not a full legal or security audit.

## Final two-minute video: rendered locally, not uploaded

The current candidate is `NextTurn-ZECATHON-2min-demo.mp4` (also kept in the
approved temporary workspace). It is separate from the app and is never deployed
with it.

Checked with ffprobe/ffmpeg on 27 October 2026:

| Property | Value |
| --- | --- |
| Duration | 120.000 s, 3,600 frames |
| Picture | 1920×1080, 30 fps, H.264 High, yuv420p, limited/TV range |
| Sound | AAC LC, stereo, 48 kHz; -16.02 LUFS integrated, -1.46 dBTP |
| Size / hash | 24,660,547 bytes; SHA-256 `FF39672EBE8A00A17698D37AD5F91D60CF196BA163F1968765CE6F7BDD4169C2` |
| Full decode | Passed on the copied file |
| Captions | 34 burned-in cues, local Manrope, no em dashes |
| End card | 115.7–120.0 s: "Try it yourself", demo URL, practice/simulation disclosure |

What it shows, in order:

| Time | Chapter | Honest content |
| --- | --- | --- |
| 0:00–0:11 | Intro | Plain-language pot/discount idea; highest valid offer wins; the group still handles membership, contributions and payouts. |
| 0:11–0:22 | Rules | Pot, maximum discount and deadlines are agreed first and bound into every offer. |
| 0:22–0:30 | Practice | Clearly labelled simulation with a fictional pot and generated practice offers. |
| 0:30–0:42 | Private file | The bid file holds the offer, salt and one-off proof key; the save acknowledgement is labelled as simulated in the recording. |
| 0:42–1:00 | Sealed offers | Sealed practice offer, other offers hidden, round rules; narration explains shielded memos, viewing-key disclosure after closing, native recomputation, and that opened amounts and salts become public, including losing offers. |
| 1:00–1:09 | Open and result | Close bidding, open the saved offer and show the result; every opened offer is checked against the rules fixed at the start. |
| 1:09–1:18 | Deterministic result | The matching result and payout illustration; a mismatched declaration is rejected; the group still pays the winner outside NextTurn. |
| 1:18–1:29 | Ownership | Spinner and `Checking ownership…`; this proves control of the bid key, not identity, membership or a right to a payout. |
| 1:29–1:45 | Wrong winner and retrieval | A wrong declared winner fails without changing offers; imported results cannot prove completeness, so native chain retrieval is explained. |
| 1:45–2:00 | Audience and end card | Savings groups, cooperatives and community funds; practice demo URL; then the "Try it yourself" end card. |

Scope and provenance: this is a continuous recording of the public practice demo,
not a real-wallet round. It shows no wallet, seed, recovery phrase, private bid file
contents, real participant group or mainnet payment. The two peer offers are
generated by practice mode. One testnet rules anchor has passed; the full two-offer
live round remains uncompleted and is shown only as a stated limitation. Narration is
locally generated synthetic speech (Kokoro, `af_heart`). No stock footage, remote
font, hosted chart widget or analytics is used. The capture workspace stays outside
the repository; only public product copy was recorded.

Before submitting: upload the MP4 to a public host that plays without login, open
the link in a private window, then paste it into the form. Do not add the video to
the app deployment.

Use only local licensed artwork/fonts and original charts. Do not show wallet
backups, private file contents, private bid values before opening, identifying memo
text or an invented participant count. Exactly one track: Private Markets.

## Final human release gate

- [ ] David confirms eligibility and registration; creates/joins the required team.
- [x] Source/distribution filename guards, licence inventory and generated-fixture
      export/storage/network checks passed. This is not a complete security audit.
- [x] Retain the explicit unfinished-live-flow disclosure for the approved quick finish.
- [x] Approve the public repository and verify its actual visibility.
- [x] Approve static hosting of `dist/` only; verify equivalent CSP/security headers.
- [x] Working public demo tested from a fresh isolated browser on 26 October.
- [x] Final 120-second practice-only video rendered and verified locally against the
      required specs, including a full decode of the copied file.
- [ ] David uploads that MP4, confirms the public URL plays without login, and
      supplies it for the form. The video stays separate from the app deployment.
- [ ] Review the final description, licences/notices and exact URL fields.
- [ ] David submits through the official form and checks its confirmation.

See `docs/HACKATHON.md`. A saved draft is not a submitted project. Publishing the
source and static demo was approved. David must explicitly submit the entry;
no automatic wallet spending or mainnet use is authorised.

## Form steps

1. Sign in to the account intended for **NextTurn**, and create/join its required team.
2. Enter **NextTurn** and select **Private Markets** only.
3. Paste the description above, repository URL and working demo URL.
4. Paste David's separate public two-minute video URL. Check that it opens without login.
5. Confirm the public-repository checkbox and review every field.
6. Click **SUBMIT**, then check the form's submitted confirmation and timestamp.

**SAVE DRAFT is not submission.** The current form also warns that saving a draft
after submitting withdraws the submitted state until **SUBMIT** is clicked again.
