# AGY-PORT 08 — overnight/timezone metadata with compatible sync

Prerequisites: 01, 03, 06. Inventory: 14 and client-contract part of 29. Protect PF03–PF06, PF10–PF12. Backend source/deployment remain out of scope.

## Navigate

Target tasks/events stores/schema, calendar spans/forms/layout, recurrence, linked reminders, ICS, all event sync push/pull/guest-link writers. Donor eventTime/eventTimeSchema/ICS/calendar tests and backend isolated event contract tests as read-only design reference.

## Execute

1. Characterize legacy floating events, recurring events, same-day end ordering, overnight spans and destination wire payloads. Define additive local end-date/zone/instant/ambiguity metadata and validation without changing old rows' meaning.
2. Migrate synthetic legacy fixtures and adapt creation/edit/review/Calendar queries/layout/recurrence/linked alarms/ICS together. Test overnight/month-boundary spans, invalid dates/local gaps, repeated times, timezone changes, yesterday interpretation and round-trip export/import. No invented time correction.
3. Freeze current seven-type cloud request schemas. Do not append new fields merely because the donor backend accepts them. Preserve existing live client contract and endpoints. Keep new fields local-only when server capability is unverified, with a clear cross-device limitation.
4. Make sync pull omission-aware for local extended metadata: omission is not an explicit clear. When changed base timing invalidates local metadata, recompute safely or surface repair; do not retain a false UTC instant. Explicit-null semantics require evidenced support. Cover account switch, guest linking, source revision/job regeneration and remote delete.
5. Add fake old-server round-trip tests proving existing event sync still succeeds unchanged, other six entity payloads are unaffected and metadata is not silently lost/incorrectly advertised as synced. Do not deploy or edit a backend to make these tests pass.
6. If extended timing cannot coexist safely with current remote edits, preserve existing floating behavior for that affected feature, report the minimal extended case deferred, and continue unrelated improvements. Never disable sync globally or silently strip existing AGY event capabilities.

## Acceptance

Existing sync requests remain compatible; legacy events keep their meaning; locally supported overnight/timezone metadata is validated consistently. Report exactly which metadata is local-only. Backend changes for #29 and any new cross-device guarantee remain DEFERRED_EXTERNAL, not implemented by a mobile-only test.

Deliver `reports/phase-08-event-time-sync.md`, timing/sync-compatibility ADR and fixtures, with manual cross-midnight/timezone/ICS and later controlled-server checklist.
