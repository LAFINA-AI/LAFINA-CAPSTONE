# 05 — Local Data, Calendar and Scheduling Design

## Non-negotiable

Scheduling and all reminders must be functional in airplane mode, without accounts, without STT/TTS, and without a resident LLM or backend. SQLite stores authoritative user schedules and alarm/job state; OS alarms are **delivery mechanisms**, never the source of truth. Prefer injection of a test clock and alarm adapter for deterministic testing.

## Minimal domain entities (adapt as needed)

### Implemented schema3 notes addition — Phase07.1

The authoritative file remains `lafina-capstone.sqlite`. Version0→1→2→3
migrations run inside one synchronous transaction. The schema2→3 step adds only
`notes` and two indexes; it preserves all prior tables, settings JSON, planner
rows, native jobs/registrations and operation receipts. A failure rolls back DDL
and `user_version`; failed rollback quarantines the connection. Native reminder
readers accept schema2 or3, reject unknown future versions and never read/write
notes. Do not downgrade/reset an existing schema3 installation.

| Actual note column | Meaning/constraint |
|---|---|
| `id` | Stable source ID; repository IDs derive from a validated operation token |
| `title`, `body` | Required trimmed title up to160 Unicode characters; body up to10000, with multiline text preserved |
| `category`, `pinned` | Personal/Coursework; explicit boolean pin state |
| `version` | Positive integer; edits/deletes require the saved expected version |
| `created_at`, `updated_at`, `deleted_at` | UTC timestamps; deletion creates a tombstone |

Create/edit/delete and their receipt are atomic and retry-idempotent. The shared
receipt fingerprint separates note operations from planner operations; retry does
not mean a deleted note is recreated. Notes page/search uses parameterized SQL,
literal escaped wildcard punctuation, a validated100-character search and at
most20 exposed rows (21 SQL rows detect the next page). Indexes
`notes_visible_order` and `notes_category_order` support list/filter order; body
substring search may scan history. Profile counts use exact live note and
completed-task `COUNT(*)` queries rather than page length.

### Notes retention and removal semantics

Removing a note updates its tombstone/version and hides it from public `get`,
page/search and counts; it does **not** permanently delete its saved content.
The `notes` row retains title/body. Each successful create/edit also stores the
returned saved note in `operation_receipts.result`; its `fingerprint` contains
the canonical JSON payload, including the complete saved title/body, rather than
a cryptographic hash. Earlier saved revisions can remain in these receipts even
after a note is edited or removed. The delete receipt itself returns null and
identifies the target/version, but does not remove older receipts.

These copies support retry/idempotency and are local to the same app-private
database. They have no automatic expiry, scheduled cleanup or user-accessible
permanent-purge mechanism in this phase. Do not describe row hiding, a zero live
count or an empty search as erasure. The removal confirmation/privacy copy must
disclose retention before the user agrees. Unsaved editor text is not a new
saved revision merely because the editor is open. Avoid sensitive test notes;
complete purge, retention deadlines and export require separately approved
design and tests, not an assumption that Phase08 will add them.

Clock format and first-weekday preferences live in the existing `app_settings`
JSON, separate from stored UTC/date-only scheduling values. Old missing display
keys default to24h/Monday; invalid supplied values fail validation. No account,
audio/transcript store, schema17 import, second database or online service is added.
See [ADR-022](decisions/ADR-022-nol-ui-local-notes.md),
[host measurements and limits](benchmarks/phase-07-1-nol-ui-notes.md) and the
[current report](reports/phase-07-1-nol-ui-report.md). Physical-device acceptance
and complete privacy purge/export remain separate work.

Incoming Nol's `lafina.db` schema17 is not an earlier version of this schema and
has no automatic import. Both apps use the same `com.lafina.capstone` Android
package; database lineage must be established independently of package identity
and signing compatibility. Keep unknown/Nol installations intact rather than
uninstalling, clearing, downgrading or replacing their database. See the
[manual preservation boundary](../qa/PHASE-07-1-NOL-UI-MANUAL.md).

### Earlier conceptual entity inventory

| Entity | Essential fields |
|---|---|
| `LocalProfile` | stable `localProfileId`, optional display name, timezone, onboardingCompletedAt, preferences |
| `Task` | id, title, notes, dueAtUtc nullable, createdAtUtc, updatedAtUtc, status `TODO/IN_PROGRESS/COMPLETED/CANCELLED`, version |
| `Event` | id, title, notes, startAtUtc, endAtUtc, timezoneId, optional recurrenceRule, status |
| `Reminder` | id, sourceType+sourceId, scheduledAtUtc, leadMinutes, status, snoozedUntilUtc nullable, attempts, version, lastOutcomeAtUtc |
| `ReminderJob` | id, reminderId, occurrenceKey, runAtUtc, status, attemptCount, platformAlarmKey, version |
| `ReminderInteraction` | id, reminderId, occurrenceKey, openedAtUtc, outcome, optional duration; no raw voice recording by default |
| `ChatMessage` | id, timestamp, local role, text, optional structuredActionId; app-owned local only |
| `AppPreferences` | key-values for theme, default lead/snooze, response mode, audio options and hints |

Create no business tables, subscriptions, cloud identity fields, Qdrant vectors, transcripts store or user_behavior logging by default. Store only data actively required for the capstone.

## State machine

```mermaid
stateDiagram-v2
  [*] --> SCHEDULED
  SCHEDULED --> RINGING: valid due alarm
  SCHEDULED --> CANCELLED: user cancel
  RINGING --> ACKNOWLEDGED: answer or explicit ACK
  RINGING --> SNOOZED: snooze valid duration
  RINGING --> MISSED: unanswered/timebox
  SNOOZED --> SCHEDULED: queued at new instant
  MISSED --> SCHEDULED: policy-approved retry
  MISSED --> CLOSED: no further retry
  ACKNOWLEDGED --> CLOSED
  CANCELLED --> CLOSED
```

Ensure diagram maps to actual code behavior. Distinguish task `COMPLETED` from alert `ACKNOWLEDGED`; don't let auto-dismiss mark an assignment done. Call `answer` may transition to `ACTIVE/ANSWERED` before final outcome if useful; log event order. State should be persisted, not just in React component state.

## Reliability requirements

1. Paired `Reminder` + `ReminderJob` writes are performed atomically (`BEGIN ... COMMIT`) through a repository method such as `commitReminderOutcome`.
2. A native alarm event carries id/occurrenceKey and idempotency token. Duplicate broadcasts, already-deleted reminders and stale call callbacks do not duplicate actions.
3. On boot/app launch/permission changes, reconcile pending DB jobs with platform scheduled alarms. `BOOT_COMPLETED` behavior must be tested; don't promise force-stop recovery before app reopens where OS prohibits it.
4. Schedule next occurrence for repeated classes in an idempotent manner. Recurrence anchored to chosen IANA timezone and appropriate wall-clock local time; handle changing timezone/travel and daylight-saving on phones even if USTP is in Asia/Manila.
5. Changing due time cancels/replaces the prior alarm. Concurrent edits and ringing events are serialized or version-checked.
6. Snooze must validate duration range (e.g. 1–120 min configurable). Overlapping alarms use independent IDs and queued notifications; avoid multiple simultaneous microphone sessions.
7. Destructive delete is confirmed and cascades only to owned reminder jobs. DB migration is non-destructive, deterministic, backed by test fixture.
8. Permission denied -> clear warning, request user action and fallback notification if possible; never silently mark an undelivered reminder as delivered.

## Android scheduling boundary

Use eligible exact alarms only for user-facing, time-specific reminders, with normal fallback when restricted. Use platform API capability checks (not merely API-level checks), implement appropriate permission education, and verify Google Play policy before considering `USE_EXACT_ALARM`. Do not rely on arbitrary background activities or continuously running foreground services. Set `AlarmManager`/`PendingIntent` identity carefully; avoid accidentally overwriting simultaneous alarms. Deferrable cleanup/model refresh uses `WorkManager` if later justified.

## Calendar scope

Core screens: Today agenda, Calendar (minimum usable month/week navigation), Add/Edit Task, Add/Edit Event, Reminder details. Distinguish date-only all-day tasks from timed events. Display local timezone; internally store stable UTC instants, selected timezone and/or date-only semantics. Initial import/export and external Google Calendar integration explicitly out of scope. Weekly recurring classes supported if included in approved phase; use dedicated recurrence test cases.

## Manual QA examples

- Fresh install airplane mode -> add task tomorrow 9am -> force close/reopen -> still visible.
- Trigger time while screen locked; confirm correct alarm fallback and audio/vibration on allowed platform.
- Create two reminders at same time; both exist, neither overwrites the other.
- Delete a reminder 10 sec before due; no stale acknowledgment updates.
- Snooze for 10 min while app is interrupted; current+future states remain consistent.
- Change timezone; compare next scheduled occurrence with explicitly defined policy.
- Reboot: verify reconciling after boot; record brand-specific battery restrictions.
- Separate 'Acknowledged' from 'Task completed'.
