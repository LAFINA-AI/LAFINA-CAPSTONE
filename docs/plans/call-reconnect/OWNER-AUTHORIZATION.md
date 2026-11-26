# Owner authorization — call reconnect and call memory (2026-11-26)

This file records the owner's decisions for the call reconnect task (RC-00 to RC-06, ADR-046).

## What the owner said

1. "can we add a reconnect feature in the lafina call? when just in case the call disconnects or suddenly stops it reconnects automatically so that its seemless? right now - when the call suddenly stops, lafina has no recollection even tho i call in the same chat. we must make the call feature more robust. plan this deeply"
2. After reading `PLAN.md` and its five decisions: "proceed everything you recommend. make sure this integrates nicely"

The second message approves every recommended option and the phases RC-00 to RC-06 without a stop between phases. Device validation is still the owner's (RC-06).

## Approved decisions

| # | Decision |
|---|---|
| D1 | Automatic reconnect for network and server drops only. Backgrounding, screen lock, a phone call (audio focus) and the student's own actions never reconnect by themselves; they offer **Continue call**. This amends ADR-030 §5. |
| D2 | Share the last few messages of the current chat with the online call. Consent v3 is shown once. |
| D3 (a) | At the session time limit, end with the limit message. A reconnect never extends the call's time. |
| D4 (a) | On reconnect LAFINA says "Sorry, I lost you for a second. I'm back." |
| D5 | Deliver the backend change as a patch with a handoff. Nothing is pushed or deployed. |

## Scope of the backend exception

The approval covers a scoped `LAFINA-backend` change for call reconnect only:

- `resumeOf` on `POST /v1/ai/voice/sessions`;
- `call_recap` and `call_mode` on the custom-LLM route;
- `resume` in `/v1/ai/voice/capabilities`;
- migration `016_voice_call_reconnect`;
- their tests.

The change was made in a scratch clone of `.local/wt-backend-greetings` (based on `9f0b844`) and delivered as `backend_integration/call-reconnect/LAFINA-backend-call-reconnect.patch`. Nothing was pushed, merged or deployed, and no backend checkout was modified. Merging, running migration 016 on Neon and redeploying are left to the owner.

The approval does not authorize unrelated backend changes, background microphone use, wake word, or any change to the planner sync contract. Everything else in `AGENTS.md` still applies.
