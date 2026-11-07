# Inventory disposition and phase coverage

Every final SUMMARY must account for these 30 rows. Do not call an area fully implemented when only its setup/tool or one provider is present. Port only the mechanism relevant to AGY. File paths are donor-relative unless explicitly called target; record actual pinned hashes when selecting source.

| # | Area and observed AGY foundation | Authorized implementation/disposition | Phase | Donor navigation anchors |
|---|---|---|---|---|
| 1 | Database recovery; existing wrapper/transactions | Adapt honest unavailable/quarantine states, safe transaction handles and additive atomic migrations | 01 | `src/storage/database.ts`, `dbInit.ts`; storage dbResilience/transactionSafety tests |
| 2 | Native alarms already exist | Adapt durable SQLite jobs/native coordinator with AGY account/sync/call APIs | 03 | `deliverySchema.ts`, `deliveryStore.ts`; native `LafinaDelivery{Store,Runtime,Provider}.kt` |
| 3 | Hash-based identities | Add full identities, occurrence/generation fencing, stale/duplicate/collision tests | 03 | native `LafinaDeliveryIdentity.kt`; `deliveryActionFences.test.ts` |
| 4 | Direct assistant writes | Add private reviewed operations, owner/revision/expiry, atomic confirm and receipts beneath AGY intents | 04 | `src/ai/nlu/commandSession.ts`, `commandSchema.ts`, `useCommandReview.ts`, `CommandReviewPanel.tsx` |
| 5 | Broad CRUD parser already exists | Preserve every AGY intent; add untimed tasks, exact target/source links and safer reviewed changes | 04 | `commandSession.ts`, `linkedReminders.ts`, `UndatedTasks.tsx`; reviewedPlannerMutations tests |
| 6 | Voice commands execute after STT | Editable drafts/Prepare/Confirm, Keep/Replace, safe handoff/back/navigation | 05 | `useDraftProtection.ts`, `VoiceModal.tsx`, `ChatScreen.tsx`, `voicePipeline.ts` |
| 7 | Process-local mic holder | OS ownership/lifetime fencing for AGY Whisper AND meetings; optional recognizer integrates later | 05 | native `LafinaMicrophoneLease.kt`, `MicrophoneLeaseProbe.kt`; speechCaptureWatchdog tests |
| 8 | Shared default Chat session | Owner-bound Chat/messages/attachments/clear with legacy quarantine and guest link | 02 | `src/storage/chatStore.ts`, `chatFiles.ts`; chatIsolation tests |
| 9 | Full Chat reads | Newest-page/load-earlier stable ordering and owner/session-bound cursors | 02 | `chatStore.ts`; chatStore tests |
| 10 | query_schedule already exists | Factual bounded SQLite replies plus safe draft-filling guide; preserve online/docs/RAG routing | 06 | `plannerConversation.ts`, `plannerQueries.ts`, `CommandGuide.tsx` |
| 11 | Full Calendar collection reads | Window/backlog/recurrence bounds, paged undated tasks, full export in batches | 06 | `plannerQueries.ts`, Calendar hooks, UndatedTasks; calendarWindowReads tests |
| 12 | Transactional rich Notes CRUD | Revision/owner-safe edits/soft deletes with retained drafts; keep meeting-generated Notes | 07 | `notesEditStore.ts`, Notes hooks/editor; notesEditConflicts tests |
| 13 | Full Notes read/UI search | Derived normalized search cache, literal escaping, keyset pages and global reorder safety | 07 | `notesQueryStore.ts`, `notesSearchSchema.ts`; notesPaging/notesQueryStore tests |
| 14 | Basic floating event timing | Overnight/timezone/ICS metadata, with legacy semantics and existing wire compatibility | 08 | `eventTime.ts`, `eventTimeSchema.ts`, `icsHelper.ts`, Calendar helpers |
| 15 | Permission UI already exists | Delivery evidence/recovery distinct from permission state; preserve profile/pro UI | 09 | `reminderHealthStore.ts`, `scheduler/reminderHealth.ts`, profile/ReminderHealth.tsx |
| 16 | General preferences already exist | Explicit local event defaults/review/Apply/Forget/expiry; don't overwrite existing account preferences | 09 | `personalMemoryStore.ts`, profile/PersonalMemory.tsx; personalMemory tests |
| 17 | Whisper + system TTS already exist | Preserve defaults/cloud fallback; optional Android on-device English STT without download or silent switch | 10 | `ai/native/androidSpeech.ts`, native AndroidSpeech/OfflineSpeech, `speechEngineStore.ts` |
| 18 | Basic system TTS | Per-owner eligible voices/rate/pitch/Preview/Stop adapted to wrapper API and entitlement behavior | 10 | `speechEngineStore.ts`, profile/SpeechEngines.tsx; speechCustomization tests |
| 19 | Capture lifecycle already exists | Bounded readiness, installed-English capability, cancel/late callback and typing recovery | 10 | androidSpeech/speechCapture; speechReadiness/speechRecovery tests |
| 20 | Content-derived voice totals | Actual SQL totals/unavailable; replace unsupported voice count with documented outcome metric | 09 | `profileStatisticsStore.ts`, ProfileStats; profileStatistics tests |
| 21 | qaData variant exists | Standalone scoped QA packaging/intended ABIs while preserving original app/release identity | 11 | donor build.gradle mechanics, inspect-apk.py/artifact receipts |
| 22 | ONNX 1.19.2 | ELF/ZIP audit; bounded evidence-based 1.22.0 evaluation only if compatible; no Kokoro | 11 | `audit_apk_alignment.py`, its tests, ONNX artifact receipts |
| 23 | AST checker already exists | Combine forbidden-module policy with scoped offline/transitive/dynamic network checks; preserve online composition | 00 baseline, 12 | `check-architecture.cjs`, evaluation/architecture tests |
| 24 | Planner benchmark exists | Frozen relevant fixtures, fingerprints, fresh non-overwrite evidence and target benchmarks | 12 | evaluation/, evaluationEvidence.ts, run-evaluation.cjs and tests |
| 25 | QA variant exists; donor diagnostics absent | Owned temporary SQL checks and bounded redacted native diagnostics in QA only | 12 | `qaSqlChecks.ts`, profile/QaDiagnostics.tsx, speechDiagnostics.ts |
| 26 | Donor emulator runner absent | Gated emulator/APK/offline scenarios, all preserved tabs/routes, scoped fixture cleanup | 12 | emulator_qa.py, its tests, docs/emulator-qa.md |
| 27 | Donor real-STT scorer absent | Scorer/collector with approved public/synthetic fixtures and fresh target inference evidence when available | 12 | evaluate-stt.cjs, stt-metrics.cjs, Whisper instrumentation |
| 28 | Simple doctor exists | Actual configured version checks, bounded read-only subprocesses and truthful nonzero failure status | 12 | doctor.mjs, scripts/tests/doctor.test.mjs |
| 29 | Existing mobile sync; backend outside target | Implement client omission/preservation tests and compatible metadata handling only; backend edits/deployment DEFERRED_EXTERNAL | 08, 13 | donor event-time backend isolated tests as contract reference only |
| 30 | Existing backend host/client | Preserve integration; document build-identity/probe proposal, backend access/deployment DEFERRED_EXTERNAL; no live probe required | 13 | check_backend_health.py and backend verification docs as reference only |

## Out of this port

Do not bulk import the donor's newer free-time/ML/risk/recap/semester/undo features, unrelated UI redesign, business/Gmail/Pomodoro/flashcard/study-note modules, donor backend or deployment configuration. Existing AGY documents and meetings are explicitly retained despite earlier prohibition text. A small donor bug fix needed for an assigned improvement is allowed with provenance, tests and a recorded reason.
