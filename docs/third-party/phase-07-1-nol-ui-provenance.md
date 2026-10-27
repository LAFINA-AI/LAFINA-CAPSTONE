# Nol UI follow-up provenance

Incoming reference: `LAFINA-AI/LAFINA-CAPSTONE`, `Nol-branch` at
`9c183a20eca2377b5e54f219c5f83460b18af81b`. Explicit pull on2026-10-27 returned
already up to date; both Nol/main have the same commit. No legacy repository
mutation, full application/database import or new model copy.

Reviewed presentation references: `src/ui/components/CustomTabBar.tsx`, calendar
screens/components/utils, `src/ui/screens/notes`, and `ProfileScreen.tsx`.
Adapted composition is connected to our confirmed domain/native ports rather
than their account stores, direct voice mutations or incompatible schema17.
Notes storage/editor and outline icon geometry are newly implemented locally.
The owner previously confirmed code/brand reuse authorization; detailed public
attribution/redistribution terms remain pending. This work is a local review build.

The one new direct dependency is exact `react-native-svg@15.15.5`, MIT, with its
lockfile integrity and notices recorded in the dependency evidence. Only
code-defined shapes and a static gradient are used; no remote SVG/XML is loaded.
Existing React Native development middleware's body-parser2.3.0 was updated
compatibly to2.4.0 after npm reported GHSA-27r3-jxmh-p828. Post-update npm audit
reported0 advisories on this date; no claim about future advisories or a complete
source audit. Build permissions remain restricted to the offline core.

Native SVG compatibility, APK size and16KiB ELF checks require current artifacts;
unit-test SVG stubs verify behavior/props only. System TTS/STT/Whisper model
provenance remains the existing Phase05–06 ledger. No Kokoro, Base English,
Silero, online credential, cloud client or account module is added.

## AUD-07 — Notice scope and actual bundle evidence

The independent audit's [fresh release-mode Metro module graph](../reports/evidence/claude-phase-07-audit-js-bundle-modules.json)
was produced from `a186bfceeb05db038bb0b7a2a35b6fe17d1fab62` in its Linux audit
copy. It contains `react-native-svg` but does **not** contain `css-select`,
`css-tree`, `boolbase`, `nth-check`, `css-what`, `domutils`, `domhandler`,
`dom-serializer`, `domelementtype`, `entities`, `mdn-data` or `source-map`.
The [independent audit](../reports/phase-07-independent-claude-audit.md#aud-07--info--the-boolbase-notice-limitation-does-not-affect-the-shipped-js)
also reports no corresponding strings in the audited release APK's Hermes
bundle. A source Metro graph and an APK string inspection are separate forms of
evidence; neither is a full native dependency/call graph or a blanket claim
about every future build. This documentation correction does not rerun bundling
or modify an APK.

The [existing notice asset](../../android/app/src/main/assets/licenses/REACT-NATIVE-SVG-NOTICES.txt)
is intentionally retained unchanged. It is over-inclusive for that audited JS
bundle and also carries the development-only `body-parser` notice. Its
`boolbase@1.0.0` entry preserves published package metadata declaring ISC; the
[dependency ledger](../reports/evidence/phase-07-1-nol-ui-dependencies.json)
records `standaloneNoticeMissing: true`. Metadata is not an invented substitute
for a missing license notice. On the recorded bundle evidence, that particular
missing-notice question does not describe shipped APK JS, while attribution for
source/npm redistribution remains a separate review item. Preserve upstream
notices; do not silently trim them or declare publication licensed by this audit.

Publication provenance remains pending. Recheck module inclusion and required
notices if imports, dependencies, bundler configuration or distribution format
change. The point-in-time advisory and bundle results above are historical
cohorts, not new hardening measurements or a guarantee of future safety.

The subsequent0.7.3 hardening build independently rechecked its fresh release
packager source map:704sources,112from `react-native-svg`, and zero from each
CSS-parser/`boolbase` group listed above. The map hash and exact group counts are
in [current bundle/native evidence](../reports/evidence/phase-07-hardening-native-bundle-inspection.json).
This describes that JS graph, not every native or source/npm distribution
obligation. The notice asset is still unchanged. See the
[hardening report](../reports/phase-07-audit-hardening-report.md) for build and
device evidence; no release/publication approval is inferred.
