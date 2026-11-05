# AGY-PORT 00 — baseline and preservation contracts

Implementation: CODE_COMPLETE (characterization tests, inventories and scoped instruction notice; no product code changed)

Automation: PASS. Build: PASS (after two environment workarounds, below). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: agy-port-20261106 / 2026-11-05T18:10Z start
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: `b9433dc39d172f30ba26ea68e4a9c9eedd922407` plus the working-tree changes this phase commits
Phase result commit: recorded in RUN-STATE.json and the log
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), current starting prompt.
Inventory areas / prerequisites: all (baseline) / none.

## Outcome in plain language

The audited base is what the plan expected, so the run proceeds on it. AGY's own test suite passes. I added 31 characterization tests that freeze behavior later phases must not break, including the first direct tests of the sync worker. I also froze the schema-17 definition as a fixture, recorded a feature inventory, and classified offline versus online modules. No application behavior changed.

## Verified facts

| Check | Result |
|---|---|
| Git top level | Exactly the required path |
| Remote | `https://github.com/LAFINA-AI/LAFINA-CAPSTONE.git` |
| Base | `agy-development-cont` at `b9433dc`, equal to the audited SHA |
| Work branch | Created new; no prior branch existed |
| Donor | `feat/capstone-remaining` at `0d4bbe39`, equal to the pin, read through `git show` only |
| Dirty files at start | Only pack inputs and earlier comparison docs; hashes in `evidence/.../phase-00/dirty-preexisting-hashes.txt` |
| Node / npm | 24.19.0 / 11.17.0 |
| Android SDK | platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1 present |
| Devices | `adb devices` empty; no AVD tool on PATH. Device checks are NOT_RUN |
| Graphify | Binary on PATH, but this checkout has no `graphify-out/graph.json`; targeted search and `check-architecture.mjs` are the substitute, as the plan allows |

## Instruction conflict resolution

| Conflict | Resolution |
|---|---|
| AGENTS.md forbids meetings, document generation and study tools, but AGY ships meetings and documents | Owner authorization item 4: preserve the existing capabilities. No new study tools |
| AGENTS.md requires stopping after each phase for approval | Owner authorization item 2 and the starting prompt: proceed through 00-13 unattended |
| AGENTS.md wants `docs/reports/phase-NN-report.md` | Pack reports live under `docs/plans/agy-improvements/reports/`, as the starting prompt says. AGY-PORT IDs are separate from historical phases |

A narrow notice was appended to `AGENTS.md`; all other rules stay in force.

## Checklist and changes

| Requirement | Result | File/module | Reason |
|---|---|---|---|
| Characterization suite | implemented | `__tests__/preservation/agyPreservedContracts.test.ts` | Freezes the entitlement matrix, guest link, seven-type wire fields and batch envelope, all 16 intents with a network sentinel, Handbook aliases, document routing, speech defaults, ACK semantics, and install identity |
| Frozen schema | implemented | `__tests__/fixtures/agySchema17.sql` | Captured from real `initDatabase()` at the base. SHA-256 of the body: `14c0411be8c6433052ad24a7b71a7178bdf54325648c717b3fe277808bed385c` |
| Feature inventory | implemented | `evidence/.../phase-00/feature-inventory.md` | Screens, native modules, intents, entitlements, endpoints, known defects |
| Architecture classification | implemented | `evidence/.../phase-00/architecture-classification.md` | Records the donor-rule mismatch; the guard stays unchanged |
| Preservation matrix | implemented | `PRESERVED-FEATURES.md` | PF01-PF13 baseline |
| Scoped instruction notice | implemented | `AGENTS.md` | Records the owner decision |

## Schema-17 fixture design

AGY-PORT 01 builds an upgrade fixture by applying the frozen SQL to an empty database with `user_version = 17`, then inserting deterministic synthetic rows: a guest, two accounts, a soft-deleted row of each personal type, pending and failed outbox rows, a sync conflict, cited and attached messages, meetings, and preferences. The fingerprint is the SHA-256 of the frozen SQL plus the sorted row inserts. No real student database is ever copied.

## Provenance and compatibility

No donor code was copied in this phase. The donor pack has no root license; donor reuse relies on the owner's authorization for their two repositories, as PLAN.md states. `android/app/src/main/cpp/third_party/whisper.cpp/LICENSE` is the notable third-party notice and stays in place.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF01-PF13 | See `PRESERVED-FEATURES.md` | `npx jest --runInBand` | PASS, except PF12 is PARTIAL because the no-op storage fallback is a known defect for AGY-PORT 01 | All device and live checks NOT_RUN |

## Commands and evidence

Evidence directory: `evidence/agy-port-20261106/phase-00/`.

| Command | Tested HEAD | Result | Evidence |
|---|---|---|---|
| `npm ci` | b9433dc | exit 0, 876 packages. Postinstall only rewrites `jcenter()` in react-native-tts's Gradle file. `npm audit` lists 23 advisories; not changed, per plan | `npm-ci.log` |
| `npm run preflight` | b9433dc | exit 0: typecheck, lint, 15 suites and 163 tests pass, architecture PASS | `preflight-baseline.log` |
| `npx jest --runInBand` with the new suite | b9433dc + working tree | 16 suites, 194 tests, all pass | `jest-counts.json` |
| `npx prettier --check src __tests__ App.tsx scripts` | b9433dc + working tree | Baseline FAIL on 182 existing files. Not a port regression; only new and changed files get formatted | Command output summarized here |

### Native build

Final result: `:app:testDebugUnitTest` passed 14 Kotlin tests with 0 failures, and `:app:assembleDebug` built arm64-v8a and x86_64 debug APKs (hashes in `apk-hashes.txt`). Attempts are preserved in order:

| Attempt | Result | Cause | Evidence |
|---|---|---|---|
| 1. `JAVA_HOME` default (Android Studio JBR 25) | FAIL at `op-sqlite:configureCMakeDebug` | JDK 25 prints a restricted-method warning on stderr, which AGP treats as failure | `gradle-baseline.log` |
| 2. JDK 17 from the original path | FAIL at `app:buildCMakeDebug` | SDK ninja 1.10.2 cannot stat object paths over 260 characters; this checkout's path is long | `gradle-baseline-jdk17.log` |
| 3-4. Short drive alias, invoking `gradlew.bat` without `.\` | Did not start | Shell exe-path policy; wrapper invocation error, not a build result | `gradle-baseline-jdk17-subst.log`, `-2.log` |
| 5. JDK 17 from `X:` (`subst` alias of this exact checkout), `.\gradlew.bat` | PASS, `BUILD SUCCESSFUL`, exit 0 | | `gradle-baseline-jdk17-subst-3.log` |

Neither workaround changes repository files. `X:` is an alias of this checkout, not a separate worktree. The `X:` alias stays mapped for the rest of this run and is removed at the end; it does not survive a reboot. The owner's Android Studio may behave differently from these command-line runs.

## Native, performance and device facts

No device or emulator was available. No performance measurement was taken.

## Review findings and decisions

Parent self-review of the diff: only test, fixture, doc and `AGENTS.md` notice changes. No routes, features or tests removed. Decisions recorded: JDK 17 and the `X:` alias for command-line builds; `syncWorker` had no direct tests, so the batch contract test was added here.

## Manual checklist still needed

1. Install/open: NO ARTIFACT PRODUCED by this phase for manual use.
2. Actions: none.
3. Expected: not applicable.
4. Current execution status: all device and live checks NOT_RUN.

## Deferrals and continuation

None. Next action: NEXT_PHASE (AGY-PORT 01). No human review pause under this pack's authorization.
