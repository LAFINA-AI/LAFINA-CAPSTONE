# ADR-032 — Per-reminder delivery style: "Call me" or "Notify only"

**Status:** accepted (owner: "proceed and do everything except the physical tests … do everything you think is best", 2026-11-14)
**Date:** 2026-11-14
**Scope:** agent audit finding 16
**Review owner:** human developer

## Context / problem

Every reminder rang as a full-screen, insistent simulated call. Some reminders don't need a call, such as "buy rice later" or "check the portal at 5". Students had no way to ask for a quieter alert. The audit asked for a per-reminder "Call me / Notify only" choice.

The choice could sync across devices or stay local. Syncing it needs a new field in the `reminder` wire entity in `LAFINA-backend` and in every client, plus a schema change on the server.

## Decision

1. **Local only, per reminder.** Schema 26 adds `reminder_delivery_styles(reminder_id PK, style IN ('call','notify'), updated_at)`.
   - A missing row means `call`, so every existing reminder behaves exactly as before.
   - Rows are removed by triggers when their reminder is hard-deleted or tombstoned, so Clear All Data leaves nothing behind.
   - The table is never read by sync, so the seven wire payloads are unchanged. Another device rings its copy as a call.
   - A recurring reminder's next occurrence copies the style.
2. **The review card owns the choice.** Any card that creates a reminder has `reminderDelivery`, shown as "When it is due: Call me | Notify only". This covers a task with a time, an event with a lead reminder, a reminder, and "30 minutes before X".
   - Switching keeps the same operation ID and writes nothing.
   - Confirm writes the style in the same transaction as the reminder. The alarm is registered after commit and already carries the style.
   - Typed or spoken phrasing pre-selects Notify only: "notify me…", "…, don't call me", "no call", "notification only", "just a notification".
3. **Native registration carries the style.** `scheduleExactAlarm` takes an optional `style`.
   - A `call` record keeps the six-field `v2` registry format, so an older build still reads it. A `notify` record adds a seventh field.
   - When the alarm fires, a notify registration posts an ordinary high-priority notification on the channel `lafina_reminder_notifications_v1`. It is not full-screen, not insistent and not ongoing.
   - The notification has Acknowledge (also the tap action) and "Snooze 10 min".
   - No pending call is stored, so opening the app never starts a call.
4. **Actions go through the existing fence.** The buttons open LAFINA with the actions `acknowledge` or `snooze`, which have their own identity URIs. `App.presentCall` admits them like any call action and applies `acknowledgeReminderAction` or `snoozeReminderAction` with the captured generation. A stale button changes nothing.
   - Acknowledged means received, not task completed.
   - When JS rings instead of native (no native engine, or registration failed), a notify-only reminder shows an alert with the same two choices, never the call screen.

## Consequences

- No backend, sync or wire change. If the owner later wants the choice on every device, add an optional `delivery_style` to the `reminder` payload on both sides. This table then becomes the local cache.
- The notification buttons open the app rather than acting in the background, because native code never writes `lafina.db` (ADR-016). Snoozing therefore briefly shows LAFINA.
- The Call Lafina calendar draft card does not show the toggle yet. "notify me…" said to Call Lafina still selects Notify only, because the same parser feeds it.

## Verification

- Jest: `__tests__/scheduler/notifyOnlyDelivery.test.ts` and `__tests__/ui/reminderDeliveryToggle.test.tsx`.
- JVM: `LafinaDeliveryContractTest` (style codec, six-field compatibility, action URIs, restore keeps style).
- **NOT RUN:** a device check of the notification, its buttons, the channel, or boot restore of a notify-only reminder.
