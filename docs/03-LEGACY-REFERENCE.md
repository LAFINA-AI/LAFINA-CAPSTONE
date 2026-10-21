# 03 — Old LAFINA Repository: Selective Reuse Map

Reference: `https://github.com/LAFINA-AI/LAFINA` at pinned commit `f7e70aec54e6d16e627f444f2a67114cbfb07b5e` (confirmed on 2026-10-21). The new repository `https://github.com/LAFINA-AI/LAFINA-CAPSTONE` is the only writable target. **Treat the old code as a reference, not a package dependency.**

## High-priority old paths (verify exact commit)

| Function | Legacy source paths | Intended action |
|---|---|---|
| Scheduler | `src/scheduler/reminderScheduler.ts`, `reminderAlarm.ts`, `callDispatcher.ts`, `reminderActions.ts` | Extract required domain logic; test alarm semantics; remove business reconciler |
| Android alarms | `android/app/src/main/java/com/lafina/LafinaReminderModule.kt`, `LafinaReminderService.kt`, `LafinaReminderReceiver.kt`, `AndroidManifest.xml` | Audit Android permissions, native events, activity/notification behavior, reboot |
| Local DB | `src/storage/database.ts`, `dbInit.ts`, `remindersStore.ts`, `tasksStore.ts`, `rruleHelper.ts` | Reimplement minimal schema with migrations; preserve useful tests only |
| Onboarding | `src/ui/screens/OnboardingScreen.tsx`, `src/ui/components/onboarding/*` | Adapt to no-account profile and minimal preferences; preserve style patterns |
| Calendar | `src/ui/screens/calendar/CalendarScreen.tsx`, `src/ui/screens/calendar/components/*` | Adapt selected useful UI behavior; avoid large interconnected tool screens |
| Chat | `src/ui/screens/ChatScreen.tsx`, `src/ui/components/chat/*` | Adapt Messenger-style text entry and hold-to-talk; remove online/chat extras initially |
| Call UI | `src/ui/screens/IncomingCallScreen.tsx`, `src/ui/components/call/CallAnsweredView.tsx` | Simplify, ensure permission fallback, manual controls |
| Whisper | `src/ai/native/speechCapture.ts`, `voicePipeline.ts`, `android/app/src/main/java/com/lafina/LafinaOfflineSpeech.kt`, `android/app/src/main/cpp/whisper_jni.cc` | Performance baseline and fallback only; inspect model licensing |
| Kokoro old baseline | `src/ai/tts/ttsService.ts`, `android/app/src/main/java/com/lafina/LafinaTTSModule.kt` | **Benchmark old**, do not bring engine/model into MVP default |
| Offline NLU | `src/ai/nlu/parser.ts`, `jsonParser.ts`, `scheduler.ts`, `prompt.ts` | Salvage deterministic date/time parser tests; simplify intent pipeline |
| USTP RAG | `backend/app/services/handbook_rag.py`, `backend/scripts/ingest_handbook.py`, `backend/app/clients/pinecone_index.py`, `backend/tests/test_handbook_rag.py` | **ONLY Phase 10**, port/adapt, improve strict fail-closed answers and versioning |
| Backend | `backend/app/api/v1/ai.py`, `backend/app/clients/deepseek.py`, `backend/app/main.py` | **ONLY Phase 09**, minimal FastAPI proxy, swap provider to Gemini; no auth/account needs for local mobile MVP but secure public endpoint appropriately |
| Theme | `src/ui/theme/*`, `src/ui/contexts/ThemeContext.tsx`, `src/assets/*` | Reuse design tokens/brand assets where rights allow; avoid UI redesign |
| Tests | `__tests__/scheduler/*`, `__tests__/ai/*`, `__tests__/storage/*`, `backend/tests/test_handbook_rag.py` | Adapt test scenarios, not mocks that hide native failures |

## Repo drift and risks found at planning

- Old `AGENTS.md` lists `react-native-sqlite-storage` but package manifest declares `@op-engineering/op-sqlite` (`^16.2.0`). Use observed tested driver, document deviations.
- Old README mixes personal student and business demo accounts and public sample credentials; **DO NOT migrate or publish them in the new app**.
- Old capstone paper and docs mentioned Django/Qdrant/DeepSeek; actual code currently includes FastAPI/Pinecone/DeepSeek. Reconcile to one validated stack for capstone.
- Android assets bundle large Whisper, SmolLM2, Kokoro, and VAD model files. Do not port all automatically; profile APK/peak RAM and verify licenses before bundling.
- Native alarm implementation includes constraints around exact alarm and full-screen intent, which require device-level tests and Play distribution eligibility review.
- Existing USTP handbook feature appears online via Pinecone; **not** an offline corpus. Its response path can continue without retrieved excerpts; in strict handbook mode that must instead fail closed.
- Legacy `dbInit.ts` reportedly schema version 17 and contains business entities; **start capstone with an intentionally minimal new schema**. No migration guarantee from old database unless approved.
- `Graphify` is already part of old package scripts. Consider adoption if tool works on newly-scoped modules.

## Required reuse evaluation process

1. Capture exact source file path+commit SHA and compile-time dependencies.
2. Explain why the behavior is still needed for student scope.
3. Identify security/privacy/license issues, native permissions, or performance costs.
4. Extract the smallest working unit with new typed interface.
5. Add adapted unit/integration tests, run them, and require physical Android checks for alarms/audio.
6. Record decision in `docs/decisions/ADR-XXXX.md` and phase report; mark `PORT`, `REWRITE`, `REFERENCE ONLY`, or `DROP`.

## Never copy

Business screens/stores/jobs; employee/manager demo data; auth/login cloud customer stack; Gmail/meeting/document AI skills; developer `.env` secrets; `build/` and `node_modules/`; generated APK/OTA bundles; third-party binaries without provenance; huge images/artifacts not needed for core UI; old conflicting AI agent rules. Keep old reference read-only.
