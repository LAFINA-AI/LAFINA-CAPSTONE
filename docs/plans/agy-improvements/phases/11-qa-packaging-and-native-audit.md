# AGY-PORT 11 — standalone QA builds and native compatibility

Prerequisites: 03, 05, 10. Inventory: 21, 22. Protect PF08–PF09, PF11–PF13.

## Navigate

Target Gradle variants/native runtime declarations, manifest, JS/assets bundling and module registration; existing qaData behavior. Donor QA split mechanics, inspect-apk/audit_apk_alignment scripts/tests and artifact receipts. Keep target package/version/signing/update identity; no wholesale Gradle replacement or donor prebuilt APK/model copy.

## Execute

1. Inventory actual target model/support asset references, checksums/licenses and intended ABIs. No missing asset may be fabricated or fetched from an unverified distribution. Preserve Whisper/SmolLM2/Silero and meeting native libraries; exclude all Kokoro assets/modules. Asset absence is an explicit build/inference limit.
2. Add/adjust standalone QA packaging with bundled JS, scoped QA-only diagnostics hooks and intended ARM64/x86_64 variants if supported. Keep existing release/debug/qaData behavior unless a documented safe correction is necessary. Do not make production debuggable, change signing secrets/versionCode or disable the updater to build a QA artifact.
3. Adapt bounded APK inventory and independent ZIP-alignment and ELF32/64 PT_LOAD audits. Test malformed/truncated/oversized cases and no-overwrite receipts. Record actual package/variant/ABI/signature compatibility facts and hashes without reading signing keys.
4. Evaluate target ONNX 1.19.2 from actual produced libraries. If evidence demonstrates the relevant compatibility defect, the owner-authorized bounded correction candidate is 1.22.0, already used in the donor. Apply only after checking target APIs/licenses and successful target build/VAD/native-model smoke checks when available. No unrelated runtime upgrades. If not verifiable, retain the current runtime and report the exact audit/upgrade limitation; do not claim donor inference proves target compatibility.
5. Exercise actual target Silero/VAD frames and applicable native inference on a designated owned emulator if possible, including installed standalone launch without Metro and meeting/capture module loading. Kokoro synthesis is neither allowed nor required. A host alignment pass is not hardware load/audibility proof.
6. Test in-place update/data preservation only on an isolated emulator with synthetic records and verified package/signature compatibility. Do not uninstall/clear data to conceal upgrade failures or install automatically on an attached phone.

## Acceptance

Produced artifacts are standalone for the claimed variants, target-specific, inventoried and hashed; ABI/ZIP/ELF checks have real results. Missing assets/toolchain/inference or phone checks stay NOT_RUN. Existing recording/speech/reminder modules remain registered and no production identity/security behavior changes silently.

Deliver `reports/phase-11-native-qa.md`, bounded native-runtime ADR if changed, artifact receipts and exact later phone installation/update requirements. No production release, push or deployment.
