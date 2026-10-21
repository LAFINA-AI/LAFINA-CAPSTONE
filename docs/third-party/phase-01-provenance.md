# Phase 01 template and dependency provenance

Date: 2026-10-21 Asia/Manila. No legacy source code, model, credential, DB or brand
asset was imported. Owner authorization for future legacy source/brand reuse was
recorded in Phase 00; no repeat permission request is needed.

## Official foundation

Official npm package `@react-native-community/template@0.86.0`, downloaded with
`npm pack`, was inspected before selective copying of Android/configuration files.

- Tarball: https://registry.npmjs.org/@react-native-community/template/-/template-0.86.0.tgz
- Registry integrity: `sha512-kw/F0AP3pTbkchZ3sAmjRpBavg3nnFW589sJ67w3X9gO0fp+QPbAuRft51K3N2BmFtA3H+ulPt6Krnd7lz/suA==`
- Registry shasum: `998c697e47c9c2de474fb33aaa0ed1f76d92845a`.
- MIT notice: [retained notice](react-native-template-LICENSE.txt).
- Actual tarball bytes were hashed after extraction and match the registry SHA512.
- Original template iOS tree, example app/test, README, generic icon PNGs and public
  debug keystore were not imported. A fresh vector launcher letterform is used.
- Android package/component names were changed to capstone identities; backup and
  release network access disabled, SDK baseline30/target36, ABI-split test APKs.
- Gradle9.3.1 official distribution checksum is pinned in wrapper properties:
  `b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06`.
- The wrapper JAR itself matches the official version-specific checksum:
  `b3a875ddc1f044746e1b1a55f645584505f4a10438c1afea9f15e92a7c42ec13`.
  Official checksum: https://services.gradle.org/distributions/gradle-9.3.1-wrapper.jar.sha256.
  [Retained Gradle license](gradle-LICENSE.txt) was retrieved from the upstream v9.3.1 source.

Exact package/lockfile version and integrity metadata are versioned. Direct runtime
dependencies are React19.2.3, RN0.86.0, OP-SQLite16.2.0 and safe-area-context5.8.0;
their installed manifests report MIT. Native OP-SQLite source is built by Gradle;
no npm install hook or arbitrary model download is required. `npm ci --ignore-scripts`
is the reproducible dependency command. Template/framework/vendor notices must be
included in any later distribution notice review; this ledger is not a complete
transitive legal clearance or security certification.

## Security scan — findings remain open

`npm audit --omit=dev --json` was run against the actual lockfile. The initial scan
reported35 affected/meta-affected package entries (26 high,8 moderate,1 low).
Compatible updates to Babel7.29.7 and CLI/AndroidCLI20.2.0 removed the Babel and
XML-parser leaf advisories without changing RN0.86.0. Final scan exits1 with
**33 affected/meta-affected entries:28 high,5 moderate,0 critical**. Multiple entries
can be propagation of the same underlying advisory; this is not33 distinct flaws.

The remaining leaf advisories are:

- `braces`<=3.0.3 stack-exhaustion denial of service,
  https://github.com/advisories/GHSA-vfj7-8cjw-p6xm.
- `sprintf-js`<=1.1.3 unbounded precision denial of service,
  https://github.com/advisories/GHSA-hp3w-g68c-fv3c.

Registry latest versions at this scan are3.0.3/1.1.3 respectively, so a direct patched
leaf version was not available. npm's suggested RN major/minor-line migration is
not applied blindly. Framework tooling/testing packages are present in RN's npm
dependency graph even when running `--omit=dev`; an audit result is not an APK
reachability analysis. App source does not import these parsers directly, but
**no blanket non-exploitability or security pass is claimed**. Build only trusted
project inputs and do not expose Metro to untrusted networks. The bundled preview
has no network permission; this is containment, not a dependency fix.

Raw [final advisory snapshot](../reports/evidence/phase-01-dependency-audit.json)
is retained. Review these findings/upstream fixes before wider distribution.
No `npm audit fix --force`, framework migration or silent suppression was used.
