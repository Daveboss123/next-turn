# Winning-bid ownership

Rules version 2 closes a gap in the original prototype: opened prices and salts
are public, so copying them must not be enough to claim the winning bid.

## Fresh bid key, not a wallet key

Every new version-2 bid generates a fresh Ed25519 key pair locally. The private
PKCS8 key is kept only in the private bid file/in-memory client state. It is not a
Zcash spending key, recovery phrase, account identity or reused wallet address.
The public key is bound to the salted commitment and carried in the memo:

```text
SHA-256("ZTENDER-ROUND-CLAIM-v1:" + rulesHash + ":" + tenderId + ":" + priceMinor + ":" + saltHex + ":" + claimPublicKeyHex)

ZT3C <roundId> <rulesHash> <commitment> <claimPublicKeyHex>
ZT3R <roundId> <rulesHash> <priceMinor> <saltHex> <claimPublicKeyHex>
```

These fit inside the 512-byte memo limit. Rules version 1 and ZT2 memos remain
readable for existing files; they cannot claim to provide ownership verification.
File envelope names and the native command retain their existing names.

## Challenge-response

After checking a final valid round, the person checking the winner creates a
fresh 32-byte nonce. The winner signs this exact UTF-8 JSON-array message using
the private bid-proof key:

```text
["NEXTTURN-WINNER-CLAIM-v1", tenderId, rulesHash, commitmentHex, nonceHex]
```

The public proof contains only round references, nonce, public key and signature.
It excludes the amount, salt and private key. Verification takes the public key
from the audited winning bid, not from a claimant's untrusted identity assertion.
It checks the expected nonce and every context field before verifying Ed25519.

The checker must issue a **new challenge for another check/claimant** and avoid
reusing an already accepted nonce. An old signature cannot answer a fresh
challenge; reusing the same old challenge is not a new ownership check. The
prototype does not provide persistent server-side nonce consumption or payout
enforcement.

The browser disables rechecking an accepted challenge and remembers its public
reference across screen navigation in the **same page**. Refreshing, reopening
the site or using another tab clears that in-memory history. A saved challenge
must be one the checker issued and has not accepted already, not one chosen by
the claimant. Keep an accepted-challenge record outside this prototype if
decisions will be made across sessions. The native checker remains stateless.

Rejected replacement files clear the previous signing/checking input. Pending
older file reads cannot restore a superseded input or a previously valid result.

## Boundaries

- This proves control of the private key bound to a bid. It does not prove a
  legal identity, group membership, one person/one bid, or entitlement to funds.
- Public result files alone still do not prove complete chain retrieval. First
  use the independent native verifier for the round if chain evidence matters.
- Anyone who obtains the private bid file can read the amount and control its
  proof key. Never share or publish that file.
- Fresh keys prevent the app from deliberately reusing a stable identity across
  rounds. They do not solve network metadata or compromised-frontend risks.
- All keys/proofs are produced locally. There are no accounts, relay, uploads,
  analytics or wallet recovery inputs.

Native file-based verification:

```text
tender-verify check-claim result.json expected-challenge.json public-winner-proof.json
```

This checks supplied round records and the signature, not full-node consensus.
The browser and native implementations are cross-tested with honest, forged,
changed-key and fresh-challenge replay cases.
