> **Follow-up 2026-11-07 (not yet in production):** backend commits [`2d43130` + `23acd93` on `codex/open-online-voices`](https://github.com/LAFINA-AI/LAFINA-backend/compare/main...codex/open-online-voices) opens online chat and ElevenLabs speech to every active signed-in account (guests and disabled accounts denied; quotas unchanged), adds authenticated `GET /v1/ai/tts/voices` and an optional validated `voiceId` on `POST /v1/ai/tts`, returns `provider`/`usedHandbook` from chat, and defaults DeepSeek to `deepseek-flash` (the retired `deepseek-v4-flash` env value is normalized; no Vercel variable change needed). `elevenlabs_client.py` here now mirrors that commit; `LAFINA-backend-online-voices.patch` (a `git am` series of both commits) applies on top of production main `f0fae4d`. `23acd93` makes the DeepSeek persona conversational: it introduces itself only when asked or on the first greeting. `LAFINA-backend-elevenlabs.patch` is the earlier migration only. See ADR-029 and `docs/reports/phase-09-online-voices-report-20261107.md`.
>
> **Activation:** the Vercel owner merges `codex/open-online-voices` into `main` (or applies the follow-up patch with `git apply --check` first) and lets Vercel redeploy. Then verify that `/openapi.json` lists `/v1/ai/tts/voices` and that an ordinary `student` session gets 200 from `/v1/ai/tts/capabilities` and `/v1/ai/tts/voices`, while unauthenticated requests still get 401. DeepSeek also needs available account balance: the key in the private root `.env` returned HTTP 402 Insufficient Balance on 2026-11-07.

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
   ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
   ELEVENLABS_MODEL_ID=eleven_flash_v2_5
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
