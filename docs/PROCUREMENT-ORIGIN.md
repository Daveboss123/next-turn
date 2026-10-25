# Archived procurement framing

This is the original October 2026 concept, preserved as project history. The
current product is bidding savings groups. Statements of implementation status
or absolute anonymity below are **not** current guarantees; see the main README
and `docs/PROTOCOL.md` for the actual build and its limits.

# Sealed Tender

Sealed tendering on Zcash, where the buyer cannot read bids before the deadline,
cannot change the rules afterwards, and cannot hide a submission — and where
losing suppliers stay anonymous permanently.

Every outcome is recomputable by anyone from public chain data.

> Built for [ZECATHON](https://thezecathon.com/) (Private Markets track).
> Working name; this repository is private until the Oct 28 2026 deadline, as the
> hackathon seals submissions until judging opens.

---

## The problem this addresses

A supplier submits a sealed price and then has no way to prove, afterwards, that
their bid was received on time, left unread until the deadline, and lost to a
genuinely better bid under rules that were not changed after the fact.

Today the entire evidence chain is held by the one party with the most to gain
from bending it. The buyer receives the bids, stores them, opens them, applies
the rules and announces the result. A losing supplier can trust that or litigate.
There is no artefact they can check for themselves.

Three pieces of external evidence shaped the scope. They are cited precisely,
because two of them support this work and one of them explicitly does not:

- **Ogbu & Asuquo (2018)**, *Africa's Public Service Delivery & Performance
  Review* — a survey of 120 questionnaires from contractors, clients and
  consultants on Nigerian public-sector projects, which identified bribery to
  access confidential tender information as the most prevalent *of the
  contractor-related unethical tendering practices examined*. A perception
  finding within a bounded set of practices, not a measured rate. It points at
  information leaking from the organiser's side.
- **Brookings / CSEA (2024)** — interview findings on procurement transparency at
  Nigerian federal level and in Kaduna and Ekiti states, identifying the period
  between bid submission and opening as vulnerable to political influence and
  individual bias, and describing inconsistent communication of outcomes to
  unsuccessful bidders. This names both a specific window of vulnerability and a
  failure to give losing bidders evidence.
- **UK CMA (2023)** — proven misconduct in specific cases: ten construction firms
  illegally rigged bids for 19 demolition and asbestos-removal contracts worth
  over £150m, fined more than £60m, with one contractor sharing its pricing and
  instructing competitors to bid 8–10% above it. **This is supplier-side
  collusion, which this project does not prevent.** See the threat model.

None of these findings generalise to all procurement, and nothing here should be
read as a claim that they do.

## What it does

1. **Create.** The buyer publishes a tender: scope, selection rules in plain
   text, a deadline fixed to a **block height** rather than a clock they control,
   one shielded tender address, and a single fixed submission amount. The hash of
   the rules is anchored before any bid exists, so the rules provably predate the
   bidding.
2. **Bid.** The supplier's browser generates a 32-byte random salt and computes
   `SHA-256(tender, price, salt)`. The salt never leaves their device.
3. **Submit.** The app builds a [ZIP-321](https://zips.z.cash/zip-0321) `zcash:`
   payment request carrying that commitment in the encrypted memo. The supplier
   pays from their own wallet. **We never touch their keys.** The resulting
   transaction is a receipt that is timestamped, unforgeable, and issued without
   needing the buyer's cooperation.
4. **Close.** At the stated block height, submissions stop. Later commitments are
   provably late.
5. **Reveal.** Suppliers send a second memo with the price and salt. The
   commitment is recomputed and checked. A price changed after seeing others
   produces a different hash and is rejected.
6. **Select.** The pinned rules are applied mechanically to valid revealed bids.
   The shipped rule is lowest compliant price, which is what grant funders
   typically mandate.
7. **Audit.** The buyer publishes the tender address's **incoming viewing key**.
   Anyone can now reconstruct every commitment and reveal, with on-chain
   timestamps, and recompute the winner independently.

## Who sees what

**Before the deadline**

| Party | Sees |
| --- | --- |
| Competing suppliers | Nothing — not values, not identities, not even that other bids exist. Without the viewing key the tender address is unreadable. |
| The buyer | Bid count, arrival blocks, the fixed amount, and the commitment hashes. Cannot derive prices (that is what the salt prevents) and cannot identify senders, because shielded transactions carry no sender field. |
| Public observers | Effectively nothing. Shielded transactions exist in blocks; amounts, memos, sender and recipient are hidden. |

**After the deadline, once the viewing key is published**

Everyone, public included, can read every commitment and reveal and recompute the
outcome. Nobody learns which real-world supplier sent which bid. Losing suppliers
stay anonymous permanently; the winner identifies themselves out of band.

That asymmetry is the design: *what* was bid becomes public, *who* bid never does.

## What Zcash is actually for here

Stated plainly, because "uses a blockchain" is not an argument:

- Sealing bids is done by the **commitment scheme**. No blockchain required.
- Tamper-evident timestamps could come from **any public chain**.
- **Anonymous submission to a publicly-auditable record** is the part Zcash
  provides. On a transparent chain, making the bid set auditable also makes the
  bidder set public — addresses cluster, and "who tendered for what" leaks
  permanently even when prices do not. Zcash lets the *contents* be disclosed
  later while the *participants* stay hidden.

One precision that matters: a Zcash memo is encrypted **to the recipient**. It is
not public, and the public cannot verify anything stored only in one. Public
auditability exists solely because the buyer publishes the incoming viewing key
after the close — a **time-released viewing key**. Before that moment there is no
public verifiability at all.

A fair alternative worth naming: commitments posted to a public bulletin board
over Tor would also give anonymity plus publicity, at the cost of trusting a board
operator not to censor or backdate. Zcash removes that operator.

## Threat model

**Prevented**

- Buyer reading prices early — they hold only salted hashes.
- Suppliers restating a price after seeing others — the hash will not match.
- Rules rewritten after bids arrive — the rules hash predates them.
- Backdated or late bids — block heights are not the buyer's to set.
- Backend compromise before the deadline — nothing we store can unseal a bid.
  Salts live only on bidder devices; a full breach yields hashes.

**Detectable but not preventable**

- The buyer never publishes the viewing key. Visible to all, no cryptographic remedy.
- The buyer declares a winner inconsistent with the bids — the verifier catches
  it, but cannot undo the award.
- The buyer suppresses a bid — once the key is published the note is on-chain and
  undeniable.

**Neither prevented nor detected**

- **Supplier collusion.** Out of scope, and worth stating sharply: because all
  bids become public after the close, a cartel *can* audit its own members'
  compliance. Full disclosure serves auditors and cartels alike.
- **The buyer plants commitments before the close** and selectively reveals a
  shill. Not preventable without supplier eligibility attestations.
- **Network-level deanonymisation.** A bidder's IP is exposed to their wallet's
  light-client server, and to us if they use the hosted page. Bid construction is
  entirely client-side and nothing is logged, but this cannot be eliminated. Tor
  is the mitigation and belongs in documentation, not in a privacy claim.
- **A lost salt** makes a bid unrevealable and void. A usability failure, not a
  security one.

Two rules are enforced in code rather than left to discipline: **salts never
leave the bidder's device**, and **no memo ever contains an identity**.

## Status

Implemented and self-tested:

- Salted commitments, reveal verification, cross-tender replay protection
- Memo payload encoding and tolerant parsing
- ZIP-321 payment request construction with base64url memos and fixed amounts

```bash
cd tender && npm install && node selftest.ts
```

In progress: memo decryption from the chain via a viewing key, and the standalone
verifier.

Explicitly **not** built, and not claimed: zero-knowledge proofs letting losers
prove they lost without revealing prices (which would also close the cartel-audit
hole), supplier eligibility attestations, multi-criteria scoring, attachments
beyond the 512-byte memo, and dispute resolution.

## Licence

MIT.
