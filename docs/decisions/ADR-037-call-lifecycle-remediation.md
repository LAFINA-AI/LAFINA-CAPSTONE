# ADR-037 — Reminder call serialization and live audio ownership

Date: 2026-11-17. Implementation authorized by the owner's “start fixing all” follow-up. Device acceptance remains separate from implementation. This extends ADR-017; it does not add a cloud entity, a provider, a permission or a background assistant.

## Privacy boundary

MainActivity contains the entire private React Native app, so it no longer declares `showWhenLocked` / `turnScreenOn` or enables them for reminder intents. Opening the reminder screen now requires normal OS unlock. The separate native alarm activity retains its existing restricted alarm UI and keyguard dismissal before entering the app. Answering above keyguard through a new activity is deferred; this implementation chooses the unlock requirement from CALL-FIX-00.

**Amendment 2026-11-25 (locked-phone call bug).** The call notification's full-screen intent still targeted MainActivity. With the phone asleep and locked, Android woke the screen for it, but MainActivity cannot show over the keyguard, so the call stayed hidden behind the lock screen (no network involved). The full-screen intent now targets `ReminderCallActivity`, a small native, non-exported screen that shows over the lock screen with only the call (the task text only when lock-screen privacy is "show"). Answer asks Android to unlock, then opens the call in MainActivity (`action=answer`). Decline ends the ring natively through the same path as an unanswered ring (auto-snooze per policy), without unlocking. If the phone is not locked it forwards straight to MainActivity. MainActivity still never shows over the lock screen, and the notification tap still opens MainActivity after unlock.

## Reminder ownership

A delivery is `{ownerId, reminderId, generation}`. An answered dispatcher session adds a process-local sequence token. Call state events include their delivery identity. Async outcome speech, disconnect, cleanup, timeout callbacks and STT transcript rendering check their owner before affecting the current call. A replacement invalidates the old session **before** stopping its speech: stopping can resolve an old outcome promise immediately.

App keeps one presented request. Later arrivals are saved under the versioned, local-only `reminder.callQueue.v1` key in the existing `local_settings` table in `lafina.db`. This uses the existing schema rather than creating another table/database or wire entity. Queue records contain identity, action, timestamps and lease state, without copying reminder text. JS fallback commits its triggered status, queue acceptance and outbox together before emitting a presentation event. Ordering uses due time then arrival time; duplicate identities do not reset the active screen. An Answer for another queued call is presented later as ringing and requires a fresh Answer. A stale screen's `onClose` cannot close its successor.

Native stores a map of pending deliveries in its existing pending-call preferences. `listPendingCalls` and the compatibility `consumePendingCall` are non-destructive; native records are removed by identity-scoped settlement. The old single slot is adopted into the map on its next write. A crash between reading and accepting a request leaves native able to replay it; after Answer, SQLite retains its call lease. Recovery never restores a microphone or auto-answers.

Account startup defers admission until the active owner is known. Confirmed sign-out/account switch and generation changes still fence presentation and mutations. Quick Chat's retained main root does not consume pending calls or run foreground delivery while Quick Chat is in front.

## Timeouts and native recovery

Every native call notification has a 45-second notification cutoff plus an identity-specific AlarmManager deadline. Notification expiry itself is not called a database mutation. The native deadline persists a timeout count and the next retry instant, and can schedule a bounded retry without JS using the last registered snooze duration/remaining count. Duplicate timeout broadcasts before a retry instant do not ring early or count twice. A newer registration, cancellation or owner change cancels stale pending deadlines.

JS registration includes a snapshot of the existing snooze preference/count. On startup/resume, native timeouts are reconciled before generic overdue retirement: one fenced SQLite transaction updates the reminder, delivery generation, outbox, local queue and next recurrence if the snooze limit was exhausted. Replaying an older native snapshot sees a superseded or retired generation and cannot increment again. Native stays out of `lafina.db`. As with ADR-017, process death between native and SQLite operations requires idempotent replay, not a cross-store transaction.

Queued requests have a fifteen-minute waiting lease. A presented ringing call has a 45-second lease. An answered call has a ten-minute limit independent of online/STT availability, with a visible remaining time and a warning in the last minute. An expired unanswered queue entry becomes missed; an answered timeout uses the existing automatic snooze/limit policy, never automatic acknowledgement or task completion. Active in-process sessions and valid leases are excluded from the generic overdue rule; stale source/generation checks still apply at actions.

Android can delay inexact deadline alarms if exact-alarm access is unavailable; notification timeout provides an independent ring cutoff. Force-stop still suspends Android delivery until the app is opened again, as in ADR-017. No exactly-once audible delivery guarantee is claimed.

## Live voice and failure behavior

Mounting an idle voice panel does not steal global ownership. Every explicit start/restart reacquires it and awaits the previous controller's end. Registration follows controller activity and publishes owner changes to the mini bar. The minimized UI follows current ownership, and minimizing an idle panel closes it so Chat's auto-entry preference can work again.

The permission request is an explicit controller stage. The hook does not confuse that dialog's activity pause with leaving the app; after permission returns, the controller checks foreground visibility before opening audio. Genuine backgrounding, reminder preemption, sign-out and Online Mode withdrawal still stop the actual owner. Native audio errors reject startup with their specific code, and later ENDED rejection cannot overwrite an audio-focus failure.

Offline recognizer errors transition to buttons-only operation rather than counting as failed student answers. Connectivity is checked before choosing online reminder conversation; connection fallback resumes after the existing announcement instead of reading it twice. Only silence/unrecognized successful captures consume the bounded answer attempts.

The reminder foreground service resolves startup only after foreground promotion. A pending stop is handled after promotion; unavailable offline STT avoids starting the microphone service. Startup failure leaves manual controls available.

Both voice contexts use one conservative whole-command parser, with casual responses enabled only for the offline choice prompt. Negation precedes synonym matching; unrelated fuzzy snooze matching is removed. Compound minute numbers and hours are supported within 1–120 minutes. Invalid explicit durations do not silently select a default.

The agent snooze tool waits for the committed result. At a snooze limit or storage failure it reports failure and leaves controls available; it never announces success in advance.

## Verification limits

See the CALL-FIX phase reports and `docs/reports/evidence/call-fix-05/`. Jest proves state, ownership and SQLite/outbox behavior. JVM tests and Android lint/builds prove their own checked contracts. Instrumentation and human device observations are reported separately. Physical ringing, lock-screen privacy, first permission grant, real phone-call focus contention and signed-in ElevenLabs voice require actual device evidence.

The installed-package privacy instrumentation uses manifest bit masks documented in [AOSP ActivityInfo](https://github.com/aosp-mirror/platform_frameworks_base/blob/master/core/java/android/content/pm/ActivityInfo.java) because those constants are hidden from the public SDK. This tests packaged manifest flags, not a substitute for the secure-keyguard phone checklist.
