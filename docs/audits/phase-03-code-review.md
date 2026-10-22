# Phase 03 independent code review

**Reviewer:** Codex `/root/phase03_review` (independent read-only source review)  
**Date:** 2026-10-23, Asia/Manila  
**Authorization:** Phase 03 only, including verification of the supplied earlier-phase audit.  
**Verdict:** findings reported; final automated, emulator and physical-device evidence pending the phase owner's validation.

**Owner validation addendum:** the three findings below were fixed. The reviewed
tree passed 156 Jest tests, 30 native JVM tests and 23 API 37 instrumentation
tests, including the corresponding regression cases. Native builds passed;
actual alarm/UI emulator evidence and remaining physical-device requirements
are recorded in the [final phase report](../reports/phase-03-report.md).
The pending labels below preserve the review-time evidence boundary.

## Scope and method

Read `AGENTS.md`, `phases/PHASE-03.md`, the actual Kotlin reminder store,
policy, runtime, private provider, bridge, receivers, PendingIntent identity,
notification and Activity implementations; TypeScript storage operations,
bridge decoder, reconciliation wrapper, App and ReminderSettings; and related
Jest, JVM and Android instrumentation test sources. This reviewer made no
implementation changes and did not run Gradle, ADB or device tests. The only
repository change by this reviewer is this review document.

Source inspection checks intended behavior and can identify defects; it is not
proof that an Android platform feature works on a phone. The working tree was
changing during review. Resolution pointers below describe fixes visible or
assigned at handoff; their final test outcomes belong to
[`phase-03-report.md`](../reports/phase-03-report.md).

## Material findings and resolution pointers

1. **P2 — A RINGING row without a deadline could abort reconciliation.**
   `ReminderRuntime.reconcileLocked()` routes a null-deadline ring to
   `ReminderStore.action(MISS)`, but the initially inspected store required a
   deadline before processing every non-cancel action and threw
   `MISSING_RING_DEADLINE`. One malformed row therefore prevented unrelated
   pending work from completing the same reconciliation pass. Reproduction:
   seed a source-valid paired RINGING reminder/job with a null deadline, then
   reconcile. The corrected store branch is visible: only MISS repairs the
   malformed ring, while ACK/SNOOZE cannot invent a successful delivery.
   `ReminderStoreTest` now includes missing-deadline recovery; migration 1→2
   also ends legacy simulated rings. **Final native test run: pending review
   owner evidence.**

2. **P2 — Manual actions did not enforce the native response deadline.**
   Initially, `reminderOperations.apply()` accepted ACK/SNOOZE for any paired
   RINGING state, even after its persisted `ringing_deadline`; the native store
   instead expires that same action to MISSED. Reproduction: simulate RING at
   time T, advance the injected clock to T+60 seconds, then ACK or SNOOZE through
   the repository before a delayed Android timeout is delivered. The corrected
   TypeScript branch now validates the stored deadline and commits MISSED when
   expired. `plannerRepository.test.ts` includes late-action and missing-deadline
   cases. **Final Jest run: pending review owner evidence.**

3. **P2 — JavaScript-valid timezone casing could cancel a valid reminder.**
   `isTimezone()`/`assertTimezone()` accept IANA identifiers through Intl without
   changing their stored casing. Native code initially passed the raw identifier
   directly to case-sensitive `ZoneId.of()`. A valid input such as
   `asia/manila` could therefore pass the JS write but fail native source
   validation; a lowercased global quiet-hours zone could similarly fail the
   native quiet policy. A read-only Node check confirmed Intl accepts
   `asia/manila`, `utc`, and `America/new_york` and resolves them to canonical
   identifiers. The corrected `ReminderPolicy.zone()` resolver is now visible:
   it resolves casing against the device's available zone IDs, and all reviewed
   store/quiet-policy callers use it. Existing saved preferences need not be
   silently rewritten. Review the corresponding JVM/instrumentation regressions
   in the final tree. **Final native test run: pending review owner evidence.**

## Architecture observations and remaining evidence

- The primary native store refuses the React main process. Native provider,
  receivers and Activity run in `:reminders`; `MainApplication` skips React
  initialization there. Both engines use the same database with DELETE rollback
  journal rather than loading two SQLite implementations against it in one
  process. Native code refuses to create/migrate/reset the primary file.
- Paired reminder/job mutations use a transaction. Native callbacks validate
  source status/deletion, occurrence and generation. ACK does not complete a
  task. Immutable explicit PendingIntents use full encoded identities rather
  than hash-only request codes.
- Delivery and full-screen preferences default off. Full-screen posting also
  checks platform access and channel importance; normal notifications open the
  same shell. No microphone, telephony, foreground service, cloud runtime or
  speech implementation was found in this Phase 03 path.
- The platform registration window and event history are bounded. The active
  native query still materializes all matching rows; the ADR identifies this
  limit and must not be read as a measured low-RAM capacity guarantee.
- `concurrentClaimsHaveOneWinner` tests framework SQLite threads on a synthetic
  database. It does not independently prove OP-SQLite/main versus framework
  SQLite/`:reminders` contention. Validate actual JS creation plus native claim,
  and preferably a near-due edit/cancel with an integrity check, on the emulator;
  retain physical-phone checks as NOT RUN until a human performs them.

No additional material source-level finding was established in the inspected
paths. This statement does not replace final builds, preflight, instrumentation,
emulator delivery tests, or the required physical-device manual checklist.

## Independent integrity follow-up

At 2026-10-22T18:24:17.728Z, this reviewer independently recalculated SHA256 and
byte sizes for all **85** entries in `phase-03-source-hashes.json` and all **seven**
current APKs in `phase-03-artifacts-reviewed.json`: **zero mismatches**. At that
cutoff, 66 local Markdown links across nine Phase 03 documents resolved to
existing files. See [the integrity record](../reports/evidence/phase-03-integrity.txt).
These checks verify recorded inputs/artifacts, not native behavior or a causal
performance improvement.

The owner validation addendum above resolves the historical automation-pending
labels. The current architecture/QA documents point to the phase report for
completed automation and keep physical checks NOT RUN. The ADR's "under
validation" status still applies to outstanding device acceptance. Final report
cutoff/pending lifecycle rows were being edited separately by the owner during
this check; an inconclusive reboot is not a PASS. No source changes, builds or
ADB actions were performed for this integrity follow-up.
