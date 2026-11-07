# Attachment-queue fairness remediation: finding C2 (2026-11-07)

**Status: CODE_COMPLETE (host), AWAITING DEVICE VALIDATION.** The overall run stays **PARTIAL**.

- **Source:** the independent audit [codex-attachment-cleanup-audit-69aafcd-20261107.md](codex-attachment-cleanup-audit-69aafcd-20261107.md).
  - It accepted C1 within host scope.
  - It requested changes for **C2 [P2]**: persistent failures at the front of the cleanup queue starved removable files indefinitely.
  - That report and its evidence directory `evidence/codex-attachment-cleanup-audit-69aafcd-20261107/` are committed unchanged with this report. Their file hashes match before and after this work (`independent-audit-dirs-before/after.sha256`, which also cover the two earlier independent audit directories).
    - A labelled copy with directory prefixes is in `independent-audit-dirs-verify-1.sha256`.
    - Git stores the 17 CRLF text files among them LF-normalized (`core.autocrlf=true`), as it did for the earlier audit directories. A checkout here reproduces the verified working-tree bytes.
- **Audited HEAD:** `69aafcd` on `codex/agy-preservation-improvements`. No newer work existed. The working tree held only the untracked audit files and the instructed never-commit items.
- **Code commit:** `acfd8fc` `fix(agy-audit): fair durable turn order for attachment cleanup (audit C2)`. It includes the ADR-026 amendment. This is the tested code, and the APKs were built from it at HEAD `acfd8fc`.
- **Report/tracking and index commits:** recorded in RUN-STATE.json and the run log.
- **Evidence:** `evidence/agy-port-20261106/attachment-queue-fairness-remediation-20261107/`. Every command, its time and exit code are in `execution-log.md`. Every log is new and numbered, and none was overwritten.
- **Architecture decision:** [ADR-026, amendment "fair turn order"](../../../decisions/ADR-026-durable-attachment-cleanup.md#amendment-2026-11-07-fair-turn-order-audit-c2). The C1 report's "more than 50 saved" recovery line carries a dated correction.
- **Not done:** nothing was installed on a phone or emulator. No live service, real account or real user data was used. Nothing was pushed, merged or deployed.

## Why the original selection starved later entries

`pendingAttachmentCleanup` ordered rows by `recorded_at ASC, path ASC`, and `runAttachmentCleanup` took the first 50 of them. Neither value ever changes for a row.

- A failed unlink kept its row and updated `attempts` and `last_attempt_at`. Neither column was used for selection.
- A refused saved path was skipped without even that bookkeeping.

So while the first 50 rows kept failing, every explicit retry selected exactly the same 50 again, and row 51 was never attempted. The audit reproduced this with 51 synthetic paths; the unchanged test fails at `69aafcd` (`pre-fix-independent-fairness-1.log`):

```
{"first":{"removed":0,"pending":51},"second":{"removed":0,"pending":51},"lastFileStillPresent":true,"lastFileAttempted":false}
```

Ordering by `last_attempt_at` would not be enough. With a frozen or coarse clock, every row attempted in one pass gets the same timestamp, and the tie falls back to the same immutable order.

## Fix (`acfd8fc`)

| Area | Change |
|---|---|
| Schema 24 (`attachmentCleanupSchema.ts`, `dbInit.ts`) | `ALTER TABLE attachment_cleanup ADD COLUMN queue_order INTEGER NOT NULL DEFAULT 0`, then `UPDATE … SET queue_order = attempts`. It runs through the existing single-transaction migration chain, as the next integer step, guarded by a column check. Additive: no row or column is changed except the new one. Rows saved under schema 23 that the old order never reached (attempts 0) go first |
| `recordAttachmentCleanup` | A new obligation joins the back of its owner's queue: `queue_order = MAX(queue_order) + 1` for that owner, in the same chat-delete transaction as before. `INSERT OR IGNORE` is unchanged, so a re-recorded path keeps its place and attempts |
| Selection | `SELECT path … WHERE user_id = ? ORDER BY queue_order, recorded_at, path LIMIT 50`. The path is unique per owner, so the order is total and deterministic |
| Each selected row | **The attempt is saved first:** `attempts + 1`, `last_attempt_at`, and the row moves to the owner's back. Then the C1 steps run unchanged: re-check the path rules, treat a missing file as done, check that the target is a regular file, unlink, retire. So a failed unlink, a directory target and a refused saved path all yield their turn. None is deleted or dropped: each stays saved and is counted as pending |
| Bookkeeping failure | The result gains `unsaved`. If the attempt cannot be saved, **the file is not touched**, the row keeps its place, and the pass moves to the next row. A removed file whose row could not be retired also counts as unsaved; the row has already yielded, and a later pass finds the file absent and retires it |
| Ownership | Claim and retire are keyed by owner. `removed` counts only real retirements (`rowsAffected`). A row that moved to another owner mid-pass is neither attempted nor counted |
| Overlapping same-owner passes | Profile awaits the pass, so two Clear All Data presses can overlap. A pass requested while another runs for the same owner now starts after it (an in-process per-owner chain). They never work on the same rows or report each other's in-flight files as pending. This is mutual exclusion only; fairness lives in the database. Different owners never wait for each other |
| `ProfileScreen` | When `unsaved > 0`: "This phone could not save its cleanup progress for N chat attachment file(s); it stays/they stay listed for the next Clear All Data." plus "Try Clear All Data again.", and never "Data Cleared". The other C1 messages are unchanged |

**How fairness survives restarts, ties and interruptions:**

- **Restarts:** the turn order is a column in `lafina.db`. A fresh process (tested with a real SQLite file and a fresh module registry) continues behind the obligations that were already tried.
- **Ties and a frozen clock:** selection never reads the clock. Equal `recorded_at` and equal `last_attempt_at` values are broken by the moving `queue_order`, then by the unique path. Tested with `toISOString` frozen.
- **Interruption after an attempt is saved** (the process stops while the file is handled): that row is already at the back and still saved. The next launch starts with the others and reaches it later.
- **Interruption before it is saved:** the row keeps its place and goes first next time. Nothing is lost.
- **A sign-in change mid-pass:** rows not reached keep their places. The row in progress has yielded.

**What happens when bookkeeping fails:** see the table above. The pass never claims progress it could not save, and Profile reports it. The work is recoverable: once writes succeed again, the next explicit Clear All Data continues. There is no automatic retry.

**Why the bound and ownership guarantees stay intact:**

- The pass still selects at most 50 rows (`LIMIT`) and attempts each at most once.
- There is no loop, timer, poller, background work or unlimited retry. Each retry is still an explicit Clear All Data.
- Every statement is keyed by the authority's owner, and the ADR-025 session check still runs before each file.
- Turn numbers are per owner, so one owner's queue never affects another's.
- Guest linking is unchanged: rows move with their `queue_order`, and ties are broken as above.
- **The fairness bound:** with `N` saved obligations, any `N` consecutive selections cover all of them. So each obligation is attempted within ⌈N / 50⌉ passes, and a new obligation waits only behind those already saved.

**Kept unchanged:**

- ADR-025 admission and stale-confirmation protection;
- strict planner reads and atomic rollback;
- C1's transactional recording, its retirement only after confirmed removal or absence, its path rules and its regular-file check;
- the partial-success and F3 event-default wording;
- device settings;
- the F1 Preview admission and the F2 ducking fixes.

`git diff 69aafcd acfd8fc` is empty for:

- `src/ai`, `src/skills`, `src/cloud`, `src/sync`;
- `android/`, `package.json` and the lock file;
- `evaluation/`, `__tests__/evaluation`, `__tests__/fixtures` and `jest.setup.js`;
- `accountDataReset.ts`, `guestMigration.ts` and `ChatScreen.tsx`.

The only changed files are the four source files, the four test files and ADR-026.

## Tests

| Run (fresh) | Log | Result |
|---|---|---|
| **Pre-fix**, unchanged independent queue-progress test, at `69aafcd` | `pre-fix-independent-fairness-1.log` | **1/1 FAILED**, at `expect(files.has(last)).toBe(false)` |
| The same test, post-fix | `post-fix-independent-fairness-1.log` | 1/1 pass. The second pass removes the last file (`{removed:1,pending:50}`) |
| Existing cleanup suites before updating them | `post-fix-existing-1.log` | **13 failed / 51 passed**, kept (see below) |
| New and updated suites | `new-suites-1.log`, `ui-cleanup-tests-1.log`, `new-suites-2.log` | 60/60, 8/8, then **69/69** after the final simplification |
| Mutation check (`mutate-fairness.py`, 15 mutations) | `mutation-check-1.log` | **15/15 killed**, every file restored (sha256 verified). The independent C2 test alone kills 3 of them: `immutable-order`, `attempt-keeps-place` and `unbounded` |
| **All four independent audit tests**, unchanged, each with its own config: `independentClearData` (2), `independentAttachmentRetry` (1), `independentCleanupFairness` (1) | `independent-tests-post-fix-1.log` | **4/4 pass** |
| The audit's 18 focused and protected suites, plus the new fairness suite | `focused-and-preservation-1.log/.json` | **19 suites, 348/348**: the audit's 327 plus 21 new |
| `npm run preflight` (768 MB heap) | `preflight-1.log` | **PASS**: typecheck, lint, Jest **55 suites, 809 passed + 1 skipped** (C1: 54, 788 + 1). The skip is the existing opt-in benchmark. Architecture: 219 modules, 0 cycles, 0 forbidden, 75 offline leaves |

The audit's 18-suite set includes:

- the protected AGY contracts (PF01–PF13 preservation, frozen evaluation contracts, chat ownership, profile/health/preferences, calendar/notes, speech);
- the earlier reset regressions (A3, F3, P1/P2 remediation, `accountDataReset`);
- the F1 Preview and F2 ducking regressions;
- schema migrations;
- the C1 suites.

**New permanent regressions** (`__tests__/storage/attachmentCleanupFairness.test.ts`, 18 tests, plus 3 in `clearDataAttachmentCleanup`):

- **Persistent failures ahead of removable files:**
  - 60 persistent failures ahead of 3 removable files, all with an equal `recorded_at` and a frozen clock. The files are removed by pass 2, each pass looks at ≤ 50 distinct paths, and every failure stays saved and untouched.
  - 120 failures over three rounds: every obligation is attempted within ⌈120 / 50⌉ passes in each round, and attempt counts never differ by more than 1.
- **Refused and directory rows:** 30 refused saved paths and 25 directory targets ahead of a valid file. The valid file is removed on pass 2. The refused paths are never `exists`-checked, the directories are never unlinked, all stay pending, and `attempts` advances.
- **Arrivals between passes:** new obligations join the back and are reached exactly when the 55 ahead have had their turn. Later arrivals do not push older ones back.
- **Duplicates:** a re-recorded path keeps its row unchanged. Repeated passes are idempotent, and the final pass is a clean `{removed:0,pending:0}`.
- **Ownership:**
  - another owner's queue and files are untouched;
  - turn numbering is per owner;
  - a sign-in change mid-pass leaves unreached rows at the front, and only the attempted one moves;
  - rows moved to another owner mid-pass are neither attempted nor counted.
- **Bookkeeping failures:**
  - when no attempt can be saved: no file touched, rows unchanged, `unsaved: 3`, then recovery;
  - one row's attempt cannot be saved: the others progress;
  - a removed file whose retirement fails: `unsaved: 1`, and the next pass retires it without an unlink;
  - an unreadable queue: `pending: null`.
- **Overlapping passes:** a second pass for the same owner starts only after the first, with no double work or count. Another owner's pass does not wait.
- **Restarts** (a real SQLite file, fresh modules):
  - the queue continues behind the failures after reopening;
  - a crash after the attempt is saved (the process hangs in the file check, then the database is closed);
  - a crash before the attempt is saved (the write fails and the pass stops);
  - a schema-23 database with C1-era rows upgrades additively to 24, and the starved row goes first.
- **Profile:**
  - 50 failures plus 1 removable file: exact counts of 51, then 50;
  - unsaved progress in the plural and the singular is never "Data Cleared", and the retry then reaches "Data Cleared".

**Changes to existing test files** (exact diff in `existing-test-changes.diff`):

- `attachmentCleanup.test.ts`: 18 exact `toEqual` results gain the new interface field. Seventeen gain `unsaved: 0`. The retire-failure case gains `unsaved: 1`, which is a stricter check of the same behavior.
  - They sit in the 13 tests that failed in `post-fix-existing-1`. A test stops at its first failing assertion, so 13 failures cover 18 results.
  - No other value changed, and no assertion was removed.
- `clearDataAttachmentCleanup.test.tsx`: only the three new cases were appended.
- `schemaMigrations.test.ts`: one comment, "18-23" → "18-24". The test passes unchanged against schema 24, because the new column belongs to a table added after schema 17.
- No skip was added, and no frozen fixture was changed.

**Note on `console.error` lines:** preflight printed 30 (C1: 31; before that, 29). By their position in the log, they belong to eight suites this change does not touch:

- `App`;
- `agyPort06PlannerReplies`;
- `phase08ChatAndOrchestrator`;
- `qaSqlChecks`;
- `agyPreservedContracts`;
- `callDispatcherAndCallScreen`;
- `agyPort05Drafts`;
- `phase02CalendarAndNotesScreens`.

None is placed with a cleanup suite. The new restart tests silence their expected storage errors, as C1's did.

## Native checks and QA APKs (one job at a time, one Gradle worker)

The recipe is the documented one: JDK 17, the bundle from the real path, native work from the `X:` alias, and `skip-prebuilt-bundle.init.gradle`.

| Step | Log | Result |
|---|---|---|
| JS bundle | `gradle-bundle-dataqa-1.log` | BUILD SUCCESSFUL, the task **executed**. Bundle `45c434eb…789a`, 5,247,524 B (C1: `9c284de8…b17b`) |
| dataQa assemble | `gradle-assemble-dataqa-1.log` | BUILD SUCCESSFUL, 12 executed / 244 up to date. `mergeDataQaAssets` and `packageDataQa` executed |
| Kotlin `testDebugUnitTest --rerun` + `assembleDebug` | `gradle-unit-assemble-debug-1.log`, `kotlin-results-1.txt` | **43 tests, 6 suites, 0 failures/errors/skips**, executed 03:36:27Z. The debug APKs were up to date (they package no JS) |

**Fresh receipts** (`artifact-hashes-1.txt`; build outputs, not committed):

| File (under `android/app/build/outputs/apk/`) | Bytes | SHA-256 |
|---|---|---|
| `dataQa/app-arm64-v8a-dataQa.apk` (phones) | 163,257,936 | `ae0b4cc1c0222561fef6897db4eea0e83504f7db161cc026f06d2e3be09c789b` |
| `dataQa/app-x86_64-dataQa.apk` (emulators) | 169,577,888 | `3f523ba79a05172c77c941476713d3d5bbfc6178d1b832aa5fa090f6cc229928` |
| `debug/app-arm64-v8a-debug.apk` (unchanged) | 159,718,559 | `0629c828072dfd5c3f8ab27e0f9838251965d78018dbf9ff32b2a0cc6d2b466e` |
| `debug/app-x86_64-debug.apk` (unchanged) | 166,317,039 | `0756c1236c0a5f1942feb6de651acd470d71606825813629146e8f54d073d63a` |

These replace the C1 dataQa builds (`4ff8d67e…8532`, `e9ec1f09…7086`), which no longer exist on disk.

**The packaged JS is the fair-selection code, not the timestamp order:**

- Both APKs' packaged `assets/index.android.bundle` hash to `45c434ebef1d348dcfc68158cb9cfc18362565f347d78fa752da1963f74a789a`, equal to the prebuilt bundle.
- `bundle-markers-1.txt` checks ASCII and UTF-16LE in both bundles:
  - It finds each of 8 fix-only strings, each absent from `src` at `69aafcd`:
    - `queue_order`;
    - the queue order `… ASC, recorded_at ASC, path ASC`;
    - the claim `SET attempts = attempts + 1, last_attempt_at = ?, …`;
    - the two new warnings;
    - the unsaved-progress message pieces;
    - the schema-24 description.
  - The C2 defect's order `ORDER BY recorded_at ASC, path ASC` is found **0 times**.
  - The C1, P1/P2 and F1 controls are present.
- These string checks corroborate the bundle contents. They are not a runtime test.

**Audits and identity:**

- `apk_audit.py`, both ABIs **PASS**:
  - a single ABI each;
  - bundled JS;
  - Whisper `4baf70dd…` and Silero VAD `7ed98ddb…` present, no missing model, no Kokoro entry;
  - ELF 16/16 at 16 KiB;
  - 302 stored entries, 0 alignment failures.
- `zipalign -c -P 16 4`: exit 0 on both.
- `apksigner`: v2, one signer, certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`, unchanged.
- `aapt2`: `com.lafina.capstone`, versionCode 6, `0.6.0-data-qa`, target SDK 36, debuggable. The 32 permission lines are identical to the C1 receipt.
- The APK sizes are unchanged because of 16 KiB alignment padding; the hashes differ.
- Nothing was installed.

## Fresh execution vs inspected

- **Fresh in this task:** every run in the tables above (see `execution-log.md`).
- **Inspected, not rerun:**
  - the auditor's logs and receipts;
  - Profile's alert flow, for overlapping presses: the confirmation closes before the pass, so a second Clear All Data can start while it runs.

## Still NOT_RUN, and what stays partial

- **M19 (e)** (added to MANUAL-QA) is NOT_RUN. It cannot be reached on a stock phone: it needs more than 50 persistent unlink failures. The fairness, restart and crash cases are host-tested only: a real SQLite file with fresh modules, which is **not** Android process-death validation.
- **Unchanged:** M01–M19 device, emulator and live checks are all NOT_RUN.
- **Reviews:** no independent review of `acfd8fc` exists yet; this was a self-review.

## Risks and limits

- **Same-path reuse.** If a new file were saved at the exact path of an obligation, between that obligation's unlink and its retirement, `INSERT OR IGNORE` would merge the new reference into the row being retired. This needs a generated file to reuse an exact name within milliseconds. It is unchanged from C1 and recorded in ADR-026.
- **The overlap guard is per process.** That matches the app (one JS runtime); it is not a cross-process lock.
- **A failure confined to one row's bookkeeping** keeps that row at the front, where it uses one of the 50 slots on every pass. The other 49 slots still rotate, and the failure is reported as `unsaved`. A database refusing all writes makes no progress and says so.
- **Chat's own "Clear conversation"** is still outside this change. It removes files best-effort without obligations, as documented for C1.
