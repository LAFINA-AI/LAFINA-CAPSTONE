# AGY-PORT 04 — reviewed mutations without losing AGY commands

Prerequisites: 01, 03. Inventory: 4, 5. Protect PF03–PF07, PF10–PF12.

## Navigate

Target `ValidatedIntent`, parser/intentService/actionExecutor, Chat orchestrator, manual planner/Notes stores, sync/guest writers and call actions. Donor commandSession/commandSchema/linkedReminders/useCommandReview/CommandReviewPanel and reviewed mutation tests. Do not import its incompatible public NluResult schema or replace AGY native inference.

## Execute

1. Create an exhaustive target-intent routing table and tests for every ParsedIntentType, deterministic and local-model paths, exact existing document/online/RAG routes. Add regression tests for no pre-confirm writes, repeated confirm and ambiguous destructive selection.
2. Add private expiring proposed operations with exact owner/IDs/revisions, resolved dates/times/zone, source links, recurrence/lead/default warnings and operation ID. Preserve rich Notes payloads and supported CRUD. Unsupported ambiguous commands produce in-product clarification rather than guessed matches or a coding-agent question.
3. Introduce local entity revisions covering all writers and minimal operation receipts. Confirm rechecks owner/session/revision/expiry, then atomically writes the item, linked reminder/job, outbox and receipt. A native registration failure leaves durable recoverable delivery status. Reconfirm returns the same receipt; rollback can safely retry.
4. Support absent/date-only deadlines explicitly. Do not turn missing date/time into today/09:00 silently; any applied default is visible in the review. Exact source IDs replace title-based reminder cleanup. Retain manual forms and their supported fields/recurrence.
5. Keep contextual ringing-call Answer/ACK/snooze immediate and bound to the captured identity. Chat/voice-destructive proposals require review. Do not force an unrelated review in front of valid document generation, meeting processing, normal manual saves or read-only queries.
6. Add review UI within existing AGY Chat/Voice and theme. Product confirmation remains explicit even though the coding run is unattended. Never auto-confirm on unmount, background, timeout or double tap.
7. Validate full intent coverage, account switch/guest linking/sync revision changes, double confirm, expiry, rollback, create/move/delete/complete/undated cases and call ACK≠completion. Run protected online/doc/RAG suites and complete gates.

## Acceptance

Every existing AGY command retains an authorized route. Prepare/Cancel produce no mutation; Confirm commits once; stale/ambiguous destructive targets are refused. Online/document/RAG/meeting workflows remain reachable. No raw model output becomes a side-effectful command.

Deliver `reports/phase-04-reviews.md`, intent coverage map, revision/receipt ADR and manual reviewed-command checklist.
