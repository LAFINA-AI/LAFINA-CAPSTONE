# Independent final audit — AGY at 940802c

**Date:** 2026-11-06, Asia/Manila. **Observed HEAD:** `940802c61457422a1ecefdad7cae5ef90cf0fddb`. **Branch:** `codex/agy-preservation-improvements`.

**Verdict:** Claude's overall **PARTIAL / awaiting device validation** outcome is supported. Host gates and the actual QA APKs have substantial corroborating evidence. This audit nevertheless found three remaining code-level issues and one material correction to the manual reminder guidance. They should be resolved before treating the affected speech/privacy/error-recovery paths as accepted.

## Scope and independence

I inspected Git history/status, final phase reports, selected final source and regression tests, installed react-native-tts 4.1.1 wrapper/native code, saved Jest/build/native XML evidence, and the actual two QA APK files. This is a focused independent review, not exhaustive certification of all changed lines or every protected product journey.

No full Jest/Kotlin suite, build, APK installation, actual native/audio/model execution, emulator, phone or live cloud operation was started. Three small isolated mock probes executed transpiled source in memory, using fake modules and a Node heap cap of 192 MiB. No production module adapters or private user content were used. Only this audit and its evidence documents are written; Claude's implementation and progress files remain unchanged.

## Findings, in priority order

### F1 — P2: Preview admission becomes stale while voice settings are applied

**Location:** `src/ai/tts/speechPreferences.ts:81–88`; related caller `src/ui/components/profile/OfflineVoice.tsx:135`.

`startVoicePreview` checks owner, capture ownership and meeting recording before awaiting `applySpeechPreferences(userId)`. Once that wait finishes it checks only `isSpeechBusy()`, then starts owned speech. It does not revalidate the account or microphone/meeting state at that admission point. Speech initialization inside `startOwnedSpeech` adds another asynchronous boundary without the original admission token.

**Independently reproduced:** keep `configureTts` pending in a fake adapter, allow the initial guards to pass, then (a) switch active owner A→B or (b) acquire the dictation microphone, and release configuration. Both cases return a Preview handle and call `startOwnedSpeech` as `preview:A`. Results are in `evidence/codex-final-audit-940802c-20261106/isolated-probes.json`.

**Consequence:** an old-account Preview can start after the owner changes; a Preview may begin while capture is now active and be recorded by it. No real recording or leak was observed—the violated admission condition is reproduced with isolated adapters. The constant preview text is not a private transcript, but the lifecycle/ownership guarantee does not hold.

**Required follow-up:** carry a cancellable owner/session/lifetime ticket through configuration and speech initialization, and revalidate account plus capture/recording state immediately before actual playback. Handle close/background/unmount while startup is pending. Add deterministic delayed-configuration and delayed-initialization tests for owner switch, mic acquisition, recording start and cancellation. Do not solve this by disabling meetings, dictation or Preview.

### F2 — P2: TTS readiness still contains an unbounded native promise

**Location:** `src/ai/tts/ttsService.ts:275–279`.

`startEngine()` awaits `Tts.setDucking(true)` without the `bounded()` helper used for initialization/language/voice calls. Catching rejection does not bound a promise that never settles. The installed wrapper actually returns the native promise (`node_modules/react-native-tts/index.js:31–35`, Android `TextToSpeechModule.java:258–261`).

**Independently reproduced:** fake getInitStatus/language resolve normally, while setDucking returns an unresolved promise. `initTts()` remains pending at this call. The short probe establishes the missing guard; it does not measure or claim a real vendor-engine hang or a five-second elapsed timeout. The source contains no timeout at this await.

**Consequence:** the advertised bounded readiness/fallback path can hang for a nonresponding bridge call; future callers share the pending initialization promise. This is an incomplete failure mode from an existing call that survived the bounded-readiness work, not an observed physical-device failure.

**Required follow-up:** bound optional ducking setup too, treating timeout/rejection as a recoverable optional-setting failure while retaining strict offline-voice eligibility. Test a never-answering ducking adapter and a later retry. Audit other pre-playback awaits for the same contract.

### F3 — P2: Clear All Data falsely reports deletion when the memory reset fails

**Location:** `src/ui/screens/ProfileScreen.tsx:270–281`.

The normal path now calls `clearForDataReset` and correctly documents retained device settings. But if that call throws, the catch appends 'Saved event defaults could not be forgotten' while the success prefix still says 'All personal scheduling data and saved event defaults have been deleted.' Both statements appear in the same completion message.

**Consequence:** the failure path contradicts itself and claims the successful deletion of data that may remain. `auditA3ClearAllData.test.tsx` tests normal reset/revision/ownership/corrupt value behavior but does not exercise this UI failure branch.

**Required follow-up:** compose the completion result from what actually succeeded. On a memory-reset error explicitly say planner data was cleared but defaults were not, with a recovery action; do not include defaults in the success claim. Add a UI regression with `clearForDataReset` throwing. Do not silently clear another owner's settings or remove the revision fence.

### F4 — P2 documentation/QA: process death is mislabeled as Force Stop

**Locations:** `docs/plans/agy-improvements/reports/SUMMARY.md` area 2 and reminder manual sequence; associated manual/handoff wording. ADR-023 itself correctly describes process death between SQLite commit and native cancellation.

The reported residual is **process death or interruption** after durable state changes but before native invalidation reaches AlarmManager. It should not be described as a guarantee that a reminder can ring after Android Settings Force Stop or `adb shell am force-stop`.

Android's official [Android 15 stopped-state documentation](https://developer.android.com/about/versions/15/behavior-changes-all#enhanced-stop-states) says entering the stopped state cancels pending intents; a user action is required to leave stopped state. This applies on Android 15 regardless of target SDK. Generic app-process death is a different test condition.

**Consequence:** using Force Stop as the main stale-alert test can cancel the alarm itself, masking the real interruption window and producing a misleading pass. The underlying process-death residual remains valid and PARTIAL; the terminology, expected results and test procedures need correction across the summary/manual/handoff.

**Required follow-up:** distinguish process death, explicit Force Stop, and relaunch recovery. Use a controlled fault-injection/kill procedure to test the commit-to-native-cancel window on a designated test environment. Separately document platform stopped-state behavior. Do not promise immediate delivery after Force Stop or try to bypass Android restrictions.

## Earlier A1–A5 audit status

- **A1:** positive metadata and successful voice selection now gate initial local speech. The original unknown-metadata acceptance is corrected. F2 identifies a separate remaining readiness wait.
- **A2:** Calendar now has owner-bound failed-part/retry handling and prior-good-data guards. The inspected UI/source fixes the original silent empty-calendar failure.
- **A3:** normal memory reset, revision fencing and explicit retained settings are added. F3 identifies an incomplete error-result branch.
- **A4:** foreground/native claim arbitration and bounded reconciliation improve the design. The process-death commit→cancel window remains explicitly unimplemented under ADR-023; an asynchronous background callback is not a durable guarantee. F4 corrects the handoff terminology, not the existence of the residual.
- **A5:** final summary/state now exist and all 30 areas have dispositions. Historic lost/overwritten logs and corrected estimated timestamps are disclosed. A correction cannot recreate missing original evidence; retain those exceptions rather than claiming every historical log survived.

## Verification findings

### Git and claimed completion

The observed HEAD is exactly the stated `940802c…`. Application/runtime files have no uncommitted modifications. Remaining untracked original prompt-pack/comparison material is consistent with the reported setup. No runtime source/package/native/script/test difference exists between the tested `d986c3b` and final HEAD; final commits after the code commit are documentation only.

The summary table has exactly 30 areas: **21 CODE_COMPLETE, 7 PARTIAL, 2 DEFERRED_EXTERNAL**. These are Claude's classifications, not blanket independent approval of each area. Seven partial areas are delivery, extended event time, optional Android STT, benchmarks, in-app QA/diagnostics, unrun emulator scenarios and actual STT collection. Backend 29–30 remain external. Device/live statuses remain NOT_RUN.

### Saved host/native evidence

- Final preflight log: **46 suites, 684 passed, 1 skipped**, typecheck/lint and architecture pass (215 modules, 71 offline leaves). The skip is the new opt-in query-timing benchmark, not an original correctness test removed from execution.
- Existing native XML: **6 suite files, 43 tests, 0 failures/errors/skips**. The final saved Gradle logs end in BUILD SUCCESSFUL for debug/dataQa and JS bundling. No suite/build was rerun by this audit.
- PF01–PF13 host contracts pass in the saved evidence. Fake cloud/server adapters do not prove live authentication, subscription enforcement, sync, RAG, document generation, cloud speech or actual capture/audio behavior.
- I found no inspected source change to package.json, authService, entitlements, cloudClient, cloud speechService, online Chat/RAG/document/meeting skills, Login/Register screen modules, meeting screen directory or update modules. Shared storage/UI/voice paths do change, so unchanged clients alone are not an end-to-end preservation proof.
- The ONNX dependency change is restricted to **1.19.2 → 1.22.0** in app/build.gradle. No replacement TTS engine or Kokoro was introduced.

### Independently inspected actual APKs

I streamed the actual APK hashes and parsed ELF program headers and ZIP local-data offsets with a separate small read-only parser, rather than trusting the audit JSON alone:

| Artifact | SHA-256 | Independent inspection |
|---|---|---|
| `app-arm64-v8a-dataQa.apk` | `ef264311182ce10299b2b87a281af7c628b9824e67d45710dc2c1fa349e87e19` | Matches receipt; 16/16 native libraries meet checked 16 KiB PT_LOAD conditions; stored-entry ZIP alignment passes; JS bundled; required Whisper/VAD model names present; no Kokoro names |
| `app-x86_64-dataQa.apk` | `58470f2f9d4ba972e43af6da32839d708aace5124c36703759e6603a699bfd5e` | Same checks pass, 16/16 libraries; matches receipt |

Saved SDK output identifies `com.lafina.capstone`, versionCode 6, versionName `0.6.0-data-qa`, with the recorded debug certificate fingerprint. This audit read that output; it did not independently rerun apksigner or compare with an installed phone certificate.

Alignment and packaged contents are necessary artifact checks, not runtime proof. Android's [16 KiB support guidance](https://developer.android.com/guide/practices/page-sizes) also calls for testing in a suitable environment. Actual loading, Silero/VAD frames after the runtime upgrade, Whisper capture, audio focus, meetings, locked-screen/reboot/Doze delivery and data-preserving phone update remain unobserved. Model names/hashes do not establish publisher provenance or inference accuracy.

## Next action

The partial engineering handoff is useful, but do not treat it as an unqualified code/device acceptance. Address F1–F3 with focused regressions and correct F4 before relying on the manual checklist. Preserve AGY's named capabilities and existing test assertions. Record these as follow-up units rather than rewriting historic reports as if their earlier code included the fixes.

After fixes, run appropriate targeted/full gates and refresh any APK whose bundled source changed, with new hashes and receipts. When the owner is ready, use a designated test phone/emulator and controlled service accounts for the still-NOT_RUN cases. Do not automatically start device actions, deploy or merge based on this audit.

**Changes made by this audit:** only this report and its independent evidence directory. No application code, Claude progress files, builds or devices were changed.
