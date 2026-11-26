# Owner authorization — Call LAFINA USTP Sources RAG (2026-11-26)

This file records the owner's decisions for the Call LAFINA USTP Sources RAG task (`USTP-CALL-00` to `USTP-CALL-05`, ADR-047).

## What the owner said

1. "lafina has no access to the ustp student handbook, when i call lafina and asked anything about ustp such as \"is it ok to wear tattered jeans in ustp?\" it replied i dont have access to the ustp handbook. plan so that lafina can accurately use our ustp sources rag so she can reply to the user on ustp related stuff."
2. After reviewing the plan and its three decisions (D1–D3): "just do all your recommended plan, Proceed"

The second message approves all recommended options (D1 a, D2, D3) and authorizes executing phases `USTP-CALL-00` through `USTP-CALL-05` without stopping between phases. Device validation and backend deployment remain with the owner.

## Approved decisions

| # | Decision |
|---|---|
| D1 (a) | Keep the existing confirmed-COR gate (`isUstpSchoolEnabled`) and `handbookPreference` for USTP lookups during calls, consistent with Ask USTP (ADR-045). When ineligible or turned off, return a clear spoken explanation instead of a generic no-access reply. |
| D2 | Deliver the `LAFINA-backend` and ElevenLabs agent changes as a reviewable patch + handoff in `backend_integration/call-ustp-rag/` (nothing pushed or deployed from this checkout), and expose `search_ustp_sources` to `ChatAgent` as well as Call LAFINA (online & reminder calls). |
| D3 | Show a compact dismissible in-call USTP Source Card with **See passages** in `CallReadResults` and persist `handbookNote` + `sourcePassageIds` to Chat history when USTP sources back a call turn. |

## Scope of the backend handoff

The approval covers a scoped `LAFINA-backend` handoff patch for Call LAFINA USTP Sources RAG only:

- adding `search_ustp_sources` to the ElevenLabs client-tool provisioning list (`scripts/provision_voice_agent.py`) and backend `approved_voice_tools` allowlist (`app/services/voice_conversation.py` / `app/api/v1/voice.py`);
- updating the voice system/style instructions so LAFINA calls `search_ustp_sources` for USTP questions and answers strictly from its verified passages with citations and caveats;
- reporting `clientUstpTool: true` in `GET /v1/ai/voice/capabilities` so apps with a populated on-device USTP index can skip redundant server-side Pinecone queries on voice sessions;
- unit tests covering the new tool allowlist and continuation behavior.

No external checkout (`LAFINA` or `LAFINA-backend`) was modified, committed, pushed, or deployed. Everything else in `AGENTS.md` still applies.
