# Controlled two-offer testnet demonstration

David approved this preparation and confirmed an offline Zingo recovery backup
on 25 October 2026. The app does not read that backup. **David sends every
transaction himself.** No mainnet money, deployment or public release is authorised.

## What this can demonstrate

- Five actual testnet transactions: one rules anchor, two commitments and two
  openings. Each pays **0.001 TAZ**, so protocol payments total **0.005 TAZ**,
  plus wallet fees reviewed by David.
- Independent retrieval of the complete window, deterministic highest valid
  offer, rejection of a deliberately wrong declared winner, and a local winner
  challenge/proof check.
- **One operator controls both offers.** This does not establish two participants,
  a real group's use, membership, payout enforcement or financial custody.
- Until those transactions and retrieval are actually completed, this is only a
  plan. Faucet funding and generated practice checks are not a completed round.

The first attempt paid 0.001 TAZ but mined after its fixed start block. David
approved a complete retry: five additional payments, so the total across attempts
is **0.006 TAZ plus wallet fees**. Do not reuse or reinterpret that late anchor.

## Private receiver and public rules

Use a fresh receiver unrelated to the funded Zingo wallet. Native `receiver-init`
creates a new folder containing:

```text
private/seed.bin          NEVER open/share/publish through the assistant
private/incoming-key.txt  keep private until bidding closes
public/receiver.json      public network/address descriptor only
```

The raw seed can control that receiver; the incoming key can read its notes but
cannot spend. Neither belongs in a URL, public repository, frontend directory or
deployment. The funded Zingo wallet's keys are never needed for verification.
Keep `.local/` private and outside any shared/cloud-synchronised workflow.

The approved preparation script reads only the public receiver descriptor and a
fresh public native tip. It pins rules version 2, two demo slots and a fictional
NGN 600,000 pot with a 25% maximum offer. The retry adds a 1,000-block anchor buffer, then
600-block bidding and opening windows. Testnet was observed advancing 105 blocks
in about six minutes on 25 October, so short windows can vanish quickly. Block
production can change again; clock-time estimates are approximate;
**actual mined heights decide validity**. No savings-group pot is being moved.

## 1. Anchor the rules — first wallet send

1. Open the prepared public `round.json` in **Use a wallet**.
2. Import a freshly fetched public tip file. A reading expires after two minutes;
   refresh it under a new filename before preparing another request.
3. Open **Send manually in Zingo**, or use **Open my wallet**.
4. Confirm Zingo is on **Testnet**, uses the shielded balance and pays the exact
   dedicated round address, **0.001 TAZ plus the wallet fee**, with the exact
   `ZT1A` memo. **No name, reply-to address or additional note.**
5. David reviews and sends. The anchor must mine **before** the bidding start.
6. Record the actual transaction ID and mined height; a typed ID alone is not
   mining proof. Save the updated public round file.

If the anchor is late, stop. Prepare a new round before any bids; do not silently
move deadlines or reinterpret bids under changed rules.

## 2. Submit two separate offers

Wait until the bidding start block. Choose two different offers within the shown
cap; keep their values private until opening. For each offer:

1. Open the same public anchored round file and a fresh tip.
2. Seal locally and **save its private bid file** before preparing a payment.
   Keep the two files distinct (for example, Offer A / Offer B), without amounts
   in filenames. Do not send these private files to an organiser or checker.
   The single **download my bid file** button opens Save As and confirms only after
   the file is written. If the picker is unavailable, it uses a normal download;
   check the file is accessible and tick the saved-file confirmation. A download
   request alone does not unlock a wallet request.
3. Review and send the exact `ZT3C` request from Zingo: **0.001 TAZ plus fee**.
4. Record its transaction ID/mined height. Wait for spendable change if the wallet
   needs confirmations before another send. A prepared request is not mining proof.
5. For the second offer, reopen the round so a new private bid and proof key are
   created. Do not replace or lose the first private file.

The commitment deadline is inclusive. A late commitment does not count.

## 3. Open offers only after bidding closes

Wait until a fresh tip is **greater than** the commitment deadline. Then, for each
private bid file, import it locally, acknowledge intentional disclosure and review
the exact `ZT3R` request. David sends **0.001 TAZ plus fee** and records the txid.

Both original values, salts and public bid-proof keys become readable once the
dedicated incoming key is disclosed. **All opened offers, including the loser,
become public.** The private bid-proof keys stay private. Do not add identifying
memo text or voluntarily open before the window.

## 4. Retrieve and check the full round

Disclose only the dedicated incoming key **after bidding closes**. After the
opening deadline plus five blocks, run the native verifier with that key file and
the public round. Do not open the receiver seed or the funded wallet backup.

```text
tender-verify verify https://testnet.zec.rocks:443 incoming-key.txt round.json --out result.json
```

The verifier retrieves the full range and fails on missing/unreadable data. The
server remains a trust assumption; this is not full-node consensus validation.
Archive only actual public evidence. Check a second server when practical.

## 5. Ownership and honest evidence

Use the actual result to generate a fresh checker challenge. The winning private
bid signs it locally; return only the public proof. Reject a changed signature or
an old proof against a new challenge. Never reuse an accepted nonce. In-page
memory is not durable replay protection after refresh or in another tab.

Also change only the declared winner in a **copy** of the public result and show
its rejection. Keep the original actual records intact. Record real steps and
test results only—no invented users, payouts, feedback or transactions.

This does not complete the ZECATHON release gate. A usable public demo, public
repository, two-minute video, licence/notices, eligibility/team and David's actual
submission remain separate tasks requiring approval. Exactly one track:
**Private Markets**. Deadline **28 October 2026, 23:59 UTC**.
