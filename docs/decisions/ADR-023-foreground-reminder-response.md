# ADR-023 — Confirmed foreground reminder responses

**Date:** 2026-10-27 (Asia/Manila)  
**Status:** Implemented for Phase 08; physical acceptance and release gate pending  
**Scope:** F-006–F-014; offline integration only

## Context

The reviewed native reminder already delivered eligible simulated-call UI and
notification fallbacks. Its Answer control previously acknowledged immediately
and then offered transient dictation that could not affect scheduling. Phase 08
requires Answer → optional offline TTS → deliberately initiated response →
validated, explicitly confirmed ACK/snooze → durable reconciliation/close.
ACK must remain independent of task completion. App cold start and unavailable
React Native/voice services must not remove the native manual fallback.

## Decision

Keep the loop in the existing native `:reminders` activity and store. It does
not bootstrap React Native, a model or a network client to interpret the two
supported actions. `ReminderResponsePolicy` accepts a bounded, exact English
grammar for this visible reminder only; it does not duplicate Chat's generic
scheduling parser. Unsupported/ambiguous input has no side effects.

`Answer` now opens a foreground response session without writing ACK. Optional
system TTS starts after Answer according to the saved offline voice preference.
The existing `AnsweredDictationPanel` stops TTS before a deliberate hold,
retains explicit recognized-text → draft transfer and exposes **Review
response**. The activity's direct **Acknowledge / Dismiss** and **Snooze 10
minutes** controls use the same review dialog. **Confirm** consumes one exact
pending review; Keep editing, draft edits, new capture, pause, replacement and
expiry retire that review. Notification ACK/snooze actions remain deliberate
direct native receiver actions with their existing identity/state checks.

The response session is memory-only. It uses the original persisted ringing
deadline, a bounded monotonic duration and wall-clock checks; Answer does not
extend the original 60-second window. A retired or expired session cannot be
revived by a clock rollback. Activity presentation tickets fence asynchronous
results; speech epochs fence delayed TTS initialization; recognition session IDs
and visibility fence late transcripts. Pause/new intent releases speech/capture,
discards unsaved drafts/reviews and requires rereading the durable record on
resume. No lifecycle/permission callback automatically starts the microphone.

Reminder OPEN intents use `NEW_TASK | CLEAR_TOP | SINGLE_TOP`, with a distinct
`${applicationId}.reminders` task affinity. The emulator expansion
found that opening Chat above an existing reminder, then reopening its task,
could leave Chat on top. The dedicated reminder task keeps the main planner and
its unsaved manual draft alive instead of clearing it from the reminder stack.
The flags return to the actual reminder and deliver the new intent through its
existing `onNewIntent` lifecycle fence. A same-alert
reopen retains the original bounded deadline and requires a new Answer/review.
This follows the [Android intent/back-stack contract](https://developer.android.com/guide/components/activities/tasks-and-back-stack).
The expanded paused-review UI case is the regression check; source flags alone
do not establish successful reopening.

The existing `ReminderStore.action` transaction independently compares the
reviewed source version and ringing deadline through optional
`expectedSourceVersion` / `expectedRingingDeadline` parameters, in addition to
identity/generation, source validity and legal ringing state. This catches a
title/source edit that retained the alarm identity. ACK changes paired delivery
states, never task completion. Snooze increments generation and updates the
paired reminder/job atomically. No new persistent ANSWERED state or migration is
introduced; schema remains 3.

Commit and OS reconciliation are separate outcomes. After a successful store
action, cancel the old identity and reconcile the scheduler. A reconciliation
failure must say that the action **was saved** but Android delivery could not be
verified, with Calendar/Profile recovery guidance. It must not falsely invite a
retry by claiming the already committed action was unsaved. An uncertain store
result instructs the user to inspect Calendar before retrying.

## Ownership and state contract

| View/session state | Owner | Durable effect / release rule |
|---|---|---|
| Ringing controls | ReminderActivity + original store snapshot | No action before review/Confirm; original deadline applies |
| Answered response | Activity + ReminderResponseSession | Memory-only; optional offline TTS; Answer writes no ACK |
| Holding/transcribing | AnsweredDictationPanel + existing SpeechInput lease | Visible deliberate hold only; text result has no scheduling effect |
| Review pending | Exact review object + presentation ticket | Immutable selected command; edits/cancel/lifecycle retire it |
| Confirm submitted | Session consumes review once; native worker owns transaction | Store rechecks current source/version/deadline and legal paired state |
| Committed/reconciling | Native store/runtime | Old alarm cancellation + scheduler reconciliation; saved outcome survives presentation loss |
| Expired/hidden/replaced | Activity/session lifecycle | Stop/release TTS and capture; retire drafts/reviews; reread durable state on resume |

After Confirm has been submitted, hiding the activity does not undo the durable
operation; on return, inspect the reloaded record. No unbounded polling, speech
daemon or continuous microphone is added. A deadline callback is bounded by the
original window; existing OS receivers remain responsible for durable recovery.

## Consequences and verification limits

The first actual emulator review-dialog attempt exposed `BadTokenException`:
the previous `ContextThemeWrapper(createConfigurationContext(config), ...)`
lost the Activity window token. The corrected wrapper is based on
`this@ReminderActivity`, with `applyOverrideConfiguration(config)` applied once
before resource/asset access, preserving the Activity context and selected
theme. That ordering follows the
[Android ContextThemeWrapper contract](https://developer.android.com/reference/android/view/ContextThemeWrapper#applyOverrideConfiguration(android.content.res.Configuration)).
The [initial failing log](../reports/evidence/phase-08-dialog-crash-initial.log)
is retained. The correction requires a rebuilt candidate and actual dialog
rerun; its source change alone is not a green UI result. Final execution
outcomes belong in the phase report, with the physical gate still pending.

The response grammar is narrower than Chat: printable ASCII English, at most
2,000 characters, exact ACK forms or snooze 1–120 minutes; bare snooze means 10
minutes. No completion, arbitrary rescheduling, bulk mutation or inferred intent
is allowed here. Manual activity controls remain available when TTS/STT,
microphone permission or engine initialization fails. Unknown language/input
requires correction or a manual control, not speculative interpretation.

Schema, dependencies, STT model and Android permission policy are unchanged.
There is no new account/backend/Gemini/RAG/Kokoro integration or legacy copy.
Candidate 0.8.0/code11 is a local capstone upgrade; cross-lineage compatibility is
not implied by matching package names.

Automated policy/session/store/lifecycle checks and builds must be reported with
actual evidence in the [phase report](../reports/phase-08-report.md). The
[manual matrix](../../qa/PHASE-08-MANUAL.md) and
[measurement protocol](../benchmarks/phase-08-device-protocol.md) retain physical
ARM64/minimum API/low-memory, actual audibility, live speech, OEM/Doze/reboot,
accessibility and matched performance/battery measurements as HUMAN REQUIRED.
This architecture removes unnecessary initialization from the two-action
response path by construction; it makes no measured speed, RAM or battery claim.
No stable offline release or Phase 09 approval follows from implementation alone.
