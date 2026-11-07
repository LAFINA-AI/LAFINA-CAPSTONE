# Lem-branch integration report

Date: 2026-11-07 (Asia/Manila). Branch: `Lem-branch`. Code merge: `7b860ef8eb13e2898e6a29c14176419f057ce99d`.

## Outcome

The latest AGY code and the audited improvement branch are integrated on a separate local branch. Both original histories remain intact. No push, deployment or device installation was performed. Host preflight, native debug validation and standalone QA builds/audits pass. Combined physical-device and live-service acceptance remains pending.

## Exact parents and protection

- Latest fetched AGY: `f76ea9dbc33fceb4d122bc586f2f17fb0712072c`.
- Audited improvements: `f531bfbe691409cd020b8a56f8d79925d249e646`.
- Common base: `b9433dc39d172f30ba26ea68e4a9c9eedd922407`.
- Merge parents are AGY first, improvements second. `Lem-branch` has no upstream targeting AGY. The local `agy-development-cont` ref remains at its original `b9433dc`; the latest fetched remote-tracking AGY ref is `f76ea9d`. Neither protected source ref was rewritten by integration.
- Existing untracked prompt packs, earlier audit output and comparison files were preserved separately. No changes were made to the donor LAFINA checkout.

## Analysis of the friend's changes

Six AGY commits arrived after the old base: `863def0`, `0b5ab39`, `1570c91`, `3bd3be6`, `24247bd`, `f76ea9d`.

**Transcription:** Whisper warmup starts while Voice is open (300 ms delay); the model is reused with inactivity/memory-pressure unloading. The native path uses a shorter voice prompt, a bounded audio context based on captured length, a 1,000 ms silence threshold, and tuned worker count/priority. The long timestamped-transcription path is retained. The optimized C++ file is byte-for-byte identical to latest AGY. Kotlin combines the warmup/tuning with the improvement branch's microphone ticket and delayed promise settlement.

The reported improvement from 8-10 seconds to 2-3 seconds is owner-reported. No comparable device benchmark was run in this integration, so those numbers are not independently established for Lem-branch.

**ML:** the local pipeline uses EWMA response latency, KNN over historical feature vectors, and fixed Random Forest definitions for adherence/offset recommendations. The timing advisor retains its preference gate, minimum five history samples, bounded offsets and baseline fallback. Algorithm bodies are preserved; only unused imports were removed from the timing advisor. The commit provides fixed tree definitions, not a training/accuracy study. KNN's channel recommendation remains advisory; it is not newly wired to automatic notification-channel delivery.

**Other changes:** retain the improved natural snooze/acknowledgement parsing, recurring-reminder parsing, week queries, scrollable voice/call cards, lazy modal mounts and immediate screen initialization where compatible with bounded data access.

See `evidence/parent-preservation.json` for exact source comparisons.

## Conflicts and semantic adapters

Eight files needed textual conflict resolution: actionExecutor, reminderActions, VoiceModal, ChatScreen, ProfileScreen, CalendarScreen, useCalendarData and useNotesData. Successful automatic merges were also reviewed, especially native speech capture.

- Reviewed Chat/Voice writes now use AGY's ML timing too. Prepare shows the actual adapted trigger, keeps task due time unchanged and freezes the proposed time. Confirm writes that exact proposal; it does not silently recompute a different recommendation. Opt-out/cold start and advisor failure keep baseline timing.
- Reviewed ACK/snooze records learning only after commit and once per operation. A rejected or cancelled card and double Confirm cannot add feedback.
- Recurrence survives the review path. Call ACK and reviewed ACK share next-occurrence creation; reviewed creation is transactional with ACK, retains the source link and schedules natively after commit. The review discloses recurrence continuation. ACK still does not complete the task.
- Immediate Chat/Notes initialization uses bounded owner-aware pages; Profile uses aggregate counts. Calendar loads a bounded window before paint. Old skip-first-reload guards were removed where they otherwise erased the first page, suppressed filter/search changes or hid storage errors.
- Preserve the frozen My quiz title contract while retaining the new natural-language parsing improvements. Frozen fixtures and existing assertions were not changed.
- Week summaries use bounded recurring planner reads and report read failures honestly.
- Clear All Data clears the admitted owner's new behavior/ML snapshots in the planner transaction, verifies deletion and rolls back together on failure. Other owners and device preferences remain intact.
- A deterministic regression exposed an AGY snapshot bug: timestamp ties were broken by random IDs, allowing an older EWMA value to win. SQLite insertion order now breaks equal timestamp ties. The ML algorithm code itself is unchanged.

Design rationale: `docs/decisions/ADR-027-lem-branch-integration.md`.

## Executed verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Full preflight | PASS: 59 suites, 860 passed, 1 existing opt-in skipped; TypeScript and lint pass | `evidence/preflight-4.log` |
| Architecture/offline boundary | PASS: 226 modules, 0 cycles, 0 forbidden dependencies; 75 offline leaves reach no network | same log |
| Four unchanged independent audit regressions | 4 PASS, no failures/skips | `evidence/independent-tests.json`, `.log` |
| Kotlin, forced test rerun | 43 tests, 6 suites, zero failures/errors/skips | `evidence/native-results.json`, `gradle-native-debug-1.log` |
| Native debug assembly | BUILD SUCCESSFUL, both configured ABIs | `evidence/gradle-native-debug-1.log` |
| Standalone bundle | BUILD SUCCESSFUL, bundle task executed from real checkout path | `evidence/gradle-bundle-1.log` |
| QA APK assembly/audits | PASS: arm64/x86_64 standalone APKs built and audited | `evidence/gradle-dataqa-1.log` |

The 12 new integration regressions cover frozen adaptive timing, confirmation/idempotency, opt-out, cancellation, fallback, ownership, recurrence through call/review ACK, post-commit feedback, ML-data reset/rollback, bounded week queries and snapshot timestamp ties. Both parents' existing suites and all frozen evaluation fixtures pass. Test edits in the friend's new suites remove unused imports only; no assertion was weakened or skipped.

All failed attempts remain: initial typecheck/lint reconciliation, preflight 1 (missing type), preflight 2 (20 integration failures), preflight 3 (one snapshot tie failure), and the deterministic failing snapshot reproduction. Preflight 4 is the final passing source. These were actual implementation failures and fixes, not discarded evidence or rewritten results.

There is no Graphify graph in this checkout. The existing TypeScript AST architecture/offline checker is the documented substitute; Graphify was not claimed to run.

## QA artifacts

| ABI | APK (under android/app/build/outputs/apk/dataQa/) | SHA-256 |
| --- | --- | --- |
| arm64-v8a | `app-arm64-v8a-dataQa.apk` | `e6468167db0e0935ff4bd00c2ba8863af6c1e7f8e9be07c8c1d74a26beda871d` |
| x86_64 | `app-x86_64-dataQa.apk` | `76963863519b7dc7cf466e9b94cd00b061bfe2dbaa99a90215dc982566347c0c` |

Both packaged bundles hash to `b1be9a76a9a863a0a51e79a1b4b7827bf84c502ed47b7c0496fc07236048e5c2`, matching the freshly built bundle from code commit `7b860ef`. All integration markers are present. Both packages contain the optimized native voice prompt and Kotlin warmup marker; these are content checks, not a latency benchmark.

Both audits PASS: one ABI, bundled JS, required Whisper/VAD models, no Kokoro, 16/16 ELF libraries at 16 KiB, and zero ZIP alignment failures across 302 stored entries. SDK zipalign and signer verification pass. Package `com.lafina.capstone`, versionCode 6, version `0.6.0-data-qa`, target SDK 36, all 16 permissions per ABI and debug signing certificate remain unchanged. Model hashes match the prior audited build. Certificate SHA-256: `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`.

Final receipts: `evidence/QA-RECEIPTS-2.json`. The first receipt and rejected auditor-output attempts remain unchanged. The inherited APK auditor only accepts its original evidence namespace; the successful audit JSONs are in `docs/plans/agy-improvements/reports/evidence/agy-port-20261106/lem-integration-20261107/`. No safety check was weakened to accept the new build.

These replace the previous C2 QA files at the same output paths; historical receipts are preserved. No APK was installed.

The builds use JDK 17, bounded 768 MB Gradle/Node heaps, one Gradle worker and the documented short-path X: workaround. JS is bundled from the real checkout; the X: assembly skips only that already-built bundle task. No native or speech defaults were changed just to make a build pass.

## Preserved features and remaining limits

Protected AGY contracts pass for accounts/guest linking, tier gates/subscriptions, sync, online AI/Handbook RAG, documents, meetings, speech defaults, UI ownership and native reminder semantics. The combined branch retains the 30-area port and its later F1-F4/P1/P2/C1/C2 fixes. No Kokoro was introduced.

Host stand-ins do not establish live login, subscriptions, synchronization, RAG citations, cloud documents, recording, real speech or alarm delivery. Older partial areas/backend handoffs remain partial. The prior native cancellation process-death window (ADR-023), stale planner benchmark and absent Android on-device recognizer/accuracy runs were not silently declared fixed. Chat's separate best-effort Clear conversation and documented exact-path-reuse limitation remain outside this merge.

## Manual checks — all NOT_RUN

1. On a designated test phone, record counts/sign-in/settings and verify the new arm64 QA hash, package ID and signing compatibility. Install in place only when compatible; never uninstall or clear real data to force an update. Open in airplane mode without Metro: expect existing records/settings preserved.
2. Compare the same utterances on the friend's tested build and Lem under the same device/model/temperature conditions. Measure cold and warm capture-release-to-draft and native inference durations; record median, p95 and failures. Expect accurate editable text, cancellation and dictation/meeting microphone exclusion. No 2-3 second promise is made by host tests.
3. With synthetic data, verify cold-start/disabled ML keeps requested timing. After controlled interaction history, inspect a changed adaptive time on Review; Confirm must register that exact time, and double Confirm must save once. Test recurring reminders through call ACK and reviewed ACK without completing the underlying task.
4. Test account switch/stale reviews, Clear All Data and attachment retry/restart cases with synthetic accounts only. Expect owner isolation, cleared personal learning, retained device settings and truthful partial results.
5. Run the existing reminder process-death/reboot/Doze/permissions checks and controlled live-service checks in the prior MANUAL-QA. All remain NOT_RUN for this combined build.

Overall: PARTIAL / AWAITING DEVICE VALIDATION. Source integration and host/native-build verification are complete; device acceptance is separate.

The full inherited-history whitespace check reports raw historical log whitespace and Markdown hard breaks. The source/native/test whitespace check passes; historical evidence was not reformatted to hide diagnostics. The temporary X: build alias is removed after verification.
