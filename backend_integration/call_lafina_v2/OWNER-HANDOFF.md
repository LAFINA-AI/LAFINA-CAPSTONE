# Call Lafina 2.0 backend-owner handoff

Status: EXTERNAL_BLOCKED. No backend files, deployment, keys, account settings or ElevenLabs agent were modified. The checked-out mobile fixes do not activate remote tools by themselves.

Reviewed backend source: `LAFINA-AI/LAFINA-backend` at `5866aa241922b710d32d6d56277a8ef24a6aa178`. Rebase this proposal onto the owner's current revision before implementation. Read-only source receipts are under `docs/audits/call-lafina-v2-codex/evidence/backend-*`. The owner must verify current production configuration; source inspection is not live provisioning evidence.

## Prepared contract

`tool-contract.json` is generated from the actual mobile `REGISTERED_TOOLS`, including flat grouped item fields. It contains no credentials. Reproduce with `node backend_integration/call_lafina_v2/generate-contract.cjs`; verify drift with the same command plus `--check`. This is a reviewable integration contract, not an applied backend patch.

## Changes that require backend-owner access

1. In `scripts/provision_voice_agent.py`, include `client_tool_call` in client events. Provision the allowlisted client tool declarations with response expected and bounded timeout. Merge into the existing agent; retain its custom LLM URL, secret-store reference, signed grant header, PCM format, interruption/turn settings, voice and existing IDs. Verify the current ElevenLabs tool API/schema before applying; newer configurations may use tool IDs. Never replace the hosted project or expose keys in the app.
2. In `app/api/v1/voice.py`, accept only the server-owned allowlist from this contract. Reject unknown definitions or schema drift from incoming `body.tools`; do not forward arbitrary caller-defined tools. Continue checking shared-secret authentication, grant, conversation/session/owner, entitlement, expiry, quota and atomic turn reservation before a paid call. Forward the approved definitions to DeepSeek.
3. In `app/clients/deepseek.py`, add optional tools to the voice stream API (ordinary chat callers keep existing behavior). Add `tools` and supported `tool_choice` only when approved tools exist. Stream `delta.tool_calls` as structured deltas, preserving index, ID, function name and argument fragments; never merge fragments by arrival order alone. A tool-only completion is valid. Propagate finish reason `tool_calls`; preserve usage accounting and existing non-thinking mode/model. Never emit `reasoning_content` to ElevenLabs or logs.
4. In `app/services/voice_conversation_service.py` and the voice route, preserve bounded assistant `tool_calls` and matching `tool` results, including tool_call_id. The present user/assistant-only filter drops this exchange and requires a trailing user turn. A validated trailing tool result needs a continuation. Reject orphan/duplicate/mismatched IDs, unknown tool names, oversized JSON/history, forged system messages and dangling partial exchanges. Truncate whole exchanges together. Give each bounded continuation its own quota/idempotency reservation; do not bypass quotas or charge twice on replay. Handbook retrieval should use actual user text, not tool JSON.
5. Relay DeepSeek tool deltas and finish reasons in OpenAI-compatible SSE rather than treating every non-text event as final usage. ElevenAgents must then deliver the client event to the phone, wait for the phone's result and return that result to DeepSeek. The backend must not directly mutate a student's device SQLite database. Only the phone's explicit Confirm/Save writes.
6. Enforce spoken-output rules before provider synthesis. The mobile transcript sanitizer cannot retract audio already generated remotely. Strip hidden reasoning and unsupported markup at the server/agent boundary; for a streamed reasoning/markup block, buffer until safe or discard the block before emitting speech text. Respect contextual language/briefness/slow-phrasing requests or explain the limitation. A saved language or prompt is not a native-speaker quality certification, and slow wording is not a verified playback-speed change.
7. Verify schema migration 013, deployed revision, session endpoints, existing voice catalog/override, agent/DeepSeek permissions and balance. Preserve authentication, subscriptions, sync, RAG and existing spending limits. Background microphone service and image input remain deferred.

## Backend CI acceptance before provisioning

- Mock upstream SSE with split function arguments, two interleaved tool indices, tool-only finish, empty/malformed fragments, unknown tools and hidden reasoning. Assert exact outbound allowlist and no reasoning leakage.
- Test user → assistant tool call → matching result → continuation. Bound characters/messages without orphan results; reject spoofed owner/system data. Exercise duplicate IDs and exhausted per-minute/day/session quotas for continuations.
- Retain all existing auth/grant/expiry/conversation-owner, entitlement, RAG, usage/error (401/402/429/timeout) and ordinary text-chat tests. Simulate client cancellation before and during streaming; ensure safe finalization and no unbounded paid retry.
- Check generated tool names/fields against `tool-contract.json`, including grouped flat `date`, `time`, `endTime`, `body` and no client-supplied owner/session IDs.

## Authorized live acceptance after owner deployment

Use a synthetic account and bounded paid usage. Capture redacted event types/IDs and actual deployed revision/config receipt. Ask for an agenda and note search, prepare/correct/cancel/confirm a task, explicitly save/undo memory and save a grouped request. Confirm no writes before the physical tap, one actual local entity/outbox/receipt after the tap, verified native registration or an honest pending warning, and a spoken result grounded in the returned result. Repeat on a production-mode build: dataQa success does not certify the production backend. No keys, grants, signed URLs or private transcript content in logs.

All backend CI, provisioning, authenticated provider and phone checks above remain NOT_RUN in this remediation. The owner needs backend repository/deployment access and an ElevenLabs account with agent write/read plus the existing voice/TTS permissions; Codex did not request or copy credentials.

Primary provider references: [ElevenLabs client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools), [tool API](https://elevenlabs.io/docs/eleven-agents/api-reference/tools/create), [DeepSeek API compatibility](https://api-docs.deepseek.com/guides/function_calling). Verify these against the installed/deployed API version before applying.
