# Call Lafina — manual device checks

All checks below are **NOT RUN on a physical phone**. Automated tests do not certify real mic, speaker, Bluetooth, network, visual layout or interruption timing.

## Install and setup

Use the arm64 Android QA APK at `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk`. Package `com.lafina.capstone`, version `0.6.0-data-qa`; its current hash is in [artifact.json](artifact.json). This is a debug-signed QA build with local QA controls, not a release APK.

Install as an update only when its signature matches your existing build. Do not uninstall or clear app data to solve a signature mismatch; preserve/export your records and use the matching build first. Open LAFINA, sign into an account with live voice access, choose explicit Online Mode and a voice, and start Call Lafina from Chat. Keep a few test tasks/events with distinctive titles.

**Backend ready:** the tested backend patch is deployed and the existing production agent now has 14 tools, their callback event, and normal turn eagerness. Start a **new call** to load the updated settings. Health/auth probes passed; signed-in speech, audio quality and real latency remain unverified. See [backend-deployment-follow-up.md](backend-deployment-follow-up.md).

## Conversation and motion

1. Start a call and allow the mic. The live waveform/avatar should remain above the timer during the greeting, transcript, review card, notices and Type input; no large blank region. The timer should continue. Check a small screen, large font and keyboard: card actions and End remain reachable.
2. Speak, pause, then mute. Input motion should follow speech, settle when silent, and stop reacting to mic input when muted. Playback motion should follow Lafina's speech. With Android reduced animations enabled, the indicator should remain visible without continuous animation.
3. Have a short ordinary conversation, including a longer pause mid-sentence, a correction, English and your normal mixed-language speech. Lafina should respond briefly, avoid reading whole cards, and avoid talking over unfinished thoughts. Note premature responses and awkward waits.
4. Interrupt a long answer by speaking. Old audio should stop and stay stopped; the next response should answer the new turn. Repeat twice, then tap Stop during speech and during tool processing. Late audio/cards from the interrupted request must not resume. End, reopen, and verify a clean new session.

## Scheduling and confirmation

5. Say: “Yeah, I want you to set a schedule for capstone meeting tomorrow at 5 PM for an hour.” Expect a **Calendar Event Review**, title **Capstone Meeting**, tomorrow 5–6 PM in your timezone. It should say it will be added after confirmation. Check Calendar before confirming: nothing new should be saved.
6. Say: “Schedule a capstone meeting.” It should ask for missing time instead of inventing 9 AM. Give the time, review the assumed date/duration if any, and verify them. Try “later,” next weekday, a date across midnight, and an ambiguous AM/PM time. Ambiguity should be clarified or clearly disclosed before saving.
7. Create a recurring event with a location, then say “Move it to 6 PM.” Verify title, location, recurrence, category and reminder delivery remain unchanged. Try inline Type edits too. For a high-priority task, change only its due time and verify priority survives. Check end time/duration after a start-time change.
8. With a draft open ask: “What is on my schedule tomorrow?” The question should return schedule information without changing the draft. Ask about an existing item with a similar title: no accidental edit or duplicate.
9. With a draft open say “Yes, but change it to 6 PM.” It must **not save**. It should revise or ask a clarification. “Actually, never mind” should cancel. Repeat with “Cancel that, do not create it.”
10. For a correct card, say “Confirm” or tap Confirm. Exactly one item should appear in Calendar, with the displayed fields and reminder. Repeat Confirm/tap quickly: no duplicate. A bare “yes” should save only after Lafina has actually asked whether to save the displayed draft.
11. Ask for an event **and** a separate reminder/note in the same turn. Expect separate reviewed items in a group or a clear question. No second item should disappear into the event title. Confirm/cancel the group and verify the resulting item count.
12. Start a draft, interrupt before the tool finishes, then ask for something different. No stale card should replace the new one. Try a rapid revision and cancel, Stop then a new request, and End while a tool is loading.
13. Read back the saved item and check it in Calendar. Lafina should say it can prepare/revise/save with your confirmation, and should claim “saved” only after success. A simulated incoming reminder acknowledgment must not mark the underlying task complete.

## Failure and lifecycle

14. Disable internet mid-answer and mid-draft. Expect a clear error/retry or usable text/manual controls; no success claim or write from an incomplete request. Restore internet and retry. Expired login/no voice entitlement should show a clear message without an endless spinner.
15. Deny microphone permission, then allow it; mute/unmute repeatedly. Type, Cancel, Confirm, Stop and End should remain usable. Check speaker, wired/Bluetooth headset, volume, route changes and another app taking audio focus. Listen for echo or Lafina responding to its own audio.
16. Minimize/restore, lock/unlock, navigate away/back and end the call. Check the mic indicator and audio stop when the call ends. Start another call and ensure no old transcript, draft, timers or audio leak into it. Check incoming reminder calls separately, including snooze versus task completion.

## Latency measurement — after deployment

Record at least 20 ordinary exchanges and 20 scheduling turns on stable Wi-Fi, then repeat on mobile data. Record device/Android version, build hash, approximate connection quality, warm/cold start and provider settings. Do not record private transcript content.

Measure end of the student's speech to the first audible response; request end to review card shown; interruption onset to old audio stopped. Record failures and early interruptions, not just successful fast turns. Report n, p50 and p95 separately for each scenario/network.

Targets are **goals, not measured results**: ordinary first audio p50 ≤1.2 s / p95 ≤2.5 s; review card p50 ≤2.5 s / p95 ≤5 s; interruption silence p50 ≤250 ms / p95 ≤500 ms. Adjust turn eagerness only after checking both natural pauses and response delay. Patient mode remains available for users who need longer pauses.
