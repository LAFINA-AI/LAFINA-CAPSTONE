# Phase 00 toolchain and baseline execution assessment

Assessment date: 2026-10-21 (Asia/Manila). Scope: documentation and read-only tool inspection. No dependency installation, application scaffold, legacy build, model download, device installation, or device setting change occurred.

## Evidence and boundaries

Observed command output is in [phase-00-toolchain.txt](../reports/evidence/phase-00-toolchain.txt). The capstone repository contained no `package.json`, lockfile, `node_modules`, `android/`, or `src/` at inspection. It therefore has no application test/build entry point to execute. A Markdown handoff is not evidence that an Android application builds.

The local legacy checkout is not the pinned baseline and was not executed. Targeted source/configuration reads used the GitHub connector at `f7e70aec54e6d16e627f444f2a67114cbfb07b5e`. No fallback to another revision was made. See [the source reuse audit](phase-00-reuse.md) for source reuse and provenance findings.

## Observed host tools

| Tool | Actual observation | Validation limit |
|---|---|---|
| OS | Windows `10.0.26300` reported by adb; Gradle identifies Windows 11 amd64 | Host only; no Android device identified |
| Node | `v24.19.0` | Version command passed; no dependency/native-addon installation tested |
| npm | `11.17.0` | Version command passed; no `npm ci` performed |
| Java / javac | Microsoft OpenJDK `17.0.20.1`, build `17.0.20.1+1-LTS` | PATH version commands passed; approved Gradle rerun with explicit process `JAVA_HOME` also reports launcher/daemon JVM 17.0.20.1. An inherited default launch selected Android Studio JBR 25.0.2, so select JDK 17 explicitly. No Android compilation |
| Gradle | No global command; cached distribution directories `8.11.1` and `9.3.1` | Initial restricted 9.3.1 version query failed to load `native-platform.dll`; approved outside-sandbox reruns **PASS**, exit 0, including explicit JDK 17. App build **NOT RUN** |
| Kotlin | No standalone `kotlinc` command; Gradle 9.3.1 reports embedded Kotlin `2.2.21` | Embedded Gradle Kotlin is distinct from the project's KGP 2.1.20; project plugin not resolved/executed. A standalone compiler is not required when Gradle supplies it |
| Android SDK platforms | Directories `android-34`, `android-35`, `android-36`, `android-37.0` | Directory presence does not prove package completeness or accepted SDK licenses |
| SDK Build Tools | Directories `34.0.0`, `35.0.0`, `36.0.0`; 36.0.0 source metadata confirmed | Packaging/signing not exercised |
| Android NDK | Directories `26.1.10909125`, `27.0.12077973`, `27.1.12297006`; 27.1 source metadata confirmed | Required 27.1 clang executable runs; no JNI link/build |
| C/C++ compiler | NDK 27.1 clang `18.0.2`, Android build `12285214` | Host executable only |
| CMake / Ninja | SDK CMake `3.22.1-g37088a8-dirty`; Ninja `1.10.2` | Both version commands passed via absolute SDK paths; not on PATH |
| SDK manager | No command on PATH; no `cmdline-tools/` directory or `sdkmanager.bat` found under selected SDK | Install/repair through Android Studio SDK Manager if required; no SDK changes made |
| adb | `1.0.41`, package `37.0.1-15733141` | Initial restricted `adb devices -l` failed, exit 1; approved outside-sandbox rerun **PASS**, exit 0, with a blank device list: **zero attached devices**. Phone model/API remain untested |
| Python / py | `3.14.7` | Version commands passed; no backend tooling is needed before Phase 09 |
| Git | `2.55.0.windows.4` | Version command passed |
| Graphify | No command on PATH; Python distribution lookup raises `PackageNotFoundError` | **NOT RUN**; no claim that Graphify or an import-cycle checker passed |

No serial number, Android ID, private device agenda, audio, transcript, signing credential, or `.env` content was collected. The initial adb query failed within the restricted environment; the approved rerun started its host daemon and returned zero attached phones. No `adb shell`, install, reboot, permission grant/revoke, force-stop, or settings command was executed. Initial restricted failures are retained in the evidence log and are resolved for host version/enumeration checks by the successful approved reruns; they are not unresolved host repair blockers.

## Pinned legacy configuration

All following values are **source observations**, not verified working capstone dependencies. Links are fixed to the requested revision.

| Component | Pinned source value |
|---|---|
| [package.json](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/package.json) | App `1.3.4`; React Native `0.86.0`; React `19.2.3`; Node declaration `>=22.11.0`; CLI `20.1.0` |
| [package-lock.json](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/package-lock.json) | Lockfile v3; TypeScript resolved `5.9.3`; Jest `29.7.0`; OP-SQLite `16.2.0`; datetimepicker `9.1.0`; RN Gradle plugin `0.86.0` |
| [android/build.gradle](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/build.gradle) | Build Tools `36.0.0`; min SDK `30`; compile/target SDK `34`; NDK `27.1.12297006`; Kotlin `2.1.20`; AGP dependency has no explicit local version |
| [android/app/build.gradle](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/build.gradle) | Repeats min `30`, compile/target `34`; CMake `3.22.1`; `arm64-v8a`, `x86_64`, `x86`; ONNX Runtime Android `1.19.2`; release minification disabled; release signing depends on external properties |
| [Gradle wrapper properties](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/gradle/wrapper/gradle-wrapper.properties) | Gradle `9.3.1`; distribution URL validation on; no distribution SHA-256 field observed |
| [settings.gradle](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/settings.gradle) | Composite RN Gradle plugin from `node_modules`, autolinking enabled |
| [tsconfig.json](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/tsconfig.json) | RN TS base; `strict` and `noImplicitAny` true; `skipLibCheck` true |
| [Jest config](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/jest.config.js) | RN Jest preset; setup harness; 20-second timeout; model extensions mapped to a file mock |
| [ESLint config](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/.eslintrc.js) | RN config with Node/Jest overrides for setup/mocks |
| `android/gradle.properties` | Connector returned 404 at pin. Required local properties are not proven; do not copy a developer's local file or credentials |

The root `graphify` npm script names a command, but the inspected package dependencies do not declare a Graphify package. A script name does not establish tool availability. React Native Testing Library is not in the inspected direct development dependencies; adding it later requires a reviewed compatible version rather than claiming legacy coverage.

## Official compatibility assessment and proposed validation set

1. The locked RN `0.86.0` package declares Node `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25.0.0`; host Node 24.19.0 satisfies that actual range. The root `>=22.11.0` declaration admits some 22.x versions outside the package's own requirement. The [versioned RN environment guide](https://reactnative.dev/docs/0.86/set-up-your-environment) recommends JDK 17. Those facts support the observed Node/JDK as **candidates**, not a successful installed dependency set.
2. The official [RN 0.86 Android catalog](https://raw.githubusercontent.com/facebook/react-native/v0.86.0/packages/react-native/gradle/libs.versions.toml) uses compile/target 36, Build Tools 36.0.0, NDK 27.1.12297006, Kotlin 2.1.20, and AGP 8.12.0. The [RN Gradle plugin catalog](https://raw.githubusercontent.com/facebook/react-native/v0.86.0/packages/gradle-plugin/gradle/libs.versions.toml) also specifies AGP 8.12.0/Kotlin 2.1.20. AGP 8.12.0 is therefore an **upstream expected resolution**, not an observed resolved local dependency.
3. The official [community template 0.86.0 build file](https://raw.githubusercontent.com/react-native-community/template/0.86.0/template/android/build.gradle) and [wrapper](https://raw.githubusercontent.com/react-native-community/template/0.86.0/template/android/gradle/wrapper/gradle-wrapper.properties) use that SDK/NDK/Kotlin set and Gradle 9.3.1. Keep min SDK 30 for the Android 11 product baseline. The legacy compile/target 34 values differ from this template; Phase 01 must establish a coherent tested configuration and document any change in permissions/behavior. Build Tools 36 alone does not raise compile or target SDK.
4. [Android's AGP 8.12 compatibility page](https://developer.android.com/build/releases/agp-8-12-0-release-notes) lists Gradle 8.13 and JDK 17 as minimum/default requirements and API 36 as its maximum supported API. [Kotlin's compatibility table](https://kotlinlang.org/docs/gradle-configure-project.html) lists KGP 2.1.20–2.1.21 fully supported through Gradle 8.12.1 and AGP 8.7.2, while allowing newer versions with caveats. Thus generic vendor ranges and the actual RN template are not perfectly aligned. This is a **build-validation risk**, not proof the RN template cannot work. Do not independently upgrade Kotlin/AGP to chase the newest release during porting. The cached Gradle version query succeeds outside the restricted context; that does not resolve or execute the project plugin/dependency configuration.
5. The [CLI compatibility table](https://github.com/react-native-community/cli#compatibility) currently lists CLI 20 through RN 0.85 and warns against independent upgrades. Legacy/template package selection and a real autolinking/build check must decide the exact capstone CLI set; no compatibility guarantee is inferred from broad peers.
6. [OP-SQLite documentation](https://op-engineering.github.io/op-sqlite/docs/installation/) confirms a native build is required and warns about duplicate SQLite implementations. Its Node facade tests query code, not the Android JSI implementation. OP-SQLite 16.2.0 remains a **candidate** pending native compilation and transaction/migration instrumentation. Use one SQLite implementation; do not add remote/libsql/Turso/WASM features for the Android offline core.

**Decision:** no fully tested capstone version set is established in Phase 00. The review candidate is observed Node 24.19.0/npm 11.17.0/JDK 17.0.20.1, RN 0.86.0/React 19.2.3/TS 5.9.3, min SDK 30, upstream SDK 36/Build Tools 36.0.0/NDK 27.1.12297006/CMake 3.22.1/Kotlin 2.1.20/expected AGP 8.12.0/wrapper 9.3.1, subject to the documented compatibility caveats and an actual minimal native build. No package, lockfile, Gradle configuration, or model asset was created here. Phase 01 approval authorizes validating and then pinning the final working set; any necessary deviation must be recorded.

## Actual gates

| Check | Result | Evidence / reason |
|---|---|---|
| Host version/inventory commands | PASS with individual missing tools recorded | Evidence log; version checks only |
| Cached Gradle executable | PASS | Approved outside-sandbox version checks exit 0, including explicitly selected JDK 17. Initial restricted failure preserved; no application build started |
| adb enumeration | PASS | Approved outside-sandbox query exit 0; zero attached devices. Initial restricted failure preserved; physical tests still unavailable |
| Capstone typecheck/lint/Jest/build | NOT RUN | No application or tool configuration exists; installing a scaffold would start Phase 01 |
| Legacy typecheck/lint/Jest/preflight | NOT RUN | Dirty local checkout is not the pin; no separate reviewed pinned execution workspace or installed dependencies |
| Legacy Android build/instrumentation | NOT RUN | No safe pinned source workspace; unknown local build properties/signing/model provenance; zero attached test phones |
| Graphify / automated import-cycle analysis | NOT RUN | Command absent; no capstone source graph yet |
| Performance / battery / alarm reliability | NOT RUN | No comparable signed release-like builds, measurement hooks, consented audio/device matrix, or accessible physical phone |

No JS test count, build success, Android feature pass, baseline timing, memory use, battery use, or improvement ratio is claimed. User-reported Kokoro slowness remains anecdotal. See [the baseline protocol](../benchmarks/phase-00-baseline.md) for comparison design and not-run records.

For that later comparison, use the same phone, app configuration, text/utterance cases, engine/model checksums and airplane-mode/audio conditions; keep cold and warm trials separate and retain 30+ repetitions where practical with p50/p95/max/failures. Callback timing alone cannot establish first audible audio, a Node SQLite harness cannot establish native transactions, an emulator cannot certify OEM battery behavior, and a successful app build cannot establish reminder reliability. Contradictory/ambiguous utterances must be scored for unsafe actions as well as WER; averages must not hide timeout/failure cases. No comparison is valid when the old model/voice configuration or new physical device differs without disclosure.

## Reproducible follow-up commands — not executed

These steps apply to a **separate, human-reviewed pinned baseline source workspace**, never the read-only local legacy checkout and never a production app import into capstone. Source/model/license review remains a precondition. Do not download a repository ZIP or clone its full history/models merely to run these commands. Provision only reviewed source/configuration/test files and any necessary reviewed vendor source; retrieve the Gradle wrapper binary separately only after checksum/provenance verification.

For repeatability, a reviewer should supply a source-only ZIP plus a manifest that records the pinned commit, file paths and SHA-256 hashes. It must exclude `.env`, credential/signing files, bundled models/audio, build outputs, and unrelated repository data. A source-only export is not a Git checkout: use its manifest rather than pretending `git rev-parse` proves provenance. Record any added baseline build-property overlay separately. Do not replace the existing legacy install or data on a person's phone.

Example preparation once that reviewed archive exists (paths are explicit proposed inputs, not artifacts created by Phase 00):

```powershell
$baselineRoot = 'C:\Temp\lafina-baseline-f7e70aec'
$reviewedArchive = 'C:\Temp\lafina-f7e70aec-reviewed-source-only.zip'
if (Test-Path -LiteralPath $baselineRoot) { throw 'Choose a new empty baseline directory.' }
Get-FileHash -LiteralPath $reviewedArchive -Algorithm SHA256
Expand-Archive -LiteralPath $reviewedArchive -DestinationPath $baselineRoot
Set-Location -LiteralPath $baselineRoot
Get-Content -LiteralPath '.\BASELINE-SOURCE-MANIFEST.json'
node --version
npm --version
java -version
npm ci --ignore-scripts
```

Review the install report and necessary dependency install scripts before allowing native-addon hooks. If the SQLite Jest harness needs `better-sqlite3`, run its reviewed rebuild in this isolated directory (`npm rebuild better-sqlite3`) and record the actual result; do not disguise missing harness dependencies with mocks. An `npm ci --ignore-scripts` install alone may be insufficient for all native dependencies. No dependency security scan has passed; a later `npm audit --omit=dev` is a networked advisory snapshot and cannot prove that dependencies or model binaries are safe.

Run checks separately so every exit code and log can be retained:

```powershell
npm run typecheck
npm run lint
npm test -- --runInBand --runTestsByPath __tests__/scheduler/reminderActions.test.ts __tests__/scheduler/reminderAlarm.test.ts __tests__/scheduler/reminderCallFlow.test.ts __tests__/scheduler/reminderRecovery.test.ts __tests__/scheduler/reminderScheduler.test.ts __tests__/scheduler/callDispatcher.test.ts __tests__/scheduler/callDispatcherEdgeCases.test.ts __tests__/ai/nlu.test.ts __tests__/ai/nluJsonParser.test.ts __tests__/ai/ttsService.test.ts __tests__/ai/ttsCacheHygiene.test.ts __tests__/ai/offlineSpeechNativeConfiguration.test.ts __tests__/ai/speechCapture.test.ts __tests__/ai/speechCaptureWatchdog.test.ts __tests__/ai/voicePipeline.test.ts __tests__/ai/offlinePipelineTimeouts.test.ts
npm test -- --runInBand
npm run preflight
```

The paths above were identified in the pinned repository tree. Recheck that each file is in the reviewed source manifest. Those suites can prove JS/domain behavior and failures against that harness; native mocks cannot prove on-device STT/TTS, alarms, process recovery, or call-style reminders.

After selecting JDK 17 in the process, verifying the wrapper distribution checksum, supplying approved nonsecret build properties, and reviewing the native sources/dependencies:

```powershell
Set-Location -LiteralPath (Join-Path $baselineRoot 'android')
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
.\gradlew.bat --version --no-daemon
.\gradlew.bat :app:dependencies --configuration debugRuntimeClasspath --no-daemon --console=plain
.\gradlew.bat :app:testDebugUnitTest --no-daemon --console=plain
.\gradlew.bat :app:assembleDebug --no-daemon --console=plain
.\gradlew.bat :app:assembleRelease --no-daemon --console=plain
```

Missing `gradle.properties`, ABI/model assets, native vendor source, signing configuration, or compatibility failures must be recorded as actual failures/blockers; do not remove failing tests or silently alter the pinned baseline. `assembleRelease` alone may produce an unsigned or unusable artifact. Only a safely signed test build with the exact configuration/patch manifest recorded can enter comparative benchmarks. Instrumentation (`.\gradlew.bat :app:connectedDebugAndroidTest --no-daemon --console=plain`) is **HUMAN REQUIRED** after an authorized test phone is available and test targets are confirmed; a successful zero-test Gradle task is not test coverage.

To recheck host/device connection after attaching the agreed test phone, run these read-only checks in an ordinary local terminal and save sanitized output:

```powershell
adb version
adb devices -l
```

The approved Phase 00 enumeration already succeeded with zero attached devices. A reviewer must connect and authorize a development phone before physical testing. Record manufacturer/model, RAM tier, Android/API, ABI, locale and offline voice engine through device Settings. Omit serial/transport identifiers from committed logs. Run an agreed Android 11/API 30 ~4 GB ARM64 phone and a newer Android 13/14/15+ phone. Keep Android 11 fallback expectations explicit: on-device speech API availability is a device/runtime capability, not implied by supporting Android 11. Manual airplane-mode TTS/STT and alarm/reboot/process-death/OEM battery checks remain required in the report's device checklist.

## Graph review substitute

Graphify did not run. Phase 00 can review the proposed Mermaid dependency diagram and source-call relationships manually; this is a design review, not proof of an acyclic implementation. Once source exists, select and pin a reviewed TypeScript dependency tool (for example Madge), then run `npx --no-install madge --circular --extensions ts,tsx src` in the capstone workspace and retain output. This command is prospective: Madge was not installed or executed and a configuration may be needed for aliases. Native JNI/Kotlin edges and transactional coupling still require manual review; a TS-only import graph cannot certify them. Exclude vendored/native third-party trees, generated output, and models from any Graphify scan.

## Phase 00 completion limit

Tool presence and source metadata are established. Native build compatibility, application tests and all physical performance/behavior checks remain unvalidated. This assessment supports human review and planning only; it does not pass Phase 01 or authorize implementation.
