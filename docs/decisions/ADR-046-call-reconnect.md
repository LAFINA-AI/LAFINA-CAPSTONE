# ADR-046 — Call LAFINA reconnects by itself and remembers the chat

**Status:** accepted (awaiting device validation)
**Date:** 2026-11-26
**Phase:** RC-00 to RC-06 (`docs/plans/call-reconnect/PLAN.md`)
**Review owner:** human developer
**Approval:** owner, "proceed everything you recommend. make sure this integrates nicely" (2026-11-26), approving D1 to D5 in the plan
**Amends:** ADR-030 §5 ("Nothing restarts by itself", "No automatic retries of billable calls")

## Context / problem

When an online call dropped (a Wi-Fi blip, a mobile handover, a server-side close), it stopped with "Start again". Calling again from the same chat started a new ElevenLabs conversation, and the app sent no chat messages to it. So LAFINA greeted the student like a stranger, even though every turn of the dropped call was saved in that chat.

## Decision

1. **Memory (D2).** Every online call, new or reconnected, starts with a recap of the chat it writes into: the last 16 messages, 3,000 characters at most, oldest first, under a header saying how long ago the last message was (`callRecap.ts`).
   - Messages are sanitized, and a message with private details is replaced by a placeholder.
   - An attachment becomes `[attachment: name]`. A cut-off answer is marked "(cut off)".
   - An Ask USTP chat gives no recap.

   Context order: segment note, then reminder context, then chat recap, then student summary, cut from the end at 12,000 characters. `student_context` now goes only in `custom_llm_extra_body`, not in the ElevenLabs dynamic variables, so the voice provider does not keep it in its conversation history. The agent prompt never used `{{student_context}}`. Consent moves to **v3**, with one added sentence about the last few chat messages, shown once.
2. **Automatic reconnect (D1).** A call is made of *segments*. Only a network or server drop reconnects by itself:
   - close codes 1001, 1006, 1011, 1012, 1013 and 1014, or a "network" reason;
   - a failed custom-LLM turn, once per call.

   A normal close, policy, auth or quota close, an error, backgrounding, screen lock, audio-focus loss (a phone call), hang-up, goodbye or skill handoff, sign-out and Online Mode off all still stop the call. They then offer **Continue call** (one tap, memory kept) as well as **New call**.
3. **Bounds.**
   - Reconnect window and attempts: a 30 s window, 10 s per attempt, backoff of 1, 2, 4 and 8 s, and an offline poll every second.
   - Limits: at most 5 reconnects per call. The flap guard stops after 3 drops in 2 minutes, or after two short segments (under 10 s) in a row.
   - Network loss: after 3 s of lost connection the call reconnects without waiting for the socket to time out.
   - Every start gate (sign-in, Online Mode, consent, internet, mic permission) runs again before each attempt.
   - Nothing about the grant or the signed URL is logged or stored.
4. **Time (D3 a).** A reconnect never gives the call more time: it keeps the first segment's `endsAt`. With less than 20 s left, a drop ends the call with the limit message instead.
5. **Opening (D4 a).** When the agent accepts an opening line, LAFINA says "Sorry, I lost you for a second. I'm back." (Continue call: "I'm back. Where were we?"). That line is heard but not saved to Chat. Without opening-line support, the agent's stock greeting is muted and hidden.
6. **Unanswered turn.** If the student's last words got no answer (the drop came while LAFINA was thinking or speaking), they are sent again once as a typed turn. This happens only if:
   - the words are less than 90 s old;
   - no tool ran for them;
   - opening-line support exists.

   They are not saved or reviewed twice, and their echo is ignored. A cut-off answer is saved once as interrupted, and LAFINA is told how it started.
7. **Native soft reconnect.** On a recoverable close after audio started, `LafinaVoiceConversationModule` *parks* the session. It keeps the mic lease, audio focus, route, recorder and player, drops captured audio (never buffered or sent), and flushes playback. JS calls `reconnect` with a new signed URL, which swaps in a new socket; each socket has an epoch, so callbacks from an old socket are ignored. A parked session ends itself after 35 s. The ping interval is now 5 s, so a dead connection is noticed within about 10 s. Older builds without `reconnect` fall back to a new native session.
8. **Backend (D5).** A patch only (`backend_integration/call-reconnect/`):
   - `resumeOf` links a reconnect to its call, which is then not counted as a new call and shares the call's time and turn budget;
   - `call_recap` gives the custom LLM the call's earlier turns as real turns;
   - `call_mode` adds a fixed "do not greet again" note;
   - capabilities report `resume: true`;
   - migration 016 adds the link columns.

   The app sends these fields only when the server reports `resume`.

## Consequences

- A blip mid-call shows "Reconnecting…" for a few seconds, and then the call carries on with the same transcript, timer, mute and review card.
- Calling again in the same chat remembers the conversation, even without reconnect.
- Each reconnect is a new ElevenLabs conversation (no documented resume exists) and, without the backend patch, a new server session. The caps above bound the cost.
- ADR-030 §5's "Nothing restarts by itself" now reads: *nothing restarts by itself except a network or server drop, within the bounds of ADR-046*. Background, lock and audio-focus loss still never reconnect, and the mic is never opened in the background.
- `autoReconnect` is a controller dependency, on only in the app's default wiring. Tests of the old stop-on-drop behaviour still run against the controller without it.

## Alternatives considered

- **Resume the same ElevenLabs conversation.** Not supported by the signed-URL flow (ADR-030 §3).
- **Silent rollover at the time limit (D3 b).** It makes calls effectively unlimited, so its cost is unbounded. Rejected by the owner's choice of D3 a.
- **Buffer the student's audio while parked.** It could send speech after a long gap, out of context, and it holds audio in memory. Rejected: frames are dropped, and the unanswered-turn replay covers the common case.
