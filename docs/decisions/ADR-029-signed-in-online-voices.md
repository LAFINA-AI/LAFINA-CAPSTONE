# ADR-029 — Online Mode for every signed-in account, with a chosen ElevenLabs voice

Date: 2026-11-07. Status: accepted by the owner; backend branch pushed, production merge pending; signed-in device validation pending.

## Context

ADR-028 moved online speech to ElevenLabs but kept it, and DeepSeek chat, behind the `student_pro` plan. The owner then asked to remove that restriction so all users can use ElevenLabs in online mode, to let users choose their voice, and to make sure DeepSeek is properly integrated. They clarified: **all signed-in users; guests sign in for online features.** Existing backend-change and deployment approvals for this Phase 09 continuation remain valid.

## Decision

1. **Access.** Online chat (DeepSeek) and online speech (ElevenLabs) require an authenticated, **active** account of any role (`student`, `student_pro`, `admin`). Guests are asked to sign in. Disabled accounts stay denied. Per-account quotas, usage recording and the per-process ElevenLabs character ceiling are unchanged. Only these two features are broadened: backend `has_online_ai_access` (documents, flashcards, meeting notes) and mobile `hasProEntitlement` keep their Pro meaning.
2. **Online Mode stays explicit.** Saved `chat.onlineMode === 'true'` is required for any online request. Connectivity alone no longer turns it on; the former code could auto-enable it when the preference was unset.
3. **Voice choice.** A new authenticated `GET /v1/ai/tts/voices` returns a bounded, five-minute cached, sanitized catalogue (`{provider, defaultVoiceId, voices:[{id,name}]}`). `POST /v1/ai/tts` accepts an optional `voiceId` (`[A-Za-z0-9_-]{1,128}`). An explicit ID must be in the current catalogue before any paid generation; unknown IDs return 422 and are never silently swapped for another voice. No ID means the configured server default.
4. **Storage.** The choice is saved on the device per account under `speech.onlineVoice.v1` in `local_settings` (`{id,name}` or null). It is separate from `speech_tts_v1` (Android offline voice, speed, pitch), is not synced, and needs no schema change. Corrupt data is rejected rather than sent.
5. **Speech lifecycle.** Prepared audio is cached per `[voiceId, text]`. A voice, account or mode change, explicit Stop, a newer request or disposal cancels silently. An ElevenLabs **timeout** or failure falls back to `react-native-tts` and reports why (`fallbackReason`, per operation, never shared). An idle provider's disposal does not stop other speech. Offline speech never depends on reading the online preference.
6. **DeepSeek.** The client sends `useHandbook` (the backend ignored the old `use_handbook`), keeps the newest turn within 10 messages / 4,090 characters each / 8,000 total, and reads `usedHandbook`, `provider`, string handbook pages and `enabled`/`functional`/`passages` status. A failed online reply says DeepSeek did not answer (sign-in, disabled, offline, limit or generic). It is never passed off as a local reply. The backend system prompt no longer claims it saved schedules; local schedule actions stay deterministic and confirmed on the device.
7. **Model.** The backend default is `deepseek-flash`, and the retired `deepseek-v4-flash` alias is normalized, so the existing deployment variable keeps working.

## Consequences

- Basic students can use online chat and speech within existing quotas, so ElevenLabs and DeepSeek spending rises with use. Provider-side spending limits remain the owner's responsibility.
- Production needs the backend branch merged and redeployed. Until then the deployed server keeps the old Pro restriction and has no voice catalogue route; the mobile picker reports the error and native speech continues.
- No new mobile dependency, permission, native module or migration.
- Architecture check after the change: 229 modules, 0 cycles, 76 offline leaves with no network reachability. Graphify output is absent in this checkout; the AST checker is the documented substitute.
