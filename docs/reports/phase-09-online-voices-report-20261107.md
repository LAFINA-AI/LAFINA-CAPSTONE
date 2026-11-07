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

---

## Addendum — streaming chat replies (2026-11-07)

Owner request: show the reply while DeepSeek writes it, a piece at a time like ChatGPT, instead of waiting for the whole answer.

**Backend `afaa36b` (same unmerged branch `codex/open-online-voices`).**
- New `POST /v1/ai/chat/stream`, sending Server-Sent Events:
  - `{"type":"delta","text"}` for each piece of the reply;
  - then `{"type":"done", provider, usedHandbook, sources, model, usage, requestId, createdAt}`;
  - or `{"type":"error", status, message}` if DeepSeek stops part-way.
- It shares access, the 8,000-character limit, the per-minute and daily quotas, and handbook retrieval with `/v1/ai/chat`. That logic moved into `_prepare_chat`, and `/v1/ai/chat` is unchanged.
- Provider errors before the first piece remain ordinary HTTP errors.
- The request counts toward the chat quota once the reply starts, so disconnecting part-way does not avoid the quota. Token counts are filled in when the reply finishes.
- `DeepSeekClient.chat_completion_stream` uses the same model, settings and error mapping as the regular call, now shared through `upstream_error()`.
- `LAFINA-backend-online-voices.patch` is regenerated as a `git am` series (now 4 commits) on `f0fae4d`.

**Mobile.**
- `cloudClient.stream` uses React Native's `XMLHttpRequest`, because RN `fetch` cannot read a body incrementally. HTTP errors map exactly as in `request`, through the extracted `errorResult`.
- `onlineChatSkill.streamChatMessage` parses events split anywhere and reports the growing reply.
- It falls back to `/v1/ai/chat` when:
  - the route is missing (404/405), and it remembers this for the session;
  - the stream fails before any text.
- Quota, sign-in and plan errors are returned without a second request.
- A reply cut off part-way keeps the text that arrived and gets the label "(The reply was cut off before it finished. Ask again to get the rest.)".
- The orchestrator streams only when the caller passes `onReplyText`, which only Chat's typed messages do. Voice, call and document paths are unchanged.
- Only the finished reply is saved.
- ChatScreen:
  - shows the question immediately and swaps the typing dots for a live reply bubble with a caret;
  - repaints at most every 50 ms;
  - replaces the live bubble with the saved message in a single render.
- Offline Mode never touches the network.

**Verification.**
- Backend suite: 195 passed, including 8 new tests in `tests/test_chat_stream.py`:
  - pieces forwarded in order, with SSE keep-alive comments skipped;
  - provider errors as HTTP errors with no quota row;
  - an empty reply returns 502;
  - a failure part-way ends with an error event and still counts;
  - guests and disabled accounts never reach DeepSeek;
  - the shared per-minute quota.
- `npm run preflight`: 62 suites, 946 passed, 1 skipped; architecture 230 modules, 0 cycles, 76 offline leaves.
- New `__tests__/ai/chatStreaming.test.tsx` (16 tests):
  - event splitting, fallback and its memory, no double request on 429/401/403;
  - interrupted replies;
  - XHR incremental delivery and error mapping;
  - only the final reply persisted;
  - the ChatScreen live bubble and its replacement.
- Production check without credentials: `POST /v1/ai/chat/stream` returns 404 (not deployed) and `/v1/ai/chat` returns 401.
- Fresh x86_64 build on `emulator-5554`, Online Mode: "give me one quick study tip" got a real DeepSeek reply through the automatic fallback. Screenshots `stream-0*.png` are in ignored `.local/qa-online-voices/`.

**Not run:**
- Piece-by-piece display on a device against a live DeepSeek stream. This needs the merge, and the local `.env` DeepSeek key returns 402.
- Whether Vercel's Python runtime sends the stream unbuffered. If it buffers, the reply still arrives whole and complete, as it does today.
- Physical phone.
---

## Addendum — Filipina voices and eleven_v4 (2026-11-07)

Owner report: Online Mode offered only a male voice. The owner also asked to confirm the ElevenLabs model (`eleven_v4`).

**Findings** (read-only API calls with the private key; no key printed):
- The account's `GET /v1/models` lists `eleven_v4` and `eleven_v4_turbo`, both supporting Filipino (`fil`). The backend default was still `eleven_flash_v2_5`.
- The account had 22 voices, including one Filipina voice (Camille). The app showed only the server default, George (British, male), because production does not yet have `/v1/ai/tts/voices`.
- Library voices synthesize by voice ID without being added first. The first use of each takes about 15 s; later calls take about 1.8 s.
- First use also adds the voice to the account. Testing added five Filipina voices: Ate Daniella, Amihan Reyes, Thea Santos, Cielle and Ate Weng. The account went from 22 to 27 voices.
- Speed of a short Filipino sentence:

  | Model | Time |
  |---|---|
  | `eleven_v4` | about 1.7–3.1 s |
  | `eleven_v4_turbo` | 0.84 s |
  | `eleven_flash_v2_5` | 0.28 s |

**Backend `872197a`** (branch `codex/open-online-voices`, unmerged):
- The catalogue always includes the six Filipina voices, listed first with short names. Other Filipino voices come next, then the rest by name.
- Each entry carries validated `language` and `gender` labels.
- Featured voices skip the catalogue lookup when selected.
- Defaults are now `ELEVENLABS_VOICE_ID=BtcCEANLn920ZIoN9grW` (Camille) and `ELEVENLABS_MODEL_ID=eleven_v4`. A value already set in Vercel's environment still overrides these, so the Vercel owner should set or remove those two variables.
- The private root `.env` now has `ELEVENLABS_MODEL_ID=eleven_v4`.

**Mobile:**
- The Online Voice sheet shows "Server default", then a "Filipina voices" section, then "More voices".
- Each voice shows a line such as "Female · Filipino".
- Only the ID and name are saved.

**Verification:**
- Backend: 197 passed. `backend_integration` mirror: 8 passed.
- Live client check with `eleven_v4`:
  - catalogue of 27 voices, with the six Filipina voices first;
  - default voice and Thea Santos synthesized in 1.68–1.80 s.
- New picker test in `phase09OnlineVoices.test.tsx` (34 tests in that suite).

**Commit history:** at the owner's request, the Claude co-author line was removed from the two tip commits (backend `bb506f7` → `afaa36b`, mobile `aa432ba` → `03307b0`). Both branches were updated with `--force-with-lease` after confirming that neither remote had moved. Older history was not rewritten.

**Not run:** the voices on a device against production (needs the merge); physical phone.
---

## Addendum — production deployment and device check (2026-11-07)

**Deployment:**
- With the owner's explicit approval in this session, LAFINA-backend `main` was fast-forwarded from `f0fae4d` to `872197a`. That is the four commits of `codex/open-online-voices`, with no other changes.
- About 40 s later, Vercel redeployed. `POST /v1/ai/chat/stream` changed from 404 to 401 when called without credentials.

**Fresh x86_64 build on `emulator-5554`** (signed-in Student Pro, Online Mode):
- **Streaming:**
  - "explain photosynthesis in detail with steps": the typing dots showed first.
  - About 3.5 s after sending, the first line appeared in a live bubble.
  - Less than a second later, the bubble had filled mid-sentence while the reply kept arriving.
  - When it finished, the saved reply (with time and speaker button) replaced the live bubble.
  - Screenshots: `stream-live-*.png`.
- **Voices:**
  - Profile → Online Voice · ElevenLabs loaded the production catalogue: "Server default", then "Filipina voices" (Camille, Ate Daniella, Thea Santos, Cielle, Amihan Reyes, Ate Weng, each "Female · Filipino"), then the remaining voices.
  - Selecting Ate Daniella and tapping Preview ended with "ElevenLabs preview finished".
  - The account was set back to Server default afterwards.
  - Screenshots: `voice-0*.png`.
- **QA note:** the emulator init script skips the JS bundle task. The bundle must be built without the init script, as the workflow already describes; the APK installed earlier in this session for the fallback check may have carried an older bundle. The APK used here was confirmed to contain the streaming and picker code.

**Not verified:**
- Which `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID` Vercel sets. If they are set, they override the new Camille / `eleven_v4` defaults.
- Whether the preview audio was audible. The emulator gives no audio check; the app reported ElevenLabs as the source.
- Physical phone.
- Separately, DeepSeek's markdown (`**bold**`, lists) is shown as plain text in chat bubbles. This existed before streaming.

## Addendum (2026-11-08): voice mode used the device voice

**Owner report:** the Profile voice test played ElevenLabs, but voice mode (speaking or typing to lafina) still read replies with the offline default voice.

**Causes found:**
1. `VoiceModal` read every reply with `ttsService` (react-native-tts) and asked the orchestrator without Online Mode, so voice mode never used DeepSeek or ElevenLabs.
2. Access tokens last 15 minutes and nothing renewed them, so after 15 minutes every online request returned `auth_required` and quietly fell back.
3. `authService.getMe` deleted the stored sign-in whenever its own refresh failed, including network/server errors and the case where a second refresh reused a token the server had already rotated. On the QA emulator the stored refresh token was gone (log: `no refresh token stored`), which is how the account kept "Online" in the header but could not reach DeepSeek.

**Changes (mobile):**
- `VoiceModal`: replies follow Online Mode and the USTP handbook toggle; they are read through the call speech provider (ElevenLabs online, device voice offline or on failure, with a "Read with the device voice: <reason>" notice).
- `speechService`: markdown is stripped before speaking; long replies are split at sentence ends into pieces of at most 500 characters, the next piece is fetched while one plays, Stop ends the chain, and a failure hands the rest to the device voice.
- `cloudClient`: authenticated requests and streams renew once, through a single shared renewal, on a 401 or a missing access token, then retry. Results say `sessionEnded` only when no refresh token is stored or the server rejected it.
- `authService.getMe`: uses that renewal; removes the stored sign-in only when `sessionEnded`, otherwise returns `server_unavailable` and keeps it.
- Replies after an ended sign-in now say "sign in again in Profile to use DeepSeek and the online voice" instead of "DeepSeek is not available right now".

**Tests:** `__tests__/cloud/tokenRenewal.test.ts` (12), `__tests__/ai/voiceModeOnlineSpeech.test.tsx` (8), `chatConversation` signed-out note, `phase06` speak test now checks the native engine. `npm run preflight`: 64 suites, 968 passed, 1 skipped; 230 modules, 0 cycles, 76 offline leaves.

**Emulator (`emulator-5554`, fresh x86_64 build):** voice mode now asks online and tries renewal; this emulator's sign-in had already been erased, so it shows the new sign-in-again note (`.local/qa-online-voices/voice-mode-signed-out-note.png`). ElevenLabs playback in voice mode was **not** verified on device: that needs the owner to sign in again on the device (the agent does not sign in to production accounts).

## Addendum (2026-11-08): conversational voice mode latency

**Owner report:** online voice mode answers with ElevenLabs, but the text takes about 5 s to appear and the voice another 5 s. Goal: respond like a live conversation, streaming text and voice.

**Measurements** (host in the Philippines, synthetic text, timings only):

| Step | Measured |
|---|---|
| ElevenLabs direct, 68 chars: `eleven_v4` / `eleven_v4_turbo` / `eleven_flash_v2_5` | 1.6 s / 0.65 s / 0.3 s (full clip) |
| ElevenLabs direct, 337 chars, same models | 6.1 s / 2.1 s / 0.75 s; streaming endpoint first byte 0.7 s / 0.2 s / 0.2 s |
| Backend `/healthz` (no database) | 0.4 s |
| Backend `/v1/auth/refresh` with a made-up token (one read query, no write) | 2.8 to 3.0 s |
| Vercel routing header `X-Vercel-Id` | `sin1::iad1`: edge in Singapore, function in Washington (iad1) |
| Emulator, voice mode, before changes (instrumented build, not committed) | send to first text 5.6 to 5.9 s; first speech clip 5.9 to 7.3 s after its request |

The backend's documentation examples place the Neon database in `ap-southeast-1` (Singapore); the production value was not inspected. If that is the production region, every database round trip crosses the Pacific from iad1, which matches about 2.4 s per request for connecting plus one query (the engine uses `NullPool`, so each request connects anew). Chat and speech each make several queries, so this accounts for most of the delay.

The DeepSeek key in the private local `.env` answered HTTP 402 (insufficient balance) during the benchmark; production chat still answers, so production uses a different key. Not investigated further.

**Changes (mobile, `Lem-branch`):**
- Voice mode streams DeepSeek's reply (as Chat does) and shows it while it is written.
- New `startSpeechStream` in the speech provider: the first finished sentence (at least 12 chars; a sentence over 160 chars is cut at a comma) is synthesized at once. The next piece takes every sentence finished by the time the first audio is ready, or the whole rest once the reply is complete. A typical reply needs 2 or 3 speech requests, staying within the 10-per-minute limit. Stop, failure fallback (device voice reads the rest, with the reason) and the lafina name case change are handled.
- Voice mode asks for `latency: "low"`. Servers without the option ignore the field.
- Opening voice mode checks online speech ahead of time (`warmUp`).
- Short small talk ("hello", "thanks") skips the USTP handbook search; handbook questions keep it.
- A failed prepared clip now reports the real reason instead of a generic one.
- Tests: `__tests__/ai/voiceModeStreaming.test.tsx` (11). `npm run preflight`: 65 suites, 979 passed, 1 skipped; 230 modules, 0 cycles, 76 offline leaves.

**Backend (branch `codex/fast-voice-replies`, commit `e31d894`, pushed, NOT merged or deployed):** `latency: "low"` uses `ELEVENLABS_FAST_MODEL_ID` (default `eleven_v4_turbo`) and `mp3_44100_64`; other requests keep `eleven_v4` at 128 kbps; the response reports the model used. Backend suite: 199 passed.

**Owner decisions pending:**
1. Merge `codex/fast-voice-replies` into production `main`.
2. Confirm the production database region (Vercel → Settings → Environment Variables → `DATABASE_URL` host, or the Neon console). If it is `ap-southeast-1`, set the Vercel function region to `sin1` (`"regions": ["sin1"]` in `vercel.json`). Expected effect: database round trips drop from hundreds of milliseconds to a few, and the phone is about 50 ms from the function instead of about 250 ms.

**Not verified:** end-to-end timings after the backend changes (not deployed); a physical phone; audibility on the emulator.

**Follow-up (same day):**
- With the owner's approval ("proceed merge"), LAFINA-backend `main` was fast-forwarded from `872197a` to `e31d894`, adding only that one commit.
- Vercel posts no deployment status to GitHub for this project. The live `/openapi.json` was checked instead: it now lists `AITtsRequest.latency` with values `standard` and `low`, so the change is deployed.
- Emulator, signed in, Online Mode, voice mode, "what causes rain in two sentences": DeepSeek replied and the audio came from the app's player (ElevenLabs), not the device voice. Audio started 12.9 s after Send.
- So the per-request database overhead (function in iad1) still dominates. Moving the region is deferred until the Vercel project owner is available.

## Addendum (2026-11-08): chat reply arrived in one burst

**Owner report:** Chat still shows "lafina is thinking…" and then the whole reply at once.

**Measured** (emulator, Chat, "explain photosynthesis in detail with six steps"; an instrumented build logging chunk times and sizes only, not committed):

| Time after Send | Event |
|---|---|
| 5.9 s | Response headers |
| 5.9 to 6.1 s | About 7.7 KB of SSE, nearly the whole reply |
| 8.4 s | Final 295 bytes (the `done` event) |

**Cause** (in `POST /v1/ai/chat/stream`):
- After DeepSeek's first piece, the usage row was committed *before* the response began. With about 2 s per database round trip (function in iad1), DeepSeek finished the reply meanwhile, so everything was sent at once.
- The `done` event then waited for a second commit (the token counts).
- The app also waited for the connection to close rather than for `done`.

**Changes:**
- Backend, branch `codex/stream-at-once` (commit `4ae07eb`; pushed, NOT merged or deployed):
  - The usage row is saved in a task alongside the stream.
  - `done` is sent before the token counts are saved; saving is shielded from client disconnects.
  - The minute and day quota checks (chat and speech) are one query instead of two.
  - New test `test_text_is_not_held_back_while_usage_is_saved` fails on the previous code and passes now. Backend suite: 201 passed.
- App: `CloudStreamOptions.isComplete`. The chat stream resolves on `done` or `error` without waiting for the connection to close. Test added; `npm run preflight`: 65 suites, 980 passed, 1 skipped.

**Remaining:** about 5.5 s before DeepSeek's first piece is still spent on database round trips (sign-in check, quota, handbook flag) and the handbook search. That needs the region move.

**Follow-up:** with the owner's approval ("proceed and merge"), LAFINA-backend `main` was fast-forwarded from `e31d894` to `4ae07eb`, adding only that commit. The change does not alter the API schema, so the deployment could not be confirmed from outside. The emulator was shut down before the streaming check, so streaming on a device after this deploy is NOT verified.

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval
