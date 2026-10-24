# PHASE 09 — Online Mode & `LAFINA-backend` Cloud AI Integration

> Read `AGENTS.md` first. Execute **only Phase 09** when approved.

## Objective

Integrate `LAFINA`'s opt-in Online Mode in `ChatScreen` and `src/ai/chatOrchestrator.ts` against `LAFINA-backend` (`/v1/ai/chat`, `/v1/ai/tts`, `/v1/sync/batch`), with seamless fallback to offline scheduling and `react-native-tts` when offline or unentitled.

## Scope

1. **Online AI Chat Client (`src/cloud/`, `src/ai/`)**
   - Connect `ChatScreen`'s Online Mode toggle and `authorizeOnlineMode` to `LAFINA-backend` (`https://lafina-backend.vercel.app` / `http://127.0.0.1:8000`).
   - Support cloud-assisted scheduling and conversational responses with strict offline fallback.
