# PHASE 06 — Push-to-Talk Offline STT (`whisper.cpp` + `silero_vad.onnx`)

> Read `AGENTS.md` first. Execute **only Phase 06** when approved.

## Objective

Migrate `LAFINA`'s offline push-to-talk Speech-to-Text pipeline (`LafinaSpeechToTextModule.kt`, C++ JNI `whisper.cpp` + `silero_vad.onnx`, `src/ai/stt/`, `VoiceModal.tsx`) for voice scheduling, note dictation, chat voice input, and answered reminder call responses.

## Scope

1. **Native STT Bridge (`android/app/src/main/java/com/lafina/LafinaSpeechToTextModule.kt`, `android/app/src/main/cpp/`)**
   - Migrate `LafinaSpeechToTextModule.kt` and native `whisper.cpp` / VAD audio capture with explicit microphone permission checks and 60s inactivity auto-unload.
2. **JS STT Service & Voice Modal (`src/ai/stt/`, `src/ui/components/VoiceModal.tsx`)**
   - Migrate `sttService.ts` and `VoiceModal.tsx` triggered from the central `Mic` button in `CustomTabBar`, `ChatScreen`, `NotesScreen`, and `IncomingCallScreen`.
