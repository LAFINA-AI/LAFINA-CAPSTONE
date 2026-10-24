# PHASE 05 — Fast TTS via `react-native-tts` & Optional Gemini Cloud TTS

> Read `AGENTS.md` first. Execute **only Phase 05** when approved.

## Objective

Implement fast local/offline Text-to-Speech using **`react-native-tts`** (replacing `LAFINA`'s slow Kokoro 82M ONNX engine) alongside optional Gemini cloud TTS (`/v1/ai/tts`) with automatic fallback to `react-native-tts`.

## Scope

1. **Replace Kokoro 82M with `react-native-tts` (`src/ai/tts/ttsService.ts`, `src/scheduler/speechProvider.ts`, `src/cloud/speechService.ts`)**
   - Install and configure `react-native-tts`.
   - Implement `ttsService.ts` (`initTTS`, `speakText`, `stopSpeaking`, `isTTSAvailable`, `preCacheReminderAudio` / no-op compatibility helpers) using `react-native-tts` offline system voices.
   - Ensure no Kokoro ONNX models (`kokoro-v0_19.onnx`, `af_bella.bin`, `cmudict.txt`) or ONNX Runtime TTS native modules are bundled.
2. **Cloud + Local Speech Provider (`src/cloud/speechService.ts`, `src/scheduler/speechProvider.ts`)**
   - Preserve `createCallSpeechProvider` so online entitled users can use `/v1/ai/tts` (Gemini TTS WAV playback) with immediate fallback to `react-native-tts` when offline or if cloud synthesis fails.
3. **Wire TTS into `IncomingCallScreen` & Reminder Alerts**
   - Speak reminder prompts during answered simulated calls without blocking UI buttons.
