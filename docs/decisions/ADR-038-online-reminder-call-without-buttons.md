# ADR-038 — Online reminder call is a conversation without Acknowledge/Snooze buttons

**Status:** proposed (awaiting device validation)
**Date:** 2026-11-18
**Review owner:** human developer

## Context / problem

When a reminder call is answered with Online Mode on, the app already opened an online voice conversation (ElevenLabs + DeepSeek via LAFINA-backend), but the answered screen still showed the offline call's Acknowledge button, Snooze button and 5/10/15/30-minute chips, with the conversation squeezed into a small status line. The owner asked (2026-11-18) to drop Acknowledge and Snooze when the student is online and make the answered call feel like the Call LAFINA conversation from Chat, while keeping the buttons for offline use.

How a student realistically uses the online call:

- Most calls end in a few seconds: hear the reminder, say "okay, thanks" or hang up. That means "received" (acknowledged), which is what End already does.
- When they need more time, they say so in words ("call me back in 20 minutes", "remind me later"). The agent already has the `snooze_reminder` tool, and the screen already reads a spoken "snooze for 20 minutes".
- Some talk about the reminder ("what else is due today?", "move it to 7 PM"); planner changes become review cards, unchanged.
- A student who cannot talk (class, library) can Decline while it rings (rings again later) or tap **Type** in the call.

## Decision

1. **Online view** (`OnlineReminderCallView`, Call LAFINA style: avatar ring, timer, status, waveform, Mute / Type / Stop / End dock). No Acknowledge or Snooze buttons. A footnote says: "Need more time? Say 'call me back in 15 minutes'. Hanging up counts the reminder as received."
2. **Offline view unchanged** (`CallAnsweredView`): Online Mode off, guest account, no internet, consent declined ("Use offline voice"), microphone denied, app left the screen during setup, online startup/connection failure, inactivity stop, or a failed spoken acknowledge/snooze all show the offline call with its buttons.
3. Answer opens straight into the online view ("Connecting…") when Online Mode is on for a signed-in account, so the buttons do not flash during the checks; any check that fails switches to the offline view.
4. **Opening line** for the online call: "Hi, it's LAFINA. Your reminder: "…". Need more time? Just tell me when to call you back. Otherwise, hang up whenever you're ready." The offline line, which mentions on-screen choices, is unchanged. The pre-cast offline audio is no longer used as the online fallback.
5. **Agent context** says the screen has no buttons, never to tell the student to tap one, that hanging up counts as received, and gives the student's usual snooze length for "remind me later". `snooze_reminder` with no minutes uses that length.
6. **10-minute limit:** an online call where the student said or typed something ends as received (same as End). An online call nobody spoke on, and every offline call, keep the automatic snooze.
7. `OnlineReminderConversation` no longer draws UI. It exposes `setMuted`, `stopResponse` and `sendText` on its handle and reports snapshots to the screen.

## Consequences

- Fewer choices on the online screen; snooze needs speech or typing once answered (Decline still snoozes without talking).
- "Acknowledged" keeps its meaning (alert received, task not completed).
- No backend, schema, native, permission or dependency change.
- Device validation required (`docs/MANUAL-PHONE-TESTING.md` INC-28 to INC-33).
