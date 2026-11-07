# Clear All Data remediation: findings P1 and P2 (2026-11-07)

**Status: CODE_COMPLETE (host), AWAITING DEVICE VALIDATION.** The overall run stays **PARTIAL**.

- **Source:** the independent remediation audit `codex-remediation-audit-7b3b183-20261106.md` (verdict REQUEST CHANGES for P1 and P2; F1, F2 and F4 accepted). That report and its evidence directory `evidence/codex-remediation-verification-7b3b183-20261106/` are committed unchanged alongside this report.
- **Audited HEAD:** `7b3b183` on `codex/agy-preservation-improvements`. No newer work existed. The working tree held only the untracked audit files and the instructed never-commit items.
- **Code commit:** `c015719` `fix(agy-audit): account-bound, outcome-reporting Clear All Data (remediation P1/P2)`. This is the tested code, and the APKs were built from it at HEAD `c015719`.
- **Report/tracking and index commits:** recorded in RUN-STATE.json and the run log (no self-referential hash).
- **Evidence:** `evidence/agy-port-20261106/clear-all-data-remediation-20261107/`. Every log is named `-N` and none was overwritten.
- ***Correction, 2026-11-07 (independent audit C1, [codex-clear-data-audit-8823b11-20261107.md](codex-clear-data-audit-8823b11-20261107.md)).*** That audit accepted P1 and the database P2 fix within host scope. It also found that this fix's attachment handling was incomplete: a failed unlink was reported truthfully the first time, but the chat rows holding the only reference were already deleted, so a retry said "Data Cleared" while the file remained. The claims below that the result accounts for attachment files hold for the **first** attempt only. Fixed in `f7e947f` with durable owner-bound cleanup obligations: [attachment-cleanup-remediation.md](attachment-cleanup-remediation.md), ADR-026.
- **Architecture decision:** [ADR-025](../../../decisions/ADR-025-account-bound-data-reset.md).
- **Not done:** nothing was installed on a phone or emulator, and no live service, real account or real user data was used. Nothing was pushed, merged or deployed.

## Root causes

**P1, a stale confirmation deletes the old account's data.**

- `ProfileScreen.handleClearData` built the "Delete Everything" handler from the `userId` prop of that render.
- The handler kept no record of which sign-in created it, and nothing checked the session or the screen's lifetime when it ran.
- The planner, chat and attachment steps took the captured ID at face value. Only `personalMemoryStore.clearForDataReset` has its own owner check, so the event defaults were the only thing that refused.
- So after an account switch, a sign-out, a fresh sign-in as the same account, or an unmount, a retained confirmation deleted the old owner's planner records, chat and document files.

**P2, a read failure reported success.**

- Each planner step listed records through the display getters (`notesStore.getAll`, `tasksStore.getAllTasks`/`getAllEvents`, `timeBlocksStore.getAll`, `remindersStore.getAllReminders`).
- Those getters catch SQL errors, log them and return `[]`, which is correct for a screen that must keep rendering.
- The F3 step helper then "deleted" nothing, nothing threw, and the step counted as cleared. The result: "All personal scheduling data … have been deleted" with the records still present.
- In addition, the steps were separate. A write failure part-way left some tables cleared and others intact, and the only report was "some items may remain".

## Fix (`c015719`)

| Area | Change |
|---|---|
| `src/storage/sessionEpoch.ts` (new) | `readSessionEpoch()` gives the owner plus an epoch: a process-local sign-in generation, `active_session.user_id` and `created_at`. `noteSessionChange()` advances the generation |
| `userStore.setCurrentUser` / `logout`, `guestMigration.linkGuestToCloudAccount` | Call `noteSessionChange()` at every session replacement. Signing in again as the same owner therefore also retires old confirmations, even within the same millisecond |
| `src/storage/accountDataReset.ts` (new) | `authorizeDataReset(userId)` is captured when the confirmation opens. `resetPersonalData(authority, isCurrent)` admits it before any write, inside the planner transaction, and before the chat and defaults steps. Planner deletes go through the existing store deletes in one `transactionSync`, verified by live-row counts before commit. Returns per-step outcomes |
| Strict getters | `getAllOrThrow` (notes, time blocks), `getAllTasksOrThrow`, `getAllEventsOrThrow`, `getAllRemindersOrThrow`. Each shares the exact SQL constant of its display getter, but a failure throws. The display getters are unchanged |
| `chatFiles.removeAttachmentFilesReportingFailures` (new) | Counts files it could not remove; a missing file counts as removed. `removeAttachmentFiles` is unchanged |
| `ProfileScreen` | Captures the authority at open. Liveness is `alive` (cleared on unmount) and the current `userId` ref. Shows "Not Cleared" for a refused confirmation, "Data Cleared" only when every step and file is confirmed, and otherwise "Data Partly Cleared" naming what was and was not cleared, the file count, the existing defaults recovery sentence and "Try Clear All Data again" |

**Decisions:**

- **Admission lives in the operation, not only in the UI.** A future caller without the Profile screen still cannot run a stale or absent authority.
- **No new async gap.** Everything from the final admission check to the last database write is synchronous. The only awaited work is removing files. That comes after, and touches only the files of messages already deleted under the admitted authority.
- **The planner step is all or nothing.** This is a design choice beyond the audit's minimum: it lets the screen say "none of those planner records were changed" truthfully, and makes a retry safe. The write-failure test pins this choice; it does not reproduce an audit finding.
- **Semantics preserved:**
  - deletes still write soft-delete tombstones and `sync_outbox` delete mutations;
  - task/event/block deletes still retire their linked reminders and cancel them natively after the commit;
  - chat ownership and `clearHistory`, the event-defaults reset and its F3 failure report, and the device settings (offline voice, theme, time format) are unchanged.
  - Raw blanket SQL deletes are not used.
- **The generation is process-local.** After a restart, `created_at` alone distinguishes sessions, and no alert survives a restart.

## Tests and results

| Run | Log | Result |
|---|---|---|
| **Pre-fix** reproduction on `7b3b183` (new UI suite + independent audit tests) | `pre-fix-regressions-1.log` | New suite **8 failed / 1 passed of 9**. The one pass is the ordinary success control, which must pass both before and after. Independent tests **2 failed of 2**. Every failure was for the intended reason: stale confirmations deleted A's records; the read failure said "Data Cleared"; the write failure left notes and tasks deleted with reminders remaining; the attachment failure was hidden |
| Typecheck | `typecheck-1.log` | exit 0 |
| Focused lint (changed files) | `lint-focused-1.log` | exit 0, max-warnings 0 |
| Post-fix: new UI suite + `auditA3ClearAllData` + `finalAuditF3ClearAllDataFailure` | `post-fix-focused-1.log` | **3 suites, 15/15 pass** |
| Independent audit tests (their own config, read-only) | `independent-audit-post-fix-1.log` | **2/2 pass**. The audit directory hashes match before and after (`independent-dir-before/after.sha256`), so nothing was written there |
| New storage API suite `accountDataReset` | `storage-api-tests-1..4.log` | Runs 1–3 failed on **test-authoring errors**, kept as written: (1) the seed did not make the owner current, so the event-defaults owner check refused; (2) re-seeding reused tombstoned IDs, a UNIQUE conflict. Run 3 passed 14/14, then the strict-read test was strengthened (see mutation) and run 4 passed **18/18** |
| Mutation of `accountDataReset.ts` (restored, sha256 verified each time) | `mutation-check-1..3.log` | Final run 3: **epoch** killed (3 fail), **liveness** killed (3), **in-transaction check** killed (1), **strict+verify together** killed (1). **strict alone** and **verify alone** survive *by design*: each is a backstop for the other, since a swallowed read leaves a live row that the verify count rejects and rolls back. Run 2 showed the combined mutation surviving, because the injected failure also broke the verify `COUNT` query (both go through `db.executeSync`). The test then injected only into the `SELECT *` listing, per planner table, and run 3 kills it |
| The 29 F1–F3 regressions (4 suites) | `f1-f3-regressions-1.log/.json` | **29/29 pass** |
| Protected gates: `agyPreservedContracts` (PF01–PF13), `evaluationContracts` (frozen v1), `auditA3`, `agyPort09ProfileHealth`, `agyPort09HealthPreferencesStats`, `chatOwnership`, `phase02CalendarAndNotes`, `agyPort10Speech`, `agyPort10OfflineVoice` | `protected-gates-1.log/.json` | **9 suites, 207/207 pass** |
| `npm run preflight` | `preflight-1.log` | **PASS**. Typecheck, lint, Jest **52 suites, 740 passed + 1 skipped** (was 50 suites, 713 + 1; +27 new tests), architecture 217 modules, 0 cycles, 0 forbidden dependencies, 73 offline leaves. The skip is the existing opt-in query-timing benchmark. `console.error` lines: 29, equal to the baseline |

**Coverage of the requested cases:**

- account switch (mounted), unmount, switch + unmount (the audit sequence), sign-out, sign-out + sign-in as the same owner, a same-owner session replacement, guest linking, a null authority, the volatile adapter and an unreadable session all refuse with nothing deleted;
- for refused cases: no outbox deletes, unchanged defaults, no file unlink, no alarm cancel, and the other account untouched;
- a strict read failure for each planner table; a write failure part-way (atomic rollback); a chat failure; a mid-reset loss of the screen (later steps not run, and reported);
- an attachment unlink rejection reported;
- success: exact tombstones and outbox deletes, the linked reminder's alarm cancelled, only A's file removed, defaults fenced, speech settings kept, the other owner untouched, and repeated use within the same sign-in.

**Unchanged:** no original test or assertion was changed, removed or skipped. `git diff 7b3b183 -- evaluation __tests__/evaluation/support android package.json package-lock.json src/cloud` is empty.

## Native checks and QA APKs (one job at a time, one Gradle worker)

About 1.9 GB of RAM was free. The recipes are the documented Phase 11/13 ones: JDK 17, the bundle built from the real path, native work from the `X:` alias, and `skip-prebuilt-bundle.init.gradle`.

| Step | Log | Result |
|---|---|---|
| JS bundle `:app:createBundleDataQaJsAndAssets` | `gradle-bundle-dataqa-1.log` | BUILD SUCCESSFUL, the task **executed** (1 executed, 10 up to date). New bundle `09e25695…a199`, 5,239,236 B (previous `f86e13af…bc67`, 5,231,904 B) |
| dataQa assemble (`--offline`, prebuilt bundle) | `gradle-assemble-dataqa-1.log` | BUILD SUCCESSFUL, 12 executed / 244 up to date; `mergeDataQaAssets` and `packageDataQa` executed; the bundle task was SKIPPED by the init script, as designed |
| Kotlin `:app:testDebugUnitTest --rerun` + `:app:assembleDebug` | `gradle-unit-assemble-debug-1.log`, `kotlin-results-1.txt` | BUILD SUCCESSFUL; the test task **executed**: **43 tests, 6 suites, 0 failures/errors/skips** (XML timestamps 00:33:26Z). The debug APKs were up to date (no packaged JS, no native input changed) |

**Fresh receipts** (`artifact-hashes-1.txt`, written by `artifact-hashes.py`, which refuses to overwrite). Build outputs, not committed:

| File (under `android/app/build/outputs/apk/`) | Bytes | SHA-256 |
|---|---|---|
| `dataQa/app-arm64-v8a-dataQa.apk` (phones) | 163,257,936 | `94c5d9ad7c67feb7698c61bdcc2941a9f5dcd9617299b88a5df8b56d703a9a04` |
| `dataQa/app-x86_64-dataQa.apk` (emulators) | 169,577,888 | `9f04fb3832962ec5a843f20d27785a306a77c974a5486a8de7f2e72880cd1183` |
| `debug/app-arm64-v8a-debug.apk` (unchanged) | 159,718,559 | `0629c828072dfd5c3f8ab27e0f9838251965d78018dbf9ff32b2a0cc6d2b466e` |
| `debug/app-x86_64-debug.apk` (unchanged) | 166,317,039 | `0756c1236c0a5f1942feb6de651acd470d71606825813629146e8f54d073d63a` |

These replace, in place, the dataQa APKs `2502aec3…89ba` (arm64) and `a0bf18e5…91f2` (x86_64), which no longer exist on disk.

**The packaged JS is the fixed code (not inferred from timestamps):**

- The `assets/index.android.bundle` read from inside each dataQa APK hashes to `09e25695a0833f661749b1da78b8782ae547783ccc2ab5c1b5b36711420ea199`, the bundle built from `c015719`.
- `bundle-markers-1.txt` (`bundle-markers.py`, ASCII + Hermes UTF-16LE) finds each of 7 strings once in both bundles. Each string is absent from `src` at `7b3b183`: "Not Cleared", "because the account, sign-in or screen changed", "none of those planner records were changed", "could not be removed from this", `getAllRemindersOrThrow`, "The account or screen changed; nothing was cleared.", "Clear All Data left planner records behind.". The controls "Data Partly Cleared" and "Starting Preview" (F1/F3) are still present.
- The APK byte sizes equal the previous build's although the bundle grew by 7,332 B: the following entries are 16 KiB-aligned and the padding absorbed it. The file hashes differ.

**Audits and identity:**

- `apk_audit.py`, both ABIs **PASS** (`apk-audit-*-1.json`):
  - bundled JS present;
  - Whisper `ggml-base.en-q5_1.bin` (`4baf70dd…dd2f`) and `silero_vad.onnx` (`7ed98ddb…2c49`) present, no missing models, no Kokoro entries;
  - ELF: 16/16 libraries pass the 16 KiB check;
  - ZIP: 302 stored entries, 0 alignment failures.
- `zipalign -c -P 16 4`: exit 0 on both (`sdk-tools-1.log`).
- `aapt2`: `com.lafina.capstone`, versionCode 6, versionName `0.6.0-data-qa`, target/compile SDK 36, debuggable. The 32 permission lines are identical to the previous receipt.
- `apksigner` (PowerShell + JDK 17, output captured): v2 verified, one signer `CN=Android Debug`, certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`, unchanged.
- Unchanged: ONNX Runtime 1.22.0, `android/`, `package.json`/lock, signing references, cloud hosts and wire.

## What was rerun and what was only inspected

- **Rerun:** everything in the two tables above.
- **Inspected, not rerun:**
  - guest linking's session rewrite, beyond the new test that links a guest;
  - the `commandReview.readOwnerEpoch` precedent;
  - that `resetPersonalData`/`authorizeDataReset` have no caller other than Profile, and which code paths write `active_session` (`grep`).

## Still NOT_RUN, and what stays partial

- **M19 (new), on a device:** a stale confirmation refused, a normal Clear All Data, the reminder that is no longer delivered. Whether Android keeps an `Alert` on screen across a sign-out at all was not observed; if it does not, the stale case cannot be reached by hand on a device.
- **Failure cases:** the read, write and attachment failure cases are **host-tested only**. There is no device fault-injection point.
- **Unchanged:** every M01–M18 device, emulator and live check remains NOT_RUN.
- **Reviews:** no independent review of `c015719` exists yet; this was a self-review.

## Risks

- **A held confirmation is now refused** after any sign-in change, including signing in again as the same account. This is intentional, and the user sees "Not Cleared" with what to do next.
- **Alarm cancellation is still best-effort.** It runs after commit, as for any delete. The process-death window in ADR-023 is unchanged.
- **The same-session check depends on every session writer.** Admission compares `active_session` with the generation. A future code path that rewrites `active_session` without `noteSessionChange()` would still change `created_at`, except within the same millisecond as the same owner. The three code paths that replace the session today (`setCurrentUser`, `logout`, guest linking; checked with `grep`) all call it. The other `active_session` writes are in-session `UPDATE`s of tokens and of the pending cloud credential. They keep the owner and `created_at`, and deliberately do not retire a confirmation.
