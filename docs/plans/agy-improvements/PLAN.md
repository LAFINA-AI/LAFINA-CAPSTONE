# AGY preservation-first improvement port

This is an implementation plan for Claude Code Opus 5.5. Read OWNER-AUTHORIZATION.md and context/ first. This pack itself is **NOT EXECUTED**; no APK, test pass, benchmark or implemented feature is supplied.

## Objective and definition of success

Selectively adapt the 28 applicable mobile/tooling improvement areas from LAFINA into AGY, preserving AGY's existing capabilities and interfaces. Areas 29–30 require backend work outside the writable project: preserve client compatibility, test local contracts where possible, and report backend changes/deployment as deferred. The plan must end with a factual report even if some units cannot safely be completed unattended.

Existing behavior is a protected contract, not a suggestion. Accounts, subscriptions/entitlements, cloud sync, online AI, RAG, documents, attachments, meeting recording/transcription/consent and all speech modes stay present. Do not introduce Kokoro. Existing UI/theme/navigation stay recognizable. New draft/review/recovery controls are purposeful improvements; explain these behavior changes in the report.

## Work branch and prerequisites

Expected remote repository: `LAFINA-AI/LAFINA-CAPSTONE`. Required writable checkout: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`. Base `agy-development-cont`, audited SHA `b9433dc39d172f30ba26ea68e4a9c9eedd922407`. Work branch `codex/agy-preservation-improvements`.

- Before edits, resolve and verify that the Git top level is exactly `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` (normal Windows case/path normalization allowed). If launched elsewhere, change to this path first. Verify the remote repository/base HEAD too. No alternate checkout or worktree is authorized for implementation; never write runtime changes in the original capstone or donor folders.
- If the base has advanced, keep its newer AGY work: record the actual HEAD, refresh characterization/file mappings and apply this preservation plan there. Never reset it to the audit SHA. If it is an unrelated repository/lineage, perform no runtime edits; record the mismatch and complete a docs-only handoff.
- If the work branch already exists, inspect its ancestry, commits, reports and dirty state. Resume compatible task work. For a name collision with unrelated work use a timestamp-suffixed `codex/agy-preservation-improvements-...` branch from the verified base and record it.
- At first launch, untracked pack docs and earlier comparison docs may be present. Treat them as task inputs; do not stage everything with `git add .`. Other dirty user files must remain untouched. If they overlap a planned edit, defer only the overlapping unit and continue independent work in this exact checkout; do not create an alternate worktree. Never stash, reset, clean, overwrite or commit user changes.
- Source checkout stays read-only. Use pinned Git objects or verified unchanged tracked source; do not use its uncommitted docs as implemented evidence. If it is unavailable, use the exact public commit/file URLs read-only. A missing source/unit is deferred rather than replaced by invented donor behavior.
- The owner's request authorizes adapting their two application repositories. An absent root LICENSE alone is not a reason to halt all first-party work or ask again. Do not invent a license; retain notices and separately verify provenance/redistribution for third-party code/models/binaries, deferring only an artifact with unresolved terms.
- Use existing dependencies first. `npm ci` and builds are authorized in the target after inspecting install scripts; do not install toolchains globally, update unrelated libraries or read `.env`/signing files. Respect actual tool permissions; record denied operations without attempting to bypass them.

## Phase index

| ID | File | Goal | Prerequisites | Inventory |
|---|---|---|---|---|
| 00 | phases/00-baseline-and-preservation.md | Actual baseline, protected contracts, scoped instruction resolution | — | all |
| 01 | phases/01-storage-and-migrations.md | Durable storage and safe additive migrations | 00 | 1 |
| 02 | phases/02-chat-ownership-and-pages.md | Account-safe Chat, attachments and history pages | 01 | 8, 9 |
| 03 | phases/03-durable-reminder-delivery.md | Native durable delivery and stale-action protection | 01 | 2, 3 |
| 04 | phases/04-reviewed-intent-mutations.md | AGY-compatible reviewed, idempotent mutations | 01, 03 | 4, 5 |
| 05 | phases/05-drafts-and-shared-microphone.md | Protected drafts and speech/meeting microphone lifecycle | 04 | 6, 7 |
| 06 | phases/06-planner-queries-and-guide.md | Bounded planner reads and factual replies | 04 | 10, 11 |
| 07 | phases/07-notes-consistency-and-search.md | Revision-safe rich Notes, paging and search | 01, 04 | 12, 13 |
| 08 | phases/08-event-time-and-sync-compatibility.md | Overnight/timezone metadata without breaking sync | 01, 03, 06 | 14, client portion of 29 |
| 09 | phases/09-health-preferences-and-statistics.md | Delivery health, explicit preferences and factual statistics | 03, 04, 06 | 15, 16, 20 |
| 10 | phases/10-speech-controls-and-readiness.md | System speech controls/readiness, optional native recognizer | 05, 09 | 17, 18, 19 |
| 11 | phases/11-qa-packaging-and-native-audit.md | Standalone QA variants, ELF audit and bounded ONNX decision | 03, 05, 10 | 21, 22 |
| 12 | phases/12-architecture-and-repeatable-evaluation.md | Scoped offline boundaries, diagnostics and reproducible QA | 06, 07, 08, 10, 11 | 23–28 |
| 13 | phases/13-integration-and-final-handoff.md | Full preserved-feature verification and final results | all attempted | 29–30 deferred backend; all |

Execute in numeric order; dependencies decide what may be active if a phase is partially deferred. Introduce a needed fixture/checker earlier than its assigned phase when that is the safest way to validate a change; record its provenance and coverage.

## Unattended phase loop

1. Read RUN-STATE.json, autonomous-run-log.md, relevant context and the phase file. Inspect Git status and prior report/commits. Refresh a short checklist; do not reread all source or restart from scratch after compaction.
2. Use Graphify queries first if this checkout has a graph. Run `graphify query` before searching source in every exploring subagent. Otherwise use the documented AST/import substitute and targeted `rg` searches. Do not write donor graphs or pretend Graphify ran. After application changes, update the target graph if available and functioning, or report the substitute honestly.
3. Record phase start/HEAD. Characterize affected AGY behavior before editing it. Add meaningful regression tests for correctness/safety defects, including preserved-feature cases.
4. Prefer a foreground implementation subagent for this single phase, then a separate read-only review using prompts/. All workers use the selected Opus 5.5 model. One writer at a time; workers do not commit, install concurrently, deploy or start the next phase. If subagents are unavailable, perform the steps yourself.
5. Implement the smallest coherent adaptation. Preserve target interfaces and migrate data additively. Do not replace source trees, copy barrels wholesale, or delete AGY online/document/meeting paths to satisfy a generic offline rule.
6. Run targeted checks, then applicable full gates from context/VALIDATION.md. Investigate regressions. Do not loosen lint, skip old tests, lower coverage thresholds, replace failures with broad mocks, or lower timeouts to fabricate success. A baseline failure is classified and documented, never silently excused.
7. Complete review, fix material findings, inspect the final diff and preserved-feature matrix. Finish templates/PHASE-REPORT.md. Append the log and update RUN-STATE.json. Commit only explicit reviewed task files, with message `feat(agy-port-NN): ...` or appropriate fix/test/docs type. Preserve a passing local integration point.
8. Continue without a human review pause. The absence of phone/live-service checks changes validation status, not the permission to work on independent units. Do not print an old 'awaiting human approval' instruction and stop.

## Safe deferral and real failures

No arbitrary retry count replaces judgment. Investigate errors with bounded, purposeful attempts; repeating the same command without new evidence is not progress. If a unit cannot be safely completed:

- Explain the concrete cause, touched paths, commands/results and minimum future prerequisite.
- Keep shared runtime code coherent and checked. Remove only that unit's own uncommitted edits with narrowly reviewed reverse edits; do not use destructive Git commands. Revert an already committed task change only with a new reviewed revert commit, leaving history intact.
- If safe inactive scaffolding helps, keep it outside active paths with tests and an explicit deferred status; do not ship a broken half-cutover, double alarm registration or hidden replacement implementation.
- Mark dependent units DEFERRED_DEPENDENCY. Continue independent units whose prerequisites are actually satisfied, including a fresh report for every phase considered. Host test failures remain FAIL; unavailable device/build operations remain NOT_RUN.
- If a mandatory baseline/tooling failure prevents all runtime verification, keep runtime unchanged, complete available research/fixtures/docs, and produce the final SUMMARY with blockers. Never label the implementation complete merely because every phase has a report.

## Durable progress and resumption

Use reports/RUN-STATE.json as structured progress, reports/autonomous-run-log.md as append-only history, and timestamped evidence subfolders. Do not overwrite benchmark baselines or prior failed logs. Each phase has independent implementation state, automated/build status and device/live status. 'CODE_COMPLETE' is distinct from 'VALIDATED'; deferred is not DONE.

Before any local phase commit, update the report with tested HEAD and command evidence; a report cannot contain the SHA of the commit that includes itself. Record the resulting commit SHA in RUN-STATE.json/log on the next step or a final report-index commit. Do not repeatedly amend commits to chase a self-referential hash. Pending own report-index edits are expected on resume and must be reviewed explicitly.

On resumption verify files/commits/checks, not just state labels. An interrupted phase remains first eligible work. Do not rerun side effects such as migration/fixture setup blindly; fixtures require idempotent owned cleanup. Never clear a student's database to recover tests.

## Required final deliverables

- reports/SUMMARY.md: plain-language outcome, actual work branch/base/final HEAD, all 30 inventory dispositions, preserved AGY feature results, changes/deviations, exact checks, limitations and next actions.
- reports/PRESERVED-FEATURES.md: every protected contract ID, baseline and final tests, actual status, expected intentional UX changes and remaining manual/live checks.
- reports/phase-NN-*.md for every phase attempted or deferred, RUN-STATE.json and autonomous-run-log.md.
- reports/evidence/: fresh commands/logs, synthetic migration/query/evaluation fixtures and receipts, artifact hashes where actual artifacts exist. No secret values or private user content.
- reports/MANUAL-QA.md: exact produced artifact/package, install/update constraints, actions/expected results and explicit NOT_RUN cases. External backend work 29–30 stays deferred; existing client features stay enabled.

Final autonomous message should be short and point to SUMMARY.md. Report partial completion honestly. No human permission request and no push/deploy/merge action.
