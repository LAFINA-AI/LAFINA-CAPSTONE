> **Call LAFINA reliability & first-person follow-up patch (`LAFINA-backend-voice-reliability.patch`):** Based on `LAFINA-AI/LAFINA-backend` branch `codex/call-lafina-tool-bridge` (`d511ceb`). Applies four fixes while keeping existing auth/billing/midstream-SSE contracts intact: (1) switches `VOICE_STYLE_INSTRUCTION` and `system_prompt_voice.txt` to first-person speech ("I", "me", "my") without third-person self-reference; (2) runs Pinecone handbook retrieval only on university/policy turns (`_should_use_voice_handbook`) with a 2.5s timeout so casual/scheduling turns do not stall time-to-first-token; (3) emits `"started"` immediately on DeepSeek `tool_calls` deltas instead of buffering until `[DONE]`; and (4) returns a brief spoken 200 SSE retry on transient pre-stream `DeepSeekError`s (timeout/transport/empty content, preserving HTTP 503 for 402 billing and 401/409/429 limits) so ElevenLabs does not drop the call with `custom_llm generation failed`. Apply via `git apply --check LAFINA-backend-voice-reliability.patch && git apply LAFINA-backend-voice-reliability.patch`, run `pytest tests/test_voice_conversation.py`, and redeploy Vercel.

> **Live voice conversation, 2026-11-08 (NOT in production).** Branch `codex/voice-conversation` (commit `a3d1671`) in `LAFINA-AI/LAFINA-backend` is based on production main `0ab2b60`. It adds:
> - `GET /v1/ai/voice/capabilities`;
> - `POST /v1/ai/voice/sessions` (signed URL + short-lived grant, `no-store`);
> - `POST /v1/ai/voice/sessions/{id}/connected|end` and `GET /v1/ai/voice/sessions/{id}`;
> - `POST /v1/ai/voice/llm/chat/completions`, the ElevenAgents custom-LLM route on DeepSeek;
> - table `voice_sessions` (migration `013_voice_sessions`, RLS owner policy);
> - `scripts/provision_voice_agent.py`.
>
> Existing chat/SSE/TTS routes are unchanged. The design is in ADR-030 and the evidence in `docs/reports/phase-09-voice-conversation-report-20261108.md`. On 2026-11-08 production returned 404 for `/v1/ai/voice/capabilities`.
>
> **Owner activation, in order. Every step needs the owner or the Vercel owner; none were done from this chat.**
> 1. In ElevenLabs, give the server's API key the **ElevenAgents (Conversational AI) read/write** permission, or create a key that has it. The current key answers `missing_permissions` on `/v1/convai/agents` and `/v1/convai/secrets`. Ordinary TTS keeps working either way.
> 2. Generate a random shared secret (for example 48 hex characters). Put it in Vercel as the server-only variable `ELEVENLABS_AGENT_LLM_SECRET`, and in the private root `.env` used to run the script. Never put it in the app.
> 3. From the backend checkout with that `.env`, review the agent config: `python -m scripts.provision_voice_agent --server-url https://lafina-backend.vercel.app` is a dry run that prints it with secrets redacted. Then create the agent: `python -m scripts.provision_voice_agent --server-url https://lafina-backend.vercel.app --apply`.
>
>    The agent is private (`enable_auth: true`), uses `custom-llm` pointing at `/v1/ai/voice/llm`, `eleven_v4_turbo`, patient turn-taking, `pcm_16000`, and allows overriding the voice and extra body. The script uploads the secret to the ElevenLabs secret store and prints only the new agent id.
> 4. Set `ELEVENLABS_AGENT_ID=<that id>` in Vercel. Optional limit variables are listed in the backend `.env.example`.
> 5. Merge `codex/voice-conversation` into `main`, and let Vercel redeploy.
> 6. Apply migration 013 to production once, with the unpooled URL: `python -m alembic upgrade head`. Until it runs, session creation fails with a server error. The app then shows "unavailable"; nothing else is affected.
> 7. Verify:
>    - unauthenticated `/v1/ai/voice/capabilities` returns 401;
>    - a signed-in `student` gets `enabled: true`;
>    - `python -m scripts.provision_voice_agent --check` lists no problems;
>    - then run the mobile checklist in `qa/PHASE-09-VOICE-CONVERSATION-MANUAL.md`.
>
> **Privacy:** unlike push-to-talk, a live conversation **streams microphone audio to ElevenLabs** while it is open and unmuted. The consent notice says so before the first session. Billing: ElevenAgents conversation minutes (ElevenLabs plan) plus DeepSeek tokens, both recorded per account (`voice_session`, `voice_turn`).

> **Follow-up 2026-11-07 (in production since `main` was fast-forwarded to `872197a` on 2026-11-07):** backend commits [`2d43130` + `23acd93` on `codex/open-online-voices`](https://github.com/LAFINA-AI/LAFINA-backend/compare/main...codex/open-online-voices) opens online chat and ElevenLabs speech to every active signed-in account (guests and disabled accounts denied; quotas unchanged), adds authenticated `GET /v1/ai/tts/voices` and an optional validated `voiceId` on `POST /v1/ai/tts`, returns `provider`/`usedHandbook` from chat, and defaults DeepSeek to `deepseek-flash` (the retired `deepseek-v4-flash` env value is normalized; no Vercel variable change needed). `elevenlabs_client.py` here now mirrors that commit; `LAFINA-backend-online-voices.patch` (a `git am` series of all four commits) applies on top of production main `f0fae4d`. `23acd93` makes the DeepSeek persona conversational: it introduces itself only when asked or on the first greeting. `afaa36b` adds `POST /v1/ai/chat/stream` (Server-Sent Events; same access and quotas as `/v1/ai/chat`), which the app uses to show replies as they are written. Until it is deployed, the app falls back to `/v1/ai/chat` automatically. `872197a` lists six Filipina voices first in the catalogue (with language and gender labels) and defaults to Camille on `eleven_v4`. `LAFINA-backend-elevenlabs.patch` is the earlier migration only. See ADR-029 and `docs/reports/phase-09-online-voices-report-20261107.md`.
>
> **Activation:** if Vercel sets `ELEVENLABS_VOICE_ID` or `ELEVENLABS_MODEL_ID`, change them to `BtcCEANLn920ZIoN9grW` and `eleven_v4` (or remove them to use those defaults). Then the Vercel owner merges `codex/open-online-voices` into `main` (or applies the follow-up patch with `git apply --check` first) and lets Vercel redeploy. Then verify that `/openapi.json` lists `/v1/ai/tts/voices` and `/v1/ai/chat/stream`, and that an ordinary `student` session gets 200 from `/v1/ai/tts/capabilities` and `/v1/ai/tts/voices`, while unauthenticated requests still get 401. DeepSeek also needs available account balance: the key in the private root `.env` returned HTTP 402 Insufficient Balance on 2026-11-07.

> Production verified 2026-11-07: main `f0fae4d814cfa5d75590db951404164d35b60023` is deployed. The new ElevenLabs/MP3 contract is live and missing-auth requests are rejected (401). Signed-in speech and phone checks remain NOT RUN. The owner has completed the merge/deployment steps below.

# ElevenLabs online voice — deployment handoff

The mobile app and backend remain separate repositories. Mobile changes are in this checkout on `Lem-branch`. The tested backend change is [commit 34f9fba on `codex/elevenlabs-online-tts`](https://github.com/LAFINA-AI/LAFINA-backend/tree/codex/elevenlabs-online-tts) in `LAFINA-AI/LAFINA-backend` (local authorized worktree: `.local/elevenlabs-backend-work`). No production host change is required.

## Provider flow

- Existing `/v1/ai/chat` and DeepSeek are unchanged.
- New authenticated `GET /v1/ai/tts/capabilities` advertises `provider=elevenlabs`, `enabled=true`, `mimeType=audio/mpeg` only when the server key is configured.
- Existing `POST /v1/ai/tts` retains `requestId` and `text` (max 512 characters), adds `provider=elevenlabs`, and returns MP3 base64 with a provider marker. Existing account entitlement, per-minute/day quota, and AIUsage recording remain in the actual backend route.
- Mobile checks capabilities first. An old server never receives a synthesis request from the migrated client. Unsupported/offline/unentitled/failed cloud speech falls back to the existing local `react-native-tts` path.
- Chat's existing read-aloud button uses ElevenLabs only in Online Mode. Incoming reminder speech and Profile's voice test use the same explicit saved Online Mode gate. Switching offline, leaving Chat, backgrounding, and Stop retire Chat speech. A new read replaces the previous owner.

## Friend who owns Vercel: activation steps

1. Review and merge [the backend branch](https://github.com/LAFINA-AI/LAFINA-backend/compare/main...codex/elevenlabs-online-tts). A branch is published; PR creation through the connected GitHub integration was denied (403), so no PR was created. Alternatively apply `LAFINA-backend-elevenlabs.patch` against reference `967180269bed21a0a88eadc03414d144c2b5728b` with `git apply --check` first. The branch includes updated endpoint tests and preserves DeepSeek/auth/sync.
2. In the existing Vercel **lafina-backend** project, add server-only environment variables:

   ```dotenv
   ELEVENLABS_API_KEY=<private key>
   ELEVENLABS_VOICE_ID=BtcCEANLn920ZIoN9grW
   ELEVENLABS_MODEL_ID=eleven_v4
   ELEVENLABS_MAX_CHARACTERS_PER_PROCESS=20000
   ```

   Configure the target environment (production, and preview if testing there). Use a hidden/secret variable for the key. The voice ID is a working initial voice selection, not a final voice-quality decision. Gemini credentials are no longer used by the TTS endpoint. Keep existing DeepSeek, database and account settings.
3. Redeploy after saving environment variables. Source and environment changes only take effect in a new deployment. Do not expose keys through mobile bundling/BuildConfig/public variables.
4. Verify `/v1/ai/tts/capabilities` with an existing authorized student_pro session: provider must be ElevenLabs and enabled. Unauthenticated requests must fail. Test one short synthetic speech request; its MIME type must be `audio/mpeg`.
5. Install/build the updated mobile app and run `qa/PHASE-09-ELEVENLABS-MANUAL.md`. The production URL remains `https://lafina-backend.vercel.app`.

The owner reports the friend has already added the ElevenLabs key to the backend project. This could not be independently verified: the connected Vercel account cannot see that project, and production activation and environment verification from this chat are NOT DONE. The earlier pre-merge production check returned 404; the merged deployment now exposes the route and correctly returns 401 without authentication. No replacement project was created. Free hosting does not require placing the backend inside the mobile repo. Hosting/runtime quotas and ElevenLabs API usage are separate.

## Local verification

```powershell
npm run preflight
python -m pytest backend_integration -q
python -m ruff check backend_integration
python -m backend_integration.smoke
```

The smoke command explicitly consumes a short TTS generation, reads private root `.env` values without printing them, saves audio under ignored `.local/`, and writes privacy-safe evidence JSON. It tests the provider adapter, not hosted authentication or Android audibility.

`requirements*.txt` describe the standalone adapter test environment. The real backend retains its own `pyproject.toml`; no production dependency replacement is required. Its full tests run in an isolated `.venv` with synthetic SQLite data.

## Limits and privacy

No microphone recordings are uploaded by this feature. Text selected for online speech leaves the device, and provider retention policies apply; do not assume enterprise zero-retention support. MP3 files are private temporary cache files removed after direct playback/disposal. No speed or voice-quality claims have been established on a phone.

The 20,000-character provider-client ceiling is per process and resets on restart; it supplements existing durable account quotas and an ElevenLabs key/account spending limit. It is not a monthly billing cap. Retries reuse neither completed requests nor failed billable request IDs within a warm provider client.

Vercel GitHub check for backend commit `34f9fba`: **success / Deployment has completed** ([owner dashboard](https://vercel.com/nblancs-projects/lafina-backend/AmaXowDD7wb2BRdSswEmkHKcUP1E)). This is a branch deployment signal, not a verified production rollout. The owner must review and promote or merge/redeploy it for the unchanged mobile production URL.

Fresh ARM64 QA artifact: `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk` (145,746,246 bytes). SHA256 and build logs are in `docs/reports/evidence/phase-09-elevenlabs-20261107/apk.json`. Host checks passed; installation/audibility/phone lifecycle checks are NOT RUN.
