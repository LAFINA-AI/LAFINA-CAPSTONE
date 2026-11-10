# AGY-PORT 10: compatible speech controls and readiness

Implementation: CODE_COMPLETE (Android on-device recognition and TTS engine choice deferred; see below)

Automation: PASS. Build: PASS (native unchanged). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: `agy-port-20261106`, 2026-11-06T08:0xZ–08:1xZ
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: base `fcdf235` (the AGY-PORT 09 result `ab6ab12` plus its index commit) / tested `fcdf235+worktree`
Phase result commit: recorded in RUN-STATE.json and the run log after commit (no self-referential SHA)
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), plus the owner's resume prompt of 2026-11-06.
Inventory areas / prerequisites: 17, 18, 19. Prerequisites 05 and 09 (`ab6ab12`) are committed.
Decision record: [ADR-022](../../../decisions/ADR-022-offline-voice-rate-provider.md).

## Outcome in plain language

**Profile → AI & Voice → Offline Voice** is a new sheet for speech made on the phone without the internet.

- **Engine state:** whether the speech engine is ready, unavailable, or did not respond.
- **English state, shown separately:** an offline English voice is installed, none is installed, or unknown.
- **Voice:** Automatic (the default), or one of the voices Android positively reports as installed and offline. Network and download-needed voices are never listed, and nothing is downloaded.
- **Speed and pitch:** each from 0.5× to 2.0× in 0.25 steps.
- **Buttons:** Preview, Stop, Reset to defaults and Refresh. The sheet re-checks voices when the student returns from Android settings.

**With no choice, nothing changes.** The voice is picked automatically as before, and the app never sends a speed or pitch, so the engine's own settings apply.

**Student Pro cloud speech is unchanged:** the same entitlement, consent and timeout rules, and the same automatic local fallback. The local fallback now uses the student's chosen offline voice and speed.

**Speech is more robust:**

- **Engine start:** bounded to 5 s. A late answer is ignored, and the next use retries.
- **Ending an utterance:** a speech request Android rejects (for example, audio focus denied) fails at once instead of waiting out the safety timeout. A late "finished" event from an earlier utterance can no longer end the current one.

**Preview plays the saved choice and acts on its own utterance only:**

- **Refused** while anything else is speaking, while the microphone is in use, or while a meeting is recording.
- **Stopped** by leaving the app or closing the sheet, which ends only the Preview.
- **Calls take priority:** a reminder call still stops all speech, as before.

**Typing and on-screen text are unaffected,** whatever the speech state.

## Characterization (before this phase)

- **Speech-to-text:**
  - Whisper + VAD (`LafinaSpeechToTextModule`) is the only recognizer, behind the AGY-PORT 05 capture slot and native lease.
  - There is no Android `SpeechRecognizer` path.
- **Local TTS:**
  - `react-native-tts` 4.1.1 with an automatic en-US-first installed voice. The automatic pick accepts any voice whose metadata does not say otherwise.
  - Speed and pitch are never set, so the engine's own apply.
  - The engine start was unbounded.
- **Cloud TTS (`createCallSpeechProvider`):**
  - Gemini is used only when the local user role is `student_pro`, the device is online, and a session token belongs to the same account. There is one role refresh and one deferred-link attempt.
  - Timeouts: 17 s for playback and 22 s for preparation. Cancellation goes through sequence numbers and abort controllers, and WAV files are deleted after use.
  - Any failure falls back to `speakTextWithTts`.
  - Admin and other roles get local speech only, because entitlement is `student_pro` only.

  None of this was changed. The existing `phase05TtsAndCloudSpeech` suite still passes unmodified.

## Spec checklist

| Item | Result |
|---|---|
| 1. Characterize and preserve Whisper default, neutral TTS, entitled cloud speech | Done; all paths unchanged; preserved suites pass unmodified |
| 2. Versioned owner-scoped offline voice prefs, choice, speed/pitch, reset, Preview/Stop; positive offline verification; default kept | Done (`speechSettingsStore`, `ttsService`, `speechPreferences`, `OfflineVoice.tsx`). Voice choice is within the system default engine; engine choice deferred (ADR-022) |
| 3. Map speed to react-native-tts 4.1.1 | Done: `setDefaultRate(f, true)` bypasses the wrapper's 0..1 transform (source read; ADR-022) |
| 4. Bounded init/readiness, service vs English, late callbacks retired, owned Preview/Stop, no cross-session stop | Done |
| 5. Optional Android on-device STT | **Deferred** (no native bridge in AGY; new Kotlin needs device validation). Whisper stays default on every version |
| 6. Tests | 21 new tests (below); preserved speech/call/meeting suites pass |

## Provenance and compatibility

**Donor:** LAFINA `0d4bbe39` (`speechEngineStore` `8febdf38`, `SpeechEngines.tsx` `4fa02428`, `speechReadiness.test.ts` `0257b75e`). What was carried over, and how:

- **Kept:** the ideas of a versioned per-account record, the 0.5–2.0 bounds, a neutral reset, owner-checked saves, a Preview limited to the saved choice, and bounded readiness.
- **Rewritten for AGY:**
  - The store has no Kokoro and no recognition choice, and adds a revision.
  - Playback, probing and readiness use the pinned `react-native-tts` instead of the donor's `LafinaAndroidSpeech` bridge.

**Not copied:** the Kokoro default, the donor native bridge, provider-package switching, and Android recognition.

**Compatibility:**

- No schema, sync payload, native or backend change.
- `ttsService` keeps every existing export and behavior. It adds `eligibleOfflineVoices`, `configureTts`, `readTtsReadiness`, `isSpeechBusy`, `stopOwnedSpeech`, `startOwnedSpeech` and a test-only reset.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF01 Accounts/auth | PASS | preflight | PASS | Live NOT_RUN |
| PF02 Subscriptions/entitlements | PASS | preflight (`phase05TtsAndCloudSpeech` unchanged: student_pro-only Gemini, fallback) | PASS | Live cloud TTS NOT_RUN |
| PF03 Guest linking | PASS | preflight; new guest-link voice test | PASS | Device NOT_RUN |
| PF08 Meetings/recording | PASS | preflight (`phase09OnlineDocsAndMeetings` unchanged); Preview refuses while recording | PASS | Device NOT_RUN |
| PF09 Speech (STT/TTS) | PASS | preflight (`ttsService`, `phase06SttAndVoiceModal`, `agyPort05SpeechCapture`, `agyPort05CallBusyMic`, `callDispatcherAndCallScreen` unchanged) | PASS | Audibility NOT_RUN |
| PF10 UI/navigation/settings | PASS | preflight; new Profile row test | PASS | Intentional: Offline Voice row in AI & Voice |
| PF11, PF12 | PASS | preflight | PASS | Untouched except error states |
| PF04–PF07, PF13 | PASS | preflight (full suite) | PASS | Untouched |

## Commands and evidence

Evidence folder: `evidence/agy-port-20261106/phase-10/`.

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| ~08:0xZ / checkout | `npm run preflight` | fcdf235+worktree | exit 0; 38 suites, 545 passed + 1 skipped; architecture PASS (215 modules) | `preflight-1.log` |
| ~08:0xZ / `X:\android` | `gradle-x.ps1 … testDebugUnitTest assembleDebug` | fcdf235+worktree | exit 0; BUILD SUCCESSFUL, 9 executed / 362 up-to-date | `gradle-unit-assemble-1.log` |
| ~08:0xZ / checkout | `python mutate10.py` (run 1, then an unintended identical rerun) | fcdf235+worktree | M2–M10 killed; **M1 survived** (test gap); **M11 harness error** (orphan `else`, suite ran 0 tests, misreported as SURVIVED) | `mutation-checks-1.log` |
| ~08:1xZ / checkout | `python mutate10.py` (run 2) | fcdf235+worktree | M1–M11 killed; all restored byte-identical | `mutation-checks-2.log`, `mutate10.py` |
| ~08:1xZ / checkout | `npm run preflight` (final, after the strengthened test) | fcdf235+worktree | exit 0; 38 suites, 545 passed + 1 skipped; architecture PASS | `preflight-2.log` |

**Evidence honesty.**

- My first harness fix failed to apply, and the `;` chain then reran the unchanged harness on the unchanged tree. That rerun overwrote `mutation-checks-1.log` with the same result, so nothing different was lost.
- This is the same slip as in Phase 09. Patch steps are no longer chained to runs.
- The test-data change (one voice that is offline but has no install flag) was made before preflight-2.
- **No query plans:** there are no new SQL reads beyond primary-key `local_settings` lookups.

| Mutation | What it broke | Killed by |
|---|---|---|
| M1 | A voice with no install flag is treated as installed | "lists only voices…" (after test data fix) |
| M2 | A default install receives neutral rate/pitch calls | "keeps AGY's default exactly…" |
| M3 | Speed sent through the wrapper's 0..1 transform | "applies an explicit choice…" |
| M4 | Engine start unbounded | "bounds a hung engine start…" |
| M5 | Another utterance's late event ends this one | "a late event for another utterance…" |
| M6 | Preview Stop stops another session | "Stop with a Preview token…" |
| M7 | Preview allowed while the microphone is held | "refuses while speech…" |
| M8 | A hung recording check counts as not recording | "refuses while speech…" |
| M9 | Guest link overwrites the account's choice | "guest link keeps…" |
| M10 | Out-of-range speed saved | "defaults to no explicit choice…" |
| M11 | Preview keeps playing after leaving the app | "…stops only its own Preview…" |

**Counts:** 524 tests before this phase and 545 after: 21 new, none removed, no existing test changed.

## Native, performance and device facts

- **Native:** no Android file changed (`git diff --stat HEAD -- android` is empty). Gradle unit tests and `assembleDebug` pass.
- **Wrapper:** react-native-tts 4.1.1. Its Android source was read for the rate transform, status codes, voice metadata, utterance ids and `setDefaultEngine`.
- **Timing:** none measured.
- **Device:** none used. Audible speech, voice quality, accent, the real voice list, audio focus, interruption by calls, and the meeting-recording check on a phone are all NOT_RUN.

## Review findings and decisions

The parent self-reviewed the full Phase 10 diff on 2026-11-06. No independent reviewer was used.

1. **A rejected `Tts.speak` was unhandled (fixed).** It used to hang until the length-based timeout. It now fails at once, so callers fall back to text.
2. **The engine-switch risk (deferred, not done).** `setDefaultEngine` destroys the shared engine. Offering it would let Profile cut off a ringing reminder call's speech.
3. **Remaining risks.**
   - Identical queued texts share an Android utterance id (a wrapper limitation; see ADR-022).
   - The automatic default still accepts voices with missing metadata, as before. Only explicit choices are strict.
   - A Preview that a call interrupts reports "stopped".

## Manual checklist still needed

1. **Install/open:** build the debug app from the Phase 10 commit and run it with Metro. Turn on airplane mode for steps 1–5.
2. **Actions:**
   1. **Readiness:** Profile → AI & Voice → Offline Voice. Check the engine and English rows.
   2. **Default:** without choosing anything, run Test TTS Voice.
   3. **Choice:** pick a listed voice, tap Faster twice and Higher once, then Preview. While it plays, tap Stop.
   4. **Busy:** start dictation in the voice sheet, then try Preview. Start a meeting recording, then try Preview.
   5. **Reset:** tap Reset to defaults, then run Test TTS Voice again.
   6. **Missing voice:** in Android settings remove or disable the chosen voice's data, return to the app and Refresh.
   7. **Cloud:** turn airplane mode off. With a controlled Student Pro account, run Test TTS Voice, then repeat offline.
   8. **Call:** let a reminder call ring while a Preview plays.
3. **Expected:**
   1. **Readiness:** "Ready" and "Offline English voice installed". Only installed offline English voices are listed.
   2. **Default:** sounds as before this phase.
   3. **Choice:** Preview is audibly faster and higher, and Stop ends it at once.
   4. **Busy:** both are refused with the matching message.
   5. **Reset:** the original voice and speed.
   6. **Missing voice:** the voice is no longer listed, "not installed now" is shown, and speech uses the automatic voice.
   7. **Cloud:** online, it says Gemini. Offline, it says native offline TTS with the chosen voice.
   8. **Call:** the call's speech starts, and the Preview reports stopped.
4. **Current execution status:** NOT_RUN. No device or live service was used. This is MANUAL-QA M14.

## Deferrals and continuation

- **Android on-device speech recognition:** deferred. A new native bridge under the microphone lease is needed, with device validation on Android 12+ and confirmation that nothing is downloaded silently.
- **TTS engine (provider) choice:** deferred until it can switch engines without cutting off a live call.
- **DEFERRED_EXTERNAL:** none new.
- **Continuation:** NEXT_PHASE (AGY-PORT 11) under the owner's unattended authorization.
