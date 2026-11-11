> **Online Voice Migration (2026-11-07):** [ElevenLabs setup and backend-owner handoff](backend_integration/README.md). DeepSeek powers online chat responses; offline voices remain native on-device (`react-native-tts`). Production speech endpoints are deployed on `LAFINA-backend` (`https://lafina-backend.vercel.app`) with automatic local TTS fallback.
>
> **Lem-Branch Integration:** [Lem-branch integration report](docs/plans/lem-integration/REPORT.md) records the merged Whisper runtime model warmup, personalized ML reminder timing advisor, screen rendering optimizations, audio ducking, and personal memory stores.

# LAFINA-CAPSTONE

**Android-first, offline-first personal academic AI secretary for university students.**

LAFINA-CAPSTONE is built around zero-barrier offline onboarding, student task and calendar scheduling, durable native Android reminder alarms with simulated voice reminder calls, push-to-talk on-device speech recognition, fast local text-to-speech, and optional bidirectional cloud synchronization with citation-backed USTP Student Handbook RAG.

---

## 1. Current Implementation Status

**Status:** **Feature-Complete Milestone (Phases 01–10 + Lem-Branch Integration & Phase 09 ElevenLabs Speech Provider Migration)**  
* **Package Version:** `1.3.4`  
* **Android Release Version:** `0.6.0-preview` (versionCode `6`)  
* **Preflight Pipeline:** `npm run preflight` PASS (84/84 Jest test suites, 1,212 unit tests, TypeScript strict, ESLint 0 warnings, 259 modules verified by AST architecture guardrails).  
* **Android 15 Compatibility:** Verified 16 KiB ELF alignment across all 16 bundled native `.so` libraries (`ONNX Runtime 1.22.0`).

---

## 2. Core Feature Matrix

### Student UI/UX & Design System (`src/ui/`)
* **Visual Shell:** Multi-strand procedural bezier spline splash (`SynthSplash`), hardware-accelerated OpenGL grain-gradient backdrop (`AuthBackdrop` + `LafinaGrainientView.kt`), and circular theme reveal animations.
* **Onboarding & Auth:** Frictionless guest onboarding (`local_guest_user`) with zero barrier to entry, plus optional authenticated student cloud accounts (`student`, `student_pro`, `admin`).
* **Design Tokens:** Centralized theme system (`Colors`, `Fonts`, `FontSize`, `Spacing`, `Layout`, `Shadows`, `useThemedStyles`, `useTheme`) supporting dark, light, and system themes.
* **Navigation:** `CustomTabBar` with animated tab transitions and floating action button modal triggers.

### Academic Calendar & Notes Workspace (`src/ui/screens/calendar/`, `src/ui/screens/notes/`)
* **Interactive Calendar:** Continuous timeline Week View and 7-day grid Month View with minute-accurate focus blocks and collision detection.
* **Philippine National Holidays:** Built-in holiday schedule banner highlighting regular and special non-working holidays.
* **RFC 5545 Recurrence & iCalendar Interoperability:** Zero-dependency recurrence rule parser (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` up to 1,000 occurrences) and full `.ics` academic timetable import/export with layer visibility toggles.
* **Lecture Notes Editor:** Full-screen Markdown editor with live preview, interactive checklists (`- [ ]` / `- [x]`), category tags, pinning, search, and drag-and-drop reordering.

### Durable Native Android Alarms & Reminder Calls (`src/scheduler/`, `android/`)
* **Native Android Exact Alarms:** Scheduled via `AlarmManager.setExactAndAllowWhileIdle` (`LafinaReminderModule.kt`) with fallback for battery-saver restrictions and full-screen intent over the Android lock screen.
* **Simulated Incoming Reminder Calls:** `IncomingCallScreen` simulated phone call with push-to-talk mic activation, ringtone playback, vibration, and background foreground service (`LafinaReminderService.kt`).
* **Decoupled Acknowledgment Invariant:** Answering, snoozing, or dismissing an alert updates reminder status to `acknowledged` while strictly keeping the underlying task pending (`isCompleted === false`).
* **Reboot & Lifecycle Recovery:** Reschedules pending alarms across device reboots (`BOOT_COMPLETED`), timezone adjustments (`TIMEZONE_CHANGED`), and package updates (`MY_PACKAGE_REPLACED`). Stale alerts (>15 min) transition to `missed`, and near-due alerts (<3 min) trigger immediately.

### On-Device Speech & NLU (`src/ai/`)
* **Push-to-Talk STT:** Offline `whisper.cpp` (`ggml-base.en-q5_1.bin`) with Silero VAD (`silero_vad.onnx`) and background model warmup on Voice modal open.
* **Fast On-Device NLU:** Deterministic regex and grammar fast-path parser extracting actions, dates, and entities with zero network latency.
* **Fast Local TTS:** Native Android speech synthesis powered by `react-native-tts` (completely replacing the legacy 85 MB Kokoro 82M ONNX binary for sub-100ms latency).

### Adaptive Reminder Timing ML Advisor (`src/ai/ml/`)
* **Local Machine Learning Pipeline:** EWMA user response latency tracking, historical feature clustering (KNN), and Random Forest adherence recommendations for optimal reminder lead times.
* **Non-Intrusive & Controllable:** Preserves baseline schedules on cold start or opt-out; suggestions are explicitly surfaced in command reviews before commit.

### Cloud Sync & Online AI (`src/cloud/`, `src/sync/`)
* **Personal Entity Sync:** Offline-first bidirectional sync across the 7 personal entities (`profile`, `task`, `event`, `time_block`, `reminder`, `note`, `custom_category`) against `LAFINA-backend` (`https://lafina-backend.vercel.app` with `http://127.0.0.1:8000` dev fallback).
* **Online AI Assistant:** DeepSeek AI chat endpoint integration with automatic local fallback when offline.
* **Cloud Voice Synthesis:** Online ElevenLabs TTS endpoint (`/v1/ai/tts`) with automatic, silent fallback to local `react-native-tts`.
* **USTP Student Handbook RAG:** Citation-backed academic policy Q&A (`/v1/ai/chat` with `use_handbook: true`) showing verified page references, coupled with strict fail-closed guidance when offline.

---

## 3. Strict Architectural Guardrails

Enforced automatically by AST analysis (`scripts/check-architecture.mjs`):
* **Forbidden Business Scope:** 0 business dashboards, business roles (`manager`, `employee`, `business`), business tasks, business work blocks, company chat, or team invitations.
* **Forbidden Gmail Scope:** 0 Gmail APIs, OAuth scopes, mail sync jobs, or inbox screens.
* **Forbidden Study Tool Bloat:** 0 Pomodoro timers, Flashcard decks, or Meeting recording modules.
* **Forbidden Heavy Models:** 0 Kokoro 82M ONNX binaries (`kokoro-v0_19.onnx`, `af_bella.bin`, `cmudict.txt`), keeping APKs lightweight.
* **Offline Boundaries:** 81 offline leaf modules verified to have zero transitive reach to network APIs.

---

## 4. Development Environment

| Dependency | Required Version |
| :--- | :--- |
| **Node.js** | `>= 24.19.0` (LTS) |
| **npm** | `>= 10.0.0` |
| **JDK** | OpenJDK 17 (`hotspot-17`) |
| **Android SDK Platform** | Android 36 (API 36) |
| **Android Build Tools** | `36.0.0` |
| **Android NDK** | `27.1.12297006` |
| **CMake** | `3.22.1` |
| **Minimum Android OS** | Android 11.0+ (API 30+) |

---

## 5. Development & Testing Commands

### Setup and Environment Check
```powershell
# Install Node dependencies
npm ci

# Run system requirements check
node scripts/doctor.mjs
```

### Full Preflight Validation
Runs TypeScript typechecking, ESLint, the full Jest unit test suite, and the architectural AST dependency checks:
```powershell
npm run preflight
```

Individual checks:
```powershell
npm run typecheck            # TypeScript compiler check
npm run lint                 # ESLint check (0 warnings allowed)
npm test                     # Jest unit test suites
npm run check:architecture   # AST circular dependency & scope verification
```

### Running on Android Device / Emulator
```powershell
# Start Metro bundler
npm start

# In a second terminal (with Android device connected via USB or emulator running):
npm run android
```

---

## 6. Building Standalone Release APKs

On Windows, native C++ builds (CMake/Ninja) exceed the 260-character `MAX_PATH` limit on long directory structures. The reliable two-step build process prebuilds the JavaScript bundle on the physical checkout and assembles the APK from a short virtual drive mapping (`subst`):

```powershell
# Step 1: Prebuild the React Native release bundle from the physical path
Push-Location android
.\gradlew.bat :app:createBundleReleaseJsAndAssets --console=plain
Pop-Location

# Step 2: Assemble release APKs from a short virtual drive alias (e.g., L:)
$checkout = (Get-Location).Path
if (Get-PSDrive -Name L -ErrorAction SilentlyContinue) { & subst.exe L: /d }
& subst.exe L: $checkout

# Temporary init script to skip re-bundling during assembly
$initScript = "allprojects { tasks.configureEach { if (it.name == 'createBundleReleaseJsAndAssets') { it.onlyIf { false } } } }"
Set-Content -Path "android/.skip-bundle.init.gradle" -Value $initScript

try {
    Push-Location "L:\android"
    try {
        .\gradlew.bat :app:assembleRelease --console=plain --init-script "L:\android\.skip-bundle.init.gradle"
    } finally {
        Pop-Location
    }
} finally {
    & subst.exe L: /d
    Remove-Item "android/.skip-bundle.init.gradle" -Force -ErrorAction SilentlyContinue
}
```

The resulting split APKs are generated under `android/app/build/outputs/apk/release/`:
* **`app-arm64-v8a-release.apk`:** For physical 64-bit ARM Android devices.
* **`app-x86_64-release.apk`:** For x86_64 Android emulators.

### Audit APK Integrity & 16 KiB ELF Alignment
Verify single-ABI packaging, 16 KiB ELF load alignment (Android 15+ compatible), model file hashes, and ZIP alignment:
```powershell
python scripts/apk_audit.py android/app/build/outputs/apk/release/app-arm64-v8a-release.apk --output docs/plans/agy-improvements/reports/evidence/release-audit-arm64.json
```

### Install onto Device via ADB
```powershell
# For physical phone (ARM64)
adb install -r android/app/build/outputs/apk/release/app-arm64-v8a-release.apk

# For emulator (x86_64)
adb install -r android/app/build/outputs/apk/release/app-x86_64-release.apk
```

---

## 7. Security and Privacy Principles

1. **Offline Privacy First:** Tasks, notes, schedules, audio input, and voice models run locally. Offline guest users store data strictly in local SQLite (`lafina.db`).
2. **Opt-in Cloud Sync:** Network transmission occurs only when the user explicitly registers or logs into a cloud account.
3. **No Embedded Secret Keys:** Client APKs contain zero embedded cloud API keys; cloud communication authenticates via short-lived bearer tokens managed by `LAFINA-backend`.
4. **Decoupled Alert Invariants:** An alert acknowledgment is strictly distinct from completing academic tasks.
5. **No Background Eavesdropping:** Speech-to-text uses push-to-talk activation only. No wake words, no always-on recording, and no background audio capture.
