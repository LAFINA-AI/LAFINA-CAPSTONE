# AGY-PORT 01 — storage resilience and migration foundation

Implementation: CODE_COMPLETE

Automation: PASS. Build: Android unit-test task PASS but UP-TO-DATE (no native input changed, so nothing re-executed). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: agy-port-20261106 / 2026-11-05T18:37Z (last gate run)
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: `5f0ac399308bcbc8a432672bfa4976826eba9a4d` plus this phase's uncommitted working tree
Phase result commit: recorded by the parent in RUN-STATE.json and the log
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), current starting prompt.
Inventory areas / prerequisites: 1 / AGY-PORT 00 complete.

## Outcome in plain language

If local storage cannot be opened or trusted, LAFINA now says so on a recovery screen instead of acting like an empty app that silently discards everything. Writes are rejected rather than pretending to succeed. A file from a newer build, or a damaged one, is left untouched.

Schema setup is now one atomic transaction, so a failure leaves the previous version and every row in place. The schema stays at version 17, because nothing in it needed to change.

Accounts, entitlements, guest linking, sync, chat, citations, attachments and meetings were not removed or altered. They are covered by host automation only. Nothing here has run on a phone.

## Checklist and changes

| Requirement | Result | File/module | Reason / intentional behavior change |
|---|---|---|---|
| Failing regression tests first | implemented | `storageResilience`, `schemaMigrations` | Before the fix, 35 of 40 failed, and the import-write test also failed first. `storageRecovery.test.tsx` was written alongside its UI fix and was not observed failing first |
| Confirm the driver's API | implemented | `database.ts` | Read from op-sqlite 16.2.0 source: it throws at import without bindings, so it now loads inside the guarded open. No device run |
| Test-only volatile adapter | implemented | `database.ts` | `setFallbackForTesting` throws unless `NODE_ENV === 'test'` |
| Unavailable state rejects writes | implemented | `database.ts` | `StorageUnavailableError`, `getHealth()`, `subscribeHealth()`, `reopen()` |
| Recoverable UI, no fabricated saves | implemented | `App.tsx`, `StorageRecoveryScreen.tsx`, `WelcomeScreen.tsx`, `useNotesData.ts`, `userStore.ts` | The new recovery screen has a retry and no clear-data action. Guest start shows an inline error. A failed note save keeps the editor and text. A failed reorder says so |
| Hidden write failures | implemented | `userStore.createGuestUser`, `notesStore.updateOrder`, `localSettingsStore.set` | The first two now throw. `set` returns a boolean; existing callers do not check it yet |
| Typed transaction lifetime, after-commit | implemented | `database.ts` | Handle expiry, nesting and async refusal. After-commit work runs only after COMMIT, and its errors are logged, not thrown |
| Quarantine after failed rollback | implemented | `database.ts` | SQLite's automatic rollback does not quarantine |
| Single atomic migration sequence | implemented | `dbInit.ts` | `SCHEMA_MIGRATIONS` (empty), `validateMigrationSequence` |
| Refuse future/malformed before writes | implemented | `dbInit.ts`, `userStore.ts` | Also removed an import-time `CREATE TABLE active_session` that ran before any check. The baseline already creates that table |
| Bounded readiness check | implemented | `dbInit.ts` | `quick_check(1)` limits reported errors, not time. See risks |
| Journal/busy ADR | implemented | [ADR-016](../../../decisions/ADR-016-storage-resilience-and-migrations.md) | Includes the separate-process constraint for Phase 03 |
| Synthetic fixtures, upgrade, reopen, forced failures | implemented | `__tests__/fixtures/schema17Fixture.ts`, `sqliteFile.ts`, `schemaMigrations.test.ts` | Built from the frozen `agySchema17.sql`, which is unchanged. Synthetic rows only |
| Store call-site audit | implemented | all `transactionSync` sites | Scripted scan of 38 call sites: none async, awaiting, nesting or using outer `db` in the callback body. Named `applyInsert`/`applyDelete` callbacks take the executor as a parameter. Deeper helpers were not traced individually |
| Sync guard | implemented | `syncWorker.ts` | `runSyncPass` deactivates with "Local only" before reading a session when storage is not durable |

## Provenance and compatibility

Donor `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`, read with `git show` only. Concepts were adapted and no source was copied. The donor's JS fallback SQL engine and full initializer were deliberately excluded.

| Donor path | Blob |
|---|---|
| `src/storage/database.ts` | `331693e6c9e793bfbc9bdee31f76fe2e1929fd82` |
| `src/storage/dbInit.ts` | `4716f06f8f88a06a3584f02c01a0289ce12915d1` |
| `__tests__/storage/dbResilience.test.ts` | `ea5f5a68f2004ca374a726d28943e99cfd1dfaab` |
| `__tests__/storage/transactionSafety.test.ts` | `69dec21820a8aadc0aa84a0f0e0afad3b69aacc7` |
| `__tests__/storage/fallbackSyncSafety.test.ts` | `742f1e5f18f1c7db8a66bf508aaf7668f98d88f2` |
| `docs/decisions/ADR-001-ustp-durable-delivery.md` | `4154a50f531dab646593cbbf0d96971f58ad1aeb` |

Schema version is unchanged at 17. Native code, wire format, entitlements and default engines are unchanged. `foreign_keys=ON` was already set at baseline. New pragmas: `busy_timeout=5000`, `synchronous=FULL`, `journal_mode=DELETE`.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF01 | PASS | `phase01Storage`, `phase01AuthAndProfileScreens`, `storageRecovery` | PASS | Device NOT_RUN |
| PF02 | PASS | preservation PF02, `phase05`, `phase09`; fixture store reads | PASS | Device and live NOT_RUN |
| PF03 | PASS | preservation PF03, `phase02` | PASS | Device NOT_RUN |
| PF04 | PASS | preservation PF04; fixture outbox reads; sync guard test | PASS | Live sync NOT_RUN |
| PF07 | PASS | `phase09`, preservation PF07; fixture rows byte-identical | PASS | Device NOT_RUN |
| PF08 | PASS | `phase09`; fixture meeting rows byte-identical | PASS | Device NOT_RUN |
| PF12 | PARTIAL | `storageResilience`, `schemaMigrations`, `storageRecovery` | PASS; the known no-op fallback defect is fixed | Device NOT_RUN |

## Commands and evidence

Evidence directory: `evidence/agy-port-20261106/phase-01/`. Times marked `~` are approximate.

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| 18:22Z / repo root | `npx jest __tests__/storage/storageResilience __tests__/storage/schemaMigrations --runInBand` (before the fix) | `5f0ac39` + tree | 35 failed, 5 passed of 40, as intended | `regression-before-fix.log` |
| ~18:28Z / repo root | `npx jest __tests__/storage/schemaMigrations -t "importing the storage" --runInBand` (before the fix) | `5f0ac39` + tree | 1 failed, as intended | `regression-import-write-before-fix.log` |
| ~18:31Z / repo root | `npm run preflight` | `5f0ac39` + tree | exit 2: TS error in a new test; fixed | `preflight-attempt1-typecheck-failure.log` |
| 18:33Z / repo root | `npm run preflight` | `5f0ac39` + tree | exit 1: lint, helper named like a hook; renamed | `preflight-attempt2-lint-failure.log` |
| ~18:36Z / repo root | `npm run preflight` | `5f0ac39` + final tree | exit 0: typecheck, lint, 19 suites, 248 tests passed, architecture PASS (180 modules, 0 forbidden dependencies) | `preflight-final.log` |
| ~18:37Z / repo root | `npx jest __tests__/storage/storageResilience __tests__/storage/schemaMigrations __tests__/ui/storageRecovery __tests__/preservation --runInBand --json --outputFile=<evidence>` | `5f0ac39` + final tree | 85 passed, 0 failed, 4 suites | `phase-01-targeted-jest.json` |
| ~18:31Z / repo root | `gradle-x.ps1 <log> :app:testDebugUnitTest --console=plain` | `5f0ac39` + tree | BUILD SUCCESSFUL, 186 tasks all UP-TO-DATE, so no native test re-executed | `gradle-testDebugUnitTest.log` |

Counts: all 194 earlier tests still pass, plus 54 new (26 + 15 + 13). No existing test was changed or removed. Prettier was already failing on 182 files at baseline and is not part of preflight.

## Native, performance and device facts

No artifact was produced and no device was used. Tests use real SQLite through `node:sqlite`, not op-sqlite. PRAGMA result shapes, `close()`, open-failure behavior, startup `quick_check` time and commit time on Android are NOT_RUN. No Kotlin or C++ code opens `lafina.db` today (search of `android/app/src`).

## Review findings and decisions

Self-review by the implementer on 2026-11-06; no independent reviewer. No routes removed, no tests weakened.

Found and fixed during the phase:

- `userStore` ran `CREATE TABLE` at import, before any refusal could run. This broke "no writes before refusal" and only showed up once a test logged every statement.
- Errors from native modules may not be `instanceof Error`, which misclassified a corrupt file. The classifier now reads the message safely.
- `synchronous=FULL` reads the file, so it moved after the refusals.

Remaining risks:

- **Thrown writes in other UI handlers.** Only guest start, note save and note reorder gained failure handling. Others (calendar, for example) still let an unexpected SQL error such as disk full reach the handler uncaught, as they did before. When storage is unavailable or quarantined the recovery screen already blocks them, so this affects errors that do not change health.
- **Reads hide transient failures.** Stores still catch read errors and return empty or null. The recovery screen covers unavailable and quarantined states. `userStore.login` also maps a storage error to "no match", which is reachable only if the read fails while health is still ready.
- **Forced-failure coverage is sampled.** The test covers about 25 evenly spaced statements plus the last 7 including COMMIT, not every statement.
- **`quick_check` cost grows with file size** and runs on the JS thread at launch. Not measured.
- **`localSettingsStore.set` callers ignore its result**, so a failed preference can look saved for the session. These are non-critical preferences (chat online mode, notes filter, tour state).
- **`remindersStore.updatePreCachedAudioPath` still swallows errors.** It is a rebuildable audio cache, not user data.
- **Formatting is uneven.** `App.tsx`, `syncWorker.ts`, `WelcomeScreen.tsx` and `useNotesData.ts` were left unformatted because Prettier would change 61–501 unrelated lines in each. `userStore.ts`, `notesStore.ts` and `index.ts` were formatted, so their diffs include style noise on top of the logic change.

## Manual checklist still needed

Current execution status: all NOT_RUN. Use only an authorized test phone with synthetic data.

1. Install/open: NO ARTIFACT PRODUCED. Build the debug artifact from this tree and install it over an existing AGY debug install holding synthetic data.
2. Reopen: open the app. Expected: same account, tasks, notes, chat and meetings, with no welcome or recovery screen.
3. Save: create a task and a note, force-stop, reopen. Expected: both are still there.
4. Failure, on a throwaway install only, because this destroys that install's data. With the app force-stopped, run `adb shell run-as com.lafina.capstone.debug sh -c "echo not-a-database > databases/lafina.db"` and open the app. Expected: "LAFINA can't open your data" and no welcome screen. Press Try again. Expected: the same screen plus "That didn't work yet". Uninstall the throwaway install afterwards.
5. During step 4, check logcat for the driver's error text. It should show the real driver reaching the same failure path.

## Deferrals and continuation

Device verification of the driver's behavior is deferred to the manual gate (M01, M02). No runtime experiment is left active.

Next action: NEXT_PHASE, AGY-PORT 02, once the parent commits this phase. No human review pause under this pack's authorization.

## Independent review (parent addendum)

A separate read-only reviewer (forked, same model) checked the stable diff against base `5f0ac39`. No high-severity findings.

- Low: `StorageRecoveryScreen` retry updated state after unmount and left a rejected `onRetry` unhandled. **Fixed by the parent:** a mounted ref guards the state update and the rejection is caught and logged. The `storageRecovery` and App suites still pass (14 tests).
- Low, accepted: `ChatScreen` and `useNotesData` ignore the new boolean from `localSettingsStore.set`, so a failed toggle save looks saved until relaunch. This is pre-port behavior; it is recorded rather than fixed here.
- Low, accepted: repo-config Prettier reformatting inflates the `dbInit`, `userStore`, `notesStore` and `index` diffs. Behavior is unchanged; the reviewer confirmed the 34 baseline statements and 20 column upgrades are identical, in the same order.

The reviewer confirmed against op-sqlite 16.2.0 source that pragma rows, `quick_check` and `close` behave as the code assumes. The parent re-ran `npm run preflight`: exit 0, 19 suites, 248 tests (`evidence/agy-port-20261106/phase-01/parent-preflight.log`).
