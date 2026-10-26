# Phase 04 provenance and dependency boundary

**Reviewed:** 2026-10-23, Asia/Manila. Phase 04 adds no npm/Gradle runtime or test
dependency, model, speech engine, vendor binary, font or brand asset. `package.json`
and `package-lock.json` have no Phase 04 dependency change. Existing Phase 03
JUnit/AndroidX test dependencies remain test-scoped. No new license clearance,
advisory scan or upstream vulnerability resolution is claimed.

The native picker uses Android framework `DatePickerDialog`, `TimePickerDialog`
and `java.time` APIs through a newly implemented capstone bridge. These are
platform API calls, not a copied third-party picker package. Manual date/time
entry remains available, and no permission/calendar-account dependency is added.
The framework does not decide authoritative timezone/DST conversion; existing
capstone scheduling validation retains ownership.

Calendar interaction concepts were reviewed at legacy revision
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`; exact paths/blob hashes and read extents
are in [the Phase 04 selection](../audits/phase-04-legacy-selection.md). No legacy
source, root app, business Today component, data store, account/cloud module,
asset, credential or dependency tree was copied. Owner source/brand authorization
is already recorded, with attribution/publication details still to follow. This
does not replace third-party/model redistribution review if later phases import
such artifacts.

The supplied audit was treated as untrusted reference material and checked
against actual source/logs. Its embedded maintenance prompt did not authorize
data deletion, reset, publication or additional phases. Corrections are recorded
in [the independent audit review](../audits/phase-04-independent-audit.md).

Historical dependency/advisory records remain in
[Phase 01 provenance](phase-01-provenance.md) and
[Phase 03 test-dependency provenance](phase-03-provenance.md). Development-signed,
debuggable dataQa is for controlled review, not public production distribution.
The Phase 04 report records current APK hashes/permissions and actual builds;
these files are not implicitly identical to historical Phase 03 artifacts.
