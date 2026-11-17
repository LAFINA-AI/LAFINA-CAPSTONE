# CALL-FIX 04/06/07/08 — backend deployment follow-up

**Date:** 2026-11-17 UTC  
**Backend commits:** `6057d2bd7a69f13f417ff8448de31adca3026d44`, `dfbeecb9a9e9366a6cc41d7fb73635e1d1895c2e`  
**Existing project:** `nblancs-projects/lafina-backend`, `https://lafina-backend.vercel.app`  
**Device used:** NONE; signed-in phone validation NOT RUN  
**Approval:** Owner answered “Authorize this scoped backend exception” to the explicit backend publication, existing-project deployment and existing-agent update request. See [OWNER-AUTHORIZATION.md](OWNER-AUTHORIZATION.md).

## 1. Scope completed

Published the call capability/prompt, structured contract and streaming/retrieval fixes to the existing backend branch and main using normal fast-forward Git pushes. The Git-connected Vercel workflow deploys the existing project. No hosting, credential, account, quota, database, sync, voice or model replacement was made.

Updated existing production ElevenLabs agent `agent_3301m72cp0msf3ftqdkswte8qg16` in place. Its prior configuration had **zero client tools**, no `client_tool_call` event, and patient turn eagerness. It now has 14 validated tools, the callback event and normal eagerness. A before/after comparison verified all unrelated conversation/platform/workflow settings, including authentication, remained identical. No new agent or secret was created.

## 2. Changes and verification discoveries

- The fresh full backend suite exposed loss of `additionalProperties=false` during contract generation; restored it for every server tool so shared chat remains strict.
- Updated one existing contract regression test to match the mobile registry's alarm read kind and location/category fields. The final patch has the original five implementation/config files plus two regression-test files (seven files total); this adds no new feature scope.
- ElevenLabs rejected the OpenAI schema keyword `additionalProperties` and bare nested type/enum properties. Its rejected HTTP 400 requests did not apply changes. Added a provisioning adapter that strips the unsupported keyword only for ElevenLabs and supplies missing descriptions, preserving the original strict DeepSeek schema. The corrected minimal PATCH succeeded and was read back for validation.
- Did not use the full provisioning command for the live update: it could replace unrelated settings or create a secret. The applied PATCH changed only tool definitions, turn eagerness and the required client-tool callback event.

## 3. Tests and real outcomes

Deployment result: **production / READY** (Vercel Git status: Deployment has completed), URL `https://lafina-backend.vercel.app`, commit `dfbeecb9a9e9366a6cc41d7fb73635e1d1895c2e`, framework FastAPI. Build duration is unavailable through the connected account; it is not estimated from status timestamps. Direct runtime error scans, drains and monitoring inspection were NOT RUN because this connection lacks access to the existing Vercel team.

| Check | Result | Evidence |
|---|---|---|
| Fresh full backend suite | **288 passed**, 12 existing marker/deprecation warnings | [backend-fresh-full-tests-final.log](backend-fresh-full-tests-final.log) |
| Critical Python lint | PASS | [backend-critical-lint.log](backend-critical-lint.log) |
| Pinned patch application | PASS, seven files | [backend-patch-check.log](backend-patch-check.log) |
| Live agent update/readback | PASS; schemas, callback, normal eagerness, auth and unrelated-settings comparison | [live-agent-update.json](live-agent-update.json) |
| Production HTTP boundaries | `/healthz` and OpenAPI 200; both unauthenticated voice POSTs 401 | [production-http-check.json](production-http-check.json) |
| Vercel deployment | Existing Git deployment; final status recorded separately | [deployment-status.json](deployment-status.json) |
| Mobile preflight/Android | Previously passed, unchanged by backend publication | [README.md](README.md), [artifact.json](artifact.json) |
| Physical phone / signed-in voice / actual latency | NOT RUN | [MANUAL-CHECKS.md](MANUAL-CHECKS.md) |

Full backend command in the isolated fresh checkout: `python -u -m pytest -p pytest_asyncio.plugin -q`, with the isolated dependency path and pytest plugin autoload disabled. Critical lint selected E9,F63,F7,F82; full Ruff lint is not claimed. A mistaken initial health probe used the undefined `/health` route; the actual `/healthz` check passed.

## 4. Performance and device matrix

No conversational timings, peak PSS, audio-route quality or physical interruption timings were measured. HTTP probe durations are not voice latency. [latency-benchmark.json](latency-benchmark.json) retains n=0 and null percentiles. The prompt, retrieval, early tool signaling and normal eagerness changes address identified delay sources; ChatGPT voice-mode parity remains an unverified user experience target.

## 5. Reliability, privacy and permissions

Production health/auth checks created no accounts, sessions, planner records or billable provider requests. The existing local ElevenLabs key was read in memory and transmitted only to the provider API; no key values were printed or copied into tracked files. Existing auth/grant references and all unrelated agent configuration were preserved.

The GitHub connector allowed reads but rejected writes with 403. Native Git's existing credential helper successfully published the scoped commits. PR creation through the connector also returned 403, so no PR exists; explicitly authorized main deployment used a normal fast-forward push. Direct Vercel project/observability access remains unavailable (403 and team authorization returned 404); deployment evidence uses the established GitHub Vercel status and public HTTP contract. No private runtime error scan, drain inventory or monitoring inspection was possible.

## 6. Human phone verification

Install/open the QA APK without clearing data, enable Online Mode and start a **new call** so the agent settings refresh. Check clean Capstone Meeting title, persistent waveform, missing-time clarification, confirmation/edit/cancel safety, preserved recurrence/location, grouped requests, interruptions/Stop, mute and reconnection. Measure natural pauses and end-of-speech response time on Wi-Fi and mobile data. All these physical checks are NOT RUN; use the full [manual checklist](MANUAL-CHECKS.md).

## 7. Documentation

Updated backend patch/manifest, authorization, reviewer handoff, manual prerequisites and benchmark deployment flags. The original phase reports are historical snapshots; this follow-up supersedes their backend authorization/publication blockers.

## 8. Remaining work and rollback

Physical-device/sign-in quality checks remain human-required. Rollback, if needed: revert only these two backend commits through the existing Git workflow, and restore the existing agent's prior tool/event/eagerness configuration from the ignored local pre-update snapshot. Do not rotate keys or create a replacement project/agent. No schema migration is involved.

## 9. Review decision

- [x] Full backend regression suite and required mobile automated gates passed
- [x] Existing production agent updated/read back with auth and unrelated settings preserved
- [x] Production health and missing-auth boundaries verified
- [ ] Phone/signed-in audio/latency checks completed

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval/device validation
