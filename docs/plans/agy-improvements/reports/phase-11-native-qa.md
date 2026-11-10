# AGY-PORT 11: standalone QA builds and native compatibility

Implementation: CODE_COMPLETE.

| Gate | Status |
|---|---|
| Automation (typecheck, lint, Jest, architecture) | PASS (`preflight-2.log`). `preflight-1.log` failed lint on a Phase 12 test comment; it is kept |
| Tooling tests (Python) | PASS (`python-unittest-1.log`: 13 audit tests; `python-unittest-2.log`: 22 audit + emulator-runner tests) |
| Standalone QA build (dataQa, arm64-v8a + x86_64) | PASS (attempt 5 and the ONNX 1.22.0 candidate). Attempts 1, 2 and 4 failed. Attempt 3 was INTERRUPTED/NO_VERDICT |
| Native unit tests + debug build (with 1.22.0) | PASS (`gradle-unit-assemble-debug-1.log`, 43 Kotlin tests executed fresh) |
| APK audits | 1.19.2: inventory PASS, ZIP PASS, **ELF FAIL** (ONNX 4 KiB). 1.22.0: all PASS |
| Emulator install / VAD or native inference | NOT_RUN (no designated emulator; dataQa shares the production app ID) |
| Phone | NOT_RUN (never installed automatically) |
| Live service | NOT_RUN |

| Item | Value |
|---|---|
| Run ID / UTC | agy-port-20261106 / 2026-11-06T08:2xZ–10:5xZ, interrupted once by host low memory (see "Commands") |
| Worktree / branch | `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements` |
| Base / tested HEAD | Base `c85b023`. Audit remediation committed as `dd96148` + `2d62e05`. Builds were tested on `2d62e05`'s source plus this phase's working tree (the Gradle line); preflight also included uncommitted Phase 12 tooling |
| Result commit | Recorded in RUN-STATE.json and the log (no self-referential SHA) |
| Inventory areas | #21 (standalone QA packaging), #22 (ONNX runtime audit) |
| Decision records | [ADR-024](../../../decisions/ADR-024-onnxruntime-1-22-0-16k-alignment.md) (ONNX 1.22.0). Provenance: [agy-port-11-provenance.md](../../../third-party/agy-port-11-provenance.md) |
| Review | Parent self-review only (no independent reviewer) |

## Outcome in plain language

1. **A standalone QA APK now exists for both intended ABIs, and it is audited.**
   - The existing `dataQa` variant was kept as it is: bundled JS and no Metro.
   - It keeps the production identity: `com.lafina.capstone`, versionCode 6, versionName `0.6.0-data-qa`, the standard debug signer, debuggable, with the planner harness flag on.
   - Release and debug are unchanged.
   - No identity, signing, versionCode or updater change was needed.
2. **A real compatibility defect was found in AGY's own artifacts and fixed narrowly.**
   - ONNX Runtime 1.19.2 ships `libonnxruntime.so` and `libonnxruntime4j_jni.so` with load segments aligned to 4 KiB. On 16 KiB-page Android devices, these can fail to load. Silero VAD, used by push-to-talk dictation, depends on them.
   - The other 14 libraries pass, including whisper, op-sqlite and Hermes.
   - Moving to 1.22.0 makes all 16 libraries pass on both ABIs. Each APK grows by about 18 MB. The Java API AGY calls is identical in both versions, and the Kotlin compiles and its unit tests pass.
   - This is the only runtime change.
3. **New, bounded APK audit tool** (`scripts/apk_audit.py`). It reports each check separately:
   - **Inventory:** a single ABI, bundled JS, both required models with hashes, and no Kokoro entries.
   - **ELF32/64 PT_LOAD alignment:** checked for every native library.
   - **ZIP local-header alignment:** checked independently of the SDK.
   - **Receipts:** written exclusively, only inside the evidence folder.
   - Its tests use synthetic ELF and ZIP files, covering malformed, truncated, oversized, duplicate and receipt-overwrite cases.
4. **Building on this Windows checkout needs an environment-only workaround.** It is documented and scripted, and no project file was changed for it:
   - **Native code needs the short `X:` alias.** On the long real path, ninja exceeds MAX_PATH, as Phase 00 recorded.
   - **Metro cannot bundle from `X:`.** It resolves `node_modules` through their real `C:` path ("Failed to get the SHA-1"), and `--preserve-symlinks` does not help (attempt 4).
   - **The working method has two steps:**
     1. Bundle from the real path (`gradle-c.ps1 :app:createBundleDataQaJsAndAssets`).
     2. Build from `X:` with `skip-prebuilt-bundle.init.gradle`, which marks only the bundle task SKIPPED.
   - Excluding the task with `-x` is refused by Gradle (attempt 2).
   - The packaged `assets/index.android.bundle` is byte-identical to the prebuilt bundle (`bundle-identity-1.log`, sha256 `e448f8ea…a91c`).

## Spec checklist

| Spec item | Result |
|---|---|
| 1. Inventory of model and support assets, checksums, licenses, ABIs | Done ([provenance](../../../third-party/agy-port-11-provenance.md)). Whisper base.en q5_1 and Silero VAD are present and hashed. No SmolLM2/gguf is bundled and `lafina_llama` is not built, so NLU uses the fast path; this is an explicit inference limit. No Kokoro. Nothing fetched. The publishers' upstream checksums were not re-verified (owner check) |
| 2. Standalone QA packaging, intended ABIs, release/debug kept | Done. Existing `dataQa` reused for arm64-v8a and x86_64 split APKs. No production identity or security change |
| 3. Bounded APK inventory, ZIP and ELF audits, tests, receipts; package, signature and hash facts without keys | Done. `apk_audit.py` + 13 tests; four receipts. `apksigner --print-certs`, `aapt2 badging` and `zipalign -c -P 16` logs read certificate and package facts only |
| 4. Evaluate 1.19.2 from produced libraries; bounded 1.22.0 correction | Done. Defect shown on target artifacts. APIs and license checked, build and unit tests pass, 1.22.0 audit PASS. VAD smoke NOT_RUN (see ADR-024) |
| 5. Emulator VAD and native inference, standalone launch, meeting/capture loading | NOT_RUN. No designated emulator. Installing `com.lafina.capstone` would replace any existing app data on that emulator. The gated runner is built in AGY-PORT 12 |
| 6. In-place update and data preservation on an isolated emulator | NOT_RUN (same reason). Update requirements are listed below |

## Artifact receipts

These are build outputs and are not committed. The receipts are under `evidence/agy-port-20261106/phase-11/`.

| Artifact | ONNX | Bytes | SHA-256 | Inventory / ELF / ZIP | Receipt |
|---|---|---|---|---|---|
| `app-arm64-v8a-dataQa.apk` | 1.19.2 | 145,037,750 | `d2e70a6268bcb2beef8c8f2ef92c2ca59b170334b871c7506523052ecf8a7e77` | PASS / FAIL (14/16) / PASS | `apk-audit-dataqa-arm64-v8a-1.json` |
| `app-x86_64-dataQa.apk` | 1.19.2 | 147,687,406 | `d38802d88a527686b9a9062bb4378fef9cce4a973073caebf4eb170be4970826` | PASS / FAIL (14/16) / PASS | `apk-audit-dataqa-x86_64-1.json` |
| `app-arm64-v8a-dataQa.apk` | **1.22.0** | 163,257,936 | `ef264311182ce10299b2b87a281af7c628b9824e67d45710dc2c1fa349e87e19` | PASS / PASS (16/16) / PASS | `apk-audit-dataqa-onnx122-arm64-v8a-1.json` |
| `app-x86_64-dataQa.apk` | **1.22.0** | 169,577,888 | `58470f2f9d4ba972e43af6da32839d708aace5124c36703759e6603a699bfd5e` | PASS / PASS (16/16) / PASS | `apk-audit-dataqa-onnx122-x86_64-1.json` |

**Common facts for all four** (from the SDK tool logs):

- **Package and version:** `com.lafina.capstone`, versionCode 6, `0.6.0-data-qa`, minSdk 30, target/compile SDK 36, debuggable.
- **Signature:** v2 only. Signer `CN=Android Debug`, certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`.
- **Models:** `ggml-base.en-q5_1.bin` `4baf70dd…` and `silero_vad.onnx` `7ed98ddb…`.
- **Stored entries:** 302, all aligned.
- **Native libraries:** `libappmodules`, `libc++_shared`, `libfbjni`, `libhermestooling`, `libhermesvm`, `libimagepipeline`, `libjsi`, `liblafina_whisper`, `libnative-filters`, `libnative-imagetranscoder`, `libonnxruntime`, `libonnxruntime4j_jni`, `libop-sqlite`, `libreact_codegen_rnsvg`, `libreact_codegen_safeareacontext`, `libreactnative`.

**Observation (no change made):** the *merged* manifest also carries `ACCESS_WIFI_STATE` and `READ`/`WRITE_EXTERNAL_STORAGE`, contributed by dependencies. `check:architecture` checks only the source manifest. This existed before AGY-PORT 00; it is recorded for owner review.

## Phone install and update requirements (for later, owner-run)

1. **Choose the APK by ABI.** Phones use the arm64-v8a APK; x86_64 is for emulators. Install from the 1.22.0 build only, and check its sha256 against the table above, or the receipt of a newer build.
2. **Update in place, never reinstall.** Use `adb install -r <apk>` or the on-phone installer.
   - The phone must already hold `com.lafina.capstone` (release preview or an earlier dataQa) signed by the same debug certificate (`acf890c3…`). If it does, data is kept.
   - If Android reports `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the signature differs. Stop: do **not** uninstall or clear data to work around it.
   - Downgrade is not possible: versionCode stays 6, so it installs over 6 but not over a higher one.
3. **Before updating, write down:**
   - the number of tasks, events and notes;
   - one armed reminder's time;
   - the signed-in account or guest state.

   Afterwards confirm they are all unchanged and the reminder still rings.
4. **The dataQa build is debuggable.** Do not hand it to others as a release.

## Manual checklist still needed (NOT_RUN)

1. **Launch offline.** Install the arm64 1.22.0 dataQa APK on the owner's phone (in place, as above). Switch to airplane mode and launch. The app opens without Metro or any "development server" message. The Calendar and Notes show the existing data.
2. **Dictation (the ONNX/VAD path).** Use push-to-talk in Chat or Voice: speak "remind me about my quiz tomorrow at eight". The words appear and VAD stops on silence. If a 16 KiB-page device or emulator image is available, repeat there (this is the defect ADR-024 fixes).
3. **Meeting recording** starts and stops and saves a recording. It is unaffected by the runtime change.
4. **Reminder call.** It rings two minutes ahead with the screen locked. Answer and acknowledge.
5. **Update preservation.** Compare the counts noted before the update (requirement 3).
6. **Emulator (optional).** Once the owner designates an AVD that holds no needed data: `python scripts/emulator_qa.py --serial emulator-5554 --designated-avd <name> --apk <x86_64 apk> --receipt <its receipt> --output <new json in evidence>` (AGY-PORT 12).

## Commands and evidence

All paths are under `evidence/agy-port-20261106/phase-11/`. Logs are never overwritten; every attempt has its own file.

| # | Command | Result |
|---|---|---|
| 1 | `gradle-x.ps1 … assembleDataQa` | FAIL: Metro SHA-1 on a real `C:` path (`gradle-assemble-dataqa-1.log`) |
| — | `gradle-c.ps1 … :app:createBundleDataQaJsAndAssets` | PASS, bundle only, not an APK (`gradle-bundle-dataqa-1.log`) |
| 2 | `gradle-x.ps1 … assembleDataQa -x :app:createBundleDataQaJsAndAssets` | FAIL: Gradle refuses (`mapDataQaSourceSetPaths` queries the bundle task) (`gradle-assemble-dataqa-2.log`) |
| 3 | `gradle-x-bundle.ps1 … assembleDataQa` (`NODE_OPTIONS=--preserve-symlinks`) | **INTERRUPTED/NO_VERDICT.** Claude Code stopped it during bundling because the host was low on memory. It is neither a build failure nor a success, and was not retried until the owner resumed development (`gradle-assemble-dataqa-3.log`) |
| — | `gradlew --stop` (this project's idle daemon, PID 37676) | Stopped. No unrelated process was touched |
| 4 | `gradle-x-bundle.ps1 … assembleDataQa --max-workers=1` | FAIL: same Metro SHA-1, so `--preserve-symlinks` does not help (`gradle-assemble-dataqa-4.log`) |
| — | `gradle-c.ps1 … :app:createBundleDataQaJsAndAssets --max-workers=1` | PASS, bundle `e448f8ea…` with the audit-remediation JS (`gradle-bundle-dataqa-2.log`) |
| 5 | `gradle-x.ps1 … --init-script skip-prebuilt-bundle.init.gradle :app:assembleDataQa --max-workers=1` | **PASS**, ONNX 1.19.2 (`gradle-assemble-dataqa-5.log`). An earlier try with `-I` never started: PowerShell parsed it as a parameter, and no log was created |
| 6 | Same, `--offline`, ONNX 1.22.0 | **PASS** (`gradle-assemble-dataqa-onnx122-1.log`) |
| 7 | `gradle-x.ps1 … --offline :app:testDebugUnitTest :app:assembleDebug --max-workers=1` | PASS: 43 Kotlin tests, 0 failures, executed fresh (`gradle-unit-assemble-debug-1.log`) |
| 8 | `python scripts/apk_audit.py <apk> --output <receipt>` ×4 | As in the receipt table |
| 9 | `zipalign -c -P 16 4`, `apksigner verify --print-certs`, `aapt2 dump badging` | `sdk-tools-baseline-1.log`, `sdk-tools-onnx122-1.log` |
| 10 | Packaged versus prebuilt bundle hash | Identical (`bundle-identity-1.log`) |
| 11 | `python -m unittest …` | `python-unittest-1.log` (13), `python-unittest-2.log` (22) |
| 12 | `npm run preflight` | `preflight-1.log` FAIL (lint: an unused `eslint-disable` in a Phase 12 test). `preflight-2.log` PASS: 43 suites, 580 passed + 1 opt-in skipped |

## Preserved AGY features

| PF | Evidence | Result |
|---|---|---|
| PF08 meeting recording / PF09 local speech / PF11–PF13 | No Kotlin or JS change in this phase. All native modules are still built and packaged. 43 Kotlin unit tests and the full Jest suite pass | PASS (host). Device NOT_RUN |
| Production identity and security | Package, versionCode, signer, updater and permissions unchanged. Only the ONNX line changed | PASS |

## Deferrals and continuation

- **Emulator and phone runtime checks** (VAD frames, library load on 16 KiB pages, meeting/capture loading, update preservation): NOT_RUN. These are owner checks.
- **Upstream model checksum verification** against the publishers: owner check before public release.
- **Next phase:** AGY-PORT 12, unattended under the owner authorization.
