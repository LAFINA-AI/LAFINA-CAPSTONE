# Call LAFINA: "The conversation connection closed" — audit and fix (2026-11-19)

Status: READY FOR REVIEW. Automated gates pass; phone checks are NOT RUN.

## Symptom

A live Call LAFINA conversation sometimes stops with "The conversation
connection closed. Start again when you are ready." That message is shown
whenever the ElevenLabs socket closes from the far side
(`src/cloud/voiceConversation/controller.ts`, `case 'closed'`).

## Evidence

ElevenLabs' conversation history for the production agent, read-only,
metadata only (no transcripts): `docs/reports/evidence/call-drops-20261119/elevenlabs-conversations.jsonl`.

| End reason (last 40 calls) | Count |
|---|---|
| `custom_llm generation failed` (error code 1002, `llm_error`) | 12 |
| `Client disconnected: 1006` | 24 |
| `Client disconnected: 1000` | 4 |

Of the 9 most recent calls with real back-and-forth, 6 ended with
`custom_llm generation failed`, 25 to 113 seconds in. The 1006 entries are
mostly the app's own hang-ups: teardown called `close()` and then `cancel()`
at once, so ElevenLabs never saw a clean close (fixed here, see below).

ElevenLabs documents that a failed custom-LLM attempt (API error, timeout,
or empty response) is retried with the same custom LLM, and that "a sustained
failure of your Custom LLM ends the conversation"
([LLM cascading](https://elevenlabs.io/docs/eleven-agents/customization/llm/llm-cascading)).
The agent ran with the default 4 s `cascade_timeout_seconds`.

The per-turn records show three repeatable patterns, each matching a backend
code path in `LAFINA-backend` `app/api/v1/voice.py` (main `dfbeecb`):

1. Silence after LAFINA speaks (`f50qs4`, `qy8d9b`, `x91khd`): after the
   agent's 15 s `turn_timeout`, ElevenLabs asks for a follow-up line. The
   backend deliberately answered with no words, which counts as a failure.
2. Straight after a planner tool result (`wfp9hc`, `fz344e`, `9ajvy1`):
   LAFINA had spoken a few words and called `prepare_lafina_action` in the
   same turn. The follow-up request was refused with 400
   `invalid_tool_result` (reproduced with the real validator for spoken words
   in a separate message, and for an app update inside the exchange).
3. Shortly after the student speaks (`z0g5az`, `zhz4w7`, `bkwxgz`, `s96j7e`):
   a retried or speculative request for the same turn got 409
   `duplicate_turn`, so every retry failed. (Vercel request logs were not
   available to tell this apart from a 429 turn limit or a timeout here;
   every one of those paths ended the call the same way.)

Ruled out: the phone's socket keep-alive (OkHttp ping every 10 s and pong
replies to ElevenLabs pings), Vercel latency (about 0.2 s warm, `sin1`, Neon
in the same region) and microphone/audio focus handling.

## Fix

Backend (PR to `LAFINA-AI/LAFINA-backend`, branch
`fix/voice-call-never-drops`): once a request is authenticated and its session
is live, it always gets a complete spoken answer. Repeated and speculative
requests for one turn are answered and paid once. Silence gets "I'm still here
whenever you're ready." Tool follow-ups accept the shapes a live call
produces and fall back to one sentence rather than re-running the tool.
Limits and provider errors are spoken and still recorded. The first bytes go
out before DeepSeek is asked. The provisioning script sets
`cascade_timeout_seconds` 15 and `turn_timeout` 30, and adds
`--tune-reliability`.

App (this PR):

- `controller.ts`: ends 5 s before the server's time limit, and reports a
  remote close within 15 s of the limit as the limit, not "connection
  closed". LAFINA speaking on its own (the silence check-in) no longer resets
  the 2-minute no-speech timer, and that timer never ends a call mid-answer.
- `LafinaVoiceConversationModule.kt`: closes the socket gracefully and only
  cancels it when a close cannot start, so hang-ups are recorded as 1000 and
  real network drops stay recognisable.

Deliberately unchanged: no automatic reconnect (ADR-030), the 5-minute and
turn quotas, and errors for missing grants and ended or expired sessions.

## Verification

| Check | Result |
|---|---|
| Backend `pytest` (full suite, synthetic providers) | 297 passed |
| Backend `ruff check` on changed files | no new findings vs main |
| App `npx jest __tests__/cloud/voiceConversationController.test.ts` | 68 passed; 3 of the new tests fail on main's controller |
| App `npm run preflight` (typecheck, lint, Jest, architecture) | passed: 160 suites, 2164 tests passed, 1 skipped |
| `gradlew :app:compileDebugKotlin :app:testDebugUnitTest --tests VoiceConversationRulesTest` | BUILD SUCCESSFUL |
| Signed-in call on a phone | NOT RUN |
| Production deploy of the backend | NOT DONE (needs merge and Vercel deploy) |
| Agent setting change (`--tune-reliability --apply`) | NOT DONE (run after the backend deploy) |

## Rollout order

1. Merge and deploy the backend PR.
2. `python -m scripts.provision_voice_agent --tune-reliability` (dry run),
   then the same with `--apply`, then `--check` (no problems listed).
3. Install the app from this PR.

## Manual phone check (NOT RUN)

1. Start Call LAFINA, ask one question, then stay silent for 40 s. Expected:
   LAFINA says "I'm still here whenever you're ready." and the call stays open.
2. Say "Set a capstone meeting tomorrow at 3 PM". Expected: a review card,
   LAFINA says it is shown, and the call stays open after the card appears.
3. Ask three or four quick questions in a row, including one that needs your
   schedule. Expected: every one is answered and the call stays open.
4. Stay silent for 2 minutes. Expected: "The conversation ended after 2
   minutes without speech", not "connection closed".
5. Keep talking past 4 min 55 s. Expected: "reached its 5-minute limit".
6. Afterwards, from the repository root run
   `python -m backend_integration.call_history_check --limit 10 --agent-id <ELEVENLABS_AGENT_ID>`
   (read-only; the key comes from the private root `.env`, the agent ID from
   Vercel's `ELEVENLABS_AGENT_ID`). Expected: the new calls end as
   `Client disconnected: 1000`, not `custom_llm generation failed`.
