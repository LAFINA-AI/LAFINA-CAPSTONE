# PHASE 10 — USTP Student Handbook RAG & Citation-Backed Answers

> Read `AGENTS.md` first. Execute **only Phase 10** when approved.

## Objective

Enable and verify the USTP Student Handbook toggle (`ustp_handbook_enabled` in `localSettingsStore` / `ChatScreen`) and citation-backed handbook RAG responses via `LAFINA-backend` (`/v1/ai/chat` with `use_handbook: true`).

## Scope

1. **Handbook Toggle & RAG Citations (`src/ui/screens/ChatScreen.tsx`, `src/ai/chatOrchestrator.ts`)**
   - Wire the USTP Student Handbook toggle per user in `localSettingsStore` and pass `use_handbook` to `/v1/ai/chat`.
   - Render verified handbook citations and clear offline/fallback messaging when handbook retrieval requires connectivity.
