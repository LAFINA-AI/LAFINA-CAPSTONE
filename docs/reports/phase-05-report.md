# PHASE 05 — Android system TTS and output modes / Completion Report

**Implemented, installed and tested on the emulator; physical-phone validation pending.**
The rebuilt app passes the available automated gates and eight final emulator
UI/restoration checks. The five-preview callback pilot remains attributed to its
earlier APK. These are ADB-driven checks, not human listening or physical-device
acceptance. Failed build/test cohorts are retained below.

**Branch / base commit SHA:** `codex/phase-05-system-tts` / `b3eefb853be7c658a38186d330eb8aaf4be8eea2`  
**Date/time UTC:** 2026-10-25; rebuilt manifests06:47:45, restored device07:01:52; exact execution timestamps in logs/manifests (Asia/Manila UTC+8)  
**Device available:** `Medium_Phone`, API37 `sdk_gphone16k_x86_64` emulator, x86_64/16KiB pages, kernel MemTotal4,008,368KiB; physical phone NOT RUN  
**Status:** `AWAITING DEVICE VALIDATION`; physical-phone listening, focus, low-RAM and performance checks NOT RUN  
**Phase approval provenance:** owner explicitly answered **`APPROVE PHASE 05`** to beginning Android system text-to-speech while leaving physical-phone validation pending, received 2026-10-25 Asia/Manila. This does not certify earlier phone gates or authorize Phase 06.

Phase 04 is still uncommitted in this checkout. Its frozen
[111-file handoff manifest](evidence/phase-04-source-hashes-handoff.json) defines
the pre-Phase 05 source baseline; cumulative Git diff includes both phases.
No Phase 05 source edits occurred before the exact approval. No commit, push,
PR, deployment, legacy write, engine/model download or model distribution was
performed for this phase.

## 1. Scope completed

| Requirement | Implemented observable behavior | Acceptance boundary |
|---|---|---|
| F-011 | Android system `TextToSpeech` adapter initializes on demand, lists installed engines/voices, selects only voices reporting installed offline data, rechecks live voice before speech, exposes Stop and setup guidance, and releases resources on lifecycle loss. | Vendor metadata is a safeguard, not independent traffic proof. Actual airplane-mode audibility/quality on phone remains HUMAN REQUIRED. |
| F-012, canned output | Text remains default and visible in Text/Voice/Both. Manual task/event saves finish durably before optional canned speech; Chat offers fixed planner help rather than command execution. | Free-form scheduling interpretation, microphone/STT and model replies remain deferred. Accepted enqueue and callbacks are not proof the user heard speech. |
| F-007/F-008, output extension | The visible native simulated reminder optionally reads its canned message in Voice/Both, with Read/Stop/setup controls and text/action fallback. Its separate process reads existing local preferences. | Stop/focus loss does not ACK or complete a task. ACK still leaves the task TODO; phone alarm/audio interaction acceptance is pending. |
| F-002, compatible extension | Optional `tts` preferences store engine package, voice, exact language tag, rate and pitch in the existing settings payload. Old settings obtain defaults when absent. | No schema migration, second database, account or destructive settings rewrite. |
| F-015, phase-local boundary | No runtime network client, microphone permission, speech data download, Kokoro/ONNX payload, STT/inference dependency or backend is added. | The full Phases 01–08 offline gate and separately installed vendor-engine behavior remain unaccepted. |

The implementation is new capstone code using Android framework APIs. The
[selective pinned legacy audit](../audits/phase-05-legacy-tts.md) inspected exact
Kokoro bridge/service ranges at `f7e70aec54e6d16e627f444f2a67114cbfb07b5e`
through public GitHub blob reads when the local pinned object was unavailable.
No legacy source, cache/store coupling, spoken-content logs, model assets or
dependency tree was copied. Kokoro remains excluded; there is no traceable
matched-device runtime baseline to support a speed ratio.

No waveform caching is added: no measured storage/performance benefit justifies
a second synthesis/playback path. Schema remains **2**, settings payload version
remains **1**, and runtime dependency pins remain unchanged.

## 2. Change summary

| File/module | Change and reason | Test evidence |
|---|---|---|
| `android/.../voice/SpeechPolicy.kt`, `SystemSpeech.kt`, `SystemSpeechModule.kt` | Pure validation/selection/ticket rules, lazy Android ownership, JSON bridge, offline live-voice checks, focus, terminal callbacks, bounded replacement and shutdown. Init timeout 10s; accepted utterance timeout 60s; one active request; at most 200 content-free diagnostic events. | Final native build PASS; 12 speech-policy tests in the 42-test JVM suite PASS; API37 instrumentation 31 PASS. |
| `android/.../reminders/ReminderActivity.kt`, `ReminderStore.kt`, `CapstoneBuildPackage.kt` | Register the typed bridge; visible reminder speech uses the same policy and authoritative local reply/voice preferences without React in `:reminders`. | Native build, JVM policies and API37 store/platform instrumentation PASS. |
| `src/core/native/textToSpeech.ts` | Strict bounded bridge parsing, honest unavailable results, request/terminal event distinction and injectable client. Malformed/unsafe inventory cannot become speech success. | `textToSpeech.test.ts`, focused16 PASS. |
| `src/core/voice/ReplyMessage.tsx` | Keep written replies immediate; Text mode does not initialize speech; Voice/Both have cancellable optional output, stale-event guards and lifecycle disposal. | ReplyMessage16 + SpeechSettings15 = focused31 PASS. |
| `src/features/settings/SpeechSettings.tsx` | Installed offline voice/engine selection, explicit save, preview, rate/pitch, Stop, setup guidance and dirty-draft handling. Bounded paged voice choices; QA-only initialization metadata. | SpeechSettings15 PASS; current full preflight below. |
| `src/core/domain/preferences.ts`, `ports.ts` | Validate compatible optional speech configuration; defaults preserve old payload shape and future STT/intent ports remain unavailable. | Preferences/bridge and full strict type gates PASS. |
| `src/app/App.tsx`, `src/features/calendar/PlannerScreen.tsx`, `src/features/onboarding/PreferencesForm.tsx` | Speech settings route, guarded draft navigation, fixed planner-help reply and post-commit save confirmation, corrected available-feature wording. Emulator review exposed off-screen inline voice Back confirmation; a Modal now makes the keep/discard decision visible. | Pre-fix regression 1 FAIL/7 PASS; corrected AppSpeech suite passes in final preflight; full App/Planner coverage preserved. |
| `android/app/build.gradle`, main manifest, `scripts/check-architecture.mjs` | VersionCode5/0.5.0 build identity; Android11 TTS service visibility query; no new permission; validate offline/native boundaries. | 35-module AST check PASS; seven current APK identities/hashes/permissions recorded. |
| `metro.config.js` | Reduce host bundle worker parallelism following observed Windows commit-memory exhaustion. | Recovered build PASS; no app latency claim or sole-cause attribution. |
| Audit, ADR-018, provenance, README/architecture/traceability/risk/manual/report docs | Record implementation contracts, actual-versus-missing evidence, native lifecycle and physical reviewer steps. | Links, hashes and factual handoff checked in [final integrity](evidence/phase-05-final-integrity.txt). |

Actual emulator review found that Android Back from a modified voice draft
prevented navigation but placed the keep/discard confirmation inline outside the
visible scrolled region. The fix moves that decision into a dedicated Modal,
retaining the draft until an explicit discard and treating the dialog's Back as
stay. A regression requiring the visible Modal failed before the change and
passes in the verified suite. Only `App.tsx` and its test changed after the
initial callback pilot. The current emulator retest confirmed the dialog appears
without scrolling, Stay preserves the draft and Discard keeps saved options.
[Screenshot](evidence/phase-05-voice-back-confirmation.png) and the
[final UI ledger](evidence/phase-05-emulator-handoff.json) record that result.

## 3. Tests and real outcomes

| Check | Exact command/procedure | Result | Evidence |
|---|---|---|---|
| Strict TypeScript, ESLint, Prettier, Jest and architecture | `npm run preflight` | **PASS**, 263 tests/20 suites in 18.982s for the rebuilt source; strict/lint/format gates and architecture 35 TS modules pass. | [Verified preflight](evidence/phase-05-preflight-verified.log). Earlier [29.309s cohort](evidence/phase-05-preflight-final.log) remains historical. |
| Typed speech bridge | `npx jest __tests__/textToSpeech.test.ts --runInBand` | **PASS**,16 tests | [Bridge log](evidence/phase-05-bridge-tests.log). |
| Speech settings + visible reply behavior | `npx jest __tests__/SpeechSettings.test.tsx __tests__/ReplyMessage.test.tsx --runInBand` | **PASS**, 31 tests | [Focused UI log](evidence/phase-05-reply-tests.log). |
| App integration | `npx jest __tests__/AppSpeech.test.tsx --runInBand` | **PASS**,8 tests | [App speech log](evidence/phase-05-app-speech-tests.log). |
| Voice Back visibility regression, before fix | `npx jest __tests__/AppSpeech.test.tsx --runInBand` | **FAIL**, 1 failed/7 passed before the Modal fix; retained as regression evidence. Corrected suite passes in verified preflight. | [Pre-fix log](evidence/phase-05-navigation-regression-before.log). |
| Concurrent handoff preflight attempt | `npm run preflight` during build/test activity | **FAIL**, 262 passed/1 existing onboarding wait timed out; no clean gate inferred from it. Subsequent verified rerun passed all 263. | [Failed attempt](evidence/phase-05-preflight-handoff.log), [verified rerun](evidence/phase-05-preflight-verified.log). |
| Initial Kotlin compilation | `:app:compileDataQaKotlin` | **PASS** in initial cohort;2m13s. Does not certify later Stop-during-init fix or final APK. | [Initial compile](evidence/phase-05-kotlin-first.log). |
| First complete Android build | Gradle task group in command below | **FAIL**, Windows JVM/paging/commit-memory exhaustion before completed gates. | [First build](evidence/phase-05-android-build.log). |
| Reduced-memory Android retry | Same task group with reduced JVM heap/one Gradle worker | **FAIL**, native allocation/commit-memory error. | [Memory retry](evidence/phase-05-android-memory-retry.log). |
| Serial Android retry | Same group, 1GB SerialGC/in-process Kotlin, emulator temporarily closed, Metro worker cap 2 | **FAIL**, Metro transform processes reported out-of-memory; `:app:createBundleDataQaJsAndAssets` failed. | [Serial retry](evidence/phase-05-android-serial.log). |
| Native unit tests in handoff build | `:app:testDataQaUnitTest` | **PASS**, 42 tests across 4 suites, 0 failures/errors/skips; prior XML duration 0.118s reused by up-to-date task, native source unchanged since execution. | [Handoff JVM manifest](evidence/phase-05-jvm-results-handoff.json) preserves source XML timestamps/hashes; not a fresh timed test run or phone test. |
| Initial recovered APK build | Same Gradle task group | **PASS**, 3m51s; 320 tasks, 83 executed/237 up-to-date. | [Recovered build](evidence/phase-05-android-recovered.log), [initial artifacts](evidence/phase-05-artifacts.json), retained for the callback pilot. |
| Current handoff APK build | `:app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest` | **PASS**, 2m33s; 320 tasks, 27 executed/293 up-to-date. Debug/dataQa/release ARM64+x86_64 and test APKs available. | [Handoff build](evidence/phase-05-android-handoff.log), [seven handoff artifacts](evidence/phase-05-artifacts-handoff.json). |
| Current API37 instrumentation | `adb -s emulator-5554 shell am instrument -w com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner` | **PASS**,31 tests in4.265s on the installed rebuilt app. | [Handoff instrumentation](evidence/phase-05-instrumentation-handoff.log). Earlier31/12.642s [run](evidence/phase-05-instrumentation.log) is separate. Android Voice/JSON/store checks do not establish audibility. |
| Installed rebuilt emulator UI | Upgrade x86_64 dataQa with `adb install -r`, exercise actual UI with airplane1/Wi-Fi0/mobile0 | **PASS**,8 recorded checks: scrolled voice Back dialog; Text help; Voice help/Stop; Both/Home cancellation; manual task save; native reading/Stop/ACK; synthetic cleanup; final restoration. | [Final UI ledger](evidence/phase-05-emulator-handoff.json), [cleanup](evidence/phase-05-emulator-cleanup.json). Installed SHA verified: `8b06f7033a79f0837ba392d2c183d8eefbbbdb0baa78ace3b605b15890e99a21`. |
| Earlier emulator preview/preferences cohort | Fixed previews, explicit Stop, save options and force-stop/reopen | **PASS**,5 callback samples plus2 UI checks. | [Initial UI ledger](evidence/phase-05-emulator.json), [raw pilot](../benchmarks/phase-05-system-tts-emulator.json). Initial APK SHA `46e3e4acb863cf496429e286951f9000f941181a9fb1e6b537cca45a6119e0c5`; do not call these fresh final-APK samples. |
| Physical Android listening/focus/quality/low-RAM | [Manual checklist](../../qa/PHASE-05-MANUAL.md) | **HUMAN REQUIRED / NOT RUN** | No physical phone supplied. Mocks/instrumentation do not establish audibility. |

Reproduction command (adjust installed JDK/SDK paths, retain actual outcome):

```powershell
npm run preflight
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDebug :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' '-Dorg.gradle.jvmargs=-Xms64m -Xmx1024m -XX:MaxMetaspaceSize=384m -XX:+UseSerialGC -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=1 --no-daemon --console=plain
```

The earlier serial cohort failed and is retained above; the recovered cohort
completed the task group after host load/worker bounds were addressed. This is
host build recovery, not a product speed measurement or proof of a sole cause.
Do not clear app storage, replace a database or rewrite the baseline to bypass
testing.

## 4. Performance and device matrix

| Metric/condition | Actual result | Evidence/limit |
|---|---|---|
| Legacy pinned Kokoro first-audible cold/warm, PSS, energy/quality | **BASELINE NOT RUN** | No independently prepared/provenance-cleared pinned legacy APK or traceable measured control. |
| Initial APK system TTS initialization | **MEASURED emulator pilot**, n=5, p50=1148 ms, nearest-rank p95/max=1234 ms; zero recorded initialization/start failures. | [Raw callback cohort](../benchmarks/phase-05-system-tts-emulator.json), [method/limits](../benchmarks/phase-05-system-tts.md). New client each trial; vendor service not forcibly stopped. |
| Initial APK native request→`onStart` | **MEASURED emulator pilot**, n=5, p50=254 ms, nearest-rank p95/max=342 ms. | Separate post-initialization native interval; not UI request→audibility, not a cold vendor-service or physical-phone result. |
| Stop/Home/reminder cancellation on emulator | **OBSERVED**, written fallback/actions preserved; no acoustic stop duration measured | Final Voice/Both/reminder UI checks and initial preview Stop. Rapid concurrent/replacement races covered by injected/pure tests; physical rapid-response/focus checks still HUMAN REQUIRED. |
| Ready-idle emulator PSS snapshot, current dataQa | Main109,589 KiB; cached reminder process43,308 KiB; Google TTS148,142 KiB | [Raw snapshot](../benchmarks/phase-05-memory-snapshot.json), one sequential snapshot after inventory, no utterance playing. This is debuggable emulator data, not release-phone memory or a synchronized peak. |
| Physical request→first audible speech, language fidelity and quality | **NOT RUN / HUMAN REQUIRED** | Engine callback is not audible speaker evidence. |
| App + actual engine peak PSS, cold/warm service conditions, battery | **NOT RUN** | A snapshot would not be peak; force-stopping only capstone would not prove a cold vendor service. |
| Matched Kokoro/system comparison | **NOT RUN** | No speedup, lower-memory, quality or superiority claim. |
| Phase 05 current APK size/hash | **MEASURED file metadata**, seven handoff artifacts | [Handoff artifact manifest](evidence/phase-05-artifacts-handoff.json) records bytes, SHA-256, version, ABI and permissions; not installed size or runtime memory. |

The initial [five-sample callback JSON](../benchmarks/phase-05-system-tts-emulator.json)
remains frozen to its original APK/source cohort. The current
[123-file handoff source/config manifest](evidence/phase-05-source-hashes-handoff.json) records
13 changed and 12 added files against the Phase 04 cohort; documentation/evidence
are outside that source scope. The [handoff artifact manifest](evidence/phase-05-artifacts-handoff.json)
and [handoff JVM manifest](evidence/phase-05-jvm-results-handoff.json) bind actual files/logs to
the successful current build. Only `App.tsx` and its AppSpeech test changed from
the initial speech cohort; native speech/bridge/SpeechSettings code is unchanged.
The five older samples are not presented as fresh measurements of the rebuilt
APK. Static legacy LFS payload arithmetic 319.39 MiB in the audit is
neither APK size nor runtime performance. Caching remains unimplemented because
there is no measured benefit to justify its storage/ownership complexity.

| Review APK | Actual bytes / MiB | SHA-256 |
|---|---:|---|
| ARM64 dataQa, 0.5.0-data-qa | 50,981,826 / 48.62 | `c1a13fa978b1697643544c089c4242198191d833974f256cc875c2303a45cfa9` |
| x86_64 dataQa, 0.5.0-data-qa | 50,502,150 / 48.16 | `8b06f7033a79f0837ba392d2c183d8eefbbbdb0baa78ace3b605b15890e99a21` |
| ARM64 release, 0.5.0-preview | 27,471,801 / 26.20 | `69d600228f6f73fe82615f58b2b44e65728b36f08f452ec662c1a67cca8fed81` |
| x86_64 release, 0.5.0-preview | 27,830,085 / 26.54 | `34c9aa3dfd05ccd77cd597e5bbb5a0680584dc519100159b3dc13927f48d2be5` |

These are local development-signed files, versionCode 5. The manifest also records
both debug APKs and the 875,734-byte instrumentation APK, including their hashes.
MiB uses 1,048,576 bytes. None of these values certifies installation, audible
speech, peak memory or publication readiness.

## 5. Reliability, privacy, permissions, licenses

Offline selection requires exact language, an installed non-network voice and
successful live verification before every utterance. Missing voices, engine
errors, focus denial/loss, timeouts and Stop leave text/manual actions usable.
The one active request is replaced rather than queued indefinitely; late
initialization/callbacks cannot revive cancelled playback. The reviewed
Stop-during-initialization generation guard is present and its pure JVM
regression passed in the final suite. Actual installed engine cancellation
still requires the separate emulator/phone checks.

The TTS service visibility declaration is a manifest query. Current bundled
dataQa/release APK metadata confirms notification/exact/full-screen/boot/vibration
permissions and the generated non-exported-receiver permission, with no INTERNET,
microphone, telephony or foreground-service permission. Debug additionally has
INTERNET and developer overlay permissions; it is not the offline bundled review
artifact. The test APK declares REORDER_TASKS. See actual
[permission metadata](evidence/phase-05-artifacts-handoff.json). Separately installed speech
engines have independent permissions and may receive updates. Their metadata
and requested package labels do not prove bound-service identity or zero traffic.

No voice/model binaries, cache files, private audio or legacy code were copied.
[Provenance](../third-party/phase-05-provenance.md) records Android platform use
and unchanged dependency pins. Earlier dependency advisories and pending
source/brand attribution details remain open; passing preflight is not a fresh
security audit or public distribution approval. Development-signed review APKs
must not be published.

Diagnostics retain only bounded request identifiers, monotonic milestones,
engine/voice metadata and outcome codes, without student speech content. Output
caps do not bound the vendor's initial voice-set allocation. No background speech
service or microphone is introduced. Reminder ACK remains separate from task
completion and audio stop. Existing Android force-stop, permission, alarm-grace
and OEM limitations remain unchanged.

## 6. Human phone verification

Full steps and a results table are in [PHASE-05-MANUAL.md](../../qa/PHASE-05-MANUAL.md).
Use a dedicated Android11+ ARM64 phone where possible, especially a2–3 GB device;
no RAM floor is certified. Upgrade the confirmed current build with:

```powershell
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Record the APK hash, general model/API/RAM/ABI and original voice/mode/radios/
reminder settings privately. Do not uninstall or clear existing data.

1. In airplane mode with Wi-Fi/mobile data off, open **Settings → Offline speech
   settings**, refresh voices and explicitly play the fixed preview. Hear the
   full phrase in the selected language. Missing voice must show guidance with
   usable text; no automatic voice download is expected.
2. Preview speed/pitch, save and reopen to verify persistence. Press Stop during
   initialization and playback; navigate/Home and rapidly replace previews.
   No stale speech or hidden backlog should restart later.
3. Save Text, Voice and Both in general preferences. Use **Chat → Show planner
   help** and save a synthetic task. Written confirmation remains visible
   immediately after durable save in every mode. Only Voice/Both automatically
   request the associated spoken reply; explicit preview can speak in Text.
4. Enable native reminder delivery deliberately, create a synthetic timed task
  2–3 minutes ahead with lead 0 and open its due notification/simulated screen.
   Hear optional visible reminder reading; Stop must not ACK/complete. ACK must
   leave task TODO; explicit completion and Snooze remain independent.
5. Test missing/unsupported voice and a real consenting incoming phone call or
   competing audio. Expect readable fallback/focus cancellation and functioning
   planner controls. Check speaker/headset/Bluetooth and lock/Home separately.
6. Record calibrated physical first-audible samples and app/engine memory/energy
   only under the defined matched protocol. Callbacks/stopwatch impressions do
   not establish millisecond audibility or peak PSS. Restore all original
   settings and remove only synthetic test items/alerts.

The agent cannot certify human hearing, physical interruption/OEM behavior,
low-RAM performance, power or matched legacy comparison from emulator/UI tests.
No physical checklist row is passed by this report.

## 7. Docs/ADRs changed

- [ADR-018](../decisions/ADR-018-system-tts.md): ownership, bridge/preference
  contracts, selection trust boundary, bounded work and callback semantics;
  includes Mermaid implementation diagram.
- [Legacy TTS audit](../audits/phase-05-legacy-tts.md) and
  [provenance](../third-party/phase-05-provenance.md): exact inspected sources,
  excluded cache/model path, missing baseline and licensing boundary.
- [Callback pilot method](../benchmarks/phase-05-system-tts.md) and
  [five raw samples](../benchmarks/phase-05-system-tts-emulator.json): initial
  APK attribution, new-client/warm-service distinction and limits on audibility
  or physical performance claims.
- [README](../../README.md), [architecture](../02-ARCHITECTURE.md),
  [decision register](../04-DECISION-LOG.md),
  [requirements matrix](../../qa/REQUIREMENTS-MATRIX.md),
  [risk register](../../qa/RISK-REGISTER.md),
  [phone guide](../../qa/PHASE-05-MANUAL.md) and
  [execution checklist](phase-05-checklist.md) record current status and limits.

`npm run check:architecture` actually passed35 TS modules in the reviewed cohort.
It checks cycles, offline imports and main manifest/process boundaries. The
Mermaid diagram is authored documentation, not generated source coverage.
**Graphify Phase 05 availability:** freshly checked CLI absent, recorded in
[availability evidence](evidence/phase-05-graphify.json). The executed AST cycle/
dependency check and ADR Mermaid diagram are the documented substitute. This
does not claim Graphify analysis ran. [React review](../audits/phase-05-react-review.md)
records the initial static-review limitation and the later emulator-discovered
visibility defect and correction.

## 8. Open blockers and recommended next steps

The [cleanup record](evidence/phase-05-emulator-cleanup.json) verifies the installed
hash, Text reply mode, reminder delivery OFF, full-screen preference OFF and zero
pending/ringing/registered/failed jobs. Airplane0/Wi-Fi1/mobile1 were restored.
Only the new manual-save task and new synthetic alarm were deleted; prior data
and theme/timezone/lead/snooze/quiet hours were preserved. The new optional voice
selection remains saved as Google `en-US-language`, `en-US`, rate1/pitch1; that
field did not exist before Phase05. The app is left open in Chat with fixed help.
Native reminder QA used the existing harness title “Phase03 synthetic alarm”; it
was a newly created Phase05 fixture, not a stale historical alarm. Its real due
job reached the visible screen, displayed the reading callback, accepted Stop
and then ACK, while its task stayed TODO. [Screenshot](evidence/phase-05-native-reminder-reading.png).

Remaining review items:

1. Physical airplane-mode audibility, output modes, missing voice, focus/call
   interruption, quality and low-end behavior require the owner's recorded
   validation. Current approval expressly leaves those checks pending.
2. Peak/energy/cold-service/first-audible measurements remain NOT RUN. The idle
   emulator PSS snapshot does not satisfy a low-end phone memory target. A vendor
   service may retain its own process after client shutdown; no force-kill is used.
3. Matched legacy/new timing/memory/energy needs a separately prepared,
   provenance-approved baseline; retain NOT RUN until available. Do not modify
   the legacy checkout or download binaries to invent a control.

These are Phase 05 review items. No Phase 06 STT, microphone, model integration,
intent commands, online Gemini or handbook work is started or approved.

## 9. Review decision

- [x] Final automated gates:263 JavaScript tests,42 JVM tests, current APK builds
      and31 current-build API37 instrumentation tests pass.
- [ ] Manual device tests completed and human-confirmed.
- [x] No disallowed application scope or legacy write introduced by Phase 05.
- [x] Final report evidence, artifact/source integrity, links and cleanup verified.

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval for Phase 06.**
