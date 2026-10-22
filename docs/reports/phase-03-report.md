# PHASE 03 — Android-native alarms, permissions and simulated reminder shell / Completion Report

**Branch / base commit SHA:** `codex/phase-03-native-reminders` / `7d4105e8803279810584f61a01f1ab3dada1bace`  
**Date/time UTC:** 2026-10-22T18:38:29.709549+00:00; 2026-10-23 Asia/Manila  
**Device available:** Android emulator `sdk_gphone16k_x86_64`, API 37, x86_64, MemTotal 4,008,376 kB; no physical phone tested  
**Status:** `AWAITING DEVICE VALIDATION`  
**Phase approval provenance:** owner wrote “APPROVE PHASE 03. Phase 02 looks good so far. Proceed with Phase 03, run it on my emulator, and tell me what to check manually afterward,” and requested verification of Antigravity's audit.  
**Evidence:** final builds, tests, artifact inspection, emulator checks and
benchmark/source manifests are linked below. Earlier failed/inconclusive attempts
are preserved separately. Physical-device acceptance remains incomplete.

**Emulator handoff:** the reviewed dataQa app is installed and open at Settings →
Reminder delivery. Delivery and in-app full-screen opt-in were turned off after
testing; native pending/ringing/registered/failed counts are all zero. Original
airplane/Wi-Fi/mobile-data states (0/1/1) are restored. Notification/exact grants
are retained for review. Existing settings/planner data were preserved; clearly
labelled synthetic test records remain available for inspection/removal. See the
[cleanup record](evidence/phase-03-emulator-cleanup.json) and
[final screen](evidence/phase-03-emulator-final-status.png).

The earlier Phase 02 work was already present as uncommitted/untracked changes
and remains preserved. HEAD identifies the base, not a commit containing this
implementation. No commit, push, deployment, legacy write or Phase 04 work was
performed. Explicit Phase 03 approval authorizes this phase; it does not turn
unreported physical-phone checks from an earlier phase into PASS.

## 1. Scope completed

| Requirement | Phase 03 behavior delivered | Acceptance limit |
|---|---|---|
| F-005 | Durable reminder/job generation drives native registration, cancellation, source edits and reconciliation after committed storage changes. | OS effects are not part of a SQLite transaction; registration is not proof of receipt. |
| F-006 | AlarmManager due callback claims a valid local occurrence, posts an Android notification, and records actual delivery diagnostics. Exact access is checked; denied access exposes inexact fallback. | Emulator evidence exists; actual-phone timing, idle/OEM behavior and reliability remain unverified. |
| F-007 | A native screen explicitly identifies a simulated reminder. Conditional user-opted-in full-screen intent and normal/heads-up notification fallback reach the same screen. | No real telephony, microphone, foreground service, STT or TTS. Android controls presentation and policy eligibility. |
| F-008, Phase 03 portion | Answer/Acknowledge/Dismiss changes reminder/job outcome only. The shell offers an explicit ten-minute snooze with a new generation. | Task completion remains a separate operation. Broader planner UI is not part of this phase. |
| F-014, Phase 03 portion | Private receivers and app foreground reconciliation handle restart, boot/unlock, package replacement, time/timezone changes and restored access. Stale identities cannot mutate a replacement generation. | Force-stop prevents delivery until the user reopens the app. Physical lifecycle tests remain required. |
| Audit hardening | Verified and corrected AUD01–AUD04; added render fallback, draft navigation protection, experimental ARMv7 opt-in and bounded QA snapshots. | These fixes do not certify every future form, a 32-bit phone or low-RAM capacity. |

The full F-015 offline core gate still belongs to Phases 01–08. This phase adds
no account, login, subscription, business/team module, cloud runtime, model,
handbook RAG, Gemini, speech engine or application implementation from a later
phase. Calendar/Chat product workflows remain deferred.

Targeted legacy inspection used revision
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`, including the old native module,
receiver, service and TypeScript alarm wrapper. Reviewed platform concepts were
retained; Phase 03 source is newly implemented for the capstone schema. No legacy
source/asset, service, model binary, credential or dependency bundle was copied.
Paths, blob hashes and exclusions are in
[the selective-reuse audit](../audits/phase-03-legacy-selection.md).

## 2. Change summary

This table describes Phase 03 changes against the existing Phase 02 working tree;
the branch's full Git diff also contains the preserved, uncommitted Phase 02 work.

| File/module | Change and reason | Test evidence |
|---|---|---|
| `android/app/src/main/java/com/lafina/capstone/reminders/ReminderStore.kt`, `ReminderModels.kt`, `ReminderPolicy.kt` | Existing-schema Android SQLite adapter; source/generation checks; paired claim/ACK/snooze/timeout; strict UTC/DST/quiet-hours policy; case-insensitive resolution of JS-valid timezone names; bounded redacted events. | JVM policy tests and real Android SQLite instrumentation. |
| `ReminderRuntime.kt`, `AlarmRegistrationPolicy.kt`, receivers | Serialized reconciliation; immutable due/timeout identities; cancel old generations; bounded OS window; process-lifetime registration reuse after initial restoration; boot/time/permission recovery. | Registration-policy/identity tests, instrumentation and separately logged emulator checks. |
| `ReminderIntents.kt`, `ReminderIdentityKey.kt` | Full encoded job/occurrence/generation/operation URI identity avoids request-code hash collisions. | JVM identity tests and real Android PendingIntent tests. |
| `ReminderCapabilities.kt`, `ReminderNotifications.kt`, `ReminderActivity.kt` | Actual permission/channel status, private notification, optional eligible FSI, native simulated screen and explicit actions. | Emulator alarm-to-notification/screen loop; phone matrix NOT RUN. |
| `ReminderProvider.kt`, `ReminderPackage.kt`, `MainApplication.kt`, manifest | Same-UID private command boundary and `:reminders` process. Native delivery does not initialize React/Hermes/OP-SQLite there. | Architecture checks, native compile and primary-store process refusal test. |
| `android/app/src/main/res/{values,values-night,drawable}` | Reminder icon, central native light/dark colors/dimensions and shell theme. | Compile/emulator visual inspection; physical accessibility and audio checks pending. |
| `src/core/native/{reminders,reconcilePlanner}.ts`, `src/core/domain/ports.ts` | Typed, bounded native responses and explicit failures; reconcile after a durable manual mutation without losing the saved result when Android fails. | Bridge argument/error/coalescing tests. |
| `src/features/reminders/ReminderSettings.tsx`, `src/app/App.tsx` | Opt-in delivery/FSI, permission/settings controls, readable status, foreground refresh and dataQa-only 15-second synthetic reminder controls. | ReminderSettings/App Jest tests and actual emulator actions. |
| `src/core/storage/{openLocalDatabase,plannerDatabase,reminderOperations,plannerRepository}.ts`, planner domain | DELETE journal and busy timeout; schema 1→2 migration; deadline/notification receipt and native metadata tables; consistent late manual-action expiry; finite QA snapshots. | Migration, rollback, repository and native storage tests. |
| `src/core/ui/formatOverviewDate.ts`, `src/app/useLocalPreferences.ts` | Safe visible UTC header fallback; persisted settings do not require a fresh runtime timezone lookup. | Formatter/App regression tests. |
| `src/features/onboarding/PreferencesForm.tsx`, App navigation | Dirty/saving state, keep/discard confirmation and saved-draft restoration on Back, tabs, harness or setup navigation. | PreferencesForm/App tests. |
| `android/app/build.gradle`, `android/gradle.properties` | VersionCode 3; ARM64/x86_64 defaults; explicit experimental ARMv7 opt-in; native test dependencies; two build/Metro workers for host build stability. | Final native builds/JVM tests. ARMv7 NOT BUILT. |
| `scripts/check-architecture.mjs`, `.github/workflows/phase-01.yml` | Phase 03 manifest/process boundaries; CI commands cover native tests and bundled QA/release variants. | Local AST/build checks PASS; remote GitHub Actions execution NOT RUN here. |
| Tests, ADR-015, architecture/schema, audit and QA documents | Record actual behavior, independent audit corrections, process/SQLite rationale and manual acceptance criteria. | Evidence links below; final human acceptance pending. |

## 3. Tests and real outcomes

Commands below are reproducible from the repository root in PowerShell. SDK/JDK
selection and local privileges must be available; this report does not claim the
same commands have run on another host or physical device.

```powershell
npm run preflight

$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --no-daemon --console=plain

adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
adb -s TEST_DEVICE shell am instrument -w com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
```

Use the ARM64 dataQa APK instead of x86_64 for a matching physical ARM64 phone.
TEST_DEVICE denotes the selected local serial, which must not be published.

| Check | Actual result | Evidence |
|---|---|---|
| TypeScript strict | PASS, no reported errors in final preflight. | [Release preflight log](evidence/phase-03-release-preflight.log). |
| ESLint | PASS, zero warning/error gate. | Same final preflight log. |
| Prettier | PASS, all matched files formatted. | Same final preflight log. |
| Jest behavioral/storage/UI/bridge | PASS: **156 tests, 11 suites**. Includes real host SQLite storage tests; mocks/rendering do not prove Android delivery. | Same final preflight log. |
| AST architecture | PASS: **25 TypeScript modules**, no cycles/forbidden offline dependencies; Phase 03 permissions/process boundaries checked. | Same final preflight log; command `npm run check:architecture`. |
| Native JVM | PASS: **30 tests**: 19 policy, 3 identity, 8 registration/restoration epoch; zero failures/errors/skips. | [Reviewed native build log](evidence/phase-03-native-reviewed.log); [captured JUnit results and XML hashes](evidence/phase-03-jvm-results.json). |
| Debug/dataQa/release plus AndroidTest APK build | PASS for requested ARM64/x86_64 application ABIs. Reviewed build ended BUILD SUCCESSFUL. Compile is not phone execution. | [Reviewed native build log](evidence/phase-03-native-reviewed.log). |
| Android instrumentation | PASS: **23 tests**, actual API 37 emulator, 11.876 seconds in reviewed run. Real Android SQLite and PendingIntent assertions use isolated synthetic test files. | [Reviewed instrumentation](evidence/phase-03-instrumentation-reviewed.log). |
| Initial emulator notification denial | PASS: blocked status and disabled synthetic-create control after denial. | [Initial APK ledger](evidence/phase-03-emulator-initial.json). |
| Initial emulator exact denial/inexact cancel | PASS: inexact registration with denied exact access; explicit cancel returned active counts to zero. Delivery timing under denied exact access was not certified by this cancellation check. | Initial APK ledger; [screenshot](evidence/phase-03-emulator-inexact-cancel.png). |
| Initial emulator offline FSI-denied fallback | PASS: airplane mode, Wi-Fi/data off; real background due notification opened native shell; Answer produced paired ACKNOWLEDGED with task TODO. | Initial APK ledger; [fallback](evidence/phase-03-emulator-fullscreen-denied.png), [native screen](evidence/phase-03-emulator-native-reminder.png), [ACK](evidence/phase-03-emulator-ack.png). |
| Initial emulator snooze/cancel | PASS: native ten-minute snooze, job PENDING, reminder SNOOZED, generation 2; later cancel returned active counts to zero. | Initial APK ledger. |
| Initial emulator overlapping/expiry | PASS: two distinct RINGING jobs; both background timeouts observed; returned state MISSED with task TODO and zero active jobs. | Initial APK ledger. |
| Final installed APK, permitted automatic screen-off FSI | PASS: screen-off alarm automatically opened native shell with explicit opt-in and permissions; Dismiss acknowledged, task stayed TODO. No notification tap/direct Activity start used. | [Final APK ledger](evidence/phase-03-emulator-final.json); [screen capture](evidence/phase-03-emulator-locked-fullscreen.png). |
| Final APK force-stop/reopen restores future alarm | PASS: task saved, UID force-stopped, then app reopened before due. Notification arrived while backgrounded before the second app open; native Answer ACK succeeded, task stayed TODO and active counts returned to zero. No delivery promise while remaining force-stopped. | [Final APK ledger](evidence/phase-03-emulator-final.json). |
| Final APK overlapping reminders | PASS: two separately created reminders were simultaneously RINGING with two independent registrations. | Final APK ledger; actual notification-post lags 33 ms and 37 ms. |
| Final APK background timeout | PASS: both native RING_TIMEOUT events preceded app return. Notifications disappeared; refreshed paired reminder/job MISSED, task TODO, all active native counts zero. | Final APK ledger; timeout lags 17 ms and 6 ms. |
| Final APK actual reboot/unlock | PASS on repeat: notification observed before the main app process started; private reminder process running. Notification opened native shell, Answer ACK returned active counts to zero. | Final APK ledger; [native screen after reboot](evidence/phase-03-emulator-reboot-reminder.png). First slow-boot probe remains INCONCLUSIVE, not overwritten. |
| Final APK hashes/metadata/permissions | PASS: seven existing APKs inspected with SDK aapt2, SHA256 and byte sizes recorded; no rebuild during inspection. dataQa/release omit INTERNET, microphone, overlay, telephony and foreground-service permissions. | [Reviewed artifact manifest](evidence/phase-03-artifacts-reviewed.json). |
| Default Gradle ABI configuration | PASS: `gradlew -p android help --max-workers=2 --no-daemon --console=plain` configured successfully without an ABI override; `gradle.properties` defaults to ARM64/x86_64. No app rebuild performed by this check. | [Default configuration log](evidence/phase-03-default-config.log). |
| Experimental ARMv7 gate | PASS for rejection: `gradlew -p android help -PreactNativeArchitectures=armeabi-v7a --max-workers=2 --no-daemon --console=plain` exited 1 with the expected explicit ARMv7 opt-in error. This expected failure is the guard assertion, not an ARMv7 build or support claim. | [ARMv7 gate log](evidence/phase-03-armv7-gate.log). |
| Graphify | NOT RUN: unavailable in this environment. | [Availability record](evidence/phase-03-graphify.json). AST/import-cycle checks and Mermaid diagrams used as documented substitute. |
| ARMv7 build/device checks | NOT RUN; explicitly experimental and opt-in. | Gradle guard and manual QA. |
| Physical phone, Android 11/API 30, ARM64 execution, OEM/low-RAM/Doze/audio/battery | NOT RUN / HUMAN REQUIRED. | [Full physical QA checklist](../../qa/PHASE-03-MANUAL.md). |

Earlier failures are retained, not relabelled as successful runs:

- [First preflight](evidence/phase-03-preflight-first.log) stopped at a formatting
  issue; final formatting/preflight passes supersede that attempt.
- [First native build](evidence/phase-03-native-first.log) failed compilation on
  the React activity reference; the corrected bridge compiled in later builds.
- [First instrumentation](evidence/phase-03-instrumentation-first.log) had **14
  failures out of 17 tests**. Android rejected a row-returning `busy_timeout`
  PRAGMA executed through `execSQL`. The adapter now uses `rawQuery` and verifies
  the returned value. Reviewed instrumentation then passed all 23 tests.
- Independent review found null-deadline recovery, late manual-action and
  JS/native timezone-casing mismatches. These were fixed with regression tests;
  see [the code review](../audits/phase-03-code-review.md). Initial implementation
  presence was not treated as evidence that these paths worked.
- The first reboot UI probe timed out during Android startup and reopened the
  app before unattended delivery was established. The repeated real reboot
  waited for boot/unlock and actual notification with no main app process.
  The first overlap probe reused stale coordinates after the QA layout moved,
  creating only one task. Fresh control lookup then produced the verified pair.
  A later navigation-helper retry was required to read its final MISSED states;
  both native background timeout records precede that read. These automation
  attempts and raw history remain in the final ledger.

### Artifact identity

The emulator currently runs `com.lafina.capstone`, versionCode **3**, versionName
**0.3.0-data-qa**, from the x86_64 dataQa artifact. Its recorded final SHA256 is:

`eeae7d5a42e714f5b63e5298b088672acac7c4db8fa4ad63133d4903b5afeb9b`

Earlier notification/denial/snooze/concurrency samples used SHA256
`73b4ef093c524bfec55d6b6342b0d99f4a97ce134edb77370bdb97aa744f7a2b`.
Those results are explicitly labelled INITIAL and are not pooled into the final
artifact's sample set. Earlier artifact manifests remain historical evidence.

The [reviewed artifact manifest](evidence/phase-03-artifacts-reviewed.json) records
all seven inspected APKs, their byte sizes, SHA256, package/version metadata and
actual `aapt2 dump permissions` output. The matching physical ARM64 dataQa APK's
SHA256 is `b08e3fcdf85a86e7dfb857d73f64c81c35f0fd9ec8a7d687e92694f5f54bca6f`.

| Existing reviewed artifact | Bytes | Purpose |
|---|---:|---|
| `app-arm64-v8a-dataQa.apk` | 50,706,363 | Bundled-JS physical ARM64 QA; device execution NOT RUN. |
| `app-x86_64-dataQa.apk` | 50,226,687 | Installed bundled-JS emulator QA. |
| `app-arm64-v8a-release.apk` | 27,356,493 | Development release preview; not production signed. |
| `app-x86_64-release.apk` | 27,714,777 | Development release preview. |
| `app-arm64-v8a-debug.apk` | 48,584,582 | Metro development variant. |
| `app-x86_64-debug.apk` | 48,104,906 | Metro development variant. |
| `app-dataQa-androidTest.apk` | 873,020 | Test runner; REORDER_TASKS test permission, separate package. |

The actual dataQa/release APKs request the five Phase 03 platform permissions and
an AndroidX-generated signature-scoped dynamic-receiver permission. Debug APKs
add INTERNET and SYSTEM_ALERT_WINDOW for development; use dataQa for offline QA.
Do not use the older `phase-03-artifacts-final.json` name as proof that its SHA
matches this later reviewed build. Verify each APK hash before installation.
The [source manifest](evidence/phase-03-source-hashes.json) records all 85 current
application/test/tool/configuration file hashes. It includes preserved Phase 02
work and identifies the uncommitted build boundary. The default ABI property was
subsequently aligned with the same explicit two-ABI selection used for the build;
the separate default/experimental configuration checks passed their assertions.

## 4. Performance and device matrix

**Matched legacy baseline:** NOT RUN. No release-like physical old/new comparison,
phone startup median/p95, peak PSS, battery or low-end capacity result is available.
No speedup or Android performance-target pass is claimed.

| Measurement | Actual recorded observation | Interpretation |
|---|---|---|
| Initial APK notification-post lag | Four samples: **59, 120, 160, 2607 ms** from planned UTC to NOTIFICATION_POSTED. | Small emulator observation set, not a phone reliability benchmark or comparable old/new trial. |
| Initial APK background timeout lag | **24 ms and 897 ms** after persisted response deadlines. | Two emulator cases; does not promise exact timeout on devices or in denied-exact mode. |
| Final APK non-reboot notification samples | Five NOTIFICATION_POSTED lags **33, 37, 77, 101, 169 ms**; median **77 ms**, nearest-rank p95 **169 ms**, n=5. | Small mixed emulator observations, including one delivered task during the first incomplete overlap probe. No reliability-rate or speedup claim; boot catch-up and historical APK rows are excluded. |
| Final APK two-reminder timeout lag | **6 ms and 17 ms** after persisted deadlines. | Actual background RING_TIMEOUT records for the final two-reminder test; no physical/OEM/Doze guarantee. |
| Final APK reboot catch-up | Notification-post lags **262,511 ms** (first inconclusive UI attempt) and **41,459 ms** (verified unattended repeat); n=2. | Includes device startup/broadcast delay, separated from awake samples. The first timestamp establishes a post, not unattended UI receipt. No exact alarm can fire while Android is shut down. |
| Initial QA emulator memory | One PSS snapshot: main **91,348 KiB**, `:reminders` **42,531 KiB**. | Not peak memory, not release/phone memory, not an Android low-RAM certification. |
| Final APK peak PSS/cold startup/battery | NOT RUN. | Requires controlled repeated physical-device protocol and matched builds. |
| Kokoro vs Android TTS; STT accuracy/latency | NOT RUN; speech implementation is outside Phase 03. | Android system TTS remains the planned default. No model bundled. |

Raw observations: [initial samples](evidence/phase-03-emulator-initial.json),
[final samples](evidence/phase-03-emulator-final.json),
[single memory snapshot](evidence/phase-03-emulator-memory.json),
[benchmark JSON](../benchmarks/phase-03-emulator.json),
[method and limits](../benchmarks/phase-03-emulator.md), and
[source hashes](evidence/phase-03-source-hashes.json).
Do not overwrite older Phase 00/02 baselines as fresh Phase 03 measurements.

The coordinator limits future platform due registrations to **128** and processes
at most **256** due items per pass, with one inexact overflow-maintenance alarm.
Its active native SQL query still materializes matching rows. These are work/OS
queue limits, not measured SQL-memory bounds or proof that a 2 GB phone can handle
an arbitrary semester history. QA snapshots separately load at most 500 rows per
table and show truncation. Product query paging remains deferred.

## 5. Reliability, privacy, permissions, licenses

- One primary database remains authoritative. Main-process OP-SQLite and Android
  framework SQLite access it in separate processes with DELETE rollback journal,
  full synchronous native writes and a 5000 ms busy timeout. JS alone migrates
  schema 2; native opening cannot create, reset or auto-delete the primary file.
  This avoids the identified same-process multiple-SQLite locking hazard and
  unknown older Android WAL-reset patch status. It is not a guarantee against
  all storage/platform failures; see ADR-015.
- Reminder/job changes are paired transactionally; OS registration/notification
  follows commit. Source status/deletion, occurrence and generation fence stale
  callbacks. ACK never completes a task. Expired manual/native actions cannot
  extend the response window; clock TIME_SET ends current rings as MISSED.
- A registration cache is derived state, not a delivery receipt. A fresh reminder
  process restores its OS registrations; later unchanged registrations/timeouts
  in that completed process lifetime are reused to avoid repeatedly resetting
  nearby deadlines. Time-change invalidation forces restoration. Reuse policy is
  unit tested; physical lifecycle behavior still needs review.
- Notification failure remains visible as FAILED/reason, including terminal
  missed outcomes. A missing ring deadline is repairable only through MISS.
  Quiet policy uses saved global timezone; invalid/gap boundaries do not silently
  shift academic times. Failure does not reset or fabricate planner data.
- Main/dataQa/release manifest source requests POST_NOTIFICATIONS,
  SCHEDULE_EXACT_ALARM, USE_FULL_SCREEN_INTENT, RECEIVE_BOOT_COMPLETED and VIBRATE.
  App-wide/channel notification blocks, DND/volume, special exact access and
  separate full-screen access affect delivery. Actual final APK permissions are
  in the reviewed artifact manifest. The debug variant has Metro/overlay development
  permissions and is not the offline QA artifact.
- Full-screen alerts are off by default and need explicit app opt-in, platform
  access and a high-importance channel. Normal/heads-up notifications remain the
  fallback. Eligibility for public app distribution is not certified by a
  successful emulator permission grant. Lock-screen title visibility is explained
  before opt-in. The simulated screen is not a phone call.
- No microphone permission/capture, telephony role, background speech service,
  account, API credential or cloud upload was added. Diagnostics retain the latest
  200 IDs/generation/event/time/reason records without task titles, notes, audio or
  transcripts. Published evidence uses synthetic items and non-sensitive device
  characteristics; raw private notification dumps must be redacted locally.
- New dependencies are test-scoped JUnit/AndroidX Test; no application runtime npm
  or Android library was added. See [Phase 03 provenance](../third-party/phase-03-provenance.md).
  The historical Phase 01 CLI advisories are not claimed resolved; no fresh npm
  security scan was performed in this phase. User-reported legacy reuse authority
  is recorded, with details still to follow; no legacy code/assets were copied.
- Release is a **development preview** signed with the development key, with
  minification disabled. It is not a publishable production signing setup.
  Gradle reports deprecations relevant to a future Gradle 10 upgrade; the current
  configured Gradle 9.3.1 build succeeds. ARMv7 remains unsupported/unverified.

## 6. Human phone verification

All physical-device cases below are **NOT RUN / HUMAN REQUIRED**. The emulator
cannot certify speaker/vibration quality, locked OEM delivery, battery saver,
Android 11 behavior, real low-RAM performance or user accessibility. Follow the
[full Phase 03 manual checklist](../../qa/PHASE-03-MANUAL.md), recording reviewer,
model/API/RAM/ABI, app version/hash, timing, permissions and actual results.

1. **Install/open:** use the reviewed matching ARM64 dataQa APK without clearing
   storage. Verify its SHA256 against the final manifest. Enable airplane mode,
   turn Wi-Fi/data off, open LAFINA, and confirm earlier nickname/theme/items are
   preserved. Expect no account, microphone, phone-call or network prompt.
2. **Enable and receive:** Settings → Reminder delivery → enable Android delivery
   and explicitly grant notification access. Check channel sound/high importance.
   Keep full-screen off. Create a 15-second synthetic reminder, press Home and
   observe the real notification. Record delay or non-delivery; registration alone
   is not a pass, and inexact fallback may be delayed.
3. **Open/acknowledge:** tap the notification within its response window. Expect
   the clearly simulated native screen. Answer or Acknowledge/Dismiss, return to
   Settings and refresh: reminder/job ACKNOWLEDGED, linked task still TODO.
4. **Snooze/cancel/expiry:** a new reminder's Snooze 10 minutes must leave task
   TODO and create generation 2/PENDING. The old timeout must not consume it.
   Cancel a future synthetic item and expect no alert for its old identity. Leave
   another unanswered: after expiry expect MISSED, with no late ACK/snooze.
5. **Permissions and lock screen:** repeat notifications denied/granted, channel
   muted, exact denied/revoked/restored, full-screen in-app off/on and OS denied/
   allowed. Expect readable constraints and the same notification-opened shell;
   manual data controls remain usable. Check both locked and unlocked behavior,
   sound/vibration, DND/volume and the lock-screen privacy notice.
6. **Lifecycle and identity:** schedule two distinct reminders; handling one must
   not alter the other. Edit/cancel/complete a source before due and verify no
   stale action. Separately test process death, explicit Force stop/reopen, normal
   reboot/unlock with app unopened, and clock/timezone changes. Do not expect
   delivery while force-stopped or before credential storage unlock.
7. **Preferences and accessibility:** edit a preference and use hardware Back,
   another tab or harness entry. Keep editing retains it; discard restores saved
   values. Check light/dark/system, large text, TalkBack, keyboard and native shell
   action accessibility on the actual device.
8. **Finish safely:** remove only synthetic QA items, disable unwanted test
   delivery, restore connectivity/DND/clock/battery settings and record failures
   and NOT RUN cases. Do not erase the database or install a schema 1 downgrade.

Exact installation/launch and diagnostic commands:

```powershell
adb devices -l
Get-FileHash android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk -Algorithm SHA256
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
adb -s TEST_DEVICE shell getprop ro.product.model
adb -s TEST_DEVICE shell getprop ro.build.version.sdk
adb -s TEST_DEVICE shell getprop ro.product.cpu.abi
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone:reminders
# Explicit stopped-state scenario; reopen only when its test step requires it.
adb -s TEST_DEVICE shell am force-stop com.lafina.capstone
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

For reboot, schedule sufficiently far ahead, reboot through the phone's normal
power menu, unlock, leave LAFINA unopened and observe the actual result. For
Android SQLite instrumentation on a selected device, use the two reviewed QA/test
APKs and the runner command in section 3, or the documented
`:app:connectedDataQaAndroidTest` command. Tests use constrained synthetic database
files and do not reset the primary planner. Save only privacy-safe diagnostics.

## 7. Docs/ADRs changed

- [ADR-015: native reminder process, SQLite and recovery protocol](../decisions/ADR-015-native-reminder-delivery.md).
- [Native architecture/state diagrams and behavior](../phase-03-native-reminders.md),
  [overall architecture](../02-ARCHITECTURE.md), [decision log](../04-DECISION-LOG.md),
  [data/schema documentation](../phase-02-data.md), and [README](../../README.md).
- [Independent Antigravity audit verification](../audits/phase-03-independent-audit.md),
  [source review](../audits/phase-03-code-review.md),
  [legacy selection](../audits/phase-03-legacy-selection.md),
  [dependency provenance](../third-party/phase-03-provenance.md).
- [Physical QA](../../qa/PHASE-03-MANUAL.md),
  [requirements matrix](../../qa/REQUIREMENTS-MATRIX.md),
  [risk register](../../qa/RISK-REGISTER.md), and
  [execution checklist](phase-03-checklist.md).
- [Emulator measurement method](../benchmarks/phase-03-emulator.md), raw pilot
  JSON, APK/source identity manifests, captured native unit results and final
  integrity evidence linked above.

Antigravity's four low-severity source findings were confirmed and fixed. Its
host benchmark numbers match the recorded Phase 02 JSON; they do not establish
Android timing targets. Its description of BEGIN IMMEDIATE as blocking all
readers, interface declarations as runtime adapters, and a completed F-015
offline gate were qualified. Weekly counts depend on explicit inclusive endpoints;
a Recent Apps swipe is distinct from Force stop. The audit's embedded fix prompt
was treated as reference material; owner authorization remained Phase 03 only.

Graphify was unavailable. `npm run check:architecture` passed its actual AST/import
checks, and Mermaid diagrams document process/data/state ownership. No Graphify
execution or graph result is fabricated. The TypeScript check is not a complete
Kotlin dependency/correctness proof.

## 8. Open blockers and recommended next steps

1. **Acceptance gate:** physical phone validation remains incomplete. Test Android
   11/API 30 plus permission-relevant newer versions and a modest-RAM/OEM phone
   where available. Obtain actual reviewer outcomes before declaring the phase
   passed; current status remains AWAITING DEVICE VALIDATION.
2. **Reboot and stopped-state coverage:** emulator reboot and force-stop/reopen
   checks pass their stated assertions. Secure-lock phones, permission/OEM
   combinations and lengthy shutdowns remain unverified. Catch-up expires jobs
   more than 15 minutes overdue; do not infer recovery for all missed deadlines.
3. **Performance evidence:** run matched release-like old/new physical protocols,
   repeated lag/failure sampling, true cold startup, peak memory and battery.
   Small emulator samples and host SQLite timings do not settle these objectives.
4. **Platform limits:** validate inexact delay, notification/FSI revocation,
   Doze/OEM restrictions, sound/DND and concurrency/crash windows. The app cannot
   bypass Android Force stop; distribution eligibility and production signing
   remain separate release concerns.
5. **Scalability and provenance:** active native SQL materialization, growing
   receipts/history, experimental ARMv7, historical tooling advisories and legacy
   authorization details remain documented limitations. Do not imply they were
   resolved by this phase's queue limits or native build.

These are review actions and future proposals, not authorization to begin another
phase. **Phase 04 has not been started.**

## 9. Review decision

- [x] Final logged JS preflight, JVM native tests, reviewed native builds and
  emulator instrumentation pass their actual assertions.
- [x] Final emulator results, source hashes, APK inspection and benchmark manifests recorded.
- [ ] Required physical-device tests completed and human-confirmed.
- [x] No disallowed application scope, legacy mutation or next-phase work.
- [x] Report/evidence links and current source/APK hashes checked; see
  [integrity evidence](evidence/phase-03-integrity.txt).

**STATUS: AWAITING DEVICE VALIDATION**  
**STOPPED — awaiting explicit human approval for Phase 04.**
