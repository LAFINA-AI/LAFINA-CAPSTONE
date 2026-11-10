# PHASE 09 follow-up — Local voice protocol and native audio verification

**Date:** 2026-11-09 Asia/Manila; emulator logs use 2026-11-08 GMT.  
**Branch / base:** `Lem-branch`, `f8f8101edd8439e9db998811e955e40144de6450`; existing working changes preserved.  
**Device:** `emulator-5554`, `Medium_Phone`, `sdk_gphone16k_x86_64`, SDK 37.  
**Status:** Local checks passed; **AWAITING DEVICE VALIDATION** for the real provider and physical phone.  
**Authorization:** Owner asked to test locally without the backend, then explicitly continued after a temporary approval-service usage failure. Existing microphone authorization applies. No new phase or backend activation was started.

## 1. Scope completed

Ran the real `VoiceConversationPanel`, `useVoiceConversation`, `VoiceConversationController`, native transport and `LafinaVoiceConversationModule` in a separate emulator package, **`com.lafina.capstone.localvoiceqa`**. The private QA entry injects a synthetic account gate, in-memory session API and persistence sink. A loopback WebSocket fixture supplies synthetic transcripts, replies, interruption events and 16 kHz PCM tones. Microphone frames are counted and immediately discarded without decoding or storage.

**No LAFINA backend, DeepSeek, ElevenLabs API, production database or provider key was used.** HTTP fetch is disabled in this QA entry. The app connects only to the fixture at `127.0.0.1:8766`, through one ADB reverse mapping. The QA banner identifies the synthetic provider. This verifies client protocol handling and real Android resource behavior; it does not validate semantic pause detection, speech recognition or ElevenLabs speech quality.

## 2. Change summary

- No product source was changed or fixed during this local test. Earlier memory/login working changes were retained.
- Added private fixtures and build helpers under ignored `.local/local-voice-qa-20261109/`; reviewed copies are in [evidence/harness](evidence/phase-09-local-voice-20261109/harness/).
- Added this report and its evidence. The earlier [call report](phase-09-call-emulator-report-20261109.md) now points at its preserved, hash-verified original APK because Gradle's shared output path was reused.
- No backend branch was modified, merged or deployed. The memory branch remains separate.

## 3. Tests and actual outcomes

| Check | Procedure / command | Outcome |
| --- | --- | --- |
| Focused controller/UI tests | `npx jest __tests__/cloud/voiceConversationController.test.ts __tests__/ui/voiceConversationUi.test.tsx --runInBand` | **PASS: 2 suites, 52 tests**, exit 0 |
| QA bundle | From physical `android` path, JDK 17: `./gradlew.bat :app:createBundleDataQaJsAndAssets --offline --no-daemon --max-workers=2 --console=plain -PreactNativeArchitectures=x86_64 -PlafinaApiBaseUrl=http://127.0.0.1:8000 --init-script ../.local/local-voice-qa-20261109/build.init.gradle` | **PASS**, 2m56s |
| Isolated APK | `.local/build-local-voice-qa.ps1`, using temporary `L:` alias and `assemble.init.gradle`; `:app:assembleDataQa`, same properties as bundle | **PASS**, 2m22s; fresh packaged bundle equals generated bundle; x86_64 package verified before launch |
| Installation | `adb -s emulator-5554 install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk` | PASS; separate package, no uninstall or data clearing |
| Provisional transcript | Start, inject `partial`, leave a three-second gap, inspect screen before final | PASS: partial words visible and status remains Listening; no final user persistence callback until final event |
| Final transcript | Inject `final` | PASS: replaces provisional words with one final turn; one user persistence callback |
| Provider interruption | Inject `interruption` while tone plays | PASS: returns to Listening, answer labelled interrupted, one interrupted persistence callback |
| Stop | Tap the real Stop button during a new tone response | PASS: playback-false event, Listening status, interrupted answer; fixture received one `user_activity` |
| Mute / Unmute | Tap controls and inspect Android recorder plus fixture counters | PASS: recording released while muted; counter **2072 → 2072** over four seconds; Unmute reopens 16 kHz recording and counter increases |
| End | Tap End | PASS: Conversation ended; empty current recording section and audio-focus stack; fixture socket closes |
| Background | Start again, press Home, return to app | PASS: stopped with background reason; recording/focus released; Start again required |
| Socket failure | Explicitly restart, fixture closes socket with code 1011 | PASS: connection-closed message; recording/focus released; no automatic restart during observation |
| Whitespace | `git diff --check` | PASS; only existing CRLF conversion notices |

The unchanged product checkout's full preflight and native JVM gate were already run in the preceding call follow-up: **75 suites / 1,139 Jest passes / 1 optional skip**, and **7 native suites / 51 tests**, with TypeScript, ESLint and architecture checks passing. See that [report and logs](phase-09-call-emulator-report-20261109.md). These broader gates were not repeated solely for an ignored fixture entry; the focused tests and actual QA build above were run fresh.

Evidence: [verification.json](evidence/phase-09-local-voice-20261109/verification.json), [focused tests](evidence/phase-09-local-voice-20261109/focused-tests.log), [bundle log](evidence/phase-09-local-voice-20261109/bundle.log), [build log](evidence/phase-09-local-voice-20261109/build.log), [QA lifecycle log](evidence/phase-09-local-voice-20261109/app-lifecycle.log), [fixture summary](evidence/phase-09-local-voice-20261109/provider-summary.json).

Screenshots: [partial words](evidence/phase-09-local-voice-20261109/provisional-after-pause.png), [final and speaking](evidence/phase-09-local-voice-20261109/final-and-speaking.png), [interrupted](evidence/phase-09-local-voice-20261109/interrupted.png), [Stop](evidence/phase-09-local-voice-20261109/stop-after-fast.png), [Mute](evidence/phase-09-local-voice-20261109/muted-fast.png), [End](evidence/phase-09-local-voice-20261109/ended-fast.png), [background](evidence/phase-09-local-voice-20261109/background-resumed.png), [connection failure](evidence/phase-09-local-voice-20261109/drop-after.png).

## 4. Artifact and measurements

- Installed package: `com.lafina.capstone.localvoiceqa`; standalone x86_64 QA fixture, **not a normal product build or phone APK**.
- APK: `android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk`; **147,890,515 bytes**.
- SHA-256: `e54dc7ba4a0aaf29aeabba803ef3dfafe301588b158055643c6c4a33e2eb8615`.
- Bundled JS SHA-256: `afc121e0bc1afcf978d36cb9117c5481fe29b20bad15a02e6236b68cf1dfbddc`.
- One Stop measurement: **32 ms** from controller Stop handling to native playback-false event. This excludes semantic detection, provider/network latency and acoustic output. It is not a performance benchmark or real interruption-latency claim.
- All three fixture sessions closed. Structured recording/focus snapshots and counters are in `verification.json`. No physical-phone, echo, intelligibility or routing measurement was run.

## 5. Reliability, privacy and deviations

The original `com.lafina.capstone.elevenlabs` app was neither reinstalled nor signed out, and its account data was not changed. No credentials were read. The synthetic entry has no HTTP access and keeps persistence callbacks in memory; production auth, cloud session security, real Chat durability and server quotas are outside this fixture's coverage.

The first QA build attempts failed because the React plugin was not yet registered, an included Gradle build lacked `:app`, and Metro mixed physical and short-drive paths. Test-only init scripts were corrected, the bundle was generated from the physical path, and APK assembly used that verified fresh bundle. An initial ASCII marker assertion failed because Hermes stores the QA banner as UTF-16; bundle identity and both marker encodings were subsequently verified. These were fixture/build setup issues, not product defects.

Automatic approval review temporarily failed because of a usage limit before the final-transcript action; that action was not executed then. After the owner continued, review worked and the action completed. Android hierarchy dumps later returned stale content, so fresh direct screenshots and native diagnostics were used for subsequent controls. No result relies on the stale dump.

The local helper was stopped, its `tcp:8766` mapping removed, and the temporary `L:` alias was absent. Android window focus confirmed return to the original `com.lafina.capstone.elevenlabs` app. No microphone session was left active by the fixture.

## 6. Manual verification still required

To repeat the local fixture: run `.local/elevenlabs-backend-work/.venv/Scripts/python.exe .local/local-voice-qa-20261109/provider.py`, add `adb -s emulator-5554 reverse tcp:8766 tcp:8766`, open the installed `com.lafina.capstone.localvoiceqa` app, then tap Start. Inject events with `python .local/local-voice-qa-20261109/control.py partial|final|interrupt|reply|drop` (choose one action per invocation). Verify provisional words remain provisional, interruption/Stop return to Listening, Mute releases capture, and End closes the session. The local fixture needs no backend. Copies of its source and hashes are included in the evidence.

For real validation, install a normal current ARM64 build on a physical Android phone and open Voice → Voice conversation (Online) after provider/backend activation. Speak, pause mid-sentence for 1–2 seconds, continue, then interrupt an answer. Expect one completed user turn, no premature reply, and prompt playback stop on interruption. Exercise Mute, Stop, End, background/lock, network loss, reminder preemption and speaker/headset routing. All real-provider semantic pause/recognition tests and all physical-phone checks remain **NOT RUN**. Use the [full manual checklist](../../qa/PHASE-09-VOICE-CONVERSATION-MANUAL.md).

## 7. Docs and architecture

This is a Phase 09 verification supplement to ADR-030 and the earlier call report. No architecture, silence threshold or production dependency was changed. No Graphify refresh was required for test fixtures and report artifacts.

## 8. Remaining limits

The local test is complete. Real ElevenLabs end-of-turn decisions cannot be established by injected transcripts: that detector runs at the provider. The separate online conversation backend remains unactivated, as recorded in [backend_integration/README.md](../../backend_integration/README.md). This local run does not require or authorize merging it, and does not change the memory-branch decision.

## 9. Review decision

- [x] Fresh focused tests and actual isolated Android build passed.
- [x] Native microphone/playback controls and teardown checked on the emulator.
- [x] No backend/provider used; original account and product source retained.
- [ ] Real-provider pause, speech and interruption detection validated.
- [ ] Physical-phone checks completed and human-confirmed.

**STATUS: AWAITING DEVICE VALIDATION**  
**STOPPED — awaiting explicit human approval**
