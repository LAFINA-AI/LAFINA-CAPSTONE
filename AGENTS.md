# AGENTS.md — LAFINA-CAPSTONE standing instructions

> This file applies in **every agent session** working in the capstone repo. Read this file before code changes. Human-approved phase instructions outrank speculative optimization ideas. If instructions conflict, pause and ask.

## Mission and scope

Build **LAFINA-CAPSTONE**, an **Android-first, offline-first academic AI secretary for students**, migrated from the `LAFINA` mobile UI/UX and aligned with the `LAFINA-backend` personal SQLite & cloud sync architecture (`https://lafina-backend.vercel.app` with `http://127.0.0.1:8000` dev fallback).
Core scope:
- Student-facing `LAFINA` UI/UX (`SynthSplash`, `AuthBackdrop` + `Grainient`, `WelcomeScreen`, `LoginScreen`, `RegisterScreen`, `OnboardingScreen`, `CalendarScreen`, `NotesScreen`, `ChatScreen`, `VoiceModal`, `IncomingCallScreen`, `ProfileScreen`, `PreferencesSettingsScreen`, `CustomTabBar`, `ProductTour`).
- Offline-first local guest mode (`local_guest_user`) **and** optional cloud accounts (`student`, `student_pro`, `admin`) with bidirectional synchronization (`/v1/sync/batch`, `/v1/auth/*`, `/v1/me`) across the 7 personal entity types (`profile`, `task`, `event`, `time_block`, `reminder`, `note`, `custom_category`).
- Durable native Android alarms (`LafinaReminderModule`, `ReminderAlarmReceiver`, `ReminderBootReceiver`), simulated incoming reminder calls, push-to-talk offline STT (`whisper.cpp` + `silero_vad.onnx`), on-device NLU (`SmolLM2` + deterministic fast path), fast local TTS via **`react-native-tts`** (replacing Kokoro 82M ONNX) with optional ElevenLabs cloud TTS (`/v1/ai/tts`) fallback to `react-native-tts`, and online AI chat + verifiable, citation-backed USTP Student Handbook RAG (`/v1/ai/chat`).

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
- **`react-native-tts` is the local/offline TTS engine** (`src/ai/tts/ttsService.ts`). Never bundle or invoke Kokoro 82M ONNX. When online and entitled, ElevenLabs cloud TTS (`/v1/ai/tts`, gated by `/v1/ai/tts/capabilities`) may be used only with explicit Online Mode with automatic fallback to `react-native-tts` and visual text/call UI if speech fails.
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

## Task-scoped notice: AGY improvement port

For the unattended AGY-PORT 00-13 run only, `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md` records the owner's decision: AGY's existing accounts, subscriptions, cloud sync, online AI and RAG, document generation and meeting recording are preserved, and the phases proceed without per-phase approval. Everything else in this file still applies, including no Kokoro and no writes outside this checkout.

## Task-scoped notice: Phase 09 ElevenLabs migration (2026-11-07)

The owner explicitly authorized the scoped `LAFINA-backend` speech-provider change and deployment for this task. It replaces active Gemini TTS with ElevenLabs while preserving DeepSeek, authentication, entitlement, sync and existing quotas. Backend commit `34f9fba` is on `codex/elevenlabs-online-tts`; the owner subsequently merged main `f0fae4d`, and production deployment/contract authentication boundaries were verified on 2026-11-07. Signed-in voice/device validation remains pending. This exception does not authorize unrelated backend changes or a replacement hosting project. See `backend_integration/README.md` and the Phase 09 follow-up report.

## Task-scoped notice: Floating LAFINA (2026-11-17)

For the Floating LAFINA task only (phases `FLOAT-00` to `FLOAT-08`), `docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md` records the owner's decision: an optional, off-by-default floating orb and Quick Chat panel are in scope, and the manifest permissions `SYSTEM_ALERT_WINDOW` and `FOREGROUND_SERVICE_SPECIAL_USE` are approved for it. `FLOAT-00` may start; every later phase still needs explicit approval. Everything else in this file still applies, including confirm-before-write, no wake word, no always-on mic, no reading of other apps, and no writes outside this checkout.

## Task-scoped notice: Chat history sync (2026-11-21)

For the chat history sync task (ADR-040), `docs/plans/chat-history-sync/OWNER-AUTHORIZATION.md` records the owner's approved decisions:
- sync on by default for signed-in accounts, with a notice;
- turning sync off keeps the cloud copy;
- attachments sync as a description only;
- clearing chats deletes the cloud copy;
- at most 20 chats per account, enforced on the phone and the server; nothing is deleted to make room.

It also records a scoped `LAFINA-backend` change: the chat sync tables, migration 014, the chat entity types, `/v1/sync/chat/purge` and the 20-chat limit. That change is delivered as `backend_integration/LAFINA-backend-chat-history-sync.patch`; nothing was pushed or deployed. Everything else in this file still applies.

## Task-scoped notice: Skill handoff and call fixes (2026-11-22)

For the skill handoff task (ADR-041, SKILL-00..07 and CALLFIX-01..03), `docs/plans/lafina-skill-agent/OWNER-AUTHORIZATION.md` records the owner's approval ("proceed and fix everything") and the defaults taken:
- LAFINA may open a Skills-tab page from a call or Chat;
- a call ends and opens the skill only on the student's own words; a model-only suggestion is a button;
- Pomodoro "start" starts the timer; no other skill generates, records or saves by itself.

This notice covers only the Skills that are already built in this checkout. It does not widen the forbidden-scope list for other work. The backend part is a handoff only (`backend_integration/skill-agent/OWNER-HANDOFF.md`). Everything else in this file still applies.

## Task-scoped notice: In-app updates (2026-11-23)

For the in-app update task (ADR-043, AUTOUPDATE-01), the owner approved ("approve auto-update ... proceed"):
- installed copies update themselves from the latest `LAFINA-AI/LAFINA-CAPSTONE` GitHub release;
- the `REQUEST_INSTALL_PACKAGES` permission (Android still asks the student to confirm every APK update);
- the launcher name is just "LAFINA".

`UPDATE_PACKAGES_WITHOUT_USER_ACTION` (silent APK updates) is **not** approved. Release keys are created by the owner with `npm run release:keygen` and never committed. See `docs/RELEASING.md`. Everything else in this file still applies.
