# NextTurn

Private bidding rounds for savings groups that choose each payout by bidding.
Members offer to take less than the pot in exchange for receiving it this round.
Offers stay hidden until opening, and the result can be checked against the
original rules. The group still collects contributions and pays members itself.

Built for **ZECATHON 2026 · Private Markets**. The original procurement framing is
preserved in [project history](docs/PROCUREMENT-ORIGIN.md).

Previously called Sealed Tender. The checkout path, native `tender-verify`
command and existing file/protocol formats keep their names for compatibility.

## Current checkpoint — 25 October 2026

Implemented:

- Separate white/black/forest-green landing page and **Open app** workspace.
- NextTurn branding, locally hosted Manrope, adapted Illos free illustrations and
  a grouped footer. [Asset sources and licences](docs/ASSET-CREDITS.md).
- A scroll-away landing header, faint background footer wordmark and scroll-only
  fade-and-slide entrances that repeat on viewport re-entry. Bars grow and the pot
  ring draws when reached, not on page load. Reduced motion is respected; no scroll
  hijack or external animation library.
- Original local SVG charts using clearly labelled example rounds, not live data.
- Practice flow: offer → save private bid file → close → open → check result.
- A wrong-winner demonstration and separate public-result import/export.
- A bid-file download acknowledgement that survives navigation within the app,
  without browser storage or accounts.
- Rules-bound salted commitments, strict memo/address validation and integer-only
  money handling.
- Version-2 bids bind a fresh Ed25519 proof key; local winner signing/checking and
  public challenge/proof files. Version-1 rules remain readable, without claiming
  ownership verification. [Ownership and limits](docs/WINNER-PROOF.md).
- Testnet round-file and wallet request builders, including local QR codes,
  exact fields for manual Zingo entry, and fresh/stale local chain-tip gates.
- Safe dedicated receiver creation: secret files stay local and only the public
  address is printed. Private files are never added to public exports.
- Rejected file replacements clear older inputs; accepted challenges cannot be
  reused in the same page. This is not durable replay/payout enforcement.
- Incoming-only native reading for Sapling, Orchard and Ironwood; independent
  result verification with fail-closed full-window retrieval.
- No accounts, analytics, remote fonts, bid API or transaction relay. Production
  CSP blocks application network connections.

**Not submission-ready:** a complete real-wallet testnet round, public hosted
demo, final security review, real user feedback, video and submission remain.
The current live checks confirm testnet connectivity, a funded Zingo wallet and
one valid rules anchor; they are not proof of a completed sealed-offer round.
The full two-offer wallet round has been set aside for the quick submission path.
The public practice experience is simulation, not two real participants or a real
savings group's use. Do not claim otherwise.

## Run locally

Use Node 24 or newer. On Windows, use `npm.cmd` so PowerShell's script policy
does not block npm. Do not change system security settings to run the project.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the URL Vite prints. The site starts with the landing page; **Open app**
starts a local practice round. No wallet or real money is needed.

Production preview:

```powershell
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173
```

Practice and unsaved bid data are held only in memory. Refreshing or leaving the
workspace clears them. Save the **private** bid file before paying or leaving;
anyone with that file can read the amount and control its bid-proof key. Never
publish it or share it with the organiser.

The single **download my bid file** button opens Save As when supported. If the
picker cannot open, that same button uses the browser's normal download flow;
check that the file is accessible and tick **I have this bid file saved locally**.
A download request alone does not unlock the next step. Embedded Review-browser
downloads may stay in its own file panel rather than Windows Downloads. No file
contents are copied to a clipboard or uploaded by the app.

## Verify the build

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

For the Rust tool, run from `verifier/`:

```powershell
cargo test --locked
cargo build --locked
```

On David's machine the existing build cache is outside the repo:

```powershell
$env:CARGO_TARGET_DIR = 'C:\Users\David\.builds\sealed-tender'
cargo test --locked
cargo build --locked
```

Compare the independent TypeScript and Rust outcome implementations from the
project root:

```powershell
node tests/cross-language.ts 'C:\Users\David\.builds\sealed-tender\debug\tender-verify.exe'
```

These tests use generated public practice records, never local wallet files.

Local desktop/phone UI screenshots on Windows can be repeated with:

```powershell
node scripts/capture-ui.mjs http://127.0.0.1:4173/
```

This uses a fresh temporary Edge profile at 1280px, 768px, 390px and 360px. It
checks overflow, header/footer behaviour, repeatable entrances and reduced-motion
cancellation. Entrances repeat after fully leaving/re-entering view; initial
content does not fade on page load. It never uses your normal browser profile or
wallet files.

Production file/signature/wallet-request flow checks:

```powershell
node scripts/check-flows.mjs http://127.0.0.1:4173/
node scripts/check-local-files.mjs
node scripts/check-release.ts
```

The flow uses generated fixtures and holds private downloads in browser memory,
not Downloads or storage. The local-file guard probes only a new harmless canary,
never actual keys. The release checker uses source/distribution filenames and
the reviewed public licence inventory. None deploys or proves a real-wallet round.

Builds reject unreviewed `public/` files, redirected output directories and stale
licence inventories. Vite copies `public/` without filtering, so this explicit
allowlist is intentional: new public assets must be reviewed first. The release
check rejects private-looking git candidates and extra distribution artifacts
without opening them. Filename checks are not a complete secret-content audit.

## Independent checks

The browser and `node audit.ts result.json` check **supplied records only**.
An imported JSON file cannot prove that the organiser included every bid.

The native verifier independently retrieves the full round from a public
light-client server. It needs the public round file and the organiser's published
incoming viewing key, not a recovery phrase or spending key:

```text
tender-verify verify https://testnet.zec.rocks:443 incoming-key.txt round.json --out result.json
```

Add a winning commitment as an optional argument to check a declaration, or
`none` to check a no-winner declaration. `--out` writes UTF-8 and refuses to
overwrite an existing file. `tender-verify check result.json` is an offline file
check, not independent chain retrieval.

For the first rules transaction only:

```text
tender-verify check-anchor https://testnet.zec.rocks:443 incoming-key.txt round.json transaction-id
```

This retrieves and checks the anchor's recipient, fixed payment, shielded source,
memo and timing without printing keys or unexpected memo text. It does not check
the full bidding window. The receiver key stays local and unpublished until the
commitment deadline has passed.

The light-client server is still a trust assumption. This is not full-node
consensus validation. See [the protocol and threat model](docs/PROTOCOL.md).

Ownership against supplied results:

```text
tender-verify check-claim result.json expected-challenge.json public-winner-proof.json
```

The checker must issue a fresh nonce. Reusing an accepted challenge is not a new
ownership check. The browser's in-memory consumption history is lost on refresh;
native file verification has no persistent consumption or payout state.

## Preparing a controlled testnet round

Follow [the live-demo procedure](docs/LIVE-DEMO.md). Use a dedicated receiver,
never your funded wallet's viewing key. New local receiver files can be created
without printing secret material:

```text
tender-verify receiver-init test --out-dir .local/round-receiver-1
tender-verify tip-json test https://testnet.zec.rocks:443 --out .local/tip-1.json
```

Use new filenames/folders; these commands refuse overwrites. `private/seed.bin`
and `private/incoming-key.txt` remain private. Only `public/receiver.json` is
needed to prepare rules. The seed is not used for reading a round. Never copy
private files into `public/`, which Vite copies directly into the build.

## Privacy and scope

- Every revealed amount becomes public after incoming-key disclosure, including
  losing offers. Bid memos do not contain names; permanent anonymity against
  network metadata or identifying patterns is not promised.
- Publish only a **dedicated incoming viewing key**, after bidding closes. Never
  publish a seed, recovery phrase, full viewing key or private bid file.
- The native checker rejects transparent-source bids. The browser refuses
  transparent fallback receivers and unsupported address formats.
- Membership, planted bids below the member count, collusion, missed payouts,
  custody, eligibility, local regulation and disputes are outside this MVP.
- A static host can see page requests and IPs. A compromised frontend can read
  what you type. CSP and passing tests are not a substitute for a security audit.
- No mainnet financial use. Example payout splits do not enforce a group's
  actual financial arrangements.

Third-party libraries are React/Vite/TypeScript, `qrcode`, `@noble/hashes` for
address decoding, the pinned librustzcash ecosystem and `ed25519-compact` for
native bid-key signatures. Illos free SVG artwork
and Manrope are incorporated under their own licences and served locally. The
charts and NextTurn mark are original. No reference-site runtime, hosted widget,
telemetry hook or remote font loader is embedded. See
[asset credits](docs/ASSET-CREDITS.md).

## Hackathon release checklist

Follow [the verified official requirements](docs/HACKATHON.md). Deadline:
**28 October 2026, 23:59 UTC**. The submission form requires both a usable demo
link and a two-minute video, a repository public at submission, and exactly one
track. Publishing and wallet use require David's approval.

No real user feedback has been collected. Record consented observations in
[the feedback log](docs/FEEDBACK.md); never invent validation or participation.

The source repository was approved for publication and verified public on
25 October 2026: https://github.com/Daveboss123/sealed-tender.
Public demo deployment and the required two-minute video are still unfinished.
This repository being public does not mean the hackathon entry is submitted.

## Continue later

For public project context, read [the protocol](docs/PROTOCOL.md) and
[submission draft](docs/SUBMISSION.md). Internal builder notes are kept locally,
not released. Wallet sends remain user-controlled; an unfinished live flow is
never presented as completed.

## Licence

Original project code is MIT-licensed; David confirmed that choice on 25 October
2026. See `LICENSE` and `THIRD_PARTY_NOTICES.md`. Third-party artwork, fonts and
dependencies retain their own terms. The reviewed inventory and original licence
texts are under `docs/licences/reviewed/`; the frontend build carries project,
browser-library and font notices. Native CI artifacts are configured to include
their notice bundle. This is a notice inventory, not a completed legal audit.

The local description/video plan is in `docs/SUBMISSION.md`. It is not submitted,
and demo hosting/repository publication still require separate approval.
