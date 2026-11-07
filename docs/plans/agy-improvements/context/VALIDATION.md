# Validation, evidence and continuation rules

Run checks against the actual target checkout and work branch. Never transfer donor pass counts, emulator WER, timings, APK hashes or phone claims. Preserve existing tests and add seam-specific characterization/regression tests. Never qualify a physical feature from Jest alone.

## Actual baseline and core gates

Phase 00 inspects package scripts, dependency lock, Android project settings and postinstall before running them. Install target dependencies with `npm ci` if needed and allowed; do not borrow/link another checkout's node_modules for an implementation baseline. Use the project's actual Java/SDK requirements; doctor presence is not compatibility proof.

Primary existing host gate:

```text
npm run preflight
```

Its audited definition runs `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:architecture`. Destination lint uses `--max-warnings 0`; do not loosen it to donor warnings. `npm run format:check` applies where existing baseline formatting permits; format only changed files, not the whole repository. Run coverage for changed safety-critical modules and compare to baseline without reducing existing thresholds. A lower or renamed test count needs a reviewed explanation; count alone is not coverage.

Windows Gradle commands from the target root, using the actual available tasks:

```powershell
& .\android\gradlew.bat -p android :app:testDebugUnitTest --console=plain
& .\android\gradlew.bat -p android :app:assembleDebug --console=plain
```

Discover variant/instrumentation tasks before assuming names. Run relevant native tests for native/storage/alarm/speech changes. Build standalone QA and instrumentation artifacts in phases 11–13. Android tests require a specifically identified authorized emulator; no device is selected merely because it appears first in adb output.

After each phase: targeted tests, applicable complete host gates, affected native/build gates, preserved-feature subset and diff review. Final phase repeats the full suite and all PF01–PF13 contracts on the integrated HEAD. Repeat extra checks only after new changes, failures or unresolved risk; avoid wasteful unchanged loops.

## Required synthetic regression cohorts

- AGY schema-17 fixture: multiple owners, guest, all seven sync types, meeting records, rich Notes/attachments/citation metadata, deleted rows, preferences, outbox/conflicts. Upgrade/reopen and forced rollback at each stage; no data clearing.
- Auth/entitlement matrix: preserve actual per-feature guest/student/student_pro/admin behavior, guest linking, token expiry and delayed old-account callbacks. No real credential or purchase required.
- Sync: request/response contracts for all seven types; push/pull/update/delete/conflict/retry/account switch; triggers/revisions do not create echo loops; old payload omission does not erase new local metadata.
- Assistant commands: every AGY intent and both deterministic/model paths; no mutation on Prepare/Cancel, one mutation after double Confirm, revision/owner/expiry, untimed tasks and ambiguous targets; online/docs/RAG routes still work.
- Delivery: duplicate/stale/collision broadcasts, concurrent due jobs, snooze collisions, source changes/deletes, rollback/native reopen/schema mismatch, legacy registration cutover, owner switch and main-process absence. Permission unavailable is an honest warning, not delivery success.
- Chat/Notes: same-time ordering, invalid/wrong-owner cursors, legacy mixed history, attachments, async stale result, rich normalization/wildcards, partial reorder and conflict drafts.
- Speech/meeting: lease contention in both directions, rejected contender and stale release, cancellation returning late, foreground/background/permission/focus transitions, keepAudio cleanup, optional recognizer unsupported, system/offline voice proof and entitled cloud speech fallback.
- Online preservation with fake adapters: current endpoint/method/body/headers and role/mode/consent gates for Chat/RAG/documents/meetings/speech; no live service claims.

## Device and remote limits

Do not install onto or manipulate a physical phone without a prior explicit test-device designation. This unattended request authorizes deterministic host and owned emulator testing, not experimentation on an attached student's phone. If no authorized emulator/test device exists, create test artifacts/instructions, mark device checks NOT_RUN, and continue independent code work. Do not uninstall, run clear-data, bypass screen locks, alter personal settings or harvest audio.

Offline emulator scenarios must verify emulator identity, APK hash/package/ABI, standalone JS assets, isolated synthetic fixture owner and bounded cleanup. Record prior state and restore only settings the test explicitly changed; if it cannot safely establish offline conditions without changing user state, report NOT_RUN. Never report uncertain cleanup as successful. Failed runs remain in evidence.

No live login, purchase, cloud data mutation, recording upload, deployment or host replacement. Cloud contract tests use synthetic requests/responses and no tokens. If an explicitly preconfigured disposable local backend is available without secrets, tests may target it and label it local; otherwise external integration stays NOT_RUN. Existing remote functions stay enabled in product code.

## Status semantics

Each phase stores these independently:

- implementation: NOT_STARTED, IN_PROGRESS, CODE_COMPLETE, VERIFIED_EXISTING, PARTIAL, DEFERRED_EXTERNAL, DEFERRED_DEPENDENCY or FAILED.
- automated/build/device/live validation: NOT_RUN, PASS, FAIL or PARTIAL (with per-check details).
- continuation: NEXT_PHASE, INDEPENDENT_ONLY or FINAL_HANDOFF.

A report exists ≠ code complete ≠ tests pass ≠ device acceptance. Missing phone/live validation never makes a report PASS; it also does not require an intermediate human approval pause under the owner's current authorization. Known regressions must be repaired or the smallest unit safely deferred. No broken active scheduler, unsafe migration or bypassed entitlement is acceptable as 'partial'.

## Evidence format

Use `reports/evidence/<run-id>/phase-NN/` and new filenames for repeats. Store exact command/working directory, UTC timestamp, tested commit, exit code, command log path, environment summary and result. Redact credentials, real account IDs, schedules, content and device serials. Record non-sensitive device model/API/ABI/page size instead. Never dump environment, tokens, passwords, signing keys or cloud request contents with private data.

Benchmarks include corpus/model/APK/source fingerprints and cold/warm definitions, sample size, failures, median/p95 where applicable. Contract fixtures are not model accuracy; synthetic emulator STT is not real microphone/accent/noise qualification. Mark unsupported metrics N/A or NOT_RUN, never zero by default.
