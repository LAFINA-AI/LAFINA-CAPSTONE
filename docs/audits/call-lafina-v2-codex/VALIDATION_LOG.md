# Actual validation log

Audit HEAD: `fe489a6487884fa6667f1cc6e2e0bddbd24e386d`. Timezone: Asia/Manila. Report refreshed: 2026-11-10T19:29:54.015513+08:00.

Only nondestructive checks and synthetic host fixtures were used. No backend smoke/provider synthesis, database migration, install, clear-data or release publish ran.

## preflight-result.json

```json
{
  "finished": "2026-11-10T19:16:24.5837578+08:00",
  "exit_code": 0,
  "sha": "fe489a6487884fa6667f1cc6e2e0bddbd24e386d",
  "command": "npm run preflight",
  "started": "2026-11-10T19:11:36.0936301+08:00"
}
```

## gradle-result.json

```json
{
  "finished": "2026-11-10T19:12:01.9768403+08:00",
  "exit_code": 1,
  "command": ".\\android\\gradlew.bat -p android :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain --max-workers=2",
  "sha": "fe489a6487884fa6667f1cc6e2e0bddbd24e386d",
  "started": "2026-11-10T19:12:01.4581205+08:00"
}
```

## gradle-elevated-result.json

```json
{
  "started": "2026-11-10T19:12:21.1794255+08:00",
  "finished": "2026-11-10T19:14:41.9209738+08:00",
  "exit_code": 0,
  "sha": "fe489a6487884fa6667f1cc6e2e0bddbd24e386d",
  "command": ".\\android\\gradlew.bat -p android :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain --max-workers=2"
}
```

## call-phase-run.json

```json
{
  "command": "node node_modules/jest/bin/jest.js callLafinaPhase --runInBand --json --outputFile=docs/audits/call-lafina-v2-codex/evidence/call-phase-results.json",
  "finished": "2026-11-10T19:19:09.1828368+08:00",
  "exit_code": 0,
  "sha": "fe489a6487884fa6667f1cc6e2e0bddbd24e386d",
  "started": "2026-11-10T19:16:49.3152290+08:00"
}
```

## defect-probes-run.json

```json
{
  "finished": "2026-11-10T19:18:02.5708479+08:00",
  "sha": "fe489a6487884fa6667f1cc6e2e0bddbd24e386d",
  "started": "2026-11-10T19:17:50.9008734+08:00",
  "exit_code": 0,
  "command": "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath docs/audits/call-lafina-v2-codex/evidence/defect-probes.test.ts --testMatch **/defect-probes.test.ts --json --outputFile=docs/audits/call-lafina-v2-codex/evidence/defect-probes-results.json"
}
```

## Results and scope

| Check | Outcome | Evidence |
|---|---|---|
| npm run preflight | Exit 0; typecheck and lint passed; 97 suites, 1395 tests passed, one skipped | evidence/preflight.log |
| Architecture within preflight | 280 modules, zero reported cycles/forbidden imports; 80 offline leaves | evidence/preflight.log |
| Native first attempt | Exit 1; sandbox denied Gradle cache lock access | evidence/gradle.log |
| Native approved escalation | Exit 0; compileDebugKotlin and testDebugUnitTest; 54 JVM tests, no failures/errors/skips | evidence/gradle-elevated.log; evidence/native-test-summary.json |
| Focused call phase suites | Exit 0; 15 suites, 197 passed | evidence/call-phase.log; evidence/call-phase-results.json |
| Audit defect reproductions | Exit 0; 11 bug observations reproduced, not acceptance passes | evidence/defect-probes.log; evidence/defect-probes-results.json |
| Original pack validator | Exit 0; 16 phases, 151 P, 78 F, 70 T | evidence/read-only-checks.json |
| Manifest | 37/37 SHA256 matches | evidence/pack-manifest-check.json |
| git diff --check actual base..HEAD | Exit 2; whitespace/blank EOF findings | evidence/read-only-checks.json |
| git diff --check unstaged | Exit 0 at initial check; owner .gitignore edit preserved | Initial read and final status |
| APK assembly/install/instrumentation | NOT_RUN | No new APK/device receipt claimed |
| Real signed-in ElevenLabs/DeepSeek | NOT_RUN | No billable/provider session started |

Jest emitted the existing open-handles warning and console warnings from negative fixtures. Both recorded main commands eventually exited 0 without --forceExit. The one skipped existing test is the opt-in planner performance benchmark in __tests__/storage/agyPort06PlannerQueries.test.ts (AGY_MEASURE). No test was skipped by this audit.

Native Gradle ran --offline and reused installed dependencies. The first attempt was blocked by filesystem cache permissions; a scoped approved escalation allowed the same compile/tests to run. No automatic approval rejection occurred.

Defect probes were initially run with nine observations and then expanded with two real reviewed-command/SQL cases. The final retained log/JSON is the eleven-observation run. They seed only node:sqlite in-memory synthetic data using the existing mock; no personal device database is opened. Permanent source/test files were not edited.

## Read-only provenance checks

Exact commands, timestamps, exit codes, stdout/stderr are in evidence/read-only-checks.json. This includes branch/HEAD, ancestor checks, base..HEAD file list/stat/history, whitespace check, pack validator, Node and Java versions. Unconfigured upstream is recorded as a nonzero discovery outcome, not a failure of implementation.

Additional discovery reads: root AGENTS/README/package.json, task-pack specifications/phase checklists/QA/templates/loop, phase ledgers/reports, affected voice/action/native/store/UI/test code, and installed React Native Modal.js:278-288. A process inventory via Get-CimInstance was denied by the sandbox; Get-Process later found no remaining Node process. No process was killed or app controlled.

GitHub connector read-only calls inspected backend branches/main, recursive source tree and three source files. Backend main was 5866aa241922b710d32d6d56277a8ef24a6aa178. Captured file content and provenance links are in BACKEND_AND_DEVICE_GATES.md and evidence/backend-*.txt. These are source reads, not deployment/provider verification.

## Preservation

Final tracked working-tree difference remains the pre-existing .gitignore entry; new authored files are confined to docs/audits/call-lafina-v2-codex/. Gradle/Jest updated ordinary generated outputs/caches. Application source, original tests/pack, backend/provider settings and existing user data were not changed. No commit, merge, push or deploy was performed.

