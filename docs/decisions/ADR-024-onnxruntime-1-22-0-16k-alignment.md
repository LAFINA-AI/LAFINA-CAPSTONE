# ADR-024: ONNX Runtime 1.19.2 → 1.22.0 for 16 KiB page alignment

**Status:** accepted (owner pre-authorized AGY-PORT 00–13 in `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`; the AGY-PORT 11 spec names 1.22.0 as the bounded correction candidate)
**Date:** 2026-11-06
**Phase:** AGY-PORT 11 (inventory 22)
**Review owner:** human developer

## Evidence (target artifacts, not donor results)

The evidence files are under `docs/plans/agy-improvements/reports/evidence/agy-port-20261106/phase-11/`.

| Artifact | `libonnxruntime.so` PT_LOAD align | `libonnxruntime4j_jni.so` | Other 14 libraries | Receipt |
|---|---|---|---|---|
| dataQa arm64-v8a, ONNX 1.19.2 | 4096 ×3 → **FAIL** | 4096 ×2 → **FAIL** | PASS | `apk-audit-dataqa-arm64-v8a-1.json` |
| dataQa x86_64, ONNX 1.19.2 | 4096 ×3 → **FAIL** | 4096 ×2 → **FAIL** | PASS | `apk-audit-dataqa-x86_64-1.json` |
| dataQa arm64-v8a, ONNX 1.22.0 | 16384 ×3 PASS | 16384 ×2 PASS | PASS | `apk-audit-dataqa-onnx122-arm64-v8a-1.json` |
| dataQa x86_64, ONNX 1.22.0 | 16384 ×3 PASS | 16384 ×2 PASS | PASS | `apk-audit-dataqa-onnx122-x86_64-1.json` |

- **Why the 1.19.2 failure matters.** On Android devices that use 16 KiB memory pages, libraries whose load segments are only 4 KiB aligned can fail to load. Only `LafinaSpeechToTextModule` (Silero VAD) loads ONNX Runtime, so the likely effect is that offline voice detection, and therefore push-to-talk dictation, fails on those devices.
- **What the SDK `zipalign -c -P 16 4` check covers.** It passes for both versions. It checks only ZIP offsets, not ELF segments, so it cannot detect this defect.

## Checks made before applying

1. **API.** `javap` on the cached AAR `classes.jar` of both versions confirms an identical surface for every call AGY's Kotlin makes:
   - `OrtEnvironment.getEnvironment()`
   - `createSession(String, SessionOptions)`
   - `SessionOptions.setIntraOpNumThreads(int)`
   - `OnnxTensor.createTensor(env, FloatBuffer, long[])` and `(env, LongBuffer, long[])`
   - `OrtSession.run(Map)`
   - `OnnxTensor.getFloatBuffer()`

   No Kotlin change was needed, and the Kotlin compiles.
2. **License.** The 1.22.0 Maven POM declares the MIT License. The 1.19.2 POM declares none; ONNX Runtime is MIT-licensed upstream. AAR sha256 values:
   - 1.22.0: `04a4617a…7dbfe2`
   - 1.19.2: `84737dd1…2a7b5f`

   Both were resolved from the existing Gradle cache (`--offline`). Nothing was fetched from an unverified source.
3. **Build.** `assembleDataQa` passes (`gradle-assemble-dataqa-onnx122-1.log`). Unit tests and `assembleDebug` pass (`gradle-unit-assemble-debug-1.log`).
4. **Packaging identity.**
   - Same package, versionCode 6 and debug signer (SHA-256 `acf890c3…62dd5e`), so it installs over earlier previews without data loss.
   - The JS bundle is byte-identical to the 1.19.2 build (`bundle-identity-1.log`).
   - Models are unchanged.
5. **Not run.** No VAD or native-model smoke check on device or emulator: no designated emulator, and the variant shares the production app ID. A host ELF pass does not prove the library loads or that VAD frames are correct.

## Decision

- **Use `com.microsoft.onnxruntime:onnxruntime-android:1.22.0`.** It is the only version change, and no other runtime is upgraded.
- **Silero VAD model and input/output handling:** unchanged.

## Consequences and limits

- **Size.** Each APK grows by about 18 MB:
  - arm64: 145.0 MB → 163.3 MB
  - x86_64: 147.7 MB → 169.6 MB
- **Required device checks** (MANUAL-QA):
  - push-to-talk dictation on a 4 KiB-page phone and, if possible, a 16 KiB-page device or emulator image;
  - meeting recording, which uses its own capture path (check it is unaffected).
- **Rollback:** change the one Gradle line back to 1.19.2. No data or schema depends on the runtime version.
- **Not claimed:** donor inference results say nothing about target compatibility.
