# AGY-PORT 12: scoped architecture and repeatable evidence

Implementation: CODE_COMPLETE for inventory 23, 24, 27 (scorer) and 28. PARTIAL for 25 (no in-app QA screen or native gate) and 26 (runner built, never run).

| Gate | Status |
|---|---|
| Automation (typecheck, lint, Jest, architecture) | PASS (`preflight-1.log`: 46 suites, 684 passed + 1 opt-in skipped) |
| Tooling tests | PASS: Node 16 (`node-tooling-tests-1.log`: stt-metrics 8 + doctor 8); Python 22 (`python-unittest-1.log`: apk_audit 13 + emulator_qa 9) |
| Mutation checks | Run 1: 11 killed, 1 HARNESS_ERROR (a real sentinel weakness, fixed). Run 2: 12/12 killed, all restored |
| Offline boundary (static) | PASS: 71 offline leaves, 0 violations, 0 approvals needed (`architecture-1.log`) |
| Zero-network sentinel (runtime) | PASS, including the positive control |
| Fresh evaluation evidence | Written: `evaluation-{intent,notes,speech,protected}-1.json`, `qa-sql-1.json` |
| Doctor | Run 1 correctly FAIL (shell `JAVA_HOME` = JDK 25). Run 2, with the build's JDK 17: PASS |
| Planner benchmark | STALE (references a removed `src/core` tree; fails before writing) |
| Native build | NOT_RUN. No native or Gradle change in this phase; the Phase 11 artifacts stand |
| Emulator / phone / Whisper collection | NOT_RUN |
| Live service | NOT_RUN |

| Item | Value |
|---|---|
| Run ID | agy-port-20261106 |
| Base / tested HEAD | Base `574e6e1`. Tested on `574e6e1` + this phase's working tree |
| Result commit | Recorded in RUN-STATE.json and the log (no self-referential SHA) |
| Inventory areas | 23–28 |
| Docs | [AGY evaluation, offline boundary and QA tooling](../../../evaluation/agy-evaluation-and-qa-tooling.md) |
| Graphify | The binary is on PATH, but the checkout has no `graphify-out/graph.json`. The AST scanner and `rg` were the substitute; no graph was claimed |
| Review | Parent self-review only (no independent reviewer) |

## Outcome in plain language

1. **Offline paths are now checked from both sides.**
   - **Static:** `check:architecture` follows every import path from the 71 offline-leaf files (storage, scheduler, on-device NLU/STT/TTS and native bridges), transitively and including dynamic imports. It fails on any path to a network API or an online module.
   - **Runtime:** a sentinel test runs the real local flows with the device reported *online* and every network global trapped:
     - parse → review → Confirm for each create intent;
     - update, delete, acknowledge, snooze and query;
     - Chat with a local command;
     - planner reads, Notes search and voice eligibility.

     Zero calls were made. A positive control proves the sentinel catches a real cloud request.
   - **Nothing was removed to pass.** Chat, documents, meetings and cloud speech stay outside the leaves, and the approval list is empty.
2. **Frozen, fingerprinted AGY fixtures.**
   - Fixtures:
     - 34 intent commands that, with the empty-transcript case, cover all 16 intent types, plus ringing-call routes;
     - the Notes search contract;
     - the offline-voice contract;
     - a PF01–PF13 → named-test map;
     - the STT reference corpus.
   - Editing a frozen file fails the suite until it is added as a new version.
   - Fresh evidence never overwrites a file, stays inside the evidence folder, and records source and fixture hashes.
3. **QA SQL checks run on an owned temporary file.**
   - The 14 checks use AGY's real migrations and stores (schema 22).
   - The report is redacted.
   - Cleanup is verified, and unconfirmed cleanup fails the run.
   - This is **host-only**. The donor's in-app QA screen and its native fixture gate were not ported (PARTIAL; see Deferrals).
4. **Tooling:**
   - **Emulator runner:** gated on a designated emulator, the receipt hash and ABI, an existing install, and offline state. It never uninstalls or clears.
   - **WER scorer:** bounded, with empty and error attempts counted.
   - **Doctor:** reads the requirements from the project and returns a truthful nonzero status.
5. **Real defects found and fixed in this phase's own tooling:**
   - After a failed check, the QA runner left its SQLite handle open, so Windows could not remove the temporary file. The first two failing runs exposed this. It now closes every handle before removal, and mutation P11 proves the test catches a regression.
   - A fire-and-forget `fetch` made the sentinel's rejection unhandled. The Jest worker then crashed before the hit was reported (mutation run 1: P8 HARNESS_ERROR). The rejection is now marked handled, and the hit still fails the test.
   - The boundary scanner's comment named `src/meetings` as an online module that the code does not check. The comment was corrected to match the code.

## Spec checklist

| Spec item | Result |
|---|---|
| 1. Combined policy plus offline transitive/dynamic/network checking; online composition classified; zero-network sentinels; scanner tests | Done. Scanner: 10 tests, real and false-positive cases. Sentinel: 5 tests |
| 2. Frozen command/Notes/speech fixtures with fingerprints; all intents; protected contracts; non-overwriting reports; version changes; contract separate from accuracy | Done (93 tests). Labeled as regression, not model accuracy |
| 3. Isolated QA SQL checks/diagnostics; owned temporary databases; no production allocation; redacted | PARTIAL. Host runner done (6 tests). The in-app screen, native gate and redacted native diagnostics are not ported |
| 4. Emulator runner with gates, bounded waits, scoped cleanup and manual steps | Code and 9 tests done. It never ran (no designated emulator). It seeds no data, so there is no fixture cleanup to verify |
| 5. WER scorer, fingerprints and timings; collection only with approved audio | Scorer done (8 tests). Whisper collection and the test-only native path: NOT_RUN, as no approved audio exists |
| 6. Doctor derives requirements, bounded, no installs or secrets, tested | Done (8 tests, two real runs) |
| 7. Suites run; performance only where valid; Graphify or substitute | Done. No new timing claimed. Planner benchmark STALE. Graphify substitute recorded |

## Files

| File | Change |
|---|---|
| `scripts/offline-boundary.cjs` (new), `scripts/check-architecture.mjs` | Offline-leaf transitive/dynamic network analysis, added to the existing policy check |
| `__tests__/evaluation/offlineBoundary.test.ts` | 10 scanner tests |
| `__tests__/evaluation/offlineNetworkSentinel.test.ts` | Runtime zero-network proof with a positive control |
| `evaluation/*-v1.json`, `evaluation/fixture-manifest-v1.json` | Frozen synthetic fixtures and manifest |
| `__tests__/evaluation/support/evaluationEvidence.ts` | Fingerprint and version verification; exclusive evidence writer |
| `__tests__/evaluation/evaluationContracts.test.ts` | 93 contract tests and optional fresh evidence |
| `__tests__/evaluation/support/qaSqlChecks.ts`, `__tests__/evaluation/qaSqlChecks.test.ts` | Owned temporary-file QA SQL runner and its 6 tests |
| `scripts/emulator_qa.py`, `scripts/tests/test_emulator_qa.py` | Gated emulator runner and 9 tests |
| `scripts/stt-metrics.cjs`, `scripts/tests/stt-metrics.test.cjs` | WER scorer and 8 tests |
| `scripts/doctor.mjs`, `scripts/tests/doctor.test.mjs` | Project-derived, bounded doctor and 8 tests |
| `docs/evaluation/agy-evaluation-and-qa-tooling.md` | What each tool proves and does not prove |

No app runtime file changed. All `src/` files are byte-identical to `574e6e1`; the mutation runs restored each one and verified it by sha256.

## Observed intent limitations (not frozen as correct)

- "mark the task … as not done" becomes a new task with the whole phrase as its title.
- "… every day at 9 pm" keeps "every day" in the title. The fast path parses no recurrence.
- "update note X to Y" sets no new title; "rename note X to Y" does.
- "next friday", said on a Monday, resolves to the Friday of the following week. This is ambiguous and was not frozen.

These are recorded for a later, owner-approved parser change. None was changed here.

## Preserved AGY features

| PF | Evidence | Result |
|---|---|---|
| PF01–PF13 | Full preflight. Every PF is mapped to a named test that must keep existing (`protected-contracts-v1.json`) | PASS |
| PF05 offline scheduling | Fixture over all 16 intents. Sentinel proves zero network for local flows while online | PASS |
| PF06–PF08 online Chat, documents, meetings | Kept outside the offline leaves, not narrowed; boundary test asserts online modules still exist | PASS |

## Commands and evidence

All paths are under `evidence/agy-port-20261106/phase-12/`:

| Command | Result |
|---|---|
| `npm run preflight` | `preflight-1.log` PASS |
| `node --test scripts/tests/stt-metrics.test.cjs scripts/tests/doctor.test.mjs` | `node-tooling-tests-1.log`: 16 pass |
| `python -m unittest discover -s scripts/tests -p "test_*.py" -v` | `python-unittest-1.log`: 22 pass |
| `node scripts/doctor.mjs` | `doctor-1.log`: exit 1 (JDK 25 in `JAVA_HOME`). `doctor-2.log`: with JDK 17, exit 0 |
| `node scripts/check-architecture.mjs` | `architecture-1.log` PASS |
| `node scripts/benchmark-planner.cjs --output …/planner-benchmark-1.json` | `planner-benchmark-1.log`: ENOENT on `src/core/...`; no JSON written |
| `AGY_EVALUATION_OUTPUT=…/evaluation-{kind}-1.json npx jest evaluationContracts`; `AGY_QA_SQL_OUTPUT=…/qa-sql-1.json npx jest qaSqlChecks.test`; sentinel and boundary suites | `evaluation-run-1.log` and the five JSON receipts |
| `python mutate-phase12.py mutation-checks-1.log` / `-2.log` | Run 1: 11/12 killed, P8 HARNESS_ERROR. Run 2: 12/12 killed, restored |
| Removal of this runner's own temp directories after the mutation runs | `mutation-cleanup-1.log` (6 directories in total, each holding only `qa-fixture.db`; none remain) |

## Manual checklist still needed (NOT_RUN)

1. **Emulator smoke** (optional; the owner designates an AVD that holds no needed data):
   - Run `python scripts/emulator_qa.py --serial emulator-5554 --designated-avd <name> --apk android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk --receipt docs/plans/agy-improvements/reports/evidence/agy-port-20261106/phase-11/apk-audit-dataqa-onnx122-x86_64-1.json --output <new json under evidence>`.
   - Expected: every gate PASS; the app launches offline without Metro; the report lists the manual steps.
2. **Manual steps from that report:**
   - planner review: Cancel, Confirm, untimed item, delete;
   - Chat paging and Notes editing and search;
   - a reminder call on a locked screen;
   - the online, document and meeting screens with the network back on.
3. **Whisper accuracy:** only with approved public or consented audio. Record a new STT report with real recognition provenance, never `SCORER_SELF_TEST`.
4. **Doctor on the owner's shell:** `npm run doctor`. If it reports JDK 25, point `JAVA_HOME` to a JDK 17 before a plain `gradlew` build.

## Deferrals

- **Inventory 25, in-app QA (PARTIAL):**
  - the donor's `LafinaQaDiagnosticsModule.kt` native fixture gate;
  - the `QaDiagnostics.tsx` Profile panel;
  - redacted native speech diagnostics.

  All three need new Kotlin, a dataQa-only gate and device validation. The host runner covers the SQL contract meanwhile.
- **Inventory 26 (PARTIAL):** the runner never ran, because no emulator is designated.
- **Inventory 27:** actual recognition collection and the test-only Whisper native path: NOT_RUN.
- **Planner benchmark:** STALE. Rewriting it against AGY's `plannerQueries` is a later task; old baselines are kept unchanged.
- **Next phase:** AGY-PORT 13, unattended under the owner authorization.
