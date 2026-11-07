# PHASE 09 (follow-up) — Signed-in online access, ElevenLabs voice choice, DeepSeek contract / Completion Report

**Branch / commit SHA:** mobile `Lem-branch` `af4edfd` (on top of teammate commit `7a4fb87`, which added `graphify-out/`) · backend `codex/open-online-voices` `2d431304f04b8ada48191e535004857f8074d13c` (parent `f0fae4d`, production main)
**Date:** 2026-11-07
**Device(s) available:** Android emulator `Medium_Phone` (`emulator-5554`, `sdk_gphone16k_x86_64`, API 37, x86_64). No physical phone.
**Status:** `AWAITING DEVICE VALIDATION` (plus `BLOCKED` on two owner items: DeepSeek balance, production merge)
**Phase approval provenance:** Phase 09 continuation. The owner asked to "remove the student_pro restriction so all users can use ElevenLabs in online mode only… Let the user choose their voice. Make sure DeepSeek is properly integrated", then clarified "All signed-in users; guests sign in for online features." The earlier backend-change and deployment approval still applies (see `AGENTS.md` task-scoped notice and ADR-028).

## 1. Scope completed

- **Access:** online chat and online speech are open to any active signed-in account (`student`, `student_pro`, `admin`). Guests get "Sign in to use Online Mode" without a server call. Disabled accounts are rejected by the server. Quotas are unchanged. Documents, flashcards and meeting notes keep their Pro gate.
- **Explicit Online Mode:** connectivity no longer enables Online Mode by itself. Toggle races (double taps, a pending enable superseded by Off, a failed preference write) are fenced.
- **Voice choice:** Profile → **Online Voice · ElevenLabs** loads the server catalogue (Online Mode, signed in, internet), saves the tapped voice per account on this device, offers Server default, warns when a saved voice disappears, and has Preview/Stop. Preview reports honestly whether ElevenLabs or the offline device voice spoke.
- **Speech provider:** sends `voiceId`; the cache is keyed by voice; voice, account or mode changes, Stop or disposal cancel silently; timeouts and failures fall back to `react-native-tts` with a per-operation reason; disposing an idle provider no longer stops other speech; offline speech does not need the online preference to be readable.
- **DeepSeek contract:** `useHandbook` camelCase, server message limits (newest turn kept), handbook page/status normalization, `usedHandbook`; explicit "DeepSeek did not reply" messages instead of a disguised local answer; backend prompt no longer claims to save schedules.
- **Backend:** `GET /v1/ai/tts/voices`, validated `voiceId` on `POST /v1/ai/tts`, `has_chat_access`/`has_tts_access` = active account, `provider`/`usedHandbook` in chat responses, `deepseek-flash` default with the retired alias normalized.

Deferred: none of the requested scope. Voice-quality/latency claims are not made.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/cloud/accountLinkService.ts` | `authorizeOnlineMode`: guest → sign-in message; otherwise live profile refresh, no plan check | All signed-in users | `phase09OnlineVoices` access tests |
| `src/cloud/speechService.ts` | voice-aware cache/requests, per-operation `fallbackReason`, timeout fallback vs silent cancel, owned dispose | Voice choice + lifecycle review items | `phase09OnlineVoices` provider tests (3 mutation-checked), `phase05` |
| `src/cloud/onlineVoiceService.ts` (new) | Guarded, fenced catalogue load | No request offline/guest/mode off | catalogue tests |
| `src/storage/onlineVoiceSettingsStore.ts` (new) | `speech.onlineVoice.v1` per account | Separate from offline `speech_tts_v1` | store tests |
| `src/ui/components/profile/OnlineVoice.tsx` (new) | Picker sheet (ToolSheet, theme tokens, radio a11y) | Voice choice | picker UI tests, emulator |
| `src/ui/screens/ProfileScreen.tsx`, `OfflineVoice.tsx` | New row; copy says settings are independent | UI | emulator |
| `src/ui/screens/ChatScreen.tsx` | Opt-in reconnect, fenced toggle, fallback-reason alert | Explicit Online Mode | Jest suites, emulator |
| `src/skills/onlineChatSkill.ts`, `src/ai/chatOrchestrator.ts` | camelCase/limits/normalization; `describeOnlineChatFailure` | DeepSeek integration | DeepSeek contract tests, phase09/phase10 updated |
| `src/scheduler/speechProvider.ts` | `fallbackReason?` | Report fallback | typecheck |
| `__tests__/ai/phase09OnlineVoices.test.tsx` (new), phase05/09/10 tests | 33 new tests; old assertions moved to the new contract | Regression | preflight |
| Backend `app/services/capabilities.py`, `app/api/v1/ai.py`, `app/clients/elevenlabs_tts.py`, `app/config.py`, `.env.example`, tests | See §1 | Server contract | backend suite |
| `backend_integration/` | Helper synced to `2d43130`; new follow-up patch; catalogue test; README | Handoff accuracy | helper tests |

## 3. Tests and real outcomes

| Check | Command / procedure | Result | Evidence |
|---|---|---|---|
| Typecheck, lint, Jest, architecture | `npm run preflight` | PASS: 60 suites, 898 passed, 1 skipped; 229 modules, 0 cycles, 76 offline leaves | `evidence/phase-09-online-voices-20261107/mobile-preflight-summary.txt` |
| New mobile suite | `npx jest __tests__/ai/phase09OnlineVoices.test.tsx` | PASS 33/33; mutations (timeout→cancel, global dispose stop, voice mismatch ignored) each fail tests | this run |
| Prettier | `npx prettier --check` on new/HEAD-clean files | PASS (files that were already unformatted at HEAD left as-is to avoid churn) | — |
| Backend full suite | `.venv/Scripts/python.exe -m pytest -q` (backend clone) | PASS 186 | `backend-full-suite-summary.txt` |
| Backend new tests | `pytest tests/test_online_voices.py` | PASS 9 (the draft had one wrong assertion, register returns 201, fixed) | — |
| Ruff (changed backend files) | `ruff check …` | 1 new B008 (`Depends` in the new route, same FastAPI pattern as 14 existing); other findings pre-existing | — |
| Helper | `pytest backend_integration`, `ruff check backend_integration` | PASS 8; clean | — |
| Live ElevenLabs via real routes | Ephemeral ASGI harness, in-memory SQLite, ordinary registered student, keys from private root `.env` | PASS: catalogue 200 (22 voices); selected non-default voice 200, `audio/mpeg`, 38,913 bytes, voice matches; unknown voice 422 | `live-provider-harness.txt` |
| Live DeepSeek via real route | same harness | **BLOCKED**: upstream HTTP 402 "Insufficient Balance", returned to client as 503 with a clear message. `/user/balance` reports `is_available: false`. A bogus model also gets 402, so `deepseek-flash` could not be validated by a completion | same |
| Vercel branch deploy | GitHub status for `2d43130` | success "Deployment has completed" (branch/preview only, not production) | api.github.com commit status |
| Android build | fresh `createBundleDataQaJsAndAssets`, then `assembleDataQa` (x86_64, via existing `X:` alias) | PASS (a stale `compressed_assets` intermediate had to be deleted first) | `emulator.json` |
| Emulator UI | install `-r`, Profile row/sheet, offline guards, Chat opt-in | PASS for observed items | `emulator.json` |
| Signed-in emulator/phone flows | — | **NOT RUN / HUMAN REQUIRED** (emulator session lacks a cloud token; production lacks the new route until merge) | — |
| Android JVM/Kotlin tests | `:app:testDebugUnitTest` | NOT RUN (no Kotlin/native change in this follow-up; last 43 passed at `91082bc`) | — |
| ARM64 phone APK | — | NOT RUN | — |

## 4. Performance and device matrix

N/A. No latency or audio-quality measurements were taken. The 38,913-byte MP3 is a size observation only.

## 5. Reliability, privacy, permissions, licenses

- No new permissions, dependencies, native modules or migrations.
- Text sent for online speech/chat leaves the device (unchanged policy); the voice preference stays on the device and is not synced.
- Keys stay in ignored root `.env` / server env; staged diffs were scanned against private values with no secret hits (only the public DeepSeek base URL matched).
- Cost: basic students now consume DeepSeek and ElevenLabs quota. Server quotas (10/min, 100/day chat; existing TTS limits; 20,000 chars per process) still apply. Provider-side spending caps are the owner's responsibility.
- Risk: until production is merged, signed-in mobile users still get the old 403 (Pro) from production. The app shows the server message and falls back to native speech or an explicit "DeepSeek could not reply" message.

## 6. Human phone verification

After the backend branch is merged and deployed, and DeepSeek has balance:

1. Install the fresh test build. On the existing emulator package, **sign out and sign in once while online** with an ordinary `student` account (the current local session has no cloud token).
2. Chat → tap **Offline** to switch to Online, then ask a general question. Expect a DeepSeek reply. If it fails, expect a message saying DeepSeek did not reply, not a generic offline answer.
3. Profile → **Online Voice · ElevenLabs** → voices load → tap one (✓ moves, "saved") → **Preview voice**, expecting the notice "ElevenLabs preview finished". Close and reopen: the choice persists. In Chat, the read-aloud button speaks the reply in that voice.
4. Turn Online Mode off or enable airplane mode: Offline Voice, text chat, local scheduling and reminders work and the picker makes no request.
5. As a guest, an Online Mode attempt asks for sign-in. Switching account, Stop or closing the sheet must not play late audio.

The agent cannot certify audibility, voice identity or phone lifecycle behavior.

## 7. Docs/ADRs changed

- `docs/decisions/ADR-029-signed-in-online-voices.md` (new)
- `backend_integration/README.md`, `backend_integration/LAFINA-backend-online-voices.patch` (new), `backend_integration/elevenlabs_client.py`, `test_elevenlabs_client.py`
- `qa/PHASE-09-ONLINE-VOICES-EXECUTION.md` (checklist + manual steps)
- `docs/reports/phase-09-elevenlabs-online-report-20261107.md` (prior emulator follow-up preserved; pointer added)
- Graphify: a teammate committed `graphify-out/` (`7a4fb87`) after this work was tested; it was generated before this follow-up and was not regenerated (no paid extraction). `npm run check:architecture` rerun after the rebase is the import/offline-boundary evidence (229 modules, 0 cycles, 76 offline leaves).

## 8. Open blockers and recommended next steps

1. **Production merge (owner's friend):** merge `codex/open-online-voices` into `main` of `LAFINA-AI/LAFINA-backend` — https://github.com/LAFINA-AI/LAFINA-backend/compare/main...codex/open-online-voices. No environment change is needed (existing `DEEPSEEK_MODEL=deepseek-v4-flash` is normalized).
2. **DeepSeek balance:** the key in the private root `.env` has no available balance (HTTP 402). Top up the DeepSeek account, or confirm the production key differs and has balance, then rerun the chat step.
3. Signed-in device QA (§6) and an ARM64 build for a phone.

## 9. Review decision

- [x] All automated required checks passing (backend Ruff legacy findings noted)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change (Pro-only features untouched; no Kokoro; no writes outside this checkout except the authorized backend branch)
- [x] Report accurate, links validated, docs updated

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval

---

## Addendum — human chat replies (2026-11-07)

Owner report: "hi", "hello" and "what are you?" got the same fixed reply even in Online Mode.

**Cause.**
- In code, greetings were already `chat` intents routed to DeepSeek in Online Mode. In the build the owner was using, any online failure silently fell back to the fixed offline line, and online calls were failing (an older emulator session without a server login; the local `.env` DeepSeek key has no balance).
- Offline replies were broken too:
  - "hi" hit the generic fallback, because the greeting regex ran on the parser's `details: "Greeting"` label instead of the text.
  - "how are you?" and "what can you do?" were tagged `Identity`.
  - "thanks" and "ok" outside a reminder call answered "You have no active reminders to acknowledge".

**Change.**
- New `src/ai/localConversation.ts`, shared by Chat and the voice executor. It classifies small talk and builds varied replies using the first name, time of day and what is left on today's plan, never repeating the opener it just used. Questions it cannot answer offline point to Online Mode with a rotating example command.
- Online Mode still sends every conversational message, greetings included, to DeepSeek first.
- If DeepSeek fails, small talk gets the on-device reply labelled "(Offline reply: DeepSeek is not available right now.)", and real questions get the explicit failure message.
- On-device replies are tagged `localReply` in existing `messages.metadata_json` (no migration). They and legacy fixed lines are excluded from the history sent to DeepSeek, so it does not imitate them.
- Plain "thanks" and "ok" with no ringing call and nothing to acknowledge become conversation. The refused review writes nothing. Real reminder acknowledgement is unchanged.
- Backend `23acd93` (same unmerged branch): the persona introduces itself only when asked or on the first greeting, keeps small talk short and varied, and matches the student's tone and language. Requires the merge.

**Verification.**
- `npm run preflight`: 61 suites, 930 passed, 1 skipped; architecture 230 modules, 0 cycles, 76 offline leaves.
- New `__tests__/ai/chatConversation.test.ts` (32 tests). Removing the DeepSeek-history filter or the "thanks" reroute fails tests.
- Updated pinned expectations in the phase08 and phase09 suites.
- Backend suite: 187 passed.
- Fresh x86_64 build on `emulator-5554`:
  - Online Mode, "hi" got a real DeepSeek reply from production (so the production DeepSeek key works; the local `.env` key does not). It was still the long old-prompt introduction until `23acd93` is deployed.
  - Offline: "hi" got "Hello, Lem! What can I help you with?"; "how are you" got "Pretty good, Lem! … How are you holding up?"; "thanks" got "Anytime! Let me know if you need anything else."
  - Online Mode was switched back on afterwards. Screenshots are in ignored `.local/qa-online-voices/`.

**Not run:** a DeepSeek reply under the new prompt (needs the merge); physical phone.

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval
