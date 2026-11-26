# Owner handoff: Call LAFINA on-device USTP Sources RAG (`search_ustp_sources`, ADR-047)

**Status:** patch only. Nothing was pushed, merged, deployed, or provisioned on ElevenLabs. Your `LAFINA-backend` checkout and worktrees were not modified.

**File:** `backend_integration/call-ustp-rag/LAFINA-backend-call-ustp-rag.patch`

**Base:** `9f0b844` ("Complete backend audit remediation and migration 015"). `git apply --check` passed on `9f0b844`, and `pytest tests/test_voice_ustp_tool.py` passed (`3 passed`).

> **Note if applying after `call-reconnect`:** Both patches add one boolean field to `VoiceCapabilitiesResponse` and `voice_capabilities()` in `app/api/v1/voice.py` (`resume: bool = False` vs `clientUstpTool: bool = False`). Keep both fields if `git apply` asks for a 2-line merge in `app/api/v1/voice.py`; no other files overlap.

## Why this backend + ElevenLabs update is required for **online** calls

- **Offline calls** and **Ask USTP / Chat** use the on-device USTP Sources RAG immediately with this app build.
- **Online calls (ElevenLabs + DeepSeek)** invoke `search_ustp_sources` via ElevenLabs `client_tool_call`. Until the ElevenLabs agent and `LAFINA-backend` allowlist `search_ustp_sources` and advertise `clientUstpTool: true`, online calls continue using the legacy server-side Pinecone path (which lacks the USTP CDO knowledge pack and misses dress-code/campus paraphrases).

## What changes in `LAFINA-backend`

| File | Change |
|---|---|
| `app/services/voice_tool_contract.json` | Synced from `backend_integration/call_lafina_v2/tool-contract.json` (`17` tools, adding read-only `search_ustp_sources(query, collection?)`). Both `approved_voice_tools()` and `scripts/provision_voice_agent.py` read this single file. |
| `app/services/voice_conversation.py` | Updates `VOICE_SYSTEM_INSTRUCTION` and `VOICE_STYLE_INSTRUCTION` so LAFINA always calls `search_ustp_sources` before answering or refusing any USTP policy or campus question, answers strictly from returned passages in 1–3 spoken sentences with section/page/`asOf` date, states caveats without choosing between conflicting dates, and never invents policies or dates. |
| `app/api/v1/voice.py` | Adds `clientUstpTool: bool = False` to `VoiceCapabilitiesResponse` and sets `clientUstpTool=enabled` in `GET /v1/ai/voice/capabilities`. When the app sees `clientUstpTool: true` and its on-device USTP index is populated, it sends `useHandbook: false` to skip redundant server-side Pinecone queries. |
| `app/api/v1/ai.py` | Adds `"search_ustp_sources"` to `CHAT_AGENT_TOOLS` and updates `CHAT_AGENT_INSTRUCTION` so mixed planner + USTP questions in Chat can also invoke it. |
| `tests/test_voice_ustp_tool.py` | Unit tests verifying voice/Chat allowlists, voice prompt rules, and `provision_voice_agent.agent_config()` tool registration. |

No database migration is required for this change.

## Owner steps to deploy & activate

1. In your `LAFINA-backend` repo (with audit / migration 015 merged):
   ```powershell
   git apply path\to\LAFINA-CAPSTONE-agy-development-cont\backend_integration\call-ustp-rag\LAFINA-backend-call-ustp-rag.patch
   ```
2. Run backend tests:
   ```powershell
   python -m pytest tests/test_voice_ustp_tool.py tests/test_voice_conversation.py
   ```
3. Push to GitHub and wait for Vercel production deployment (`https://lafina-backend.vercel.app`) to go live.
4. **Re-provision the existing ElevenLabs voice agent** so ElevenLabs registers `search_ustp_sources` as a client tool (preview first without `--apply`, then apply):
   ```powershell
   python -m scripts.provision_voice_agent --server-url https://lafina-backend.vercel.app --update
   python -m scripts.provision_voice_agent --server-url https://lafina-backend.vercel.app --update --apply
   python -m scripts.provision_voice_agent --check
   ```
5. Verify on your phone: start Call LAFINA (with a confirmed USTP COR) and ask *"Is it ok to wear tattered jeans in USTP?"* — you should see `Checking USTP sources...`, hear the grounded Appendix I (p. 120) answer, and see the in-call **USTP Sources** card with **See passages**.
