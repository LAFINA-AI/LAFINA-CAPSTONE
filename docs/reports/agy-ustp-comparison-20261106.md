# agy-development-cont versus latest local LAFINA — merge assessment

Date: 2026-11-06 (Asia/Manila). Status: READY FOR REVIEW — analysis only.

## Result and execution checklist

The requested branch has been cloned to `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`. Keep this branch as the destination and selectively adapt the donor improvements. A wholesale merge or directory replacement would introduce unrelated and forbidden modules and overwrite destination-specific NLU, speech, UI, Android package, and online behavior.

- [x] Clone the requested remote branch into a separate, previously absent directory.
- [x] Record actual source/destination commits, branches, and dirty states.
- [x] Read both repositories' standing instructions and the linked improvement inventory.
- [x] Compare tracked application/test/tooling text; inspect critical storage, command, speech, and reminder paths.
- [x] Map all 30 numbered improvement areas to destination gaps and adaptation work.
- [x] Identify newer donor changes outside the inventory's implementation baseline.
- [x] Run limited read-only setup and architecture checks; preserve logs and exact checker invocations.
- [ ] Resolve conflicting scope instructions before implementation.
- [ ] Approve and execute a single migration batch, with its automated and device gates.

No application code, dependencies, Android configuration, or existing reports were changed. No merge, cherry-pick, commit, push, deployment, device installation, database access, or model copying was performed. The original LAFINA checkout remained read-only. Reports/evidence added in this clone are untracked until explicitly committed.

## Reproducible inputs

| Input | Observed state |
| --- | --- |
| Destination remote | `https://github.com/LAFINA-AI/LAFINA-CAPSTONE.git` |
| Destination branch | `agy-development-cont` |
| Destination HEAD | `b9433dc39d172f30ba26ea68e4a9c9eedd922407` — `feat: phase 10 synchronization fix` |
| Destination initial state | Clean, tracking `origin/agy-development-cont` |
| Donor path | `C:\L3mxr\Github Repositories\LAFINA\LAFINA` |
| Donor branch | `feat/capstone-remaining` |
| Donor HEAD | `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480` — `wip: save work before capstone run` |
| Donor uncommitted work | Modified `docs/capstone-improvements-in-ustp.md`; untracked `docs/plans/capstone-remaining/` |
| Public inventory | [LAFINA-USTP inventory](https://github.com/LAFINA-AI/LAFINA/blob/LAFINA-USTP/docs/capstone-improvements-in-ustp.md), fetched through the GitHub connector, blob `fab2132795b52b634568eff2f019d77111b3753e` |
| Inventory implementation baseline | `ea6358e`; inventory baseline `4a08ffe`; 30 numbered areas, of which 29–30 are deferred backend work |
| Original working capstone | `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE`, branch `phase-08-offline-reminder-response` at `a53ea93f76021db1f0589e0e18fe68421815c0e8`, already dirty; not used as the migration donor |

The local inventory includes an extra remaining-features/Phase 0 section beyond the fetched public inventory. Its claimed Phase 0 report links were not present in the observed untracked plan directory; do not treat those claims as independently verified execution evidence. The public and local documents are inventories, not proof that phone acceptance passed.

The standing historical legacy pin `f7e70aec54e6d16e627f444f2a67114cbfb07b5e` was not available in either checked repository's object database. This comparison uses the latest local checkout explicitly requested by the owner, with its HEAD and inventory hash frozen in the evidence. No component has been copied from an alternative revision; implementation provenance must be approved before porting.

## What the file comparison measures

[comparison.json](evidence/agy-ustp-comparison-20261106/comparison.json) records the inputs and counts. [files.csv](evidence/agy-ustp-comparison-20261106/files.csv) records each path, normalized SHA-256, and added/removed line counts for shared changed files.

Scope: Git-tracked files under `src/`, `__tests__/`, and `scripts/` with `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, or `.py` extensions; compare working-tree content after BOM removal and CRLF normalization. These are same-path comparisons, not semantic equivalence or predicted Git conflicts. Native files, Gradle, package configuration, docs, and fixtures are reviewed separately; they are excluded from these totals.

| Measure | Count |
| --- | ---: |
| Destination files | 198 |
| Donor files | 475 |
| Shared paths with identical normalized contents | 20 |
| Shared paths with different contents | 151 |
| Destination-only paths | 27 |
| Donor-only paths | 304 |
| Destination tracked Jest test-suite files | 15 |
| Donor tracked Jest test-suite files | 161 |

Test-suite file counts are not executed test results. Donor-only files include business, Gmail, study tools, and other unrelated functionality; 304 does not mean 304 suitable imports.

## Priority findings from inspected code

1. **Database failures can masquerade as successful operations.** Destination `src/storage/database.ts:37–55` enters a no-op fallback after native open failure. `transactionSync:78–91` still runs work and after-commit callbacks there. Rollback failure is only logged at `125–135`. Destination `dbInit.ts:17` declares schema 17, while donor declares schema 24 and performs version refusal and transactional setup. Adapt resilience first; do not copy version numbers or the donor's full initializer.
2. **Recognized commands can mutate without a separate review.** Destination `VoiceModal.tsx:304–322` invokes the command immediately after recognition. `actionExecutor.ts:386–438` writes a task, then a reminder, then attempts platform registration separately; absent task dates default to today. Deletion at `656–717` scores candidate matches and cleans reminders by title. Adopt private expiring reviews, exact owner/revision targeting, operation receipts, and atomic source/reminder/job/outbox saves.
3. **Chat session ownership is unsafe for multiple accounts.** Destination `chatStore.ts:30` uses one `default_chat_session`; `64–69` reads messages by that shared ID without an owner predicate. The donor has owner-bound sessions, cursors, and attachment access tests. Historic mixed ownership needs explicit handling, not guessed reassignment.
4. **Alarm delivery has a different persistence model.** Destination native code uses SharedPreferences for registrations/pending calls and `reminderId.hashCode()` for PendingIntent request codes and notification IDs (`LafinaReminderModule.kt:298–309,396–453`). Donor introduces SQLite delivery jobs, retained platform identities, generation fencing, full URI identities, and a native database coordinator. Port the whole reviewed protocol and tests together; replacing only the scheduler adapter is insufficient.
5. **The microphone lease is only partially equivalent.** Destination `LafinaMicrophoneLease.kt:20–34` is a process-local enum holder and permits acquisition again by the same holder. Donor uses an OS file-lock object with synchronized ownership and instance-fenced release. Port capture cancellation/lifetime handling with the lease, while excluding meeting recording.
6. **Existing system TTS still needs fail-closed offline validation.** Destination `ttsService.ts:39–45` excludes explicitly network-required voices but permits missing eligibility metadata. Initialization `86–101` can succeed when there is no eligible selected voice or enumeration fails. That is a static risk of falling back to an unverified engine default, not a measured network leak. Retain `react-native-tts`, add explicit installed-offline eligibility/selection checks and text fallback; do not restore Kokoro.
7. **Destination Profile infers voice totals from content.** `ProfileScreen.tsx:166–177` loads task/note collections and treats voice flags or the word "voice" in task notes as usage. Donor `profileStatisticsStore.ts` uses aggregate SQL and a reminder-outcome on-time rate, returning unavailable values on failures. The metric definition must remain visible and must not equate acknowledged with task completed.
8. **Current architecture checking misses the stronger offline boundary.** The destination's own checker passed 179 modules and found no cycles or its forbidden imports. Applying the donor's AST offline-boundary analyzer to the same destination found two violations, listed below. Preserve online features only if authorized and move orchestration across a clear boundary; an import finding is not proof of a runtime offline failure.

All line locations refer to the recorded destination HEAD except explicitly named donor paths. Findings are a focused static assessment; this is not an exhaustive security or correctness audit.

## All 30 inventory areas: disposition and work required

Donor paths below are relative to `C:\L3mxr\Github Repositories\LAFINA\LAFINA`. Destination paths are relative to this clone. “Missing” means the inspected implementation/inventory lacks the donor mechanism; it does not mean the destination has no related feature. “Adapt” means selectively reuse behavior and tests, preserving destination interfaces and scope.

| # | Inventory area | Destination assessment | Donor starting points | Proposed disposition / acceptance focus |
| --- | --- | --- | --- | --- |
| 1 | Safer database saves/recovery | Partial transactions; no-op production fallback; schema 17 vs donor 24 | `src/storage/database.ts`, `dbInit.ts`; `__tests__/storage/dbResilience.test.ts`, `transactionSafety.test.ts` | **Adapt first.** Quarantine unsafe connections; reject future schemas; transactional migrations; failures cannot show durable success. |
| 2 | Persistent native delivery | Native AlarmManager exists; donor SQLite coordinator/jobs absent | `src/storage/deliverySchema.ts`, `deliveryStore.ts`; native `LafinaDeliveryStore.kt`, `LafinaDeliveryRuntime.kt`, `LafinaDeliveryProvider.kt`; `durableDeliveryBridge.test.ts` | **Adapt as a unit.** Pair reminder/job/outbox transitions; registration failures remain recoverable; kill-main-process and reboot QA. |
| 3 | Duplicate/stale-alarm protection | Hash request/notification identities; donor occurrence/generation fences absent | Native `LafinaDeliveryIdentity.kt`; `__tests__/scheduler/deliveryActionFences.test.ts`; native delivery instrumentation | **Adapt with #2.** Collision, duplicate broadcast, edited/deleted reminder, and stale button tests. |
| 4 | Assistant review/confirmation | Direct executor writes; no donor review/receipt layer | `src/ai/nlu/commandSession.ts`, `src/storage/commandSchema.ts`, `src/ui/hooks/useCommandReview.ts`, `CommandReviewPanel.tsx` | **Adapt through target intent adapter.** No side effects before Confirm; double Confirm creates one durable operation. |
| 5 | Reviewed commands/untimed tasks | Rich CRUD parser exists, but dates/target selection differ | `commandSession.ts`, `src/storage/linkedReminders.ts`, `src/ui/components/UndatedTasks.tsx`; `reviewedPlannerMutations.test.ts` | **Preserve target command coverage.** Allow truly untimed tasks; refuse ambiguous deletion; source IDs replace title cleanup. |
| 6 | Editable speech drafts | Immediate post-STT execution; donor Keep/Replace/review guards absent | `src/ui/hooks/useDraftProtection.ts`, `VoiceModal.tsx`, `ChatScreen.tsx`, `src/ai/native/voicePipeline.ts`; `draftProtection.test.tsx` | **Adapt after #4.** Recognize → edit → Prepare → Confirm; navigation and handoff preserve unsent text. |
| 7 | Shared microphone ownership | Process-local lease exists, weaker than donor OS lock | Native `LafinaMicrophoneLease.kt`, capture integration; `MicrophoneLeaseProbe.kt`; `speechCaptureWatchdog.test.ts` | **Adapt scoped capture only.** Rejected contender/stale cleanup cannot release another lease; cancellation waits for native return. Exclude meetings. |
| 8 | Account-safe Chat/attachments | Shared default session; owner isolation gap | `src/storage/chatStore.ts`, `src/ui/components/chat/chatFiles.ts`; `chatIsolation.test.ts` | **Adapt existing data protection**, subject to scope decision. Do not introduce auth modules. Handle ambiguous historical ownership explicitly. |
| 9 | Paged Chat/stable ordering | Unbounded `created_at` history read | `src/storage/chatStore.ts`; `chatStore.test.ts` | **Adapt with #8.** Newest 50, stable tie-breaker, owner-bound cursors, load-earlier UI. |
| 10 | Factual planner replies/guide | `query_schedule` exists; donor bounded query/guide infrastructure absent | `src/ai/nlu/plannerConversation.ts`, `src/storage/plannerQueries.ts`, `src/ui/components/CommandGuide.tsx`; `plannerConversation.test.ts` | **Adapt without replacing target orchestrator.** Read actual records; unavailable stays unavailable; guide fills draft only. |
| 11 | Bounded Calendar/undated tasks | `useCalendarData` loads full collections | `src/storage/plannerQueries.ts`, calendar data hook, `UndatedTasks.tsx`; `calendarWindowReads.test.tsx` | **Adapt.** Visible-window reads, recurrence/backlog bounds, paged manual untimed-task access. |
| 12 | Revision-safe Notes | CRUD transactions exist; donor edit snapshots/revision guards absent | `src/storage/notesEditStore.ts`, command revision schema, Notes editor/hook; `notesEditConflicts.test.tsx` | **Adapt after revision schema.** Reject stale save/delete and retain draft on conflict/storage failure. |
| 13 | Paged Notes/search/order | Full collection loaded and normalized in UI | `src/storage/notesQueryStore.ts`, `notesSearchSchema.ts`; `notesPaging.test.tsx`, `notesQueryStore.test.ts` | **Adapt.** Derived rich-body cache, literal wildcard handling, keyset paging; partial lists cannot rewrite global order. |
| 14 | Overnight/timezone-safe events | Legacy date/start/end fields; donor metadata absent | `src/storage/eventTime.ts`, `eventTimeSchema.ts`, `icsHelper.ts`, calendar helpers; `eventTime.test.ts` | **Adapt additive schema and all consumers.** Preserve floating legacy times; cross-midnight/ambiguous/invalid times; keep backend work deferred. |
| 15 | Reminder health/recovery | Permissions APIs/modal exist; persisted delivery-health UI absent | `src/storage/reminderHealthStore.ts`, `src/scheduler/reminderHealth.ts`, `src/ui/components/profile/ReminderHealth.tsx` | **Adapt after #2.** Separate permission state, queued work, blocked delivery, and evidence of ringing. |
| 16 | Explicit scheduling preferences | General preferences exist; reviewed opt-in memory absent | `src/storage/personalMemoryStore.ts`, `src/ui/components/profile/PersonalMemory.tsx`; `personalMemory.test.ts` | **Adapt selectively.** Explicit Apply/Forget/disable, expiry and revision guards; no inferred preferences or existing-event edits. |
| 17 | Optional Android speech engines | Whisper default and system TTS already exist; donor Android recognizer option absent | `src/ai/native/androidSpeech.ts`, native `LafinaAndroidSpeechModule.kt`, `LafinaOfflineSpeech.kt`, `speechEngineStore.ts` | **Adapt only compatible pieces.** Keep target system TTS and Whisper; no Kokoro/default-engine replacement; Android 11 uses supported fallback. |
| 18 | Voice/rate/pitch/Preview/Stop | No donor per-owner speech-customization layer | `speechEngineStore.ts`, `src/ui/components/profile/SpeechEngines.tsx`, native offline speech; `speechCustomization.test.ts` | **Adapt for system TTS.** Persist eligible choices; validate settings and owned Preview/Stop; measure actual sound on phone. |
| 19 | Speech readiness/recovery | Capture lifecycle code exists; donor readiness probes/recovery UI differ | `androidSpeech.ts`, `speechCapture.ts`, `SpeechEngines.tsx`; `speechReadiness.test.ts`, `speechRecovery.test.tsx` | **Adapt.** Bounded init/probes, installed-English readiness, late-result cancellation, typing always available. |
| 20 | Truthful statistics | Voice usage inferred from note flags/task text | `src/storage/profileStatisticsStore.ts`, `ProfileStats.tsx`; `profileStatistics.test.ts` | **Adapt.** Aggregate recorded data; unavailable/No data states; document on-time-rate denominator. |
| 21 | Standalone QA APKs | `qaData` build exists but is debuggable; donor ABI QA split differs | `android/app/build.gradle`, `scripts/inspect-apk.py`, artifact receipts | **Adapt build mechanics only.** Keep `com.lafina.capstone` IDs/version/signing policy; bundle JS, scope assets; test in-place update separately. |
| 22 | Native ELF audit/ONNX correction | ONNX 1.19.2 vs donor 1.22.0 | `scripts/audit_apk_alignment.py`, `scripts/tests/test_apk_alignment.py`, ONNX receipts | **Port audit first.** Decide upgrade separately; verify target VAD/native graph and both ABIs. No Kokoro smoke requirement or source-binary copying. |
| 23 | Offline architecture/dependencies | Own AST checker passes, stronger boundary checker flags 2 paths | `scripts/check-architecture.cjs`; `__tests__/evaluation/architecture.test.ts` | **Combine policies.** Keep destination forbidden-module guard and add transitive/dynamic/network checks after scoping online orchestrators. |
| 24 | Frozen regression/benchmarks | Planner benchmark exists; frozen multi-domain evidence tooling absent | `evaluation/`, `scripts/evaluationEvidence.ts`, `run-evaluation.cjs`, evaluation tests | **Select relevant fixtures.** Preserve fingerprints and non-overwrite reports; separate contract checks from inference accuracy. Rebenchmark target. |
| 25 | Isolated in-app QA/diagnostics | Donor SQL fixture screen/native diagnostics absent | `src/storage/qaSqlChecks.ts`, `src/ui/components/profile/QaDiagnostics.tsx`, `speechDiagnostics.ts`; `qaSqlChecks.test.ts` | **Adapt gated to QA builds.** Own temporary DBs and cleanup; no student DB experiments/audio/transcript collection. |
| 26 | Offline emulator scenarios | Donor gated runner absent | `scripts/emulator_qa.py`, `scripts/tests/test_emulator_qa.py`, `docs/emulator-qa.md` | **Adapt after UI stabilizes.** Update package/UI IDs; explicit emulator/APK/offline gates; scoped cleanup; no clear-data commands. |
| 27 | Real STT collection/scoring | Donor collection/scoring tooling absent | `scripts/evaluate-stt.cjs`, `stt-metrics.cjs`, Whisper fixture instrumentation, `docs/stt-evaluation.md` | **Adapt scorer and collector.** Use approved synthetic/public/consented target fixtures; no Kokoro bundling. Donor 11.11% synthetic emulator WER is not target/phone evidence. |
| 28 | Development doctor | Existing simple checker hardcodes expected tool versions | `scripts/doctor.mjs`, `scripts/tests/doctor.test.mjs` | **Adapt to destination requirements.** Derive actual configured versions, bounded subprocesses, meaningful failure exits; no secret/env-file inspection. |
| 29 | Backend event metadata sync | No backend source in clone; mobile sync exists | Donor `backend/tests/test_event_time_contract_isolated.py` and event payload normalization | **DEFER.** Separate backend project/access and approval required; keep omission-vs-null contract in #14 design. |
| 30 | Backend build identity/probe | Destination already points at a different backend integration | Donor backend identity route, `scripts/check_backend_health.py`, deployment verification docs | **DEFER.** No deployment, host replacement, endpoint probing, or assumption source and target backend contracts match. |

## Newer local changes beyond the inventory baseline

[donor-since-inventory.txt](evidence/agy-ustp-comparison-20261106/donor-since-inventory.txt) records `git log ea6358e..HEAD` and the scoped `git diff --stat`. The scoped delta is **116 files changed, 7,084 insertions, 243 deletions**. This includes a WIP commit, not thirty newly approved migration units.

| Additional observed work | Representative donor paths | Assessment |
| --- | --- | --- |
| Free-time proposals/conflict feedback | `src/ai/nlu/findTime.ts`, `src/scheduler/availability.ts`, `src/utils/freeSlots.ts`, `conflicts.ts`, `FreeTimeChoicesPanel.tsx` | Potential follow-up; adapt into the target's richer intents/review flow. |
| Undo and recurring task actions | `src/scheduler/undo.ts`, `taskActions.ts`, `recurringReminders.ts`, `UndoSnackbar.tsx`, `OverdueActionsSheet.tsx` | Separate behavior changes; destructive actions, recurrence, and delivery identity need joint tests. |
| Reminder outcome log/adherence/risk/recap | `src/storage/callLogStore.ts`, `behaviorSchema.ts`, `src/ml/{adherence,ewma,features,randomForest,recap}.ts`, `TaskRiskBanner.tsx` | Research/model behavior and privacy need independent review and an ADR; no accuracy or speed claim established here. |
| Deadline suggestions | `src/utils/deadlineExtractor.ts`, `src/ui/components/DeadlineSuggestions.tsx` | Optional reviewed suggestions; must not silently invent deadlines. |
| Semester/academic-calendar support | `src/storage/semesterStore.ts`, `src/utils/academicCalendar.ts` | Inspect provenance and applicability before importing calendar dates or policy-like assumptions. |
| Calendar occurrence and week-layout fixes | Calendar hooks/components, `calendarHelpers.ts`, `timeGridLayout.ts`; occurrence/week tests | Assess focused bug fixes against destination layout rather than replace screens. |
| Notes refresh and title extraction | Notes hook/screen, `src/utils/noteTitle.ts`, refresh/title tests | Useful focused candidates after Notes consistency/paging. |
| Developer options and sync-status display | `ProfileScreen.tsx`, `src/utils/syncStatusLabel.ts`, `SyncStatusLine.tsx` | Preserve destination settings and separate cloud scope; no blanket UI replacement. |

The untracked `docs/plans/capstone-remaining/PLAN.md` describes further phases. It is planning material, not an instruction or approval for this session, and does not prove the planned features are implemented. No work from that plan was executed here.

## Compatibility constraints and scope decisions

- **Framework/driver overlap helps selective reuse:** both packages specify React Native 0.86.0 and OP-SQLite 16.2.0 (donor uses a range). No dependency installation was needed for the comparison.
- **NLU contracts are incompatible:** destination `src/ai/nlu/types.ts` has `create_task`, `update_task`, `delete_task`, `query_schedule`, etc., with title/camelCase timing fields and confidence/validation metadata. Donor has `schedule`, `cancel`, `find_time`, etc., with `task` and `duration_minutes`. Preserve target parser/native-model behavior and insert a typed review/mutation adapter; do not replace the contract wholesale.
- **SQLite schema is not a number-only upgrade:** destination 17 and donor 24 have different initializer coverage. Inventory actual tables/columns/triggers, preserve destination sync/local settings, and test upgrades from a synthetic destination-17 fixture. Native and OP-SQLite writers must agree on path, journal protocol, version range, transactions, and triggers.
- **Android IDs differ:** target `com.lafina.capstone` (debug suffix `.debug`), donor `com.lafina`. Remap Kotlin packages, manifest provider authorities, module registration, APK checks, emulator runner IDs, and test fixtures. Do not overwrite versionCode/versionName/signing configuration.
- **Speech policies differ:** target uses `react-native-tts` and forbids Kokoro; donor defaults to Kokoro and includes related runtime/assets. Keep target TTS, port eligible system speech settings/readiness, and verify model licenses/checksums independently.
- **Scope rules conflict:** the owner's active standing instructions forbid accounts/subscriptions/external Skills/document generation/meeting recording and defer backend work until offline device QA; the cloned AGENTS permits accounts/sync/online AI, and its Phase 09/10 code includes document and meeting paths. Historical approvals recorded in that clone do not authorize this session to execute a new phase or override the owner's instructions. Resolve the intended scope before editing runtime code. This assessment neither removes existing functionality nor imports more of it.
- **Licensing remains open:** no root application license appeared in either tracked file inventory; vendor Whisper has its own LICENSE. Common repository ownership alone is not a redistribution license check. Verify intended reuse rights, vendored notices, model terms and checksums before copying code/assets.
- **Do not copy source barrels wholesale:** donor storage/scheduler/AI/UI index files reference business, Gmail, meetings, study tools, and other excluded modules. Prefer explicit reviewed imports and adapt tests with the module.

## Proposed migration order — no batch is approved or started

| Batch | Scope | Required evidence before advancing |
| --- | --- | --- |
| A | Scope/provenance decision, clean target baseline, storage failure/migration safety (#1) | Target typecheck/lint/Jest/architecture/build; synthetic schema-17 migration/rollback/future-version tests; human startup/durable-save check. |
| B | Native durable delivery, identity fencing, health (#2, #3, #15) | Shared SQLite protocol tests, Kotlin instrumentation, process death/reboot/stale-action/permission tests, physical locked-screen delivery. |
| C | Reviewed commands, untimed items, draft protection, microphone ownership (#4–#7) | Target intent coverage retained; cancel has zero writes; Confirm idempotency; stale account/revision/capture checks; phone voice/call checks. |
| D | Chat ownership/paging, factual planner/guide, Calendar bounds, statistics (#8–#11, #20) | Owner/cursor tests; query bounds with synthetic large data; no history/attachment leak; manual navigation and unavailable-state checks. |
| E | Notes consistency/search/paging, event metadata, explicit preferences, speech controls/readiness (#12–#14, #16–#19) | Data-preserving migrations, revision conflicts, cross-midnight/timezone fixtures, airplane-mode voice selection and actual phone audio. Split this batch into separately approved units as needed. |
| F | QA packaging, ELF audit, architecture upgrades, fixtures/benchmarks/diagnostics/emulator/STT/doctor (#21–#28) | Independent target artifacts, both intended ABIs, no forbidden assets, fresh benchmark evidence, physical installation and sound/reliability acceptance. Introduce focused tooling earlier when needed by A–E. |
| Later | Explicitly selected newer WIP features; deferred backend #29–#30 | Separate scope approval/ADRs/validation. No automatic import of the additional 116-file delta. |

Before starting A, create a destination-local `codex/` work branch from the recorded target HEAD. Keep the existing remote-tracking branch intact. No branch creation or checkout was necessary for this read-only analysis.

## Checks actually run and limitations

Logs and exact checker argument arrays are in [checks.json](evidence/agy-ustp-comparison-20261106/checks.json).

| Check | Actual result | Evidence / limitation |
| --- | --- | --- |
| Clone | PASS | `git clone --branch agy-development-cont --single-branch https://github.com/LAFINA-AI/LAFINA-CAPSTONE.git C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`; clean initial status and HEAD recorded. |
| Tracked text comparison | PASS | `git ls-files` in each repo; Python SHA-256/SequenceMatcher comparison; `comparison.json`, `files.csv`. |
| Newer donor delta | PASS | `git log --format='%h %s' ea6358e..HEAD`; `git diff --stat ea6358e HEAD -- src android scripts evaluation __tests__`. |
| Target doctor | COMPLETED, exit 0 | [doctor-target.log](evidence/agy-ustp-comparison-20261106/doctor-target.log): Node 24.19.0, Java 25.0.2, listed Android SDK/NDK/CMake components present. The script mostly prints presence, always omits build qualification, and contains stale Graphify/Phase 01 text; this is not an Android build pass. |
| Target architecture policy | PASS, analysis toolchain | [architecture-target-policy.log](evidence/agy-ustp-comparison-20261106/architecture-target-policy.log): 179 modules, no cycles/its forbidden imports. The script was evaluated in memory with its TypeScript import pointing to the already-installed donor TypeScript 5.9.3. No file was patched, dependency linked/copied, or npm install performed. This is not a fresh target preflight. |
| Stronger offline-boundary scan | FAIL under donor boundary policy | [architecture-offline-boundary.json](evidence/agy-ustp-comparison-20261106/architecture-offline-boundary.json): 179 modules, 0 cycles, 2 violation paths. Reused donor exported `analyzeSources/readSources` read-only against the target; code below. |
| Graphify navigation | RUN on original workspace graph | `graphify query "Compare agy-development-cont capstone architecture with documented LAFINA USTP improvements scheduling alarms STT TTS memory and reuse constraints" --budget 2000`; located original workspace context only. Neither compared checkout has `graphify-out/graph.json`; used actual AST checkers for compared code. No Graphify build/update claimed. |
| Fresh target install/typecheck/lint/Jest/Gradle | NOT RUN | Fresh clone has no node_modules. No dependencies installed and no Android build launched for a static assessment. Archived source/target pass claims were not rerun or transferred. |
| New benchmark/model evaluation | NOT RUN | No p50/p95, memory, battery, accuracy, alarm drift, or speed claim established. |
| Emulator/physical device | NOT RUN | No device selected or inspected; no APK created/installed, no private records/audio/transcripts read. |

Stronger analyzer paths:

```text
src/ai/chatOrchestrator.ts -> src/skills/documentSkill.ts -> network/cloud import ../cloud
src/ai/index.ts -> src/ai/chatOrchestrator.ts -> src/skills/documentSkill.ts -> network/cloud import ../cloud
```

These are architecture-policy differences. Higher-level online orchestration currently lives under `src/ai`; decide the layering boundary and intended feature scope before treating this as a runtime defect or blindly suppressing the rule.

## Manual review and later phone checklist

For this analysis, open this report and the evidence CSV/JSON; verify the destination/source HEADs and the proposed improvement selection. **Install nothing yet:** this task produced no APK and changed no runtime behavior.

After one approved port batch produces a verified build, the device checklist must state that artifact's package/signature/hash and cover:

1. Install the intended target QA APK in place only when signature/package compatibility is verified; open existing synthetic records and confirm they survive startup/migration.
2. In airplane mode, create and edit a task manually, then restart the app; expected durable record and truthful error/delivery state.
3. Type or dictate a command; expect editable draft/review, no save on Cancel, one save after repeated Confirm, and no guessed target for ambiguous deletion.
4. Schedule a synthetic reminder; test locked screen, main-process death, reboot/unlock, Doze, permission revocation, edit/delete and stale notification actions. ACK must not complete the task.
5. Select an installed offline English system voice, Preview/Stop, then disable or remove availability; expect real offline speech when eligible, otherwise text/recovery with typing intact. Check microphone cancellation and competing capture.
6. Where account behavior remains authorized, switch owners and check Chat/attachments/cursors; edit a note from stale snapshots and confirm draft retention and conflict feedback.

Every phone check above is **NOT RUN**. No physical-device performance or release qualification can be inferred from this assessment or inherited donor emulator reports.

## Review handoff

The clone and analysis are complete. The first recommended implementation unit is storage resilience after resolving scope/provenance and establishing a real target baseline. Backend, newer WIP features, device qualification, and all runtime edits remain unstarted.

STATUS: READY FOR REVIEW

STOPPED — awaiting explicit human approval
