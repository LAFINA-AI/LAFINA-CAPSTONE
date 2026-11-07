# Independent audit of final-audit remediation

Audit date: 2026-11-06 (Asia/Manila). Audited checkout: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`; branch `codex/agy-preservation-improvements`; HEAD `7b3b183`. Claude's runtime fix is `f61d1eb`; the subsequent audited commits change documentation/evidence. No runtime diff exists between `f61d1eb` and HEAD in `src`, `android`, `scripts`, original tests, App.tsx or dependency manifests.

## Verdict

F1 and F2 pass scoped source review and an independent rerun of Claude's new regression tests. F4's current guidance is corrected. F3's originally demonstrated event-default reset exception is addressed, but the broader Clear All Data flow still has two independently reproduced defects. Do not mark that flow fully fixed. Overall acceptance remains PARTIAL / AWAITING DEVICE VALIDATION.

This was an audit, not an implementation phase. No application code, original tests, protected fixtures or existing reports were changed. No build, install, emulator, real microphone, phone or live-service check was run by this audit. New evidence and this report are uncommitted. The AGY graph directory is absent; targeted source reads were used.

## Findings requiring changes

### P1: A retained destructive confirmation can delete a previous account's records

Location: `src/ui/screens/ProfileScreen.tsx:258`, especially the first writes at lines 270-277.

The native Alert callback captures `userId` but does not check the current account/session or component lifetime before deletion. An independent synthetic test opens the confirmation as owner A, changes the active session to owner B, unmounts the old Profile, and invokes the retained confirmation. A's note receives `deleted_at` despite A no longer being active. The later event-default reset owner check cannot protect the planner writes that already ran.

This demonstrates that the callback is not fenced against a session change; it does not claim a physical-device reproduction of native dialog timing. The account-scoped destructive path must refuse a stale callback even if an asynchronous session change or retained native callback supplies it.

Fix: validate a captured account/session generation and screen lifetime before any destructive work. Put ownership/admission checks in an explicit reset operation as well, so the guard cannot be bypassed through another caller. On mismatch, make no changes and require a fresh confirmation in the current session. Add a regression covering account switch/unmount before confirmation, and retain successful same-account reset coverage. This finding concerns the existing reset path; this audit does not attribute its introduction to `f61d1eb`.

### P2: A swallowed read error still produces a false full-success message

Locations: `src/ui/screens/ProfileScreen.tsx:270`, `src/storage/notesStore.ts:84`.

The new `step()` helper treats lack of an exception as success. However, `notesStore.getAll()` catches database errors and returns an empty array. A synthetic read failure for the notes SELECT therefore leaves a real synthetic note undeleted, while all three step booleans remain true and the UI reports `Data Cleared` / `All personal scheduling data and saved event defaults have been deleted.` Other planner getters use the same best-effort pattern.

Fix: use strict, owner-bound reset operations that propagate failures or return explicit outcomes, rather than using display-oriented getters that return empty collections on error. Report only confirmed outcomes, including partial progress. Preserve existing AGY sync/tombstone/outbox semantics; do not replace these deletes with raw blanket SQL or change best-effort getter behavior globally without reviewing callers. Add read-failure regression coverage with retained records and an honest partial/failure message. The original F3 defaults-exception regression remains valid and passing, but does not cover this case.

## F1-F4 assessment

| Finding | Assessment | Evidence and limits |
| --- | --- | --- |
| F1 Preview race | Addressed in scoped host verification | Cancellable admission ticket; owner, speech, dictation and recording checks during startup and immediately before synchronous playback; pending UI ticket cancelled on Stop/close/background/unmount. New regression suites pass. Real native audio timing remains NOT_RUN. |
| F2 Ducking wait | Addressed in scoped host verification | Ducking uses bounded optional startup handling with generation checks. Timeout/rejection no longer indefinitely blocks startup. Offline voice selection remains enforced. Host tests pass; native-engine behavior remains NOT_RUN. |
| F3 Clear All Data message | Original exception fixed; broader flow PARTIAL | Claude's event-default failure case passes. Two independent reset tests fail for the defects above. |
| F4 Process-death/Force Stop docs | Addressed in reviewed current guidance | SUMMARY and M18 distinguish ordinary process death (R1), Force Stop (R2), and relaunch/recovery (R3). Old historical records retain dated corrections. Current instructions do not equate Force Stop with a normal process-death alarm test. All manual procedures remain NOT_RUN. |

Review of the Preview implementation also confirmed a synchronous meeting-recording claim and a final admission callback in the playback turn. The known surviving mutation removes an intermediate recheck duplicated by later checks. Its survival was disclosed; it is not by itself evidence that the final admission outcome is broken. No claim of exhaustive concurrency proof is made.

## Independently executed tests

Evidence directory: `evidence/codex-remediation-verification-7b3b183-20261106/` relative to this report.

1. Claude's four new regression suites were independently rerun: **4 suites, 29 tests PASS**, no skips. Files: `claude-regressions.json` and `.log`.
2. Two additional synthetic Clear All Data regressions were independently run: **2 tests FAIL**, each on the intended assertion. The read-failure test first confirms the note remains, then fails because the alert says `Data Cleared`; the stale-confirmation test fails because the previous owner's note is deleted. Files: `independentClearData.test.tsx`, `jest-audit.config.cjs`, `independent-clear-data.json` and `.log`.

The tests use the existing host database/test adapters and synthetic users/notes only. They do not touch user app data. The additional tests live outside normal application test discovery, with a separate audit configuration, so they are reproducible evidence rather than silent changes to the production test gate.

Commands from the checkout (PowerShell; `$ev` is a task-local path):

```powershell
$ev = 'docs/plans/agy-improvements/reports/evidence/codex-remediation-verification-7b3b183-20261106'
node --max-old-space-size=384 node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/ai/finalAuditF1PreviewAdmission.test.ts __tests__/ai/finalAuditF2Ducking.test.ts __tests__/ui/finalAuditF1OfflineVoicePending.test.tsx __tests__/ui/finalAuditF3ClearAllDataFailure.test.tsx --json --outputFile="$ev/claude-regressions.json"
node --max-old-space-size=384 node_modules/jest/bin/jest.js --config "$ev/jest-audit.config.cjs" --runInBand --runTestsByPath "$ev/independentClearData.test.tsx" --json --outputFile="$ev/independent-clear-data.json"
```

Existing saved preflight evidence reports 50 suites, 713 passed and 1 opt-in benchmark skipped. Existing Kotlin XML contains 6 suites / 43 tests / 0 failures / 0 errors / 0 skips, and the saved Gradle log records a forced rerun. Existing debug/dataQa logs report successful builds. These full runs were inspected, not independently rerun. The larger pass count does not invalidate the two uncovered reset cases. `saved-native-results.json` contains the independently aggregated saved XML totals.

## QA APK verification

Both current QA APKs were independently streamed through SHA-256, ZIP inspection and ELF-header checks without changing them. Results are in `artifact-verification.json`.

| APK | SHA-256 | Result |
| --- | --- | --- |
| `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk` | `2502aec34ffb3f349e43dd9d1c202e8f549a26a0595e8961c58a51ecb95689ba` | Matches Claude's new receipt |
| `android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk` | `a0bf18e5ce2b87a03097895231e67e3f1b7735a656b05272e1ca12417b5c91f2` | Matches Claude's new receipt |

Both contain the same JavaScript bundle with SHA-256 `f86e13afe42dfc9588a6bea6aaf70a75cc0e10c83cdaeece943f7fefd5d8bc67`, matching the reported fixed bundle. Both have 16/16 native ELF libraries satisfying the checked 16 KiB PT_LOAD alignment/congruence requirements, with no ZIP alignment failures. Both retain `ggml-base.en-q5_1.bin` and `silero_vad.onnx`; no Kokoro filenames were found. These checks establish artifact contents/alignment, not runtime model accuracy or device compatibility.

The saved successful SDK signer log reports APK v2 verification and certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e` for both artifacts. This audit read that log; it did not independently rerun apksigner or compare a phone's installed signer. Preserve the failed/empty first signer attempt as historical evidence.

After fixing the remaining reset defects, rerun the relevant gates, rebuild QA artifacts and generate new non-overwriting receipts. The hashes above identify the audited, currently incomplete version and must not be reused for later builds.

## Preservation and next acceptance

Nothing in this audit modifies AGY accounts/subscriptions, cloud sync, online AI/Handbook RAG, documents, meeting recording, Whisper defaults or native offline TTS. Passing host contracts and unchanged native/dependency code do not prove live-service or physical-device behavior. The existing reminder durability limitation, other partial areas and backend handoff remain outside these four remediation findings.

Before closing F3, fix and rerun both independent failures, retain Claude's 29 regressions and the protected AGY gates, then update SUMMARY/remediation docs and QA APK receipts truthfully. No phone installation, force-stop experiment, deletion of real records or live account operation was performed. All M01-M18 device/live checks remain NOT_RUN unless separately evidenced by the owner.

Audit disposition: **REQUEST CHANGES for the two reset cases; F1/F2/F4 accepted within stated host/document scope. Overall PARTIAL / AWAITING DEVICE VALIDATION.**
