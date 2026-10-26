# LAFINA-CAPSTONE

Android-first, local-first academic AI secretary for university students. Anonymous
offline onboarding, tasks, calendar, reliable Android reminders, manual controls,
hold-to-talk offline speech recognition, and Android system TTS define the planned
core. No registration, login, accounts, business roles, subscriptions or teams.
Low-end device performance is a priority; minimum RAM/ABI support will be stated
only after real-device validation.

**Current state: Phase07 confirmed offline chat commands implemented; device validation pending.**
Today and Calendar now support a week/day agenda, undated/date-only/timed tasks,
events and bounded weekly classes. Add/edit/delete items, explicitly complete or
reopen tasks, and inspect/acknowledge/snooze/cancel reminders without AI or internet.
Android date/time pickers have typed-entry fallbacks; display supports 12/24 hour
time. Settings exposes Android reminder permissions and delivery diagnostics.
AlarmManager opens the simulated reminder screen through an eligible full-screen
alert or notification. Optional Android system TTS adds installed offline-voice
selection, a visible preview and Stop control, spoken canned planner replies and
visible reminder reading. Text is the default and stays readable in every output
mode. Chat adds explicit hold/release input, editable recognized text and a manual
draft that remains usable on speech failure. The native Answer action offers an
optional visible draft after durable acknowledgement. Speech alone never runs a
command. Chat's explicit Send, exact action review and Confirm change can create,
move, complete/delete or acknowledge/snooze a uniquely identified item. Queries
and Repeat are read-only. Android on-device recognition is conditional;
reviewed local Whisper Tiny is an explicit optional model-bearing build.
The owner explicitly approved Phase07. Phase08 acceptance work, backend and online
models remain deferred. Earlier phone acceptance is not implied.

Start with [AGENTS.md](AGENTS.md), [the charter](docs/00-PROJECT-CHARTER.md),
[requirements](docs/01-PRODUCT-REQUIREMENTS.md), and the
[Phase 00 report](docs/reports/phase-00-report.md) for pinned-source evidence.
For current work read [Phase07 report](docs/reports/phase-07-report.md),
[confirmed-command decision](docs/decisions/ADR-020-confirmed-offline-commands.md),
[command manual checks](qa/PHASE-07-MANUAL.md),
[frozen command evaluation](docs/benchmarks/phase-07-intents.md),
[pinned intent audit](docs/audits/phase-07-legacy-intents.md),
[Phase06 report](docs/reports/phase-06-report.md),
[hold-to-talk decision](docs/decisions/ADR-019-offline-stt.md),
[speech-input manual checks](qa/PHASE-06-MANUAL.md),
[source/model provenance](docs/third-party/phase-06-provenance.md),
[measured STT cohort and limits](docs/benchmarks/phase-06-stt.md),
[Phase05 report](docs/reports/phase-05-report.md),
[system speech decision](docs/decisions/ADR-018-system-tts.md),
[speech phone checklist](qa/PHASE-05-MANUAL.md),
[Phase 04 report](docs/reports/phase-04-report.md),
[manual planner architecture](docs/phase-04-manual-planner.md),
[native architecture/schema](docs/phase-03-native-reminders.md) and
[manual Android checklist](qa/PHASE-04-MANUAL.md).
Use [phase instructions](phases/PHASE-07.md) and
[the report template](templates/PHASE-REPORT.md) for one phase at a time.

Legacy reference: [LAFINA at the pinned revision](https://github.com/LAFINA-AI/LAFINA/tree/f7e70aec54e6d16e627f444f2a67114cbfb07b5e).
The legacy repository is read-only and is not a runtime dependency. No legacy code,
credentials, database, model binaries or dependency tree have been imported.

Android system offline-capable TTS is implemented; actual phone audibility remains
unverified. Eligible voices must report installed data and no network requirement;
these vendor metadata checks do not replace airplane-mode listening. Kokoro is excluded
from the initial MVP. Android STT uses only the API31+ on-device factory, never a
generic potentially network recognizer. API30 requires the optional checked
Whisper asset for STT or retains manual text-only fallback. A candidate flag does
not certify recognition, accents or phone performance. Deterministic validated
intents use an anchored English grammar and private expiring reviews. Ambiguous
dates, negation, mixed actions, duplicate/vague targets and bulk/series changes
require clarification or manual Calendar review. No extra NLU model is bundled;
typed/manual controls remain available on speech failure.
Online Gemini and verified USTP handbook RAG remain deferred until the Phase 08
offline gate passes and the owner explicitly approves the relevant later phase.

## Development

Use Node **24.19.0**, npm **11.17.0** and **JDK17**. Android: min SDK30,
compile/target36, Build Tools36.0.0, NDK27.1.12297006, Gradle9.3.1 (checksum pinned),
Kotlin plugin2.1.20. Exact dependency pins are in package.json/package-lock.json.
OP-SQLite stores settings and planner records in one `lafina-capstone.sqlite`.
Migration0→1→2 preserves Phase01 settings. Android framework SQLite accesses the
same file only in a private reminder process using DELETE journaling (ADR-015).
Never copy the legacy DB.

```powershell
npm ci --ignore-scripts
npm run preflight
npm run doctor

# Set these paths to your installed JDK/SDK, in this terminal only.
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --no-daemon --console=plain
```

ABIs produce separate APKs under `android/app/build/outputs/apk/` to avoid shipping
unneeded architectures. For a physical ARM64 phone use the ARM64 release-preview
APK; x86_64 is for the matching emulator. ARMv7 is experimental, excluded by default,
and requires `-PenableExperimentalArmv7=true` plus separate validation. Android11+ is required.
See report for actual built ABIs and artifact hashes/sizes.

**Release preview uses standard development signing. Do not publish it.** It bundles
JS/Hermes, has no INTERNET permission and runs without Metro. Debug has Metro and
developer-overlay permissions and app ID `com.lafina.capstone.debug`; preview app ID is
`com.lafina.capstone`, distinct from old LAFINA. Phase03 requests notification,
exact-alarm, conditional full-screen, boot and vibration permissions. Phase06 adds
RECORD_AUDIO, requested only at visible use, and recognition-service visibility.
No telephony, background-microphone/foreground service or network permission is
intended in bundled QA/release; current APK inspection belongs to the phase report.

The completed Phase07 preflight cohort passed453 tests/27 suites and44-module AST
checks. The current model-bearing x86_64 dataQa upgrade and42 API37 functional
instrumentation tests are verified; offline emulator create/move/query/refusal,
review cancellation/persistence and named ringing-reminder ACK were exercised.
Event/TTS/speech-copy/final restoration outcomes belong to the phase report.
The first independent parser evaluation was62/64 exact; the retained post-fix
unchanged-label regression was64/64. These are synthetic text proposals, not
speech quality or executed-action accuracy. Chat retains at most40 messages in
memory, clears them on leaving, and does not persist conversation history.

The earlier verified Phase06 preflight passed308 tests/24 suites and38-module AST checks.
The native task group built debug/dataQa/release for ARM64 and x86_64;62 JVM
tests and42 API37 emulator instrumentation tests passed. Six checked synthetic
English PCM clips passed real local Whisper decoding with WER0, median2,939ms
and p953,206ms for model preparation/loading/decoding. These are not real-mic,
phone, accent or release-to-result measurements. Current UI/restoration and
physical-phone outcomes are recorded separately in the phase report. For offline Phase07 review,
use the completed report's verified ABI-matching **0.7.0-data-qa** hash from
`android/app/build/outputs/apk/dataQa/` with `adb install -r`, then open
**Chat**. Type a command in **Message**, **Send message**, inspect the exact
review and **Confirm change**. For spoken emulator tests, deliberately enable
host microphone input and check app permission. Host input is deliberately off;
Phase07 started with app microphone permission already allowed and preserves it.
Open **Show speech input** and choose **Whisper local model** if the Android
candidate's local language is unavailable. Review/edit recognized words, copy to
Draft and **Use draft in chat**; Send and Confirm remain separate. Native
answered-reminder drafts remain local-only and cannot execute Chat commands.
**Today** and **Calendar** retain manual tasks/events. Enable Android delivery and
notification access explicitly in **Settings → Reminder delivery**, then schedule
a timed item with a reminder. **Open data test harness** retains storage
review tools. The APK bundles JS with development support off,
enables test controls through a native build flag, and preserves the existing
preview's app ID/settings. It is a private debuggable QA build, not a public
release. Release hides the harness; debug requires Metro. See the manual checklist
for exact commands, ACK-versus-completion checks, Android limits and permission fallbacks.
Open **Settings → Offline speech settings** for installed voices, rate/pitch,
explicit preview, setup guidance and Stop. Set the general reply preference to
Text, Voice or Both, then send a query or confirm a reviewed change. Written
confirmation must not wait for speech; **Stop reading reply** retains text and
durable results. Hold only when ready to record; release to transcribe, then
explicitly review/copy/send/confirm. Granting mic permission alone never records.
A separately installed speech engine
has its own permissions; app permission absence is not a vendor traffic audit.

Whisper is included only with `-PwhisperModelDir=<reviewed-assets>` after checksum
staging; without that flag it reports unavailable. The32,152,673-byte Tiny Q5_1
weight is not committed or downloaded by the app. Phase06's measured model-bearing
ARM64 release preview was60,706,193 bytes; current Phase07 APK sizes belong to its
report. The private verified model copy adds
disk use beyond the APK. Sampled maximum instrumentation-process PSS was167,689KiB,
not an absolute whole-app peak. Phone RAM/energy and language quality remain
unmeasured, especially on2–3 GB phones. See
[the manual guide](qa/PHASE-06-MANUAL.md) for exact staging/build/install/benchmark
commands. `sttCorpusDir` includes checked synthetic WAVs only in androidTest,
not in the main app. Synthetic PCM inference is not a real microphone/accent test.

For development with a USB-connected test device:

```powershell
npm start
# In a second terminal with JDK/SDK selected:
npm run android
```

Tests use an injected repository and real **host** SQLite for SQL persistence and
write-failure cases. They do not certify Android JSI, phone UI or future native
STT, audible TTS or physical-phone alarm behavior. Native SQLite, speech policy and PendingIntent instrumentation
are separate from host tests. `npm run check:architecture` checks the TS import graph, pure domain,
offline dependency boundaries and main manifest. Graphify is not installed.
The CI workflow is provided; remote execution is not implied by local checks.
Known inherited dependency advisories remain open in the
[provenance/security ledger](docs/third-party/phase-01-provenance.md); passing
preflight is not a clean security scan or publication approval.

No local settings, audio, transcripts or private data are uploaded. Uninstall or
clearing storage removes this device's settings and planner; backups are disabled. Reopen
onboarding in Settings to keep preferences while reviewing setup. Item deletion
currently hides the item and retains cancellation tombstones; complete privacy
purge controls are later work. Optional voice choices extend the existing local
preferences payload; missing old fields receive defaults without a DB migration.
Quiet hours retain the existing native reminder policy.

Read-only/manual baseline procedures are in the
[baseline protocol](docs/benchmarks/phase-00-baseline.md); all unmeasured values are
explicitly NOT RUN. Never infer physical-phone behavior from mocks or a build.

The supplied 57-file planning kit contains 56 listed SHA-256 entries plus the
manifest itself; all 56 listed hashes were verified.
Its existing extracted folder is preserved locally and ignored to avoid duplicate
instructions. The original one-line README was inspected before this expansion.

Every phase requires its report, actual test outcomes, limitations and human review.
No next phase begins without explicit approval. The
[host data benchmark](docs/benchmarks/phase-02-host.md) and Phase 04 query benchmarks
measure real in-memory host SQLite calls only. Actual emulator reminder evidence
is separate; matched physical startup, peak PSS, battery, speech and legacy
comparisons remain NOT RUN. Product views use bounded page/window reads rather
than the finite QA snapshot; see [ADR-016](docs/decisions/ADR-016-planner-queries.md).
