# AGY-PORT 03 — durable reminder delivery and identity

Prerequisite: 01. Inventory: 2, 3. Protect PF01–PF04, PF09, PF11–PF13.

## Navigate

Target native reminder module/receivers/service/manifest, reminderAlarm/Poller/Rescheduler/Actions, callDispatcher, IncomingCallScreen, stores/sync worker/guest migration. Donor pinned deliverySchema/store/native Identity/Store/Runtime/Provider and deliveryActionFences/instrumentation. Remap `com.lafina` into AGY, preserving public module names and provider authorities.

## Execute

1. Document reminder/job/registration/receipt state machines and legal idempotent transitions. ACK is receipt of alert, not task completion. Define expiry, auto-snooze/timeout and user preferences based on AGY behavior.
2. Add local delivery jobs, retained registrations and bounded redacted evidence with additive migrations. Pair authoritative reminder changes and relevant outbox state in one transaction, including manual, assistant, sync-pull, guest-rekey and native writers. Avoid trigger echo loops and duplicate enqueues.
3. Add full owner/reminder/occurrence/generation/action Intent URI identities and tagged notifications, with captured-identity fences at broadcast/UI/voice/cleanup boundaries. Hash collisions, duplicate broadcasts and stale buttons cannot affect newer work.
4. Implement native claims/transitions/reconciliation with the agreed database protocol. Bounded busy retries, registration-failure recovery and future-schema refusal must be safe. A successful queue/registration result is distinct from evidence of ringing.
5. Build a single-scheduler cutover: backfill jobs/identities, idempotently retire legacy SharedPreferences/PendingIntent registrations, reconcile after reboot/time/timezone changes, then use one active engine. Never leave a competing JS poller dispatching the same due work.
6. Preserve existing call UI, entitled cloud speech/local fallback, notification/exact/full-screen permission flows and ownership. On account change/logout retire old active UI/speech/registrations according to AGY's active-account behavior, preserve owned jobs for safe return and prevent cross-account callbacks. Guest linking rekeys metadata atomically.
7. Test real synthetic SQLite/native claims, rollback/reopen/schema ranges, collision IDs, concurrent due reminders, snooze/edit/delete, duplicate/stale actions, sync-driven changes, owner switch and main-process absence. Run native unit/instrumentation/build checks when available; don't fabricate a phone pass.

## Acceptance

Delivery work survives recoverable registration errors; a single authoritative engine registers/dispatches; obsolete actions are inert; reminder/job/outbox consistency holds across writers. Existing simulated calls and speech/entitlements stay operational. Physical reboot/Doze/locked-screen/manufacturer reliability stays NOT_RUN unless actually observed on an authorized test device.

Deliver `reports/phase-03-delivery.md`, delivery ADR/state diagrams/schema notes, native evidence and a concrete later phone checklist. If cutover cannot be verified, keep the known engine active and new incomplete work inactive/deferred; do not ship two engines or no reminders.
