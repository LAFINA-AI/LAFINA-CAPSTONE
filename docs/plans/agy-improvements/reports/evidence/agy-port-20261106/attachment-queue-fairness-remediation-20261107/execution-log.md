# Execution log: attachment-queue fairness remediation (audit C2), 2026-11-07

All times are UTC. Every log was written once, under a new name; none was overwritten. Jest ran with `--runInBand`, one command at a time. Gradle ran one job at a time, with `--max-workers=1`.

- **Revisions:**
  - Audited and base HEAD: `69aafcd759bb5e8977fdf2450987359c9ca0c022`.
  - Code commit: `acfd8fc836142843efa4918128bdb2dcc7b397eb`.
  - Builds ran at HEAD `acfd8fc`.
- **The tested code is the committed code.** Runs before the commit used a working tree identical to `acfd8fc` in code. The mutation check reports the restored hashes, which equal the committed files' working-copy hashes:
  - `src/storage/attachmentCleanup.ts` `0037cef8…fc29`;
  - `attachmentCleanupSchema.ts` `83ff8df2…9269`;
  - `ProfileScreen.tsx` `a7b95be6…b15d`.

| # | Time (start) | Command (abridged) | Exit | Result | Log |
|---|---|---|---|---|---|
| 1 | 03:13:24 | `sha256sum` of the three independent audit dirs plus the C2 audit report | 0 | 59 lines | `independent-audit-dirs-before.sha256` |
| 2 | 03:13 | **Pre-fix, at `69aafcd`:** `node --max-old-space-size=512 jest --config <C2 audit>/jest-independent.config.cjs --runInBand --runTestsByPath <C2 audit>/independentCleanupFairness.test.ts` | 1 | **1/1 FAILED** (C2 reproduced: `{removed:0,pending:51}` twice, last file never attempted) | `pre-fix-independent-fairness-1.log/.json` |
| 3 | 03:18 | The same test, post-fix (uncommitted) | 0 | 1/1 pass | `post-fix-independent-fairness-1.log/.json` |
| 4 | 03:19:18 | jest: `attachmentCleanup`, `clearDataAttachmentCleanup`, `schemaMigrations` (unchanged test files) | 1 | **13 failed / 51 passed**. Each failure only lacks the new result field `unsaved` (12 × `0`, 1 × `1`) | `post-fix-existing-1.log` |
| 5 | 03:23:04 | jest: the new `attachmentCleanupFairness` + updated `attachmentCleanup` | 0 | 60/60 | `new-suites-1.log` |
| 6 | 03:23:30 | jest: `clearDataAttachmentCleanup` with the 3 new C2 cases | 0 | 8/8 | `ui-cleanup-tests-1.log` |
| 7 | 03:24:51 | jest: all three cleanup suites. This ran after the compare-and-set on `queue_order` was dropped (redundant once passes are serialized) and the ownership-move test was added | 0 | 69/69 | `new-suites-2.log` |
| 8 | 03:25–03:29 | `python mutate-fairness.py mutation-check-1.log` (15 mutations; each runs the 3 suites plus the independent C2 test) | 0 | **15/15 KILLED**, all restored (sha256 verified) | `mutation-check-1.log` |
| 9 | 03:29 | All independent tests, unchanged, each with its own config: `independentClearData` (2), `independentAttachmentRetry` (1), `independentCleanupFairness` (1) | 0, 0, 0 | **4/4 pass** | `independent-tests-post-fix-1.log`, `independent-*-post-fix-1.json` |
| 10 | 03:30:05 | jest `--runTestsByPath`: the audit's 18 focused/protected suites plus `attachmentCleanupFairness` | 0 | **19 suites, 348/348** | `focused-and-preservation-1.log/.json` |
| 11 | — | `git diff` of the 3 changed existing test files | — | — | `existing-test-changes.diff` |
| 12 | 03:31:03–03:33:12 | `NODE_OPTIONS=--max-old-space-size=768 npm run preflight` | 0 | typecheck, lint (max-warnings 0), Jest **55 suites, 809 passed + 1 skipped**, architecture 219 modules / 0 cycles / 0 forbidden / 75 offline leaves | `preflight-1.log` |
| 13 | 03:33:36 | `git commit` (explicit paths) | 0 | `acfd8fc` | — |
| 14 | 03:33:50 | `gradle-c.ps1 … :app:createBundleDataQaJsAndAssets --max-workers=1 --console=plain` | 0 | BUILD SUCCESSFUL, the task **executed** (1 executed, 10 up to date) | `gradle-bundle-dataqa-1.log` |
| 15 | 03:36:01 | `gradle-x.ps1 … --init-script X:\…\phase-11\skip-prebuilt-bundle.init.gradle --offline :app:assembleDataQa --max-workers=1` | 0 | BUILD SUCCESSFUL, 12 executed / 244 up to date. `mergeDataQaAssets` and `packageDataQa` executed; the bundle task SKIPPED by design | `gradle-assemble-dataqa-1.log` |
| 16 | 03:36:20 | `gradle-x.ps1 … --offline :app:testDebugUnitTest --rerun :app:assembleDebug --max-workers=1` | 0 | BUILD SUCCESSFUL. Kotlin **6 suites / 43 tests / 0 failures, errors or skips**, executed 03:36:27. `packageDebug` up to date | `gradle-unit-assemble-debug-1.log`, `kotlin-results-1.txt` |
| 17 | 03:36:41 | `python scripts/apk_audit.py <apk> --output apk-audit-<abi>-1.json`, both ABIs | 0, 0 | inventory, ELF and zip alignment all PASS | `apk-audit-*-1.json/.stdout.txt` |
| 18 | 03:37:20 | SDK build-tools 36.0.0: `zipalign -c -P 16 4`, `apksigner verify --verbose --print-certs`, `aapt2 dump badging` (filtered) | all 0 | v2, 1 signer `acf890c3…dd5e`. `com.lafina.capstone` 6 / `0.6.0-data-qa` / SDK 36, debuggable. The 32 `uses-permission` lines (both ABIs) and the package and target lines are identical to C1's `sdk-tools-1.log` | `sdk-tools-1.log` |
| 19 | 03:37:56 | `python artifact-hashes.py artifact-hashes-1.txt …` and `python bundle-markers.py bundle-markers-1.txt` | 0, 0 | full SHA-256 receipts. 8/8 fix-only strings present, the old order absent, 4/4 controls present, in both bundles | `artifact-hashes-1.txt`, `bundle-markers-1.txt` |
| 20 | 03:38:05 | `sha256sum` of the audit dirs again; `cmp` with step 1 | 0 | identical | `independent-audit-dirs-after.sha256` |
| 21 | 03:4x | Labelled re-hash with directory prefixes (steps 1 and 20 printed `*./file`, so the prefixing `sed` did not match and those files hold bare names in a fixed directory order). It is compared hash-by-hash with step 1, then checked with `sha256sum -c` | 0 | 59 identical hashes, all files verify | `independent-audit-dirs-verify-1.sha256` |

**Marker provenance:** for each marker, `git grep -c -F` gives these counts in `src`:

| Marker | At `69aafcd` | At `acfd8fc` |
|---|---|---|
| Each of the 8 fix-only strings | 0 | ≥ 1 |
| The removed string `ORDER BY recorded_at ASC, path ASC` | 1 | 0 |

**Fresh vs inspected:** every row above was run fresh in this task. Inspected, not rerun: the auditor's own logs and receipts.
