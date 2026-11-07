# Attachment-cleanup remediation: finding C1 (2026-11-07)

**Status: CODE_COMPLETE (host), AWAITING DEVICE VALIDATION.** The overall run stays **PARTIAL**.

> *Correction 2026-11-07:* the independent audit [codex-attachment-cleanup-audit-69aafcd-20261107.md](codex-attachment-cleanup-audit-69aafcd-20261107.md) accepted C1 within host scope and found **C2**: the bounded pass always took the same first 50 obligations, so persistent failures starved the rest. The "more than 50 saved" recovery line below is corrected in place; the fix is in [attachment-queue-fairness-remediation.md](attachment-queue-fairness-remediation.md) and the ADR-026 amendment. Everything else in this report is unchanged.

- **Source:** the independent audit [codex-clear-data-audit-8823b11-20261107.md](codex-clear-data-audit-8823b11-20261107.md). It accepted the original P1 and database P2 fixes within host scope, and requested changes for **C1**: a failed attachment cleanup could not be retried, but the retry reported full success. That report and its evidence directory `evidence/codex-clear-data-audit-8823b11-20261107/` are committed unchanged alongside this report. Their file hashes match before and after this work (`independent-audit-dir-before/after.sha256`).
- **Audited HEAD:** `8823b11` on `codex/agy-preservation-improvements`. No newer work existed. The working tree held only the untracked audit files and the instructed never-commit items.
- **Code commit:** `f7e947f` `fix(agy-audit): durable owner-bound attachment cleanup for Clear All Data (audit C1)`. This is the tested code, and the APKs were built from it at HEAD `f7e947f`.
- **Report/tracking and index commits:** recorded in RUN-STATE.json and the run log.
- **Evidence:** `evidence/agy-port-20261106/attachment-cleanup-remediation-20261107/`. Every log is new and numbered, and none was overwritten.
- **Architecture decision:** [ADR-026](../../../decisions/ADR-026-durable-attachment-cleanup.md), which extends ADR-025.
- **Not done:** nothing was installed on a phone or emulator, and no live service, real account or real user data was used. Nothing was pushed, merged or deployed.

## Root cause

`resetPersonalData` (ADR-025) read the owner's attachment URIs, deleted the chat messages, and returned the URIs **in memory**. Profile then unlinked them.

- When an unlink failed, the message was truthful, but the messages, the only reference to the file, were already gone.
- The next Clear All Data found no URI, unlinked nothing, and said "Data Cleared" with the file still on the phone.
- A restart lost the in-memory list in the same way.

## Fix and recovery behavior (`f7e947f`)

| Area | Change |
|---|---|
| Schema 23 (`attachmentCleanupSchema.ts`, `dbInit.ts`) | Adds the `attachment_cleanup (user_id, path, recorded_at, attempts, last_attempt_at)` table, with primary key `(user_id, path)`, in the same `lafina.db`, through the existing single-transaction migration chain. Device-local and never synced |
| `accountDataReset.ts`, chat step | One `transactionSync`: re-admit the authority, read this owner's attachment URIs, record an obligation for each accepted path (`INSERT OR IGNORE`), delete the owner's messages. A failure anywhere rolls back, so the messages (the references) stay and the step reports `failed`. Returns `refusedAttachments` (distinct refused references) |
| `attachmentCleanup.ts` (new) | `attachmentCleanupTarget` (the path rules, below). `runAttachmentCleanup`: one pass over at most 50 of the owner's saved obligations, oldest first. Per path: re-check the rules → absent counts as done → `stat` must be a regular file → `unlink` → retire the row. A failed unlink keeps the row and increments `attempts`. A failed retire keeps the row. Stops if `stillCurrent()` turns false. Returns `{removed, pending, interrupted}`, where `pending` is the count of saved rows, or null if it could not be read |
| `finishAttachmentCleanup` / `hasAttachmentCleanup` | Run that pass for the authority's owner, with the ADR-025 session epoch as `stillCurrent`. When no obligation is saved, the pass is skipped synchronously (the earlier timing) |
| `chatStore.getAttachmentUris` / `clearHistory` | Optional transaction argument; without it they behave as before |
| `guestMigration` | Guest obligations move to the account in the link transaction (`UPDATE OR IGNORE` + delete of leftovers) |
| `ProfileScreen` | "Data Cleared" only when all steps are confirmed, **no obligation remains saved** and nothing was refused. Otherwise "Data Partly Cleared" with the exact count of saved files ("…could not be removed from this phone's storage yet; Clear All Data keeps it listed and tries again."), an unreadable count, an interrupted pass, refused references, and "Try Clear All Data again" only when a retry can help |
| `chatFiles.ts` | Uses the shared `CHAT_FILES_SUBDIR`. The P1/P2 helper `removeAttachmentFilesReportingFailures` is removed (now unused). `removeAttachmentFiles` (used by Chat) is unchanged |

**Recovery:**

- recording fails → the messages are kept and nothing is lost;
- crash before unlink → the row is saved and the next Clear All Data removes the file;
- unlink fails → the row is kept and retried;
- crash after unlink, before retiring → the next pass finds the file absent and retires the row without an unlink;
- sign-in changes mid-pass → the rest stays saved for that owner only;
- ~~more than 50 saved → the next pass continues.~~ *Corrected 2026-11-07 (attachment-cleanup audit C2, [attachment-queue-fairness-remediation.md](attachment-queue-fairness-remediation.md)):* this held only when the first 50 were removed. Selection by the immutable `recorded_at, path` meant that 50 obligations that kept failing, refused saved paths or directory targets were selected again on every pass, so later obligations were never attempted. A durable per-owner turn order (schema 24) now fixes this.
- There is no loop, timer, poller or background work: each retry is an explicit Clear All Data.

**Path rules:**

- **Accepted:** a regular file name with an extension, in `chat_files/` (where `saveGeneratedFile` writes) or directly in the app's private document storage. The latter is accepted because the reference-based ownership rule (`chatStore.hasAttachment`) already treats an owned reference there as the owner's attachment, and the unchanged independent regression uses such a path (`/documents/synthetic-retry.pdf`).
- **Refused:**
  - other schemes, and relative paths;
  - `.`, `..` and empty segments, backslashes and control characters;
  - anything outside app storage;
  - `models/`, `meetings/`, `avatars/` and every other nested directory;
  - the two top-level state files;
  - hidden and extension-less names.
- **Directories:** Android's `RNFS.unlink` is recursive, so each unlink is preceded by a regular-file `stat` check. No directory is ever swept.

**Kept unchanged:**

- ADR-025 admission (session epoch, liveness, the in-transaction checks);
- strict planner reads and the atomic planner step;
- the F3 event-default failure wording;
- device settings;
- the F1 Preview and F2 ducking fixes.

`git diff 8823b11 f7e947f` is empty for:

- `src/ai`, `src/skills`, `src/cloud`, `src/sync`;
- `android/`, `package.json` and the lock file;
- `evaluation/`, `__tests__/evaluation` and `__tests__/fixtures`.

## Tests

**Pre-fix, on `8823b11`** (`pre-fix-independent-retry-1.log`): the unchanged independent regression **failed**, 1 of 1, at `expect(files.has(path)).toBe(false)`. The second alert was "Data Cleared".

The new suites can't run before the fix, because the module they import did not exist. The mutation check below shows they guard it.

| Run (fresh) | Log | Result |
|---|---|---|
| Typecheck (768 MB heap) | `typecheck-1.log` | exit 0 |
| Focused ESLint, changed files, max-warnings 0 | `lint-focused-1.log` | exit 0 |
| Independent C1 regression, unchanged, its own config | `post-fix-independent-retry-1.log` | **1/1 pass** |
| All three independent tests (C1 + both earlier reset tests) | `independent-tests-post-fix-1.log` | **3/3 pass** |
| Existing related suites (remediation UI, accountDataReset, A3, F3, chatOwnership, schemaMigrations, preservation) | `post-fix-existing-1.log` → `-2.log` | Run 1: **5 failed / 96 passed**, kept (see below). Run 2: **101/101 pass** |
| New `attachmentCleanup` (storage, 43) | `storage-cleanup-tests-1.log` → `-2.log`, `new-suites-3.log` | Run 1: 1 failed / 41, a test-authoring error (see below). Run 2: 42/42. After adding one test, 43/43 |
| New `clearDataAttachmentCleanup` (UI, 5) | `ui-cleanup-tests-1.log`, `new-suites-3.log` | **5/5** |
| Mutation check (`mutate-cleanup.py`) | `mutation-check-1.log` → `-2.log` | Run 1: 9/10 killed; **no-revalidation SURVIVED**. A test for a stored invalid row was added. Run 2: **10/10 killed**, every file restored (sha256 verified) |
| The audit's 15-suite focused + protected set | `focused-and-preservation-1.json/.log` | **15 suites, 263/263 pass** (equal to the audit's 263) |
| The 29 F1–F3 regressions | `f1-f3-regressions-1.json/.log` | **29/29 pass** |
| `npm run preflight` (`NODE_OPTIONS=--max-old-space-size=768`) | `preflight-1.log` (01:50:18Z–01:53:06Z) | **PASS**. Jest **54 suites, 788 passed + 1 skipped** (was 52, 740 + 1; +48 new tests). The skip is the existing opt-in benchmark. Architecture 219 modules, 0 cycles, 0 forbidden, 75 offline leaves |

**Failed runs, explained:**

- **`post-fix-existing-1` had 5 real failures, each from a deliberate change:**
  - `schemaMigrations` lists the exact tables added since schema 17. The new `attachment_cleanup` table was added to that list, which is the documented schema-change step.
  - `accountDataReset` (2) asserted the old outcome field `attachmentUris`; the outcome now has `refusedAttachments`.
  - `auditA3` and `finalAuditF3` read the alert synchronously, and the handler had started to await the cleanup even with nothing saved. **These two tests were not changed.** Instead, the synchronous fast path was restored when no obligation is saved.
- **`storage-cleanup-tests-1` was a test-authoring error.** The restart test counted run 1's `unlink` call on the shared RNFS mock. The call record is now cleared at the start of run 2.

**What the new tests cover:**

- first unlink fails, then a retry succeeds, with an empty chat history in between;
- discovery and removal after closing and reopening a real SQLite file in a fresh module registry (no module state survives);
- the two crash-equivalent points: before any unlink, and after the unlink but before retiring;
- an already-missing file (no unlink);
- duplicate references, recorded and counted once, with idempotent repeats (`attempts` 2);
- a failure to save the obligation (messages kept, chat `failed`, no unlink);
- a failure to retire (not success; the next pass finishes it);
- other owners' obligations and files untouched;
- 25 refused path forms, refused references, a stored invalid row, and a directory target;
- a sign-in change mid-pass (stops; the rest stays saved for A only, B unchanged);
- the 50-per-run bound;
- guest linking;
- exact singular and plural messages, the unreadable-count message, the interrupted message and the refused message.

**Changes to existing test files** (exact diff in `existing-test-changes.diff`):

- `schemaMigrations`: the expected added-table list now includes `attachment_cleanup`, and a comment changed from 18–22 to 18–23.
- `accountDataReset`: two assertions changed `attachmentUris: []` → `refusedAttachments: 0`.
- `jest.setup.js` gains a default `RNFS.stat` mock that reports a regular file; the shared mock had no `stat`.
- No assertion was weakened or removed, no skip was added, and no frozen fixture was changed.

**Note on `console.error` lines:** preflight logged 31 (29 before). The 2 extra lines are React `act(...)` warnings from a `VirtualizedList` in `chatHistoryPaging`, a suite this change does not touch; it calls `clearHistory` without the new argument, which runs the unchanged path. Run alone on the same code, that suite printed 1 warning, then 0 (`chat-history-paging-alone-1/2.log`), with 10/10 passing both times. It is recorded as intermittent test timing, not a database error.

## Native checks and QA APKs (one job at a time, one Gradle worker)

About 1.1 GB of RAM was free. The recipe is the documented one: JDK 17, the bundle from the real path, native work from the `X:` alias, and `skip-prebuilt-bundle.init.gradle`.

| Step | Log | Result |
|---|---|---|
| JS bundle | `gradle-bundle-dataqa-1.log` | BUILD SUCCESSFUL, the task **executed**. Bundle `9c284de8…b17b`, 5,245,364 B (P1/P2: `09e25695…a199`) |
| dataQa assemble | `gradle-assemble-dataqa-1.log` | BUILD SUCCESSFUL, 12 executed / 244 up to date; `mergeDataQaAssets` and `packageDataQa` executed; the bundle task SKIPPED by design |
| Kotlin `testDebugUnitTest --rerun` + `assembleDebug` | `gradle-unit-assemble-debug-1.log`, `kotlin-results-1.txt` | **43 tests, 6 suites, 0 failures/errors/skips**, executed 01:57:52Z. The debug APKs were up to date (no packaged JS) |

**Fresh receipts** (`artifact-hashes-1.txt`; build outputs, not committed):

| File (under `android/app/build/outputs/apk/`) | Bytes | SHA-256 |
|---|---|---|
| `dataQa/app-arm64-v8a-dataQa.apk` (phones) | 163,257,936 | `4ff8d67e459bf572598b2d7c922885c3a5f871755b30b1d8b29fe81d42ed8532` |
| `dataQa/app-x86_64-dataQa.apk` (emulators) | 169,577,888 | `e9ec1f09e4b06eddf51e5355d14b634f1aee5c4229b61562572fb2d43da27086` |
| `debug/app-arm64-v8a-debug.apk` (unchanged) | 159,718,559 | `0629c828072dfd5c3f8ab27e0f9838251965d78018dbf9ff32b2a0cc6d2b466e` |
| `debug/app-x86_64-debug.apk` (unchanged) | 166,317,039 | `0756c1236c0a5f1942feb6de651acd470d71606825813629146e8f54d073d63a` |

These replace the P1/P2 builds (`94c5d9ad…9a04`, `9f04fb38…1183`), which no longer exist on disk.

**The packaged JS is the fixed code:**

- Both APKs' packaged `assets/index.android.bundle` hash to `9c284de8ba7aa58fa5029b515d58b4a7bcace85a4c5fc608c6856a57eaeab17b`.
- `bundle-markers-1.txt` finds each of 7 strings once in both bundles. Each is absent from `src` at `8823b11`:
  - the table name `attachment_cleanup`;
  - "listed and tries again";
  - "… not point to this app's attachment storage, so …";
  - "The sign-in changed before every file was removed";
  - "could not confirm that every chat attachment file was removed";
  - "Unreadable attachment cleanup count.";
  - the schema-23 migration description.
- The P1/P2 and F1 controls are present.
- The APK sizes are unchanged, again because of 16 KiB alignment padding; the hashes differ.

**Audits and identity:**

- `apk_audit.py`, both ABIs **PASS**:
  - a single ABI each;
  - bundled JS;
  - Whisper `4baf70dd…` and Silero VAD `7ed98ddb…` present, no missing model, no Kokoro;
  - ELF 16/16 at 16 KiB;
  - 302 stored entries, 0 alignment failures.
- `zipalign -c -P 16 4`: exit 0 on both.
- `aapt2`: `com.lafina.capstone`, versionCode 6, `0.6.0-data-qa`, SDK 36, debuggable. The 32 permission lines are identical to the P1/P2 receipt.
- `apksigner`: v2, one signer, certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`, unchanged.

## Fresh execution vs inspected

- **Fresh in this task:** every run in the two tables above.
- **Inspected, not rerun:**
  - the audit's own logs and receipts;
  - the code paths that write `active_session`, unchanged since ADR-025;
  - `ChatScreen`'s separate "Clear conversation" flow (`grep`).

## Still NOT_RUN, and what stays partial

- **M19 (c)** now covers attachment cleanup on a device. It is NOT_RUN:
  - a failed removal cannot be forced on a stock phone;
  - the restart and crash cases are host-tested only (a real SQLite file, fresh modules), not an Android process death.
- **Unchanged:** M01–M19 device, emulator and live checks are all NOT_RUN.
- **Reviews:** no independent review of `f7e947f` exists yet; this was a self-review.

## Risks and limits

- **Chat's own "Clear conversation" is outside C1.** It still removes files best-effort without obligations, and it does not claim they were removed. A file it fails to remove is not later retried by Clear All Data.
- **The path rule accepts top-level document-storage files** with an extension, other than the two reserved state files. This matches the existing reference-based ownership rule and the audit's synthetic path. If a future feature writes its own top-level files there, it should be added to the reserved list.
- **The process-local generation part of the session epoch** resets at restart (ADR-025). After a restart, admission relies on `active_session.created_at`. Obligations do not depend on the epoch: they are keyed by owner only.
