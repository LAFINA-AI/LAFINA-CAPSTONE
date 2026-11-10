# Independent audit: durable attachment cleanup

Date: 2026-11-07 (Asia/Manila). Checkout: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`. Branch: `codex/agy-preservation-improvements`. HEAD: `69aafcd759bb5e8977fdf2450987359c9ca0c022`. Implementation/build commit: `f7e947f`.

## Verdict

**The original C1 lost-reference/retry bug is fixed within host verification. One P2 queue-progress defect remains: a full batch of persistently failing entries indefinitely prevents later entries from being attempted. REQUEST CHANGES for that bounded-retry edge case.**

The three earlier independent audit tests now pass unchanged. Independently rerunning the new cleanup/restart tests, migrations, earlier reset/Preview regressions and protected AGY suites produced 18 passing suites / 327 passing tests. A new independent queue-progress regression fails on the expected assertion.

No AGY feature regression was found in the reviewed diff or protected host contracts. Device, emulator and live-service behavior remains unverified. Overall acceptance stays PARTIAL / AWAITING DEVICE VALIDATION.

## Actionable finding

### C2 [P2]: Persistent failures at the front of the queue starve removable files indefinitely

Locations: `src/storage/attachmentCleanup.ts:73`, `:118`, and the failure bookkeeping at `:143`.

`pendingAttachmentCleanup` always orders by the immutable `recorded_at` timestamp and path. `runAttachmentCleanup` always selects the first 50. A failed unlink leaves its row in place and updates `attempts` / `last_attempt_at`, but neither affects selection. If the first 50 paths keep failing, every later explicit retry repeats those same 50 paths. A removable 51st file is never attempted. Refused stored rows also stay at the front without advancing their attempt state.

Independent reproduction uses 51 valid, synthetic owned cleanup paths. Unlink persistently fails for the first 50; the last file is removable. After two passes:

```json
{
  "first": {"removed": 0, "pending": 51, "interrupted": false},
  "second": {"removed": 0, "pending": 51, "interrupted": false},
  "lastFileStillPresent": true,
  "lastFileAttempted": false,
  "firstAttempts": {"attempts": 2}
}
```

Because selection order never changes, additional retries repeat the same outcome while those failures persist. The UI truthfully stays partial; this is a progress failure, not another false full-success message. It contradicts ADR-026's unqualified recovery statement that, with more than 50 saved, the next pass continues.

Fix direction: retain the 50-file bound and durable owner isolation, but select work fairly across explicit attempts. A persisted cursor or least-recently-attempted ordering can work. Advance scheduling state for failed, directory and refused stored entries as well; do not delete unsafe targets or drop their obligations merely to unblock the queue. Add a regression with at least 50 persistent failures ahead of a valid removable file, including retry progress after a restart if the chosen fairness state is persisted. Keep the ordinary transient-failure and crash-recovery tests. Update the ADR/report and regenerate APK receipts after the fix.

## What is fixed and preserved

### C1 durable cleanup: accepted within the stated host scope

- Schema 23 adds `attachment_cleanup` to the existing database/migration chain. The queue is device-local and is not added to sync entities.
- The chat reset transaction records accepted cleanup paths before deleting their owning messages. A recording failure rolls back the chat step, keeping the recovery references.
- Existing messages can be empty while pending obligations still drive cleanup.
- An obligation is retired only after unlink succeeds or the file is found absent. Retirement failure leaves the row for a later pass.
- A real SQLite file is closed/reopened with fresh module state in the restart tests. These are meaningful persistence tests, not merely reuse of an in-memory array. They do not constitute Android process-death testing.
- Paths are constrained to the documented app-storage locations; regular-file checks protect against recursive directory unlink. Refused paths are not deleted.
- Owner-scoped queries and the existing session epoch preserve admission. Guest obligations move with guest linking. Existing tests verify separate-owner data and pending work remain untouched.
- Work is bounded per pass with no new timer, polling loop, background worker or cloud dependency. C2 concerns fairness across those bounded passes.

### Existing reset and speech fixes

The original stale-confirmation and swallowed-read regressions pass. Planner deletes retain transaction rollback, strict reads, tombstones, outbox mutations and after-commit alarm cancellation. Event-default error wording, device preferences, Preview admission/cancellation and bounded ducking regressions continue to pass.

The existing native reminder cancellation window described in ADR-023 remains outside this change.

## Independently executed checks

New evidence directory, relative to this report:
`evidence/codex-attachment-cleanup-audit-69aafcd-20261107/`.

| Check | Result | Evidence |
| --- | --- | --- |
| Focused/protected suites, new cleanup/UI suites and schema migrations | **18 suites, 327 PASS**, no failed/skipped tests | `focused-and-preservation.json`, `.log`, `commands.json` |
| Three earlier independent tests, unchanged | **3 PASS** | `independent-regressions.json`, `.log`, `independent-commands.json` |
| New queue-progress test | **1 FAIL**, removable last file remains unattempted after repeated passes | `independentCleanupFairness.test.ts`, `independent-regressions.json`, `.log`, `jest-independent.config.cjs` |
| TypeScript | PASS, 768 MB bounded heap | `typecheck.log`, `static-checks.json` |
| Full repository ESLint invocation | PASS, max-warnings 0 | `lint.log`, `static-checks.json` |
| Architecture checker | PASS | `architecture.log`, `static-checks.json` |

The 18-suite run includes the earlier 263-test subset, the 48 new cleanup/UI tests, and schema migrations. Protected host coverage includes PF01-PF13, frozen evaluation contracts, chat ownership, profile/health/preferences, calendar/notes and speech. Tests use synthetic data and host/native/cloud/filesystem adapters. The new audit test uses a fake filesystem; no real attachment was deleted. Historical independent tests/configs were read only, with new outputs written to this audit's directory.

The saved full preflight evidence reports **54 suites, 788 passed, one existing opt-in benchmark skipped**. Saved Gradle logs record executed bundle/package tasks and successful builds. The forced native unit-test log records an executed `testDebugUnitTest`; independently aggregating saved Kotlin XML gives **6 suites / 43 tests / 0 failures, errors or skips** (`saved-native-results.json`). These full runs/builds and Kotlin execution were inspected, not rerun by this audit.

### Existing-test changes

The implementation changed two `accountDataReset` expected result fields from `attachmentUris: []` to `refusedAttachments: 0`, preserving the surrounding assertions. Schema-migration tests explicitly add the new table to their expected additive schema. Jest setup gains an RNFS `stat` mock for the new regular-file check. These are justified interface/schema/harness updates; no weakened assertion or new skip was observed. Frozen evaluation fixtures are unchanged. The older immediate-result tests were not modified and pass with the synchronous no-pending-files path.

## QA APK verification

Both on-disk dataQa APK hashes independently match the fresh receipts:

| APK | SHA-256 |
| --- | --- |
| `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk` | `4ff8d67e459bf572598b2d7c922885c3a5f871755b30b1d8b29fe81d42ed8532` |
| `android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk` | `e9ec1f09e4b06eddf51e5355d14b634f1aee5c4229b61562572fb2d43da27086` |

Independent artifact checks:

- Each has only its intended native ABI.
- Both packaged JavaScript bundles hash to `9c284de8ba7aa58fa5029b515d58b4a7bcace85a4c5fc608c6856a57eaeab17b`, matching the reported build from `f7e947f`.
- All seven new-fix markers and three earlier reset/Preview controls are present in both bundles, checked as ASCII/UTF-16LE strings. This corroborates contents; it is not a reproducible rebuild proof or runtime test.
- Whisper and VAD assets are present. Their full SHA-256 hashes match the preceding independently audited artifacts. No Kokoro filenames were found.
- Both have **16/16 ELF libraries** satisfying the checked 16 KiB PT_LOAD alignment/congruence requirements and zero checked stored-entry ZIP alignment failures.
- Installed SDK `zipalign -c -P 16 4` exits 0 for both.
- Installed SDK apksigner verifies both with v2 signatures and one signer. Certificate SHA-256 remains `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`.
- Installed SDK aapt2 confirms package `com.lafina.capstone`, versionCode 6, versionName `0.6.0-data-qa`, target SDK 36. The 16 permission lines per ABI match the prior independently audited output. No installed phone's signer was checked.

Evidence: `artifact-verification.json`, `model-hash-comparison.json`, `sdk-checks.json`, `identity-comparison.json`, and per-ABI SDK logs.

These are genuine updated QA artifacts with the durable cleanup implementation. They also contain the C2 selection behavior. Passing APK content/signature/alignment checks does not establish functional acceptance. Later fixes require new builds and receipts.

## AGY feature preservation, docs and limits

Git comparison from `8823b11` shows no changes to Android native code, dependency manifests/lock, cloud, sync, AI, skills, meetings code/context or frozen evaluation fixtures. Runtime/test/build-script diff from `f7e947f` to audited HEAD is empty. Session admission behavior is retained; guest linking is extended only for pending cleanup transfer. Chat's existing callers retain their no-executor transaction path.

No regression was observed in accounts, guest linking, subscriptions/tier gates, cloud sync, online AI/Handbook RAG, documents, meeting recording, Whisper defaults or offline TTS under reviewed source changes and protected host tests. This is not a new exhaustive review of all older AGY port commits or a live integration guarantee.

ADR-026, the remediation report, SUMMARY and manual QA describe the durable queue and keep overall acceptance partial. The recovery documentation needs to qualify/fix progress with a full failing batch (C2). The pasted completion text was truncated, so the on-disk report/receipts were used for exact totals/hashes. Its separate Chat “Clear conversation” residual is explicitly documented: that flow remains best-effort without durable cleanup. It was not silently claimed fixed by this change.

All M01-M19 phone/emulator/live procedures remain NOT_RUN. No build, installation, live account action, actual recording, native audio or alarm-delivery test was performed in this audit. No app source, existing test, historical evidence or tracked documentation was modified by the auditor; this new report/evidence is uncommitted. No commits, pushes, merges or deployments were performed.

**Audit disposition: original C1 accepted within host scope; REQUEST CHANGES for C2 queue starvation. AGY preservation checks PASS within host scope. Overall PARTIAL / AWAITING DEVICE VALIDATION.**
