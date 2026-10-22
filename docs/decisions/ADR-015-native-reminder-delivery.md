# ADR-015 — Durable Android reminders across an isolated SQLite process

**Date:** 2026-10-23 (Asia/Manila)  
**Approved phase:** 03 only  
**Status:** implementation under validation; automated and physical-device results belong to the Phase 03 report.

## Decision and reason

Keep OP-SQLite in the React Native main process. Run Android system SQLite,
AlarmManager coordination, private receivers/provider and the native reminder
Activity in **:reminders**. Both processes use the same app-private
`lafina-capstone.sqlite` file and standard SQLite locking. They do not maintain
separate reminder databases. The React runtime does not initialize in the reminder
process, and primary ReminderStore access refuses a different process.

Two SQLite implementations touching the same file inside one process can lose
track of each other's POSIX locks. Separating processes avoids that particular
failure mechanism; it does not prove all platform/file-system failures impossible.
Never bypass SQLite to copy/read/replace the live database file. See
[SQLite locking pitfalls, sections 2.2–2.4](https://www.sqlite.org/howtocorrupt.html).

Use **DELETE rollback journal**, `busy_timeout=5000` and full synchronous writes.
Do not enable WAL opportunistically in either process. SQLite documents a rare
WAL-reset corruption race fixed in 3.51.3, with backports 3.44.6/3.50.7; a supported
Android 11 phone's system SQLite must not be assumed patched. This conservative
choice trades concurrent-read/write performance for compatibility until actual
engine versions and safe alternatives are verified. See
[SQLite WAL-reset guidance, section 11](https://www.sqlite.org/wal.html).

## Data ownership and crash boundary

JS alone creates/migrates the primary database to `user_version=2`. Native opening
requires the existing file, schema 2 and DELETE journal, first checked read-only;
it never creates, migrates, resets or auto-deletes a corrupt primary database.
An incompatible/unreadable file produces a recoverable unavailable result. The
standard Android corruption handler is replaced so it cannot erase saved items.
Debug-only synthetic test files have a separate constrained filename and never
stand in for primary-database validation.

The v1 data harness could simulate RINGING without a real Android alert. Migration
ends those paired simulated rings as MISSED with `LEGACY_SIMULATION_ENDED`, while
preserving generation/attempt history; it does not invent a native response
deadline or notification receipt for an alert that was never delivered.

Schema 2 adds nullable `ringing_deadline`/`notified_at` to jobs, explicit native
delivery settings (delivery and full-screen both default false), a derived OS
registration cache, and a redacted event log retaining the latest 200 rows.
Reminder/job transitions share one IMMEDIATE transaction. Acknowledgement never
writes task completion. Source edits invalidate old generations, and native work
also checks live source status/deletion and occurrence identity before effects.

SQLite cannot atomically commit an AlarmManager or notification operation. The
committed job is desired state; post-commit reconciliation applies platform
effects. Registration cache is derived evidence and is retained across terminal
states, generation changes and source deletion until the coordinator cancels the
old alarm, notification and timeout. A cache row is never proof of delivery.

The notification receipt is written only after notify succeeds. A crash between
claim and posting leaves a ring with no receipt; reconciliation can repost its
stable notification identity before the deadline. A matching generation/key,
private notification tag and only-alert-once behavior limit duplicate effects.
This is an idempotent recovery protocol, not a claim of exactly-once audible
delivery; the physical crash window still requires testing.

## Identity, permissions and limits

Use immutable explicit PendingIntents with a losslessly encoded URI containing
package, operation, job ID, occurrence key and generation. Notification identity
uses a matching string tag. A hash/request-code collision cannot merge different
occurrences. A stale callback cannot mutate the newly edited/snoozed target.

Delivery is explicitly enabled by the student. Notifications, notification-channel
importance, exact-alarm access and full-screen access are independently reported.
Schedule exact alarms when permitted for user-requested academic reminders;
otherwise expose inexact fallback and its possible delay. Do not claim exactness
from a successful scheduling call. See [Android alarms](https://developer.android.com/develop/background-work/services/alarms).

Full-screen presentation additionally needs the student's opt-in, platform access
and a high-importance channel. Otherwise a normal/heads-up notification opens the
same Activity. Android 14 restricts default full-screen access to eligible calling
or alarm apps; simulated call styling supplies no exemption. Distribution policy
eligibility remains a review item. See [Android 14 full-screen behavior](https://developer.android.com/about/versions/14/behavior-changes-14).

The shell is an academic reminder, **not a real phone call**. It uses text and
notification sound/vibration. No microphone, telephony role, speech engine,
foreground service or network dependency is introduced. Answer/Acknowledge
acknowledges only delivery; Snooze currently offers an explicit ten-minute action.
Manual planner controls remain available when delivery is disabled or unavailable.

The coordinator limits future due-alarm registrations to 128 and due handling to 256
per pass. One inexact maintenance alarm advances an overflow window. These are
work/OS-queue limits, not proven memory/throughput or timing guarantees. The
current native active-job query still materializes its result; dataset paging and
low-RAM behavior need evidence before claiming scalable phone capacity.

Within one successfully restored native-process lifetime, reuse a matching
REGISTERED job/identity/run time/precision instead of resetting its OS alarm on
each unrelated callback. The first reconciliation in a fresh native process
always rebuilds persisted registrations; failed/unavailable rows always retry.
A wall-clock rebase invalidates the process restoration marker. A posted ring
receipt also permits keeping its unchanged timeout within that same lifetime;
new processes/unposted rings rebuild it. No durable cache row alone proves that
Android retained an alarm across force-stop or restart.

This refinement follows an initial overlapping-alarm observation (one notification
posted2.607s after its planned time) and Android's minimum-future scheduling clamp.
Avoiding redundant resets removes a known avoidable source of delay; it does not
establish the cause of that one sample or a measured speedup. See
[AOSP AlarmManagerService](https://android.googlesource.com/platform/frameworks/base/+/cc76d06b5ef3c4040fdbad88fab29a4333f66c63/apex/jobscheduler/service/java/com/android/server/alarm/AlarmManagerService.java).
The phase report separates initial observations from final-build retests.

## Time and lifecycle policy

Future callbacks do nothing. More than 15 minutes late becomes MISSED; exactly 15
minutes remains eligible. Quiet hours use the saved global preference timezone,
with inclusive start/exclusive end, midnight crossing and explicit fold handling.
Nonexistent quiet boundaries fail visibly instead of shifting silently. Quiet
deferral and snooze advance generation. A new ring increments attempt count once
and has a 60-second response deadline. Timeout matches both identity and deadline;
it cannot consume a later snooze. This is a response window, not a promise of
continuous ringtone playback or exact timeout delivery under denied exact access.

Boot/unlock, package replacement, time/timezone changes, granted exact access and
foreground resumption reconcile from durable desired state. Credential-protected
storage requires unlock after reboot. Process death and force-stop are different:
delivery while explicitly force-stopped is not promised; the student must reopen
the app. Android 15 cancels PendingIntents when stopped. See
[Android 15 stopped-state behavior](https://developer.android.com/about/versions/15/behavior-changes-all).

An actual wall-clock TIME_SET change ends current rings as MISSED before
reconciliation, avoiding a backwards clock change extending a response window
indefinitely. A timezone-only change does not close rings or move stored UTC
instants. A schema 2 RINGING row missing its deadline is repaired only by MISS,
with `MALFORMED_RING_STATE`; ACK/SNOOZE cannot invent a successful alert. Terminal
MISSED rows retain FAILED delivery state/reason for diagnostics.

## Consequences, validation and rollback

Benefits: alarms can run without React/AI/cloud, stale work is fenced, and all
delivery state remains alongside academic data. Costs: Binder/process overhead,
two compatible SQLite engines across processes, rollback-journal contention,
platform permission/Doze/OEM limits, and the nontransactional OS effect boundary.
Failures remain visible and must not silently reset saved state or claim delivery.

JVM policy/identity tests, real Android SQLite transaction tests, JS bridge tests,
build/manifest inspection and actual-phone QA are separate evidence classes.
Actual automated and emulator results are recorded in the
[Phase 03 report](../reports/phase-03-report.md); physical-device acceptance
remains pending in [manual QA](../../qa/PHASE-03-MANUAL.md).
No mock proves locked-phone delivery.
No Android speedup, RAM floor or battery benefit is claimed without measurements.

Rollback means disabling delivery, reconciling cancellation, and retaining schema 2
data for a compatible corrective build. Do not downgrade to a schema 1 app, clear
storage, delete journal/cache files by hand, or overwrite a database to recover.
This decision does not authorize Phase 04 or any speech/model implementation.
