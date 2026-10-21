# LAFINA-CAPSTONE

Android-first, local-first academic AI secretary for university students. Anonymous
offline onboarding, tasks, calendar, reliable Android reminders, manual controls,
hold-to-talk offline speech recognition, and Android system TTS define the planned
core. No registration, login, accounts, business roles, subscriptions or teams.
Low-end device performance is a priority; minimum RAM/ABI support will be stated
only after real-device validation.

**Current state: Phase 01 foundation.** Anonymous local onboarding, saved
preferences, semantic light/dark themes, Today and Settings are implemented.
Calendar and Chat are honest placeholders. Tasks, alarms, speech and command
execution are not implemented yet. No backend or models are present.
Physical-device acceptance remains required; Phase 02 is not authorized.

Start with [AGENTS.md](AGENTS.md), [the charter](docs/00-PROJECT-CHARTER.md),
[requirements](docs/01-PRODUCT-REQUIREMENTS.md), and the
[Phase 00 report](docs/reports/phase-00-report.md) for pinned-source evidence.
For the current build read [Phase 01 report](docs/reports/phase-01-report.md),
[implementation map](docs/phase-01-foundation.md) and
[manual Android checklist](qa/PHASE-01-MANUAL.md).
Use [phase instructions](phases/PHASE-01.md) and
[the report template](templates/PHASE-REPORT.md) for one phase at a time.

Legacy reference: [LAFINA at the pinned revision](https://github.com/LAFINA-AI/LAFINA/tree/f7e70aec54e6d16e627f444f2a67114cbfb07b5e).
The legacy repository is read-only and is not a runtime dependency. No legacy code,
credentials, database, model binaries or dependency tree have been imported.

Android system offline-capable TTS is the default direction; Kokoro is excluded
from the initial MVP. On-device Android STT must be evaluated on real devices,
with a reviewed Whisper.cpp fallback where needed. Deterministic validated intents
come first. Typed/manual controls remain available when speech or AI fails.
Online Gemini and verified USTP handbook RAG remain deferred until the Phase 08
offline gate passes and the owner explicitly approves the relevant later phase.

## Development

Use Node **24.19.0**, npm **11.17.0** and **JDK17**. Android: min SDK30,
compile/target36, Build Tools36.0.0, NDK27.1.12297006, Gradle9.3.1 (checksum pinned),
Kotlin plugin2.1.20. Exact dependency pins are in package.json/package-lock.json.
OP-SQLite stores one local settings snapshot in `lafina-capstone.sqlite`;
Phase 02 will extend the same database. Never copy the legacy DB.

```powershell
npm ci --ignore-scripts
npm run preflight
npm run doctor

# Set these paths to your installed JDK/SDK, in this terminal only.
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:assembleDebug :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-daemon --console=plain
```

ABIs produce separate APKs under `android/app/build/outputs/apk/` to avoid shipping
unneeded architectures. For a physical ARM64 phone use the ARM64 release-preview
APK; x86_64 is for the matching emulator. ARMv7 is a configured target, but must be
built and tested separately before claiming support. This build requires Android11+.
See report for actual built ABIs and artifact hashes/sizes.

**Release preview uses standard development signing. Do not publish it.** It bundles
JS/Hermes, has no INTERNET permission and runs without Metro. Debug has INTERNET
only for Metro and app ID `com.lafina.capstone.debug`; production preview app ID is
`com.lafina.capstone`, distinct from old LAFINA. No mic/notification/alarm permission
is requested in Phase 01. Debug-only diagnostics are in Settings.

For development with a USB-connected test device:

```powershell
npm start
# In a second terminal with JDK/SDK selected:
npm run android
```

Tests use an injected repository and real **host** SQLite for SQL persistence and
write-failure cases. They do not certify Android JSI, phone UI or future native
alarms/STT/TTS. `npm run check:architecture` checks the TS import graph, pure domain,
offline dependency boundaries and main manifest. Graphify is not installed.
The CI workflow is provided; remote execution is not implied by local checks.
Known inherited dependency advisories remain open in the
[provenance/security ledger](docs/third-party/phase-01-provenance.md); passing
preflight is not a clean security scan or publication approval.

No local settings, audio, transcripts or private data are uploaded. Uninstall or
clearing storage removes this device's settings; backups are disabled. Reopen
onboarding in Settings to keep preferences while reviewing setup. Future voice and
quiet-hour choices are saved preferences only, clearly labeled in the UI.

Read-only/manual baseline procedures are in the
[baseline protocol](docs/benchmarks/phase-00-baseline.md); all unmeasured values are
explicitly NOT RUN. Never infer physical-phone behavior from mocks or a build.

The supplied 57-file planning kit contains 56 listed SHA-256 entries plus the
manifest itself; all 56 listed hashes were verified.
Its existing extracted folder is preserved locally and ignored to avoid duplicate
instructions. The original one-line README was inspected before this expansion.

Every phase requires its report, actual test outcomes, limitations and human review.
No next phase begins without explicit approval.
