# Third-party notices

NextTurn's original code is MIT-licensed; see `LICENSE`. This does not replace
the licences of incorporated artwork, fonts or dependencies, and grants no
rights to third-party trademarks.

## Browser code

React, React DOM, Scheduler, qrcode and @noble/hashes are used under their own
licences. Their installed runtime dependency graph, exact versions, declared
licences and original licence texts are recorded in:

- `docs/licences/reviewed/dependency-licences.json`
- `docs/licences/reviewed/npm-licences.txt`

The inventory includes qrcode's installed runtime graph, which is broader than
the modules used by the frontend bundle. Build tools are separate npm development
dependencies; their original notices remain in their packages.

## Native verifier

The pinned librustzcash ecosystem, ed25519-compact and their dependency manifest
graph are recorded in `docs/licences/reviewed/native-licences.txt` and the JSON inventory.
Cargo metadata includes optional/platform-specific packages, not an exact binary
composition analysis. Preserve the copied original notices with distributed
verifier binaries. Any missing licence texts in the generated report remain an
explicit release-review item, not a claim of completed legal clearance.

The reviewed inventory has no missing declared licences or notice texts. It
contains 33 installed npm runtime packages and 275 Cargo manifest packages. Where
crate archives omit workspace-root notices, the copied texts come from the exact
public repository revision recorded in that crate's `.cargo_vcs_info.json`.
r-efi's original MIT notice/copyright text is retained from its `AUTHORS` file.
The initial unreviewed inventory under `docs/licences/` is historical; distribute
the `reviewed/` bundle. A complete inventory is still not a legal audit.

## Manrope

The local Manrope font is under the SIL Open Font License 1.1. Its original notice
and full terms are in `src/assets/fonts/OFL-Manrope.txt`; keep that notice with
distributed font files. No Google Fonts request or remote font loader is included.

## Illos artwork

The adapted free Email delivery and Queue SVGs are by Naved Alam / Illos.dev, under
the [Illos free licence](https://illos.dev/license), reviewed on 24 October 2026.
That licence permits product use/modification but not repackaging the artwork as
an illustration collection or competing asset library. No Pro assets or unlicensed
preview images/videos were incorporated. See `docs/ASSET-CREDITS.md` and the local
`public/illustration-credits.txt`.

The original NextTurn charts and brand mark are project code. The legacy
`public/icons.svg` scaffold file is not referenced by current NextTurn screens;
third-party brand symbols do not imply endorsement or confer trademark rights.

## Regeneration

```text
node scripts/generate-notices.mjs --out-dir <new-notices-directory>
```

The generator reads public dependency manifests/licence files only, never wallet
material or `.local/` records. It refuses an existing output directory. Review
the generated report before replacing an earlier inventory; do not overwrite or
discard unrelated work. This is a notice inventory, not a full legal audit.
