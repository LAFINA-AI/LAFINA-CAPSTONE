# Call follow-up — repeated ring after a native timeout (2026-11-18)

**Status:** `AWAITING DEVICE VALIDATION` — code fix and regression test pass; phone re-check NOT RUN (the phone was locked).
**Branch:** `feature/lafina-floating-assistant` (same working tree as CALL-FIX and Floating LAFINA). No commit made.
**Authorization:** owner chat 2026-11-18: "i will let you fix things codex missed".

## Finding

Found on the Infinix X6880 during the Floating LAFINA run (`docs/reports/evidence/float-03/device-checks.md`, "Second ring after a timed-out call"): a reminder rang natively at 23:49:00 and timed out at 23:49:45 (CALL-FIX 45-second cutoff). When LAFINA was opened at 23:50:48, `[ReminderPoller] Triggering reminder` showed the same reminder again as an in-app call, instead of waiting for the retry.

## Cause

`runReminderPoll` (`src/scheduler/reminderPoller.ts`) reads the due reminders, then awaits the native registration listing and the foreground claim. On app start the lifecycle pass adopts the native timeout in the same window (`recoverNativeCall`: reminder snoozed until the retry time, new delivery generation). The poll then used its stale row: the new generation's foreground claim succeeded (it is newer than the generation native fired), so it rang again and took the retry's native registration away.

## Fix

After the awaits and before claiming, the poller reads the reminder again and continues only if it is still the same owner's, still `pending`/`snoozed` and still due within 30 seconds. No other file changed.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| New regression: "a native timeout adopted while the poll awaits native state does not ring again" (`__tests__/scheduler/agyPort03Delivery.test.ts`) | PASS; no claim, no `LAFINA_CALL_TRIGGER`, reminder stays snoozed in the future | — |
| `agyPort03Delivery` suite | PASS (40) | — |
| `npm run preflight` | PASS: 159 suites, 2140 passed, 1 skipped; typecheck, lint, architecture | `docs/reports/evidence/call-fix-followup/preflight.log` |
| Phone: reminder rings, times out after 45 s, LAFINA opened a minute later | NOT RUN (phone locked with a secure lock) | — |

No native code changed, so the installed debug APK picks up the fix from Metro.

## Phone check

1. In the debug app, set a reminder two minutes ahead and press Home.
2. Let the call ring without answering; it stops after 45 seconds.
3. Open LAFINA about a minute later: no call appears. The reminder shows as snoozed and rings again at the retry time (5 minutes after the cutoff by default).
