# ADR-014 — Capstone schema v1, atomic scheduling and finite weekly classes

**Date:** 2026-10-22  
**Phase:** 02, explicitly authorized by the owner in natural language  
**Status:** implemented; device review pending

Phase01's settings-only database had SQLite `user_version=0` and a separate
preferences payload `schemaVersion=1`. These are different version namespaces.
Migration **0 → 1** preserves the settings row exactly, adds the fresh capstone
tables, singleton anonymous profile and indices, and commits DDL/profile/version
together. It rejects future versions. No legacy v17 migration is offered.

One lazy app-private OP-SQLite connection owns settings and planner data.
`BEGIN IMMEDIATE` callbacks are synchronous: no await, native effect or model runs
between paired writes. Reads/errors propagate; there is no volatile fallback.
Task/event, reminder, desired job and operation receipt commit together. A token
replay returns the committed result; conflicting reuse fails. An early/stale
reminder no-op does not consume a token. Edits use optimistic record versions.
If rollback itself fails, the shared connection is quarantined until app restart;
later preference or planner access cannot report success inside an uncertain
transaction. A real-SQLite fault test covers the shared-write rejection path.

Each occurrence has one stable reminder/job identity and a monotonic generation.
Rescheduling, snoozing and cancellation invalidate prior callbacks. Acknowledged
and missed occurrences remain terminal through metadata/series edits. Task
completion requires a separate explicit task edit. Source records retain their
current reminder lead independently of historical occurrence outcomes. Logical
deletion hides the item and records cancellation without losing the job identity.
Physical purge/receipt retention and production paging remain later work.

The desired job remains `UNAVAILABLE` in Phase02, including after the QA tool
changes a data state to RINGING. No alarm or audio was delivered. SQLite cannot
commit atomically with Android AlarmManager; Phase03 must implement/review native
identity, generation checks, capability reporting and post-commit reconciliation.
The stored job ID is a stable cancellation key; it is not a tested PendingIntent.

Timed instants use canonical UTC with milliseconds; supported years are 2000–2100.
Date-only tasks retain a calendar date and never acquire an invented midnight
alarm. Weekly events preserve chosen timezone/wall-clock start with a fixed
elapsed duration, unique selected weekdays and an inclusive finite end within
366 calendar dates. Gap times reject; repeated times require an explicit fold.
Device timezone changes do not move existing instants or class timezone anchors.
Upcoming windows are half-open; overlapping events are included. Date-only tasks
are included by intersecting local calendar dates in the query timezone.

Due processing is a pure policy followed by a transaction: future → no-op; more
than 15 minutes overdue → MISSED; otherwise quiet hours → requeue at quiet end;
otherwise eligible → RINGING. The 15-minute grace is an initial policy for review,
not an observed reliability result. Quiet intervals include start/exclude end,
cross midnight, and encompass both sides of a repeated boundary. Nonexistent
quiet boundaries reject with a recoverable error. Quiet hours do not change DND.
No automatic missed retry, background timer or alarm is introduced in this phase.

Alternatives rejected: cloning the legacy business schema, native-first scheduling
with compensating writes, async overlapping transactions, host-local recurrence,
infinite RRULE expansion, resetting terminal occurrences, and marking tasks done
when reminders are acknowledged. No dependency or model was added.

Validation: real host SQLite fault injection and process termination, RNTL controls,
native builds and separately labeled emulator SQL checks. Host timing results
measure in-memory operations only; they cannot justify Android performance claims.
See the [phase report](../reports/phase-02-report.md), [schema](../phase-02-data.md)
and [manual checklist](../../qa/PHASE-02-MANUAL.md).

Rollback: retain the v1 database and install a compatible newer build. Do not
downgrade to settings-only Phase01 as a schema recovery strategy, reset user data,
or clear pending jobs after a native delivery failure. Test any future migration
on a synthetic copy before changing the version.
