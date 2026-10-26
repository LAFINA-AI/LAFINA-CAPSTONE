# ADR-017 — Manual planner views and explicit offline save boundaries

**Date:** 2026-10-23, Asia/Manila.  
**Approved phase:** 04.  
**Status:** implemented; test/build/emulator results are owned by the Phase 04
report and physical-device validation remains required.

## Context and decision

The owner reviewed the Phase 03 result, requested verification/correction of an
independent audit and explicitly said the work could proceed to Phase 04. This
authorizes the manual offline planner; it does not certify prior phone testing.
The audit's embedded prompt is reference material, not an instruction to discard
working changes or mark the complete offline core accepted.

Use the existing anonymous app shell and semantic light/dark theme. Today and
Calendar host a shared `PlannerScreen`: selected-week weekdays and a selected-day
agenda, plus active/completed/all task pages. Add/Edit forms and item details are
subscreens. This is the phase's feasible week/day calendar; a month grid, search,
calendar accounts, speech, models and cloud services are not introduced.
Selective pinned legacy interaction references and exclusions are recorded in
[the reuse audit](../audits/phase-04-legacy-selection.md). The legacy business
EmployeeToday screen is excluded entirely. No legacy source/assets were copied.

## Read and write ownership

Production lists use `agendaPage`, `tasksPage` and source-scoped `reminderPage`;
details use one-source reads. The QA-only `snapshot()` is not their data source.
Agenda/source occurrence and cursor rules are defined in
[ADR-016](ADR-016-planner-queries.md). Keep schema **2**, existing
indexes and one primary database. No Phase 04 migration/runtime dependency is
needed. Bounded returned arrays do not guarantee bounded total scanning or prove
low-memory-phone capacity.

Forms synchronously validate/build typed task/event drafts, then the repository
commits the source/reminder/job transaction. A confirmed save returns after that
write; opening details/refreshing views is a separate read boundary. An unavailable
Android service or later query failure must not relabel the committed write as
failed and invite a duplicate create. The `reconcilePlanner` decorator requests
native effects after successful mutations; failure is visible while saved data
remains available. Native delivery still follows [ADR-015](ADR-015-native-reminder-delivery.md).

Expected source versions fence stale edits/deletes/completion; reminder actions
carry occurrence/generation identity. Delete requires explicit confirmation.
Completing and undoing a task are explicit source-status operations. ACK, Answer
and Acknowledge/Dismiss only change alert outcome; snooze changes the job's next
`runAt`, not task due time or event start/end. Native shell snooze remains ten
minutes; detail actions use the saved snooze preference. Existing handled
occurrences are not silently replayed by undoing completion or a metadata edit.

## Form, time and navigation behavior

- Distinguish undated/date-only tasks from timed items. Untimed tasks have no
  inferred midnight alarm. Events have explicit start/end and optional bounded
  weekly recurrence. Editing/deleting a recurring source affects its entire series;
  individual exceptions are not offered. Past schedule/reminder times require an
  explicit confirmation before saving.
- Native `CapstoneDateTimePicker` returns date/time **components**, never an epoch
  instant in the device's implicit timezone. Strict TypeScript/native validation,
  cancel/dismiss-once handling and a concurrent-dialog guard protect this bridge.
  Existing domain conversion owns timezone/DST gaps/folds and recurrence. Text
  fields remain usable on picker failure; no dependency or permission is added.
- The 12h/24h choice is explicitly labelled “this view”; it changes display/picker
  presentation and is not persisted. Typed time entry remains 24-hour HH:mm.
  Display timezone comes from current preferences; source detail also names its
  own timezone. UTC scheduling instants remain unchanged by display choices.
- Forms track a dirty draft, in-flight save/picker and committed values. Android
  Back, bottom-tab navigation and Cancel ask before discarding changed entries.
  Confirmation modals keep the destination explicit. Save failure retains inputs;
  failed latest reads hide stale detail mutation controls and expose retry.
- Android `adjustResize`, a scrolling form and the keyboard-aware container keep
  controls reachable; physical keyboard/large-font/TalkBack behavior still needs
  review. No claim is made from source structure alone.
- On foreground return, refresh list state, permissions and selected detail via a
  refresh signal. This reflects native ACK/snooze/timeout without polling. Invalid
  device/local-date boundaries use a bounded display-only date and visible warning;
  the fallback never changes saved deadlines, timezone or authoritative validation.

## Consequences and evidence

Manual scheduling is usable without AI, speech or internet. Delivery can remain
blocked/inexact and must be described honestly. Product pages are finite; agenda
rescan/offset costs and native active-job materialization remain measured capacity
questions. There is no new archival/deletion policy or arbitrary historical-data
purge.

[Code review](../audits/phase-04-code-review.md) records the date-boundary,
foreground-detail and failed-action-message fixes. Component/domain/picker
regressions and fresh build/emulator results are recorded in
[the Phase 04 report](../reports/phase-04-report.md), rather than inferred here.
The [manual guide](../../qa/PHASE-04-MANUAL.md) covers offline creation, actual
delivery/snooze/resume, independent completion, lifecycle, denied permissions,
accessibility and the unrun physical performance matrix. Full Phases 01–08
acceptance and Phase 05 remain unapproved by this decision.
