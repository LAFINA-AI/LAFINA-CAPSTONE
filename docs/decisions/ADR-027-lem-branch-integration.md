# ADR-027: Integrate the AGY improvements on Lem-branch

Date: 2026-11-07. Status: implemented; combined device validation pending.

The owner requested a separate Lem-branch integrating the audited improvement branch with the latest tested AGY changes. Preserve the friend's source branch, transcription optimization and new ML components. Do not treat the combined app as device-tested.

## Parents and isolation

Start from AGY f76ea9dbc33fceb4d122bc586f2f17fb0712072c, then merge codex/agy-preservation-improvements at f531bfbe691409cd020b8a56f8d79925d249e646. Their common base is b9433dc39d172f30ba26ea68e4a9c9eedd922407. Work only on Lem-branch, with no upstream targeting AGY, no push, no deployment and no app installation. Existing branches retain their commits.

## Decisions

1. Preserve AGY's optimized Whisper C++ code exactly. Retain Kotlin warmup, memory-pressure unloading, worker tuning and shorter silence detection alongside our token-fenced microphone lease and deferred promise settlement. The reported 2-3 second transcription result is owner-reported, not independently benchmarked on the combined branch.
2. Preserve the KNN, Random Forest and EWMA algorithm bodies. ML timing must also run in the reviewed Chat/Voice flow, not only the legacy direct executor. Compute a recommendation during Prepare, disclose a changed trigger, preserve the requested task due time, and freeze the proposed trigger until Confirm. Do not recompute a different time after approval. Cold-start, preference opt-out and failure retain baseline timing.
3. Record reviewed ACK/snooze feedback after commit, once per applied operation. Cancellation, rejected ownership and double Confirm cannot create extra learning events. Keep the call-action feedback path intact.
4. Carry the new recurring-reminder intent through cleaning, review and storage. Share next-occurrence creation between call ACK and reviewed ACK. The reviewed path creates the next reminder in the ACK transaction, retains its exact source link and registers its alarm after commit. ACK never completes the task. Disclose continuation of a recurring schedule on the review card.
5. Keep AGY's immediate first-page initialization and lazy modal rendering, using bounded/revision-aware Chat and Notes APIs and aggregate Profile counts. Calendar loads a bounded window before paint. Remove stale skip-first-load guards that conflict with account changes, query/filter changes, read-error recovery and first mount. Keep the original My quiz title contract while retaining AGY's new recurrence, natural snooze and week-query parsing.
6. Use bounded recurring planner queries for the new week summaries, with explicit storage failure rather than a false empty week.
7. Clear All Data also clears the admitted owner's behavior logs and ML snapshots in the planner transaction, with verification and rollback. These are personal learned data, not retained device preferences. Another owner's learning and existing device choices remain intact.
8. Resolve same-millisecond ML snapshot ties by SQLite insertion order (rowid), after the existing timestamp ordering. Random generated IDs must not select an older EWMA value. A deterministic regression first reproduced this defect.

## Scope and evidence

The forest definitions are fixed trees in code; the commit does not establish model training provenance or predictive accuracy. KNN's channel recommendation remains advisory; this integration does not invent automatic notification-channel routing. EWMA and historical KNN features remain local and owner-scoped.

Preserve accounts/subscriptions, cloud sync, online AI/Handbook RAG, documents, meeting recording, Whisper/native TTS defaults and no Kokoro. Backend contracts and frozen evaluation fixtures remain unchanged. Existing partial areas and real-device/live-service checks remain pending.

See docs/plans/lem-integration/REPORT.md and its evidence directory for the actual commands/results, conflict decisions and build receipts. The existing TypeScript AST architecture/offline checker is the graph substitute: this checkout has no Graphify graph. Do not claim Graphify ran or claim a speedup without a comparable device benchmark.
