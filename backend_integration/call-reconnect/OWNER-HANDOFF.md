# Owner handoff: call reconnect backend patch (ADR-046, RC-05)

**Status:** patch only. Nothing was pushed, merged, deployed or migrated. Your `LAFINA-backend` checkout and its worktrees were not changed.

**File:** `backend_integration/call-reconnect/LAFINA-backend-call-reconnect.patch`

**Base:** `9f0b844` "Complete backend audit remediation and migration 015" (branch `fix/complete-backend-audit`). The patch adds migration **016**, which comes after **015**. Merge the audit work (`backend_integration/LAFINA-backend-complete-audit.patch` / `OWNER-HANDOFF-COMPLETE-AUDIT.md`) first.

## Do you need it?

No, not for reconnect to work. The app reconnects with or without it:

- **Without the patch**, each reconnect is a new call on the server. It counts against `VOICE_CONVERSATION_SESSIONS_PER_DAY` (unlimited by default) and gets its own turn budget. LAFINA's memory of the call comes from the summary the app sends.
- **With the patch**, the server sends `resume: true` in `/v1/ai/voice/capabilities`. The app then links each reconnect to the dropped session:
  - the reconnect is not counted as a new call;
  - it shares the call's time limit and turn budget, and never gets more time;
  - LAFINA gets the call's earlier turns as a real conversation, plus a fixed note "the call reconnected, do not greet again".

## What changes

| File | Change |
|---|---|
| `app/api/v1/voice.py` | `POST /sessions` accepts an optional `resumeOf` (the dropped session id). The id must belong to this account, the call must still have time left, and a call can link at most 8 times. Otherwise the server answers 404 or 409, and the app starts an ordinary new call. A linked session skips the per-minute and daily call counts and does not record a `voice_session` usage row. It inherits the call's `turns` and ends when the call's first session would (`maxDurationSeconds` is the time left). The custom-LLM route puts `call_recap` in front of the new conversation's turns and adds the `call_mode` note. Capabilities gain `resume`. |
| `app/services/voice_conversation.py` | `call_recap_turns`: at most 12 turns of 600 chars, user/assistant only, fences and control characters stripped, starting with the student and ending with LAFINA. `with_call_recap` fills only the room the new conversation leaves inside the existing 12-message / 6,000-char bounds. `call_mode_prompt` maps `reconnect` / `resume` to fixed server text; any other value is ignored. |
| `app/models/voice_session.py` | `resumed_from_id`, `call_root_id` (nullable, `ON DELETE SET NULL`). |
| `alembic/versions/016_voice_call_reconnect.py` | Adds the two columns and an index on `call_root_id`. It is additive and nullable, so older apps and existing rows are unaffected. The existing RLS policy covers the new columns. |
| `tests/test_voice_call_reconnect.py` (new), `tests/test_initial_migration.py` | 11 new tests; the migration chain includes 016. |

The app's request body and extra-body fields are already in this app build (`resumeOf` in `createSession`; `call_recap` and `call_mode` in `custom_llm_extra_body`). They are sent only when the server reports `resume: true`.

## Steps

1. Merge the audit work (migration 015), as its own handoff describes.
2. Apply the patch on top: `git apply backend_integration/call-reconnect/LAFINA-backend-call-reconnect.patch`. I checked that it applies cleanly on `9f0b844`.
3. Run the tests: `python -m pytest tests/test_voice_call_reconnect.py tests/test_voice_conversation.py tests/test_initial_migration.py`.
4. Push and let Vercel deploy.
5. **Run the migration by hand.** Vercel skips `create_all`, and no migration runs on deploy. Use the **direct** (non-pooler) Neon URL:

   ```powershell
   $env:DATABASE_URL = "postgresql://USER:PASSWORD@YOUR-NEON-DIRECT-HOST/neondb?sslmode=require"
   alembic upgrade head
   alembic current   # expect 016_voice_call_reconnect (head)
   ```

   Until it runs, every `POST /v1/ai/voice/sessions` fails, because the model has columns the table lacks. **Deploy and migrate together.** If you can, run the migration first: the columns are nullable, so the old code ignores them.

## Checks after deploy

- `GET /v1/ai/voice/capabilities` (signed in) shows `"resume": true`.
- On a phone: start a call, turn airplane mode on for about 5 s, then off. The call says "Reconnecting…" and then carries on. In Neon, the new `voice_sessions` row has `call_root_id` set, and there is only one new `ai_usage` row with `request_type = 'voice_session'`.

## Test results (scratch clone, Python 3.14, SQLite)

- `tests/test_voice_call_reconnect.py`: **11 passed**.
- Voice, opening-line, tool-bridge, migration-chain and reconnect suites together: **95 passed**.
- Full suite compared with the unpatched base: see `docs/reports/phase-RC-00-to-06-report.md` (the same failures before and after; they come from packages missing on this machine, such as `reportlab`).

## Rollback

`alembic downgrade 015_audit_hardening` drops the two columns and the index. Then revert the code. The app keeps working with either server.
