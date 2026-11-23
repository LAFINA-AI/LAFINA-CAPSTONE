# Device test — 2026-11-23 (Infinix X6880, Android 15)

Scope: the owner asked for the main features (chat, Call LAFINA, notifications) to be tested on their phone and for any bugs found to be fixed.

- **Device:** Infinix X6880, Android 15, connected over adb.
- **Starting build:** v1.0.2 release (versionCode 100, HEAD `3207a63`).
- **Fixed build:** the fixes below were built as a local arm64 release APK and installed with `adb install -r`. App data was kept. Build log: `docs/reports/logs/device-test-2026-11-23-assembleRelease.log`.
- **Not done:** nothing was committed or released.

## What worked on the device

- **Online chat:**
  - Schedule questions are answered correctly.
  - Chat history survives restarts.
  - The handbook stays gated behind a COR upload (by design).
- **Reminders:**
  - Proposal → review card → Confirm saves the reminder and registers an exact alarm.
- **Alarm screen:**
  - The LAFINA alarm ring screen (Snooze/Dismiss) and its heads-up notification work.
- **Reminder calls:**
  - The incoming-call screen works after the screen wakes.
  - After 45 s of ringing, the call is marked missed.
- **Call LAFINA (online):**
  - Connects in about 1.4 s and greets the student.
  - A typed turn gets a schedule answer.
  - End releases audio focus.
  - The transcript is saved into Chat.

## Bugs found and fixed

| # | Bug | Fix | Verified |
|---|-----|-----|----------|
| 2 | When the app was open and unlocked, a reminder call showed only a heads-up notification. The call screen never opened. | `LafinaReminderModule.kt`: when MainActivity is resumed and the keyguard is unlocked, the pending call is handed straight to JS (`handed_to_app` receipt plus a health label). | **Device ✅**: at 21:42 the call screen opened by itself over Chat. |
| 3 | Chat did not follow new messages. New replies and review cards landed below the composer. | `ChatScreen.tsx`: `maintainVisibleContentPosition` gets `autoscrollToTopThreshold: 80`. This is the same 80 px as the near-bottom check. | **Device ✅**: the review card was fully visible after sending. |
| 4 | "Explain photosynthesis in one sentence" was read as a "which one?" follow-up. | `structuredAction.ts`: counted phrases such as "one sentence" no longer count as pointer words. | Jest ✅ |
| 5 | Online extraction saved titles with "LAFINA" lowercased ("lafina TEST reminder"). | `onlineChatSkill.ts` gained the `keepNameCase` option. `onlineIntentExtractor.ts` uses it. | Jest ✅ |
| 6 | "In 1 minute" sent at 9:30:51 was set for 9:31:00. The time had already passed before Confirm, so the review expired. | `fastPathParser.ts` rounds relative times **up** to a whole minute. The online extractor now uses the phone's own clock maths for relative times (`withLocalRelativeTime`). | Jest ✅, **device ✅** (sent 21:40:56 → rings 9:42) |
| 7 | Developer hub "Force Cloud Sync" said "success in 12 ms" even though the sign-in had expired. | `developerTestService.ts` now reports the real sync state. | typecheck/lint ✅ (not checked on the device) |

## Open — needs an owner decision

**Bug #1 (serious): Infinix XOS "Hiber" holds back all of LAFINA's alarms while the screen is off.**

What happens:
- About 5 s after the screen turns off, Hiber freezes the app.
- It holds `setExactAndAllowWhileIdle` reminders and `setAlarmClock` alarms until the next unlock.
- In a clean run, a reminder due at 20:09–20:13 was delivered at 20:32:56.
- It also drops the app's network sockets. This may explain a cloud sign-in that expired during the test, but that is not proven.

What did not help:
- Battery set to "Unrestricted".
- Adding the app to the deviceidle whitelist.
- Phone Master "App Launch: Allowed".

What might help: Hiber skips apps that have a home-screen widget (`importantcase is : widget` in its log). Options:
1. A small LAFINA home-screen widget. No new permission is needed.
2. An opt-in foreground service. This needs a new permission and owner approval.
3. In-app guidance for Infinix, Tecno and itel phones.

Other open items:
- When the chat agent fails, the student sees the clarify text instead of the real error.
- The uiautomator dump cannot read the incoming-call or Call LAFINA screens. Use screenshots to test them.

## Automated checks

- `npx tsc --noEmit` ✅
- ESLint on every changed file ✅
- Jest suites run:
  - agentTools, onlineIntentAndEditableReview, phase07Nlu, todoChatAndNlu, agentAuditFixes, voiceConversationController
  - callDispatcher, onlineReminderCall, reminderCallDispatcherAudit
  - agyPort04/06/09, chatHistory*, developerSettingsUi
  - All passed.
- Full `npm run preflight`: **NOT RUN**.

## Changes made on the phone and test data

- LAFINA's battery setting was changed from "Optimized" to **"Unrestricted"**.
- Test items created on the owner's account:
  - Reminders/tasks: "lafina TEST reminder", "Check experiment one/three/A/B", "Call test two", "Verify call fix" (×2).
  - LAFINA alarms at 7:58 PM and 8:13 PM.
  - Test chat messages.
