# Phase03 targeted legacy selection

Read-only GitHub fetches at `f7e70aec54e6d16e627f444f2a67114cbfb07b5e`.
No legacy checkout changes, build, copied code, assets, binaries or dependencies.
Owner source-reuse authorization remains recorded; details are still to follow.

| Pinned file | Blob SHA | Reviewed behavior / decision |
|---|---|---|
| `android/app/src/main/java/com/lafina/LafinaReminderModule.kt` | `c2943fb2538be0dc8ba65a7c69b65ffc94b6f910` | Lines1–160 reviewed again: typed RN methods, future-time validation, timer/alarm integration, one pending-call preferences slot and active-call service launch. Keep platform adapter/capability concepts; implement a fresh durable-row command boundary rather than importing unrelated timers or call service. |
| `android/app/src/main/java/com/lafina/LafinaReminderReceiver.kt` | `95a8504a86d07eb524f8030cfd489773faf0b3e1` | Restore action set is a useful reference. New receivers validate occurrence and generation against the current source in SQLite; payload strings alone cannot authorize actions. |
| `android/app/src/main/java/com/lafina/LafinaReminderService.kt` | `9e2ab1652deae7a07e4650f9a0834bd3039225cc` | Whole140-line service reviewed: microphone/media foreground-service types, active-call notification and wake lock. Excluded: Phase03 needs no microphone, speech session, continuous ringtone, foreground service or wake lock. |
| `src/scheduler/reminderAlarm.ts` | `3b342f34970725e005c413b0234adc746b145400` | Typed permission/bridge lookup and future trigger validation are reference ideas. New adapter rejects absence and malformed native responses explicitly, reconciles durable jobs after commit, and does not import legacy reminder stores or microphone-call helpers. |

The [Phase00 native audit](phase-00-native.md) retains earlier targeted inspection
of the module's scheduling, manifest registration, hash-derived IDs and call state.
This Phase03 selection records the additional reads without claiming every line
of the legacy application was reaudited. Reuse consists of reviewed platform
concepts; all Phase03 source is newly implemented for the capstone schema.

Pinned source root:
[legacy Android source](https://github.com/LAFINA-AI/LAFINA/tree/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina).
