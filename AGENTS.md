# AGENTS.md — LAFINA-CAPSTONE standing instructions

> This file applies in **every agent session** working in the capstone repo. Read this file before code changes. Human-approved phase instructions outrank speculative optimization ideas. If instructions conflict, pause and ask.

## Mission and scope

Build **LAFINA-CAPSTONE**, an **Android-first, offline-first academic AI secretary for students**, migrated from the `LAFINA` mobile UI/UX and aligned with the `LAFINA-backend` personal SQLite & cloud sync architecture (`https://lafina-backend.vercel.app` with `http://127.0.0.1:8000` dev fallback).
Core scope:
- Student-facing `LAFINA` UI/UX (`SynthSplash`, `AuthBackdrop` + `Grainient`, `WelcomeScreen`, `LoginScreen`, `RegisterScreen`, `OnboardingScreen`, `CalendarScreen`, `NotesScreen`, `ChatScreen`, `VoiceModal`, `IncomingCallScreen`, `ProfileScreen`, `PreferencesSettingsScreen`, `CustomTabBar`, `ProductTour`).
- Offline-first local guest mode (`local_guest_user`) **and** optional cloud accounts (`student`, `student_pro`, `admin`) with bidirectional synchronization (`/v1/sync/batch`, `/v1/auth/*`, `/v1/me`) across the 7 personal entity types (`profile`, `task`, `event`, `time_block`, `reminder`, `note`, `custom_category`).
- Durable native Android alarms (`LafinaReminderModule`, `ReminderAlarmReceiver`, `ReminderBootReceiver`), simulated incoming reminder calls, push-to-talk offline STT (`whisper.cpp` + `silero_vad.onnx`), on-device NLU (`SmolLM2` + deterministic fast path), fast local TTS via **`react-native-tts`** (replacing Kokoro 82M ONNX) with optional Gemini cloud TTS (`/v1/ai/tts`) fallback to `react-native-tts`, and online AI chat + verifiable, citation-backed USTP Student Handbook RAG (`/v1/ai/chat`).

**Forbidden scope:**
- All business dashboards, business roles (`manager`, `employee`, `business`), business tasks, business work blocks, company chat, business invitations, and team management.
- All Gmail APIs, OAuth, and inbox screens.
- All study tools: **Pomodoro**, **Flashcards**, **Study Notes**, and **Meetings** (including meeting recording and document generation).
- Kokoro 82M ONNX model binaries (`kokoro-v0_19.onnx`, `af_bella.bin`, `cmudict.txt`) and `LafinaTTSModule` ONNX synthesis.
- General-purpose autonomous agents, wake word, always-on mic, official university portal integration. Do not import forbidden modules from `LAFINA`.

## Phase control — most important rule

- **Execute ONE approved phase at a time.**
- Do not start the next phase, even if the current phase passed, until the human explicitly writes `APPROVE PHASE NN` (or equivalent explicit phase approval) and all issues in the current phase are resolved.
- A phase is not passed until all automated gates pass and human-required device checks are completed/acknowledged; if only automation passes, report `AWAITING DEVICE VALIDATION` (or `READY FOR REVIEW`) and STOP.
- After each phase, generate `docs/reports/phase-NN-report.md` based on `templates/PHASE-REPORT.md` and a concise reviewer summary. Provide commands, logs, benchmark JSON paths, actual device identifiers (non-sensitive), tested/not-tested status, change list, manual verification steps, deviations and risks.
- Never claim successful Android alarm/call/STT/TTS on device solely from Jest mocks. Never fabricate build/test/benchmark results.
- Owner instruction: after **every phase**, include a concrete short manual-check checklist in the chat handoff as well as the full phase report. State what to install/open, actions, expected results and checks still NOT RUN.
- Treat blockers truthfully. Ask for one concrete item of human help when needed.

## Repository safety and efficient legacy reuse

- Only `LAFINA-CAPSTONE` is writable. **Never modify, commit, push, rename, or run destructive commands against `LAFINA` or `LAFINA-backend`**.
- Read targeted files from `LAFINA` and `LAFINA-backend` per phase, copy **only reviewed student-scope components**, strip business/Gmail/study-tool/Kokoro dependencies, explain changes, and test thoroughly.
- Do NOT copy full legacy history, Kokoro ONNX binaries, business modules, Gmail modules, study-tool modules, demo business credentials, `.env` files, build outputs, or secret keys.
- Prefer adapting well-understood code from `LAFINA` to regenerating solutions. Follow `LAFINA`'s UI/UX design tokens (`Colors`, `Fonts`, `FontSize`, `Spacing`, `Layout`, `Shadows`, `useTheme`, `useThemedStyles`) and SQLite schema conventions matching `LAFINA-backend`.

## Stack and core technical rules

- Mobile stack: React Native 0.86 + TypeScript strict; Android Kotlin native modules; C/C++ JNI where required by STT (`whisper.cpp`) and NLU (`llama.cpp` / `SmolLM2`).
- One local SQLite database (`lafina.db` via `@op-engineering/op-sqlite`) with schema migrations (`dbInit.ts`), transaction boundaries, sync outbox/metadata/state/conflict stores, and Jest test coverage (`node:sqlite` in-memory mock).
- Android native `AlarmManager` (`LafinaReminderModule`) for exact time-critical reminder alarms and boot/time-change rescheduling.
- **`react-native-tts` is the local/offline TTS engine** (`src/ai/tts/ttsService.ts`). Never bundle or invoke Kokoro 82M ONNX. When online and entitled, Gemini cloud TTS (`/v1/ai/tts`) may be used with automatic fallback to `react-native-tts` and visual text/call UI if speech fails.
- STT: offline `whisper.cpp` + `silero_vad.onnx` via `LafinaSpeechToTextModule` (`src/ai/stt/`).
- NLU: deterministic regex/fast-path parser + on-device `SmolLM2` (`LafinaIntentExtractorModule`, `src/ai/nlu/`).
- Online auth, sync, TTS, and chat/handbook RAG communicate with `LAFINA-backend` (`https://lafina-backend.vercel.app` with `http://127.0.0.1:8000` local fallback in `src/cloud/cloudClient.ts`). Do not embed cloud API keys in the mobile app.

## Core semantics and reliability

- Text/manual UI always works even when STT, TTS, intent model, notifications, alarm permissions, or internet fail.
- Reminder `acknowledged` means the user received/acknowledged the alert, **not that the underlying task is completed**.
- Preserve transactional consistency between local SQLite writes and `sync_outbox` mutations (`profile`, `task`, `event`, `time_block`, `reminder`, `note`, `custom_category`).
- Simulated reminder call (`IncomingCallScreen`) is **not a real phone call**. Mic access only after explicit user interaction (`Answer` / push-to-talk) and OS permission.

## Code architecture and quality

- Follow `LAFINA` module organization: `src/{ui,storage,scheduler,ai,cloud,sync,updates,utils,assets}` with `App.tsx` at root.
- Central semantic design tokens in `src/ui/theme/` and `src/ui/contexts/ThemeContext.tsx`. Use `StyleSheet.create` + `useThemedStyles` + `useTheme().colors`.
- Use ESLint + Prettier + TypeScript strict + Jest (`npm run preflight`) and Android Gradle verification (`gradlew`) in every phase.
- End **every response that completes work on a phase** with `STATUS: READY FOR REVIEW`, `STATUS: AWAITING DEVICE VALIDATION`, or `STATUS: BLOCKED`, and `STOPPED — awaiting explicit human approval`.
