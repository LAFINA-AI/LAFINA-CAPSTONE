# PHASE 08 — End-to-End Offline Student Assistant & `ChatScreen` Integration

> Read `AGENTS.md` first. Execute **only Phase 08** when approved.

## Objective

Migrate `ChatScreen.tsx` and `src/ui/components/chat/` and integrate the complete offline student assistant loop: text/voice input -> deterministic fast-path / `SmolLM2` NLU -> conflict-aware scheduling (`tasksStore`, `timeBlocksStore`, `remindersStore`, `notesStore`) -> immediate text confirmation + non-blocking `react-native-tts` spoken response.

## Scope

1. **Chat UI (`src/ui/screens/ChatScreen.tsx`, `src/ui/components/chat/`)**
   - Migrate `ChatScreen` and chat components (excluding document generation attachments and business/Gmail skills).
2. **Offline Assistant Loop (`src/ai/chatOrchestrator.ts`)**
   - Wire `ChatScreen` and `VoiceModal` to `chatOrchestrator` with offline scheduling, adaptive slot recommendations, and `react-native-tts` playback.
