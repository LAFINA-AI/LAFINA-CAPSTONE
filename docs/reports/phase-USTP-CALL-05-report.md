# PHASE USTP-CALL-00..05 — Call LAFINA On-Device USTP Sources RAG / Completion Report

**Branch / commit SHA:** `main` (working tree on top of `be5b499`; pre-existing uncommitted quick-chat files were left untouched)  
**Date/time UTC:** `2026-11-26T13:13:00Z`  
**Device(s) available:** NONE (automated checks only; live phone + ElevenLabs validation required after owner backend deployment)  
**Status:** `AWAITING DEVICE VALIDATION`  
**Phase approval provenance:** Owner chat message on 2026-11-26 ("just do all your recommended plan, Proceed"), approving D1(a), D2, and D3 (`docs/plans/call-ustp-rag/OWNER-AUTHORIZATION.md`, `docs/decisions/ADR-047-call-ustp-sources-rag.md`).

## 1. Scope completed

- **USTP-CALL-00 (ADR & Authorization):** Recorded ADR-047 (`docs/decisions/ADR-047-call-ustp-sources-rag.md`), owner authorization (`docs/plans/call-ustp-rag/OWNER-AUTHORIZATION.md`), and the task-scoped notice in `AGENTS.md`.
- **USTP-CALL-01 (Spoken Recall & TTS Formatting):**
  - Expanded dress-code domain concepts and spoken paraphrases (*ripped/frayed/torn jeans*, *flip-flops/tsinelas*, *sando/tank tops*, *crop tops*, *miniskirts*, *hair dye/color*) in `src/handbook/handbookSearch.ts` and `src/handbook/knowledgeScope.ts`.
  - Expanded `HANDBOOK_TOPIC_RE` in `src/ai/onlineIntentExtractor.ts` so natural dress-code and conduct questions (including `"is it ok to wear tattered jeans in ustp?"`) trigger `isHandbookQuestion`.
  - Added `formatSpokenHandbookReply` in `src/handbook/handbookSearch.ts` for plain, TTS-safe spoken answers without Markdown or raw URLs, while keeping section, page, `asOf` date, caveats, and freshness warnings.
  - Moved `replyDisclaimsHandbook` into `src/handbook/handbookSearch.ts` (re-exported by `chatOrchestrator.ts`) to keep the dependency graph acyclic (`0 import cycles`).
- **USTP-CALL-02 (`search_ustp_sources` Client Tool & Wiring):**
  - Implemented on-device USTP RAG bridge in `src/handbook/voiceUstpSearch.ts` (`searchUstpSourcesForVoice`, `formatVoiceUstpToolResult`), enforcing confirmed-COR eligibility (`isUstpSchoolEnabled`, D1 a), `handbookPreference`, prompt-injection sanitization, `dataIsUntrusted: true`, follow-up query merging, and fail-closed statuses (`ok`, `no_evidence`, `wrong_academic_year`, `disabled`, `ineligible`, `unavailable`).
  - Registered read-only `search_ustp_sources(query, collection?)` (`kind: 'ustp.search'`) across `actionRegistry.ts`, `types.ts`, `actionValidator.ts`, `actionService.ts`, `personaPolicy.ts` (`Checking USTP sources...`), `OnlineReminderConversation.tsx`, `ChatAgent` (`src/ai/chatAgent.ts`), `backend_integration/system_prompt_voice.txt`, and regenerated `backend_integration/call_lafina_v2/tool-contract.json` (`17` tools).
  - Added `clientUstpTool?: boolean` capability flag in `src/cloud/voiceConversation/types.ts` + `controller.ts` + `index.ts` so online calls send `useHandbook: false` to skip redundant server-side Pinecone queries once the backend advertises `clientUstpTool: true` and the local USTP index is populated.
- **USTP-CALL-03 (Offline Call RAG, In-Call Source Card & Chat Citations):**
  - Wired on-device USTP RAG into `reviewOffline` in `src/ui/components/voice/VoiceConversationPanel.tsx` (with follow-up tracking, in-call source card display, and spoken replies).
  - Added a dismissible **USTP Sources** card with section/page/`asOf`/caveat metadata and **See passages ›** (`UstpSourcesSheet`) in `src/ui/components/callLafina/CallReadResults.tsx` and `VoiceConversationPanel.tsx`.
  - Added per-owner turn-scoped citation handoff (`src/ai/voiceActions/callUstpCitations.ts`) wired into both online (`src/cloud/voiceConversation/index.ts`) and offline (`src/ai/offlineCall/offlineCallDeps.ts`) Chat persistence, attaching `handbookNote` + `sourcePassageIds` unless the reply disclaims the handbook.
  - Updated `src/ui/components/chat/UstpSourcesSheet.tsx` copy to reflect that Call LAFINA now uses the same on-device USTP sources.
- **USTP-CALL-04 (Backend & ElevenLabs Handoff):**
  - Produced `backend_integration/call-ustp-rag/LAFINA-backend-call-ustp-rag.patch` and `backend_integration/call-ustp-rag/OWNER-HANDOFF.md` (nothing modified, pushed, or deployed in `LAFINA-backend` or ElevenLabs).
- **USTP-CALL-05 (Verification):** Added real-corpus Jest suite `__tests__/ai/callUstpSourcesRag.test.tsx`, verified `npm run preflight` (typecheck, ESLint, 248 Jest suites, architecture cycle check), contract check, backend patch `git apply --check` + `pytest`, and Android Gradle `:app:testDebugUnitTest`.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/handbook/handbookSearch.ts`, `src/handbook/knowledgeScope.ts`, `src/handbook/index.ts` | Dress-code concepts/synonyms, `formatSpokenHandbookReply`, `replyDisclaimsHandbook` | Fix spoken dress-code recall, TTS-safe replies, and keep module graph acyclic | `callUstpSourcesRag.test.tsx`, `localHandbookRag.test.tsx`, `ustpCdoKnowledge.test.ts`, `appStatusAudit20261116.test.ts` |
| `src/handbook/voiceUstpSearch.ts` (new) | On-device USTP RAG query & payload builder for calls and ChatAgent | Single source of truth for Handbook + CDO pack with COR gating & sanitization | `callUstpSourcesRag.test.tsx` (9/9 pass) |
| `src/ai/onlineIntentExtractor.ts` | Added dress-code & conduct terms to `HANDBOOK_TOPIC_RE` | Detect `"is it ok to wear tattered jeans in ustp?"` and similar spoken queries | `callUstpSourcesRag.test.tsx`, `localHandbookRag.test.tsx` |
| `src/ai/voiceActions/{types,actionRegistry,actionValidator,actionService}.ts`, `callUstpCitations.ts` (new) | Registered, validated, and executed `search_ustp_sources`; session follow-ups & Chat citation slot | Enable synchronous read-only USTP RAG during live calls | `callUstpSourcesRag.test.tsx`, `generate-contract.cjs --check` |
| `src/ai/chatAgent.ts`, `src/ai/chatOrchestrator.ts` | Exposed `search_ustp_sources` to `ChatAgent` and merged local sources | Ground mixed planner + USTP questions in Chat with citations | `callUstpSourcesRag.test.tsx`, full Jest suite |
| `src/cloud/voiceConversation/{types,controller,index,localVoiceData,personaPolicy}.ts` | `clientUstpTool` Pinecone bypass, `Checking USTP sources...`, voice prompt rule, Chat citation persistence | Ground online calls and avoid redundant 2 s server Pinecone calls | `callUstpSourcesRag.test.tsx`, `voiceConversationController.test.ts` |
| `src/ai/offlineCall/offlineCallDeps.ts`, `src/ui/components/call/OnlineReminderConversation.tsx` | Persist offline call USTP citations; allow `search_ustp_sources` in reminder calls | Parity across online, reminder, and offline calls | Full Jest suite |
| `src/ui/components/callLafina/CallReadResults.tsx`, `src/ui/components/voice/VoiceConversationPanel.tsx`, `src/ui/components/chat/UstpSourcesSheet.tsx` | In-call USTP Source Card + `See passages`, offline call USTP RAG, updated library copy | Transparent source verification on screen & offline call support | `callUstpSourcesRag.test.tsx`, `ustpSourcesLibrary.test.tsx` |
| `backend_integration/call_lafina_v2/tool-contract.json`, `backend_integration/system_prompt_voice.txt`, `backend_integration/call-ustp-rag/*` | Regenerated 17-tool contract + backend patch & handoff | Owner deployment & ElevenLabs agent re-provisioning | `generate-contract.cjs --check`, `git apply --check`, `pytest` (3/3 pass) |
| `docs/decisions/ADR-047-call-ustp-sources-rag.md`, `docs/plans/call-ustp-rag/OWNER-AUTHORIZATION.md`, `AGENTS.md` | Decision record, owner authorization, standing notice | Governance & auditability | Reviewed |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | PASS/FAIL/NOT RUN/HUMAN REQUIRED | Evidence path / error |
|---|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS | Exit code 0 (post-final edit) |
| Lint | `npm run lint` (`eslint src __tests__ App.tsx index.js --max-warnings 0`) | PASS | Exit code 0, 0 warnings |
| Architecture / cycles | `npm run check:architecture` (`node scripts/check-architecture.mjs`) | PASS | 542 TS modules, 0 import cycles, 0 forbidden deps, 125 offline leaves verified |
| Tool contract check | `node backend_integration/call_lafina_v2/generate-contract.cjs --check` | PASS | `PASS: 17 unique tools; flat grouped schema; contract matches; no network used.` |
| Full Jest suite | `npm test` (`jest --runInBand`) | PASS | 248/248 suites passed, 3,334 passed, 1 skipped, 0 failed |
| Targeted USTP & H1 audit Jest (post cycle-fix edit) | `npx jest __tests__/ai/callUstpSourcesRag.test.tsx __tests__/ai/localHandbookRag.test.tsx __tests__/ai/ustpCdoKnowledge.test.ts __tests__/ui/ustpSourcesLibrary.test.tsx __tests__/ai/appStatusAudit20261116.test.ts --no-coverage` | PASS | 5/5 suites passed, 147/147 tests passed |
| Backend patch & pytest (scratch clone) | `git apply --check backend_integration/call-ustp-rag/LAFINA-backend-call-ustp-rag.patch` + `python -m pytest tests/test_voice_ustp_tool.py --noconftest -v` | PASS | `git apply --check` exit code 0 on `9f0b844`; 3/3 pytest passed |
| Android Gradle unit tests | `Set-Location android; .\gradlew.bat :app:testDebugUnitTest` | PASS | `BUILD SUCCESSFUL in 1m 46s` |
| Backend deployment & ElevenLabs provisioning | Apply patch in `LAFINA-backend`, deploy Vercel, run `scripts/provision_voice_agent.py --update --apply` | HUMAN REQUIRED / NOT RUN | Requires owner backend/ElevenLabs credentials |
| Device manual validation | Online call + offline call + reminder call on physical Android device | HUMAN REQUIRED / NOT RUN | No physical device attached to agent session |

## 4. Performance and device matrix

- On-device SQLite FTS5 `searchUstpSourcesForVoice` latency in Jest (`node:sqlite`, full bundled 2023 Handbook + USTP CDO pack): ~15–50 ms per query.
- Real Android device latency, audio playback, ElevenLabs round-trip timing, and offline Whisper STT + TTS flow: **NOT RUN** (awaiting owner build + device check).

## 5. Reliability, privacy, permissions, licenses

- No new Android permissions requested; no wake word, no background microphone, no Kokoro ONNX, no forbidden modules imported.
- `search_ustp_sources` is strictly read-only, owner-scoped, validates input length/schema and rejects prompt-injection strings, sanitizes returned excerpts (`sanitizePassageForPrompt`), and marks payloads `dataIsUntrusted: true`.
- Confirmed-COR eligibility (`isUstpSchoolEnabled`) and `handbookPreference` remain enforced (D1 a), returning clear student-facing explanations instead of generic no-access errors.

## 6. Human phone verification

1. **Apply backend & ElevenLabs handoff** (required for **online** calls; see `backend_integration/call-ustp-rag/OWNER-HANDOFF.md`):
   - Apply `backend_integration/call-ustp-rag/LAFINA-backend-call-ustp-rag.patch` to `LAFINA-backend`, run pytest, push/deploy to Vercel.
   - Re-provision ElevenLabs agent: `python -m scripts.provision_voice_agent --server-url https://lafina-backend.vercel.app --update --apply`.
2. **Build & install** the updated Android APK on your test phone.
3. **Online Call LAFINA checks** (signed in, Online Mode ON, USTP COR confirmed):
   - Ask *"Is it ok to wear tattered jeans in USTP?"* → Status briefly shows `Checking USTP sources...`; LAFINA replies aloud that torn and tattered jeans are prohibited (**Appendix I, page 120**) and notes dress-code penalties (**Chapter 5, Section 3, page 84**); the in-call **USTP Sources** card appears with **See passages ›** opening the exact stored text.
   - Ask *"Can I wear ripped jeans or flip-flops on campus?"* and follow up *"What about dyeing my hair blue?"* → Grounded Appendix I (p. 120) answers.
   - Ask *"When are second semester midterms?"* → Grounded AY 2026–2027 UG dates with PDF page and `as of November 24, 2026`.
   - Ask *"When does midyear start?"* → Mentions the conflicting dates caveat without choosing one.
   - Ask *"When does first semester AY 2025-2026 start?"* → Refuses cleanly (only has AY 2026–2027).
   - Hang up and open **Chat** → Confirm the assistant reply shows the citation note and **See passages ›**.
4. **Offline Call LAFINA checks** (Airplane Mode / Offline Mode):
   - Call offline and ask *"Is it ok to wear tattered jeans in USTP?"* → LAFINA speaks the plain TTS-safe Appendix I (p. 120) rule with no raw Markdown/URLs and shows the **USTP Sources** card.
5. **Eligibility check**:
   - On an account without a confirmed USTP COR, ask a USTP question → LAFINA clearly explains to review and confirm the USTP COR to enable USTP sources.

## 7. Docs/ADRs changed

- [ADR-047-call-ustp-sources-rag.md](file:///c:/L3mxr/Github%20Repositories/LAFINA-CAPSTONE-agy-development-cont/docs/decisions/ADR-047-call-ustp-sources-rag.md)
- [OWNER-AUTHORIZATION.md](file:///c:/L3mxr/Github%20Repositories/LAFINA-CAPSTONE-agy-development-cont/docs/plans/call-ustp-rag/OWNER-AUTHORIZATION.md)
- [OWNER-HANDOFF.md](file:///c:/L3mxr/Github%20Repositories/LAFINA-CAPSTONE-agy-development-cont/backend_integration/call-ustp-rag/OWNER-HANDOFF.md)
- [AGENTS.md](file:///c:/L3mxr/Github%20Repositories/LAFINA-CAPSTONE-agy-development-cont/AGENTS.md)
- `node scripts/check-architecture.mjs`: **PASS** (`542` modules, `0` import cycles).

## 8. Open blockers and recommended next steps

- **Owner action needed to activate online calls live:** Apply `backend_integration/call-ustp-rag/LAFINA-backend-call-ustp-rag.patch`, deploy `LAFINA-backend`, and run `scripts/provision_voice_agent.py --update --apply` so ElevenLabs registers `search_ustp_sources`. (Offline calls and Ask USTP / Chat work immediately without backend deployment.)

## 9. Review decision

- [x] All automated required checks passing (`typecheck`, `lint`, `check:architecture`, `tool-contract --check`, Jest, backend `git apply --check` + `pytest`, Gradle `:app:testDebugUnitTest`)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated
