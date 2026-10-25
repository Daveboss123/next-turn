# Round protocol and privacy boundaries

This is a testnet prototype for bidding savings groups. It verifies a bidding
round; it does not hold the pot, establish eligibility, enforce payouts or
resolve disputes.

## Rules and commitments

Round rules use integer minor units, UTF-8 and a fixed JSON-array preimage. See
`rulesPreimage` in `src/lib/round.ts` and `rules_preimage` in
`verifier/src/audit.rs`. The SHA-256 hash includes the address, round ID, title,
currency, pot, declared member count, cap, windows and tie-break.

All accepted round commitments bind the **full rules hash**, not just the round ID.
Existing rules version 1 uses:

```text
SHA-256("ZTENDER-ROUND-v1:" + rulesHash + ":" + tenderId + ":" + priceMinor + ":" + saltHex)
```

New UI rounds use **rules version 2** and a fresh Ed25519 bid-proof key:

```text
SHA-256("ZTENDER-ROUND-CLAIM-v1:" + rulesHash + ":" + tenderId + ":" + priceMinor + ":" + saltHex + ":" + claimPublicKeyHex)
```

The proof key is not a Zcash spending key or real-world identity. Its private
PKCS8 bytes remain in the private bid file/in-memory client state and never enter
public results, wallet memos or proofs. The public key is bound to the offer and
used for a fresh winner challenge. See [winning-bid ownership](WINNER-PROOF.md).
Existing `sealed-tender-*` file envelopes and the native command remain unchanged.

The salt is 32 cryptographically random bytes. It stays private before opening,
and is intentionally disclosed in a reveal. The original `ZTENDER-v1` helper
remains for regression tests; its legacy commitment/reveal memos are not accepted
as new round bids by the independent verifier.

## Memo formats

```text
ZT1A <16-hex round ID> <64-hex rules hash>
ZT2C <16-hex round ID> <64-hex rules hash> <64-hex commitment>
ZT2R <16-hex round ID> <64-hex rules hash> <integer discount minor units> <64-hex salt>
ZT3C <16-hex round ID> <64-hex rules hash> <64-hex commitment> <64-hex claim public key>
ZT3R <16-hex round ID> <64-hex rules hash> <integer discount minor units> <64-hex salt> <64-hex claim public key>
```

All fit in the 512-byte memo limit. There is no identity field. Encoding validates
every field; parsing rejects extra text. New rounds reject conflicting rules
hashes for the same ID, rather than reinterpret an offer under different rules.
Rules version 1 accepts ZT2 bids; version 2 requires ownership-bound ZT3 bids.
Copying public opening data does not supply the private key needed for ownership.

Every protocol payment is exactly **100,000 zatoshis / 0.001 TAZ**, plus wallet
fees. The independent checker rejects bids with transparent inputs or recipients
that do not match the advertised shielded round address. The browser validates
checksums, F4Jumble, known ZIP-316 R0 receivers and absence of transparent
fallbacks. Unsupported address revisions/metadata fail closed.

## Time windows and selection

- The advertised anchor transaction must pay the round address and contain the
  exact rules hash **before** `startHeight`.
- Commitments are accepted from `startHeight` through `commitDeadlineHeight`,
  inclusive.
- Reveals are accepted after the commitment deadline through
  `revealDeadlineHeight`, inclusive.
- Final checks require the reveal deadline plus five blocks. This is a heuristic,
  not irreversible finality.
- The highest valid revealed discount within the cap wins. Ties use the earliest
  commitment block, then lexicographically lowest commitment hash.
- Repeated commitments count once at the earliest valid block. Unopened bids are
  void. More distinct commitments than declared members invalidates the round,
  but counting does **not** prove membership or prevent planted bids.

The browser requires a **locally imported public chain-tip reading** from the
native reader, no more than 120 seconds old; timestamps over 30 seconds into the
future fail closed. Missing, stale, malformed and wrong-network readings disable
requests. An anchor request is shown only before the start block, a commitment
only during bidding, and an opening only in its window with explicit consent.

These files are supplied snapshots, not authenticated chain proofs or clocks.
A hand-edited file can lie. Actual mined heights decide validity, and a request
can become late while the wallet sends it. An early voluntary reveal can already
leak an amount to the recipient even though the checker rejects it. Rejected
replacement files clear the older input/request rather than leaving it usable.

## What is verified

An imported JSON file is **supplied data**, not a chain proof. Browser and offline
checks verify internal rules/outcome consistency only. They cannot detect an
omission from a fabricated file.

The native `verify` command independently fetches the anchor, every compact
block in the full window, and every shielded candidate transaction. It checks
sequence, linked block hashes, txids, returned heights, the scan boundary and
confirmation depth. Missing/unreadable data aborts the audit. Sapling, Orchard
and Ironwood are all read using incoming-only trial decryption.

Native `check-anchor <server> <incoming-key-file> <round.json> <txid>` provides a
testnet-only first-transaction check using the same anchor policy. It verifies
recipient, fixed payment, shielded inputs, rules memo and timing on the same
decrypted output. It prints only public references and boolean checks, never an
unexpected memo or the viewing key. This is not a complete round audit.

The light-client server still supplies the chain data; this is not full-node
consensus validation. Compare independent servers when possible. A funded Zingo
testnet wallet has been observed, but the complete live commit/reveal round has
not yet been demonstrated. A planned two-offer test uses one operator, not two
proven participants or a real savings group's participation.

## Intentional disclosure and remaining risks

- Publish only the dedicated **incoming** viewing key after bidding closes, never
  the seed, recovery phrase or full viewing key.
- Use a fresh receiver separate from the funded sender wallet. `receiver-init test
  --out-dir <new-folder>` writes its seed and incoming key directly to private
  local files and prints only a public address descriptor. Keep `.local/` private;
  never copy keys or receipts into `public/` or a deployment. The seed file is not
  needed for reading a round.
- Every revealed value and salt becomes public, including losing offers.
- Bid memos do not include names; network metadata, timing, outside information
  and distinctive amounts can still identify activity.
- An organiser can withhold the key. A lost bid file/salt cannot be recovered.
- A lost private bid-proof key prevents an ownership response. The browser
  remembers accepted challenges only within the current page; refresh/another
  tab loses that history. Native file checks are stateless. Fresh challenges and
  an operator's accepted-challenge record remain necessary; there is no automated
  payout or durable nonce-consumption service.
- Collusion, multiple bids per person, shills below the member count, defaults,
  local regulation and payouts are not solved. Uninvited submissions can cause
  denial of service; eligibility attestations are outside this MVP.
- Frontend integrity is a trust boundary: compromised JavaScript can read what a
  bidder types. No analytics, remote fonts, bid API or relay is included.
- Production CSP blocks application network connections, but is not a security
  audit or a guarantee against a compromised host.

The landing charts are explicitly fictional example rounds, not live activity,
returns, growth statistics or user validation.
