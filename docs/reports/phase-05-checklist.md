# Phase 05 execution checklist

Approval: human user wrote `APPROVE PHASE 05` and authorized implementation of fast local TTS via `react-native-tts` and optional Gemini cloud TTS (2026-10-25).

Branch: `main`. Only `LAFINA-CAPSTONE` modified; `LAFINA` and `LAFINA-backend` remain untouched and read-only.

- [x] Read AGENTS.md, PHASE-05.md, report template, and legacy speech/TTS modules.
- [x] Verified zero Kokoro 82M ONNX model binaries (`kokoro-v0_19.onnx`, `af_bella.bin`, `cmudict.txt`) and zero ONNX runtime TTS synthesis.
- [x] Verified zero business dashboards, zero Gmail APIs/OAuth, zero study tools (Pomodoro, Flashcards, Study Notes, Meetings).
- [x] Implemented fast local TTS engine wrapper (`src/ai/tts/ttsService.ts`) with `initTTS`, `speakText`, `stopSpeaking`, `isTTSAvailable`, `selectOfflineVoice`, and compatibility helpers (`preCacheReminderAudio`, `deletePreCachedReminderAudio`).
- [x] Created lightweight native Android audio player (`android/app/src/main/java/com/lafina/capstone/LafinaAudioPlayerModule.kt`) using standard `MediaPlayer` and audio focus handling for Gemini cloud TTS WAV playback.
- [x] Registered `LafinaAudioPlayerModule` in `CapstoneBuildPackage.kt` and added Jest mock in `jest.setup.js`.
- [x] Preserved and verified cloud speech provider (`src/cloud/speechService.ts`, `src/scheduler/speechProvider.ts`) with automatic, graceful fallback to `react-native-tts` when offline or unentitled.
- [x] Verified non-blocking call UI: speech synthesis executes asynchronously during reminder calls in `IncomingCallScreen.tsx` and `CallAnsweredView.tsx` without blocking manual buttons (Acknowledge, Snooze 5m/10m, Decline).
- [x] Created comprehensive test suite (`__tests__/ai/phase05TtsAndCloudSpeech.test.ts`, 18 tests) and native Kotlin test (`LafinaAudioPlayerTest.kt`).
- [x] Full preflight pipeline verified: TypeScript strict PASS, ESLint PASS (0 warnings, 0 errors), Jest PASS (10/10 suites, 70/70 tests), Architecture AST guardrails PASS (131 modules).
- [x] Gradle Kotlin verification: `testDebugUnitTest` and `compileDebugKotlin` PASS (`BUILD SUCCESSFUL in 1m 21s`).
- [x] Authored Phase 05 completion report (`docs/reports/phase-05-report.md`).
- [x] Await human device validation and explicit approval before starting Phase 06.

**HUMAN REQUIRED / NOT RUN:** Physical device audio speaker playback via Android TextToSpeech engine, physical network latency test for `/v1/ai/tts` Gemini cloud synthesis. The phase is **READY FOR REVIEW** / **AWAITING DEVICE VALIDATION**.
