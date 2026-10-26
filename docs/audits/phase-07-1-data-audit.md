# Phase 07.1 incoming data and command audit

**Incoming revision:** `9c183a20eca2377b5e54f219c5f83460b18af81b` (`origin/main` when fetched).  
**Scope:** read-only comparison of incoming storage, calendar persistence, account/sync wiring and reminder commands with the retained Phase 07 core. The incoming branch is reproducible by commit rather than a moving branch name.  
**Authorization:** the owner requested integration and testing as Phase 07.1 before Phase 08. This does not approve accounts, backend services, cloud synchronization or Phase 08.  
**Result:** incoming visual presentation can be adapted; its storage, scheduler and account runtime must not replace the existing offline core without resolving the findings below.

## Method and limits

Targeted files were read with `git show <revision>:<path>`. The isolated probe script reads that same fixed revision, records Git blob and SHA-256 identities, transpiles reviewed TypeScript and evaluates only the selected code with inert imports. Database probes record SQL strings in memory; no real database, Android module, network endpoint, credential or user schedule is used.

Run from the repository root:

```powershell
node scripts/audit-incoming-data.cjs --output docs/reports/evidence/phase-07-1-incoming-data-probes.json
```

The evidence file was actually generated and all probe assertions passed. The script refuses to overwrite evidence: select a new output filename for subsequent runs. See [probe script](../../scripts/audit-incoming-data.cjs) and [actual results](../reports/evidence/phase-07-1-incoming-data-probes.json). These are reproductions of incoming source behavior, not proof of Android durability or physical-device operation. Other findings below are source inspection, explicitly distinguished from executed probes. No Android build or device check was performed by this data-audit subtask; integration evidence belongs in the Phase 07.1 report.

## Findings

Line numbers in this table refer to the fixed incoming revision, not to adapted integration files.

| ID / priority | Incoming source | Verified behavior and integration consequence |
|---|---|---|
| DATA-01 / High | `src/storage/database.ts:39`; `src/storage/dbInit.ts:17,51–56,424–425` | Opens `lafina.db`, schema 17. The retained core opens `lafina-capstone.sqlite`, schema 2, and the incoming initializer contains no import from that file. Replacing the runtime therefore makes existing capstone data invisible; this is not an upgrade migration. Source inspection. |
| DATA-02 / High | `src/storage/database.ts:42–57,79–94` | Native open failure enables empty-result fallback. **Executed probe:** a transaction returned `accepted`, its `afterCommit` callback ran and an attempted write affected zero rows. The UI can report success without durable storage. |
| DATA-03 / High | `src/storage/database.ts:79–136` | Transaction callbacks are not checked for async functions/promises. **Executed probe:** SQL sequence was `BEGIN IMMEDIATE TRANSACTION`, `COMMIT`, then the asynchronous write. Failed rollback is also logged without quarantining the connection; that additional weakness was inspected, not simulated. |
| DATA-04 / High | `src/scheduler/callDispatcher.ts:249–257,332–346` | Substring matches feed directly into reminder actions. **Executed pure-parser probes:** `do not acknowledge`, `I did not acknowledge` and `acknowledge later` all return ACK; `do not snooze` returns snooze. `snooze zero minutes` silently becomes unspecified/default snooze. Preserve explicit reviewed drafts and confirmation rather than importing this dispatcher. |
| DATA-05 / High | `src/ui/screens/calendar/hooks/useScheduleItemModal.ts:93–179` | Saves a task/event and then separately inserts a reminder with a new random ID. Editing inserts another reminder rather than replacing the source reminder. Reminder creation failures are logged while the modal closes as saved. Trigger times in the past are clamped to now plus one second. These are not paired task/reminder/job transactions. Source inspection. |
| DATA-06 / High | `src/storage/tasksStore.ts:270,445` | Deletion finds pending/snoozed reminders using `user_id` plus the source **title**, rather than task/event ID. Identical titles can cause unrelated reminders to be cancelled. Triggered reminders are excluded from that cleanup. Source inspection. |
| DATA-07 / Medium | `src/ui/screens/calendar/hooks/useScheduleItemModal.ts:90` | Uses `selectedDate.toISOString().split('T')[0]`. **Executed expression probe:** selected midnight `2026-10-27T00:00:00+08:00` becomes `2026-10-26`. The separate start/end check also uses `>` and permits equal event times; inspected, not a full UI probe. |
| DATA-08 / High scope conflict | `App.tsx:41,50–51,201–299,417–423`; `src/storage/dbInit.ts:56+` | Imports login/register screens, account sessions, user credentials/roles, cloud linking, sync tables and startup/resume sync passes. These conflict with the approved anonymous offline product. Guest entry does not remove those features or dependencies. Source inspection. |
| DATA-09 / Medium | `src/storage/database.ts:69–73`; `src/scheduler/reminderPoller.ts` | SQL failures log complete parameters; the poller logs reminder titles. Those can expose private academic schedules in logs. Source inspection; no personal data was printed during this audit. |
| DATA-10 / High | `src/scheduler/reminderActions.ts:49–53,89`; `src/storage/remindersStore.ts` | Snooze schedules Android before persisting its DB outcome. Status changes lack the retained core's generation/version/response-window checks and paired job transaction. A race or database failure can desynchronize delivery. Source inspection; no concurrency/device test claimed. |

### Positive behavior retained in the audit

Incoming `acknowledgeReminderAction` and `remindersStore.acknowledgeReminder` update reminder status without completing the underlying task. The isolated ACK probe recorded an `UPDATE reminders ... acknowledged` and no task mutation. This is a useful invariant, but it does not resolve the unsafe parser, missing state/version fences or scheduler consistency findings.

Incoming code also rejects nested transactions, uses parameterized SQL for most entity operations, and attempts post-commit native cleanup on deletion. Those practices are useful references; they do not make the incompatible database a replacement for the retained repository.

## Database integration decision

Keep the installed Phase 07 capstone database and its existing runtime authoritative: `lafina-capstone.sqlite`, schema 2, anonymous settings/profile, explicit source relationships, optimistic versions, operation receipts and reminder/job generations. The schema number 17 in the other implementation does not establish compatibility or superiority. Do not rename either file, run the incoming initializer against the retained file, change `user_version` to force acceptance, wipe app data or silently open a fresh database as a recovery path.

There is **no automatic `lafina.db` schema-17 import** in this integration. We have no verified ownership/mapping for its account-scoped records, and the data semantics differ: separate floating date/time strings versus canonical timestamps/date-only values, title-based reminders versus source IDs, recurrence formats, missing optimistic versions, and no equivalent paired job/receipt state. Blind import could expose another account's data, assign the wrong timezone or create duplicate/mistimed alarms. No real `lafina.db` contents were inspected or copied.

If a person later needs to preserve data created using the friend's build, retain that private database and request a separately reviewed, explicit import workflow. The importer needs ownership selection, source mapping, validated timezone/date conversion, preview/count reconciliation, transaction rollback, idempotency, duplicate-title handling, reminder regeneration policy and tests before touching a real schedule. Its absence must be communicated as a limitation; the integration must not claim that both historical databases were merged.

## Presentation integration boundaries

- Reuse reviewed theme/assets/calendar/tab presentation through typed adapters to the retained repository and scheduling validation.
- Replace incoming persistence hooks; do not keep two independent writable task/reminder databases or competing alarm schedulers.
- Keep the existing command session's private review token, expiry, source/version fences, confirmed writes and explicit completion semantics.
- Exclude account/login/register/credential/cloud/sync runtime and the incoming direct speech keyword executor.
- Keep recoverable storage errors visible. A failed open or query must not become an empty successful planner.
- Preserve existing historical reports and benchmarks. This source audit provides neither a new device benchmark nor retrospective validation of the friend's reports.

## Integration regression checks

The integration owner should exercise the retained preflight and native gates, then verify on the emulator that settings/data survive replacement installation. Targeted regression scenarios are duplicate task/event titles, editing without duplicate alarms, date selection at UTC+08 boundaries, rejected negated commands, ACK leaving TODO intact, explicit task completion, and storage-failure UI recovery. Real handset audio, battery, low-memory behavior and reboot delivery still require their documented physical-device checks.

**Subtask ownership:** only this audit, its standalone probe script and its new evidence JSON were written. Core implementation was not changed. Ownership is returned to the integration owner after completion.
