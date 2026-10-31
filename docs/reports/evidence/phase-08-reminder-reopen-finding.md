# Phase 08 reminder reopening finding

The A28 paused-review check exposed a production navigation defect: after
opening Main/Chat above an existing reminder, reopening the reminder task could
leave Chat on top. The [initial actual-notification attempt](phase-08-expanded-A28-notification.log)
reached the paused confirmation attempt but failed before observing the reopened
reminder. This was distinct from the [A35 instrumentation completion race](phase-08-notification-harness-finding.md).

Reminder OPEN previously used `NEW_TASK` alone. Investigation identified the
shared task/back-stack arrangement as the reason that bringing the task forward
could expose Main rather than the reminder. An initial flags-only correction
passed the [first reopening regression](phase-08-expanded-A28-fixed.log). That
candidate was superseded by the final implementation: OPEN uses
`NEW_TASK | CLEAR_TOP | SINGLE_TOP`, and `ReminderActivity` has the dedicated
`${applicationId}.reminders` task affinity. This returns to the native reminder
through its existing lifecycle fence while retaining the main planner and its
unsent draft. The decision and Android contract are recorded in
[ADR-023](../../decisions/ADR-023-foreground-reminder-response.md).

The final task-isolated candidate passed the [A28 regression JSON](phase-08-emulator-expansion/ex20261028/20261028T091739207196Z-7d375720-lifecycle.json).
The driver first opened the private reminder Activity, answered and reviewed an
ACK proposal, then opened Main, attempted the cached old confirmation node and
staged a synthetic unsent Chat draft. Reopening used the exact owned notification
in System UI. Recorded stages include
`paused_review_reopened_via_actual_owned_notification`,
`resume_requires_new_answer_and_review`, and `main_unsent_draft_preserved`.
The old review/draft did not return, Answer was available again, and returning to
Main preserved the exact unsent text. The driver then cleared only that owned
synthetic draft. The JSON's general direct-launch label describes initial
fixture entry; its explicit reopening stage identifies the notification action.

Independent read-only SQLite snapshots [before](phase-08-emulator-expansion/ex20261028/20261028T091654795179Z-b3084357-wait.json)
and [after](phase-08-emulator-expansion/ex20261028/20261028T091739207196Z-7d375720-lifecycle.json)
showed the same reminder/job identity and generation 1, paired `RINGING` states,
task `TODO`, one registration, and the unchanged original deadline
`2026-10-28T09:18:37.567Z`. Reopening did not extend the response window or commit
ACK. The [combined regression log](phase-08-expanded-isolated-regressions.log)
also records subsequent exact-fixture cleanup.

The [final source ledger](phase-08-expansion-source-hashes-permission-ui.json) pins
`ReminderIntents.kt`, `AndroidManifest.xml` and the lifecycle driver; the
[final APK ledger](phase-08-expansion-artifacts-matched.json) identifies the rebuilt
candidate. A separate [final A35 notification ACK/replay](phase-08-emulator-expansion/ex20261028/20261028T091805074651Z-935238d2-notification.json)
verified paired `ACKNOWLEDGED`, task `TODO` and zero registrations after the
harness waited for the existing receiver worker. A28 establishes reopening and
review retirement, not voice ACK or A35 reconciliation by itself.

These are synthetic-fixture results on the tested emulator. Physical-phone
navigation, Recents gestures, OEM delivery, live speech and audibility remain
**NOT RUN / HUMAN REQUIRED**.
