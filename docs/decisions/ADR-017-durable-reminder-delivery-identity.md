# ADR-017 — Durable reminder delivery: jobs, identities and one engine

**Status:** accepted for automation. Device behavior is not validated.  
**Date:** 2026-11-06  
**Phase:** AGY-PORT 03  
**Review owner:** human developer  
**Relates to:** ADR-016 (storage protocol). This ADR replaces ADR-015 for this branch, because the AGY base does not implement ADR-015 (see below).

## Context / problem

The AGY base (`b9433dc`) delivered reminder calls with these defects:

- **Hash identity.** Both the alarm PendingIntent and the call notification used `reminderId.hashCode()`. Two IDs with the same Java hash (`"Aa"`/`"BB"`) shared one alarm slot and one notification.
- **No generations.** An alarm registered before an edit, snooze, delete or guest rekey still fired later. Answer, Decline, Snooze and Acknowledge all acted on whatever the reminder row held by then.
- **Two engines.** The JS foreground poller and the Android alarm could both ring the same reminder.
- **A shared pending call.** `finishIncomingCall` cleared the pending call for *any* reminder.
- **Unbounded restore.** Boot restore rang every past-due reminder, however old.
- **No account fence.** Another account's alarm could ring after a switch or logout. The call UI only filtered by owner after it had been shown.

ADR-015 describes a `:reminders` process with native SQLite. That design is not in this codebase: the manifest has no `process` attribute and there is no native SQLite code. It is historical only.

## Decision

### 1. Jobs live in SQLite and are derived by triggers (schema 19)

`reminder_delivery_jobs` has one row per reminder:
- `user_id`, `generation`, `state`, `trigger_at`
- the registration receipt: `registration_state`, `registered_generation`, `registration_error`, `registration_attempts`
- optional local source linkage: `source_type`, `source_id`

`reminder_delivery_events` holds bounded, redacted evidence: IDs and codes only, never reminder text, keeping the newest 500 rows.

Three triggers on `reminders` keep jobs consistent for every writer, inside that writer's own transaction:
- `AFTER INSERT`
- `AFTER UPDATE OF user_id, trigger_at, status, deleted_at, task`
- `AFTER DELETE`

The writers this covers are manual UI, assistant, sync-pull upsert, guest rekey, task and time-block cascades, and raw cleanup. The triggers write only the job table. They never touch `sync_outbox` or `reminders`, so they cannot echo, double-enqueue or write under the wrong user.

Job state comes from the reminder:

| Reminder | Job state |
|---|---|
| deleted | `retired` |
| `pending`, `snoozed` | `armed` |
| `triggered` | `ringing` |
| `acknowledged`, `missed` | `retired` |

**The generation increments when:**
- the instant changes (`trigger_at`),
- the owner changes,
- the reminder is deleted or undeleted, or hard-deleted, or
- the reminder is re-armed after ringing or closing.

**The generation does not change when:**
- the reminder goes from `pending` to `triggered`, so a ringing call keeps the identity it was shown with;
- it goes to a terminal status (the job retires);
- only the task text changes, which marks the job for re-registration so the native text updates;
- an identical sync row is applied again.

Jobs are local-only. The seven wire payloads are unchanged.

### 2. The native registry is a separate file, not lafina.db

Native code never opens SQLite. ADR-016 allows only one SQLite library per process.

JS registers each armed generation through `scheduleExactAlarm({reminderId, task, triggerAtMs, ownerId, generation})`. Native keeps its own durable registry in `lafina_delivery_registry_v2` SharedPreferences: one record per reminder, versioned (`v2|…`), written with `commit()`.

So there is no cross-library locking, no busy-retry loop and no native schema range to refuse. Native reports what it did as receipts, which `drainDeliveryReceipts` copies into `reminder_delivery_events`. The receipts are:
- `registered`, `registered_inexact`
- `fired`, `posted`, `post_denied`
- `stale_ignored`, `duplicate_ignored`, `suppressed_inactive_owner`
- `expired`, `superseded`, `cancelled`
- `legacy_adopted`, `legacy_trigger_ignored`

A record in a newer format is never interpreted or deleted ("no destructive repair").

**Trade-off (accepted):** native code cannot see SQLite. A job retired by a writer that does not also cancel the alarm keeps its native registration until the next reconcile. That registration can still post a call, and JS then dismisses it at admission. Reconcile runs at startup, on resume, after sync pulls that touch reminders, on account switch and on logout. Explicit delete, ACK and snooze paths also cancel directly. ADR-015's design (native SQLite in a separate process) would close this gap, at the cost of a second process and engine. That is not adopted here.

### 3. Identity

The identity is a full Intent data URI:

`lafina-capstone://reminder/<operation>/<owner>/<reminderId>/<generation>`

- The operation is `due`, `call`, `answer` or `decline`.
- Components are encoded the same way in JS and Kotlin: keep `A-Z a-z 0-9 - . _` and percent-encode every other UTF-8 byte. An empty owner is written `~`.
- Shared test vectors exist on both sides.

Every PendingIntent uses a constant request code, so Android tells them apart by the URI alone. Call notifications use tag `lafina-reminder:<reminderId>` with a constant id. Old hash-based IDs are cancelled once, for upgrade cleanliness. Generation `0` means a registration adopted from the old registry.

### 4. Claims and fences

- **Native claim (alarm broadcast).** The receiver claims only the exact current registry identity and removes it with a synchronous commit before posting. The result is one of:
  - a duplicate broadcast (entry gone),
  - a superseded generation (identity differs),
  - an inactive owner (the active-owner marker set by JS: `""` means signed out),
  - a fire.
  
  A claim is not proof that the alarm rang.
- **JS admission (`admitReminderCall`).** This is the one path for the native event, the cold-start pending call, resume and the JS fallback. It requires an active owner equal to the reminder owner and the identity owner. A captured generation must equal the job generation, and the job must not be retired. AGY's suppressions are kept: acknowledged/missed, completed task, and an already-acknowledged title (title pairing is AGY behavior; exact-source linkage is AGY-PORT 04).
  - A rejected call dismisses only its own notification.
  - The alarm is cancelled only when the job is retired, never for a stale generation, which may be newer work.
- **Actions.** Answer, Decline, the Snooze and Acknowledge buttons, voice ACK/snooze and auto-snooze carry the generation captured at admission (`IncomingCallScreen.deliveryGeneration`, then the dispatcher session). They re-check it inside the mutation's transaction, through the `ReminderMutationGuard` parameter on `snoozeReminderAt`, `acknowledgeReminder` and `updateReminderStatus`. A mismatch rolls back the reminder, the job and the outbox together.
  - Callers with no captured identity, such as typed Chat commands, keep AGY's owner-only check.
  - Generation 0 (an adopted legacy alarm) is accepted only while the job is still at generation 1, its backfill generation. After any bump it is stale.
  - **ACK still never completes a task.**
- **Pending call.** `finishIncomingCall(reminderId)` clears the pending-call record only when it belongs to that reminder.

### 5. One authoritative engine

Android AlarmManager is the engine. `reconcileReminderDelivery(activeUserId)` runs one pass at a time. It:
- sets the native owner marker,
- drains receipts,
- lists native registrations,
- keeps matching live ones,
- re-registers missing ones and ones Android dropped (`armed: false` after reboot or force-stop),
- cancels other owners', retired and superseded registrations,
- marks other owners' armed jobs `suppressed` (they stay in SQLite for that owner's return).

A registration is kept only when it matches the job identity and instant, Android still holds it, and the job's receipt is `registered` for this generation. Any other receipt, including `unregistered` after a text-only edit or sync update, re-registers the same identity so the native text is refreshed.

The JS poller dispatches a due reminder only when `shouldDispatchInJs` holds. That means one of:
- the native module is missing, or
- the native listing (read once per pass) succeeded, shows no live registration for that reminder, and the receipt is not `registered` for this generation.

A failed listing means native stays the only engine.

**Residual double-ring windows:**
- Native fires in the sub-second gap between the poller's listing and its dispatch.
- A native build without the listing method relies on receipts alone.

**Owner unknown before the first reconcile after upgrade.** An adopted legacy alarm (owner `""`) can post natively for whichever account is signed in, because the owner marker is unset. JS admission still checks the reminder row's owner, and the first start reconciles and replaces adopted entries.

**Snooze and lead-time changes now commit before registering.** A failed registration keeps the saved change, records `failed`, and is retried by reconcile; meanwhile the foreground fallback can ring it. Before, AGY registered first and refused the snooze when Android rejected the alarm.

### 6. Cutover and restore

- **Cutover.** A one-time, versioned (`legacy_cutover_version = 1`), idempotent native cutover runs before any registry operation. It adopts each old `lafina_alarm_registry` entry as owner `""` generation 0, never over an existing v2 record. It then cancels the old hash PendingIntent and deletes the old entry. Adopted future alarms are re-armed and the restore rule handles past ones. An interrupted cutover repeats safely. The next JS reconcile replaces adopted entries with real identities.
- **Restore.** This covers boot, package replace, time or timezone change, and a change in exact-alarm permission:
  - future alarms are re-armed;
  - alarms at most 15 minutes late are claimed and posted once (both boot receivers run; the second finds nothing to claim);
  - older alarms are expired natively. JS marks them missed through the rescheduler's existing 15-minute rule.

### 7. Accounts

Account switch or logout:
- hides the previous owner's call;
- stops speech and the active-call service (`disconnectCall`);
- reconciles: with the new owner, or with `null` on logout, which cancels every owned registration.

Jobs survive in SQLite for that owner's return. Guest linking rekeys jobs atomically through the `user_id` trigger, with a generation bump, so a guest-identity alarm is stale after linking. This is AGY's single-active-account model, not a new multi-account background policy.

## Consequences

- Hash collisions, duplicate broadcasts, superseded generations and stale buttons cannot affect newer work: tested in JS and on the JVM.
- **Force-stop.** Android drops alarms and PendingIntents. Nothing rings until the app is opened again, at which point reconcile re-registers them (`armed: false`). Delivery after a force-stop is not promised.
- **Exact-alarm permission denied.** Native falls back to inexact `setAndAllowWhileIdle` and records `registered_inexact`.
- **Exactly-once audible delivery is not guaranteed.** A crash between claim and `notify` loses that ring, and the claim receipt shows it.
- **Rollback.** A build without this phase ignores schema-19 tables. Its old code reads `lafina_alarm_registry`, which the cutover emptied, so after a downgrade, alarms exist only after that build's own reschedule pass. Do not hand-edit preferences or the database.

## Validation

- Jest on real SQLite: triggers, fences, reconcile with a stateful registry fake, poller, admission, upgrade from the schema-17 fixture.
- Kotlin JVM tests for the pure contract.
- An instrumentation test using test-named preferences only. It is compiled, not run (no device).

Phone behavior (ringing, lock screen, Doze, reboot, OEM) is **not validated**. See `docs/plans/agy-improvements/reports/phase-03-delivery.md`.
