# Call Lafina greetings: backend handoff (2026-11-22)

**Owner approval:** "PROCEED ADD" (2026-11-22), given after the app-side greetings were shown. It covers this scoped `LAFINA-backend` change. Nothing else in the backend changes.

**Status:**
- The patch is prepared and tested locally.
- **Pushed** to `LAFINA-backend` `main` as `52f269c` on 2026-11-22, at the owner's request ("push the backend changes to main"). The flag is off by default, so behaviour is unchanged until steps 2 to 4.
- The live ElevenLabs agent is unchanged. Steps 2 to 4 below need the owner's backend access and the private `.env`.

## Why

Online, Call Lafina opens with the agent's fixed `first_message`: "Hi, I'm listening. What's on your mind?". The app now picks a different opening line on each call (`src/ai/callGreetings.ts`). The line depends on:
- the conversational tone (Default, Casual, Professional);
- the student's name;
- the time of day.

The live agent refuses to let the app replace the line. The saved snapshot `.local/call-feature-agent-after-update.json` shows `platform_settings.overrides.conversation_config_override.agent.first_message: false`. ElevenLabs refuses a conversation that sends an override the agent does not allow. So the app sends its line only when `/v1/ai/voice/capabilities` returns `openingLine: true`.

## The patch

`backend_integration/call-greetings/LAFINA-backend-call-greetings.patch`, against `LAFINA-backend` `main` @ `94f0fa0` (it applies cleanly there).

| File | Change |
|---|---|
| `app/config.py` | `VOICE_OPENING_LINE_OVERRIDE: bool = False` |
| `app/api/v1/voice.py` | Capabilities return `openingLine = enabled and VOICE_OPENING_LINE_OVERRIDE` |
| `scripts/provision_voice_agent.py` | `agent_overrides()` now also allows `agent.first_message`, and new agents get it. New `--allow-opening-line [--apply]` patches **only** `platform_settings.overrides` on the existing agent. `--check` now reports `opening_line_override_allowed`, and flags the dangerous order (flag on while the agent refuses). |
| `tests/test_voice_opening_line.py` | 6 tests |

**Local results** (Python 3.14.7, a worktree of origin/main @ 94f0fa0):

| Check | Result |
|---|---|
| Voice, config and online-voices suites | 98 passed |
| Full suite | 281 passed, 24 failed. The same 24 (`test_documents`, `test_flashcards`, `test_study_notes`) also fail on unmodified `main` in this environment, so the patch did not cause them. Log: `.local/backend-greetings-full-tests.log` |
| `ruff check` on the changed files | No new findings compared with `main` |
| `ruff format` | The new test file is formatted. `app/config.py` was already unformatted on `main`. |

## Steps for the owner (in this order)

1. **Done:** pushed as `52f269c`. For reference, applying the patch by hand:
   ```
   git apply LAFINA-backend-call-greetings.patch
   python -m pytest tests/test_voice_opening_line.py
   ```
2. Allow the override on the **existing** agent. This is a dry run first; no new agent and no secret upload:
   ```
   python scripts/provision_voice_agent.py --allow-opening-line
   python scripts/provision_voice_agent.py --allow-opening-line --apply
   ```
   The `--apply` run ends with `--check`, which should show `"opening_line_override_allowed": true`.
3. Deploy the backend. Then set `VOICE_OPENING_LINE_OVERRIDE=true` in the Vercel environment and redeploy.
4. Check: `python scripts/provision_voice_agent.py --check` should print no PROBLEM lines. Make one Call Lafina call. It should open with a greeting that matches the student's tone.

**Rollback:** set `VOICE_OPENING_LINE_OVERRIDE=false`. The app goes back to the agent's fixed line on the next call. Leaving the agent's override permission on is harmless.

**Never** turn the flag on before step 2. Every online call would be refused. `--check` reports this case.

## What the app sends once it's on

```json
"conversation_config_override": {"tts": {"voice_id": "…"}, "agent": {"first_message": "Hey Ana! What's up?"}}
```

- At most 240 characters.
- No `{` or `}`, so the line can't use the agent's variables.
- An answered reminder call sends `first_message: ""`, because the app has already read the reminder aloud.
