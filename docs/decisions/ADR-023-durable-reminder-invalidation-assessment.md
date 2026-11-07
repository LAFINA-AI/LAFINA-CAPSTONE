# ADR-023: Durable invalidation of obsolete native reminder registrations (assessment)

**Status:** proposed, not implemented. It needs Kotlin changes and device validation that this unattended run cannot provide.
**Date:** 2026-11-06
**Origin:** codex audit A4 (`docs/plans/agy-improvements/reports/codex-audit-20261106-phase11.md`)
**Review owner:** human developer

## Problem

Android `AlarmManager` (`LafinaReminderModule`) holds one registration per reminder: owner, generation and instant. When it fires, `ReminderAlarmReceiver` cannot read SQLite, which is the source of truth for whether that job is still armed.

**When a registration goes obsolete:**

- **Product writers** (form, Chat review, task/time-block delete, acknowledge, snooze): they commit to SQLite, then call `cancelReminderAlarm` without waiting.
- **Sync pull:** it commits, then runs `reconcileReminderDelivery`.
- **Every other change:** the foreground poller (`reconcileIfDeliveryChanged`) and the background-entry pass in `App.tsx` correct it.

**The residual risk:** if the process dies after the SQLite commit but before the cancel reaches Android, the obsolete registration can still ring.

- JS admission (`admitReminderCall`) dismisses the call and cancels the alarm once the app opens, but the ringtone may already have played.
- `__tests__/scheduler/auditA4InterruptedReconcile.test.ts` pins this behavior.

## What this run changed

- **Bounded native calls.** Every native call inside a reconcile pass is now bounded (`NATIVE_CALL_TIMEOUT_MS` = 5 s). Before this, one bridge call that never answered blocked every later serialized pass in that process, including the background-entry pass.
- **What it does not change.** The process-death window remains.

## Options considered

| Option | Removes the window? | Cost / risk |
|---|---|---|
| A. Keep the current design and document the window | No | None. This is the current state. |
| B. Cancel first: wait for the native cancel/re-register before the SQLite commit | Only for product writers; sync and raw writers remain | A crash between the cancel and the commit loses a ring that is still valid, until the next pass. That trades a stale ring for a missed ring, which is worse for a reminder app. |
| C. Native invalidation marker: JS writes `invalidated[reminderId] = generation` synchronously through a bridge call that uses `commit()`, inside every writer and before its SQLite commit. The receiver refuses any generation ≤ the marker. Reconcile prunes markers. | Yes for writers that call it. Raw sync upserts still depend on the reconcile that follows them. | New Kotlin plus a contract test. A synchronous bridge call on every reminder write. Markers must be per owner and generation (Phase 03 identities). |
| D. Native fire-time check against a native copy of armed jobs (the donor's native SQLite) | Yes | A second source of truth and much larger Kotlin. The audit does not mandate it. |

## Recommendation

Option C is the smallest AGY-compatible protocol, if the owner wants a process-death guarantee for product writers. It reuses the existing `claims` SharedPreferences pattern from the pre-advance remediation.

**Prerequisites:**

1. A Kotlin contract test shared with Jest: a marker at generation N blocks N and earlier, never N+1.
2. A device test that kills the app between the marker and the commit.
3. A device test for a sync upsert followed by a kill.

Until then the honest claims are:

- **Double ring:** closed.
- **Ring after retirement:** narrowed, not closed.
- **Exactly-once audible delivery:** never claimed.

## Correction, 2026-11-06 (final audit F4): process death is not Force Stop

The analysis above is unchanged. Only the test wording around it is corrected. The final audit (`docs/plans/agy-improvements/reports/codex-final-audit-940802c-20261106.md`, F4) found that run summaries and checklists described this residual as "force-stop during a background reconcile". The terms are not interchangeable:

- **The residual is process death or interruption.** The process ends after the SQLite commit but before the native cancel reaches `AlarmManager`. The package is not put into Android's stopped state, so its registrations stay armed and the obsolete one can ring.
- **Explicit Force Stop is a different platform condition.** This means Settings → Force stop, or `adb shell am force-stop`. On Android 15 and later, the package enters the stopped state and Android cancels its pending intents, alarms included. It stays stopped until the user launches it again. See [Android 15 enhanced stop states](https://developer.android.com/about/versions/15/behavior-changes-all#enhanced-stop-states).
  - Using Force Stop to probe this residual cancels the alarm itself, so a "no ring" would be a misleading pass.
  - LAFINA does not promise delivery while force-stopped and does not try to bypass the stopped state.
- **Prerequisites 2 and 3 above mean ordinary process death.** One way to get it is a QA-only fault-injection point between the commit and the cancel. It does not exist yet and is part of building option C. Another is killing the process of a debuggable QA build on a designated test device. Force Stop does not qualify.

This note does not implement option C or change the A4 status: the window remains.
