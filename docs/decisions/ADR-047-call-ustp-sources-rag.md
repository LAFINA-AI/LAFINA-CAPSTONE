# ADR-047 — Call LAFINA uses on-device USTP Sources RAG (`search_ustp_sources`)

**Status:** accepted (awaiting device validation)
**Date:** 2026-11-26
**Phase:** USTP-CALL-00 to USTP-CALL-05 (`docs/plans/call-ustp-rag/PLAN.md`)
**Review owner:** human developer
**Approval:** owner, "just do all your recommended plan, Proceed" (2026-11-26), approving D1(a), D2, and D3
**Amends:** ADR-044 (Call LAFINA previously used only the backend server-side index) and ADR-045 §4 (library copy describing calls as using a separate online copy)

## Context / problem

Calling LAFINA and asking USTP policy or campus questions (such as *"is it ok to wear tattered jeans in USTP?"*) caused her to reply that she has no access to the USTP handbook, even though the exact passages are bundled on the phone in `src/handbook/ustpHandbookPack.json` (**Appendix I — Dress Code Policy for Students, p. 120** and **Chapter 5, Section 3, p. 84**) and `src/handbook/ustpCdoKnowledgePack.json`.

Five gaps caused this:
1. Call LAFINA's 16 client tools (`REGISTERED_TOOLS`) had no tool to search our on-device USTP sources (`localHandbookService`).
2. Online calls relied on server-side Pinecone (`LAFINA-backend` `voice_llm_turn` with a 2 s timeout and narrow trigger regex), which lacked the USTP CDO Knowledge Pack (ADR-044) and returned empty passages on misses/timeouts.
3. `isUstpSchoolEnabled` gating produced zero passages without telling the model why, leading to confusing generic refusals.
4. Offline Call LAFINA (`reviewOffline` → `reviewSpokenTurn`) never queried `localHandbookService`.
5. `isHandbookQuestion` and `handbookSearch.ts` missed natural spoken dress-code and campus paraphrases (*"tattered jeans"*, *"ripped jeans"*, *"flip-flops"*, *"dye my hair blue"*), and `formatOfflineHandbookReply` emitted Markdown/URLs unsuitable for TTS.

## Decision

1. **Single source of truth on device.** Call LAFINA (online, offline, and reminder calls) uses the same on-device SQLite FTS5 USTP Sources index (`localHandbookService`: 2023 USTP Student Handbook + USTP CDO Knowledge Pack) as Ask USTP.
2. **Read-only client tool `search_ustp_sources` (D2).**
   - Added to `REGISTERED_TOOLS`, `actionValidator.ts`, `actionService.ts`, `OnlineReminderConversation.tsx`, `ChatAgent` (`src/ai/chatAgent.ts`), and regenerated `backend_integration/call_lafina_v2/tool-contract.json`.
   - Accepts `{ query: string, collection?: 'all' | 'handbook' | 'ustp_cdo' }`.
   - Read-only, owner-scoped, sanitized (`sanitizePassageForPrompt`), marked `dataIsUntrusted: true`, bounded to ≤ 2,400 chars of excerpts, and tracks the call's previous USTP query for short follow-ups.
   - Preserves all ADR-044 rules: section/page citations, `asOf` dates, UG/GR and semester separation, explicit caveats without choosing between conflicting dates, academic-year refusal, and fail-closed `no_evidence` handling.
3. **USTP eligibility gate preserved with truthful explanations (D1 a).**
   - Keeps `isUstpSchoolEnabled(userId)` (confirmed USTP COR) and `handbookPreference.read(userId)`.
   - Returns structured `ineligible` or `disabled` statuses with plain-language guidance so LAFINA explains *why* USTP sources are off instead of claiming she has no access.
4. **Spoken recall & TTS-safe formatting.**
   - Expands `QUERY_SYNONYMS` and the dress-code concept group in `handbookSearch.ts` plus `HANDBOOK_TOPIC_RE` in `onlineIntentExtractor.ts` while preserving the H1 off-topic fail-closed gate.
   - Adds `formatSpokenHandbookReply` (plain prose, no Markdown or raw URLs) for offline calls and voice fallback.
5. **Offline Call LAFINA + In-Call Source Card + Chat citations (D3).**
   - Offline calls (`reviewOffline`) search `localHandbookService` and speak `formatSpokenHandbookReply`.
   - `CallReadResults` renders a compact dismissible USTP Source Card with section/page badges, `asOf` date, caveats, and a **See passages** action opening `UstpSourcesSheet`.
   - When `search_ustp_sources` returns verified matches during a call turn (online or offline), the persisted assistant message in Chat attaches `handbookNote` and `sourcePassageIds` (omitted if `replyDisclaimsHandbook(reply)` is true), so **See passages** works in Chat history too.
   - Updates `UstpSourcesSheet` copy to reflect that Call LAFINA now uses these on-device sources.
6. **Backend & ElevenLabs handoff (D2).**
   - Delivered as a reviewable patch + `OWNER-HANDOFF.md` under `backend_integration/call-ustp-rag/` (nothing pushed or deployed from this checkout).
   - Adds `search_ustp_sources` to ElevenLabs client tools and backend `approved_voice_tools`, updates `VOICE_SYSTEM_INSTRUCTION` / `VOICE_STYLE_INSTRUCTION`, and exposes `capabilities.clientUstpTool` so mobile sends `useHandbook: false` to bypass redundant server-side Pinecone once the backend is updated.

## Consequences

- Online calls answer USTP Handbook and USTP CDO questions accurately in the same turn with ~10–25 ms on-device retrieval and zero Pinecone dependency once the owner deploys the backend patch and re-provisions ElevenLabs.
- Offline calls answer USTP Handbook and USTP CDO questions aloud immediately with no internet required.
- Students can verify spoken USTP answers via the in-call USTP Source Card and **See passages** in Chat.
- Existing off-topic fail-closed guarantees (`appStatusAudit20261116.test.ts`), confirm-before-write planner rules, and privacy boundaries are unchanged.
