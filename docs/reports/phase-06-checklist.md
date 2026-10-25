# Phase 06 execution checklist

Approval: human user wrote `APPROVE PHASE 06` and authorized implementation of Push-to-Talk Offline STT (`whisper.cpp` + `silero_vad.onnx`) (2026-10-25).

Branch: `main`. Only `LAFINA-CAPSTONE` modified; `LAFINA` and `LAFINA-backend` remain untouched and read-only.

- [x] Read `AGENTS.md`, `phases/PHASE-06.md`, report template, and legacy speech capture modules in `LAFINA`.
- [x] Verified zero Kokoro 82M ONNX model binaries (`kokoro-v0_19.onnx`, `af_bella.bin`, `cmudict.txt`) and zero ONNX runtime TTS synthesis.
- [x] Verified zero business dashboards, zero Gmail APIs/OAuth, zero study tools (Pomodoro, Flashcards, Study Notes, Meetings).
- [x] Migrated native `whisper.cpp` C++ tree and CMake build setup to `android/app/src/main/cpp/`.
- [x] Added JNI export bindings for `Java_com_lafina_capstone_LafinaWhisperBridge_...` in `android/app/src/main/cpp/whisper_jni.cc`.
- [x] Bundled verified offline student speech models in `android/app/src/main/assets/models/`:
  - `ggml-tiny.en-q5_1.bin` (32,166,155 bytes, Whisper tiny.en Q5_1).
  - `silero_vad.onnx` (1,289,603 bytes, Silero VAD v4 16kHz).
- [x] Configured `android/app/build.gradle`:
  - Added `aaptOptions { noCompress "onnx", "bin" }` for zero-copy memory-mapped asset access.
  - Added `externalNativeBuild { cmake { path file("src/main/cpp/CMakeLists.txt"); version "3.22.1" } }`.
  - Added `implementation("com.microsoft.onnxruntime:onnxruntime-android:1.19.2")`.
  - Resolved `splits.abi` conflict by removing duplicate `ndk.abiFilters` in `defaultConfig`.
- [x] Created `android/app/src/main/java/com/lafina/capstone/LafinaSpeechToTextModule.kt`:
  - `LafinaWhisperBridge`: loads `lafina_whisper` and declares JNI external methods.
  - `SileroVadProcessor`: handles VAD speech boundary detection using `models/silero_vad.onnx`.
  - `LafinaSpeechToTextModule`: implements `startListening`, `stopListening`, `cancelListening`, `transcribe`, `isAvailable`, `release`.
  - Explicit microphone permission check (`Manifest.permission.RECORD_AUDIO`).
  - 60-second inactivity auto-unload mechanism (`INACTIVITY_UNLOAD_TIMEOUT_MS = 60_000L`) that frees Whisper context and closes the ONNX runtime session when microphone is idle to conserve RAM and battery.
- [x] Registered `LafinaSpeechToTextModule` in `CapstoneBuildPackage.kt` and mocked in `jest.setup.js`.
- [x] Created JS STT service in `src/ai/stt/sttService.ts` and `src/ai/stt/index.ts` with `isSTTAvailable`, `ensureMicrophonePermission`, `startListening`, `stopListening`, `cancelListening`, `transcribeUtterance`, `addSpeechListener`.
- [x] Exported STT APIs from `src/ai/index.ts`.
- [x] Migrated `VoiceModal.tsx` in `src/ui/components/VoiceModal.tsx`:
  - Push-to-talk hold-down button with animated pulse ring (`pulseAnim`).
  - 11 animated waveform bars (`waveBars`).
  - Live speech transcription cards responding to `onSpeechPartialResult` and `onSpeechFinalResult`.
  - Text input fallback (`TextInput` + send button).
  - Error shake animation on silence/failure (`shakeAnim`).
  - Student scheduling and note commands (adds tasks, notes, completes tasks).
- [x] Wired `VoiceModal` into `App.tsx` replacing the Phase 01 placeholder modal, triggered by the central Mic button in `CustomTabBar`.
- [x] Verified `IncomingCallScreen.tsx` speech listeners for voice call responses.
- [x] Created Kotlin unit test suite in `android/app/src/test/java/com/lafina/capstone/LafinaSpeechToTextTest.kt`.
- [x] Created comprehensive Jest test suite in `__tests__/ai/phase06SttAndVoiceModal.test.tsx` (14 tests).
- [x] Full preflight pipeline verified: TypeScript strict PASS, ESLint PASS (0 warnings, 0 errors), Jest PASS (11/11 suites, 84/84 tests), Architecture AST guardrails PASS (134 modules).
- [x] Gradle verification: `compileDebugKotlin` and `testDebugUnitTest` PASS (`BUILD SUCCESSFUL in 37s`).
- [x] Authored Phase 06 completion report (`docs/reports/phase-06-report.md`).
- [x] Await human device validation and explicit approval before starting Phase 07.

**HUMAN REQUIRED / NOT RUN:** Physical device microphone recording audio stream, physical device Whisper C++ inference on arm64-v8a hardware, voice response during incoming simulated call on physical handset. The phase is **READY FOR REVIEW** / **AWAITING DEVICE VALIDATION**.
