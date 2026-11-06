# Final-audit remediation: F1–F4

**Date:** 2026-11-06 (UTC in logs). **Run:** `agy-port-20261106` (follow-up unit `CODEX-FINAL-AUDIT-REMEDIATION-1`).

**Audit addressed:** [codex-final-audit-940802c-20261106.md](codex-final-audit-940802c-20261106.md), taken at audited HEAD `940802c`. The owner authorized the fixes, tests, documentation, QA APK rebuild and local commits.

**Result:**

| Finding | Disposition |
|---|---|
| F1, F2, F3 | **CODE_COMPLETE** (host-tested) |
| F4 | **CORRECTED** (documentation) |
| ADR-023 residual (the process-death window) | Stays **PARTIAL**: not implemented |

**Device, emulator and live checks:** NOT_RUN. Overall acceptance stays **PARTIAL / AWAITING DEVICE VALIDATION**.

| Item | Value |
|---|---|
| Branch / worktree | `codex/agy-preservation-improvements` / `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` |
| Starting HEAD | `940802c61457422a1ecefdad7cae5ef90cf0fddb` (verified). Only untracked prompt-pack/comparison/audit files were present, and they were left untouched |
| Code commit (tested) | `f61d1eb69183ac572b20527b5f7016e2b8d471f9`: fix(agy-audit) F1–F3 code and regression tests |
| F4 commit | `0c1b99ace16798c7059a19a11d5a7565e80a8c9d`: docs only |
| This report and tracking | the next commit. Its hash, and the index commit's, are recorded in RUN-STATE.json and the run log (never self-referentially) |
| Tested code | Preflight ran on the working tree that became `f61d1eb`, with nothing else changed in src/ or `__tests__/`. The APKs were built at HEAD `0c1b99a`, whose code is identical to `f61d1eb` |
| Review | Parent self-review only. No independent review of these fixes |

## F1: Preview admission and the microphone race

**Problem (as reproduced by the audit):** `startVoicePreview` checked owner, speech, microphone and recording only before awaiting `applySpeechPreferences`. After that it checked only `isSpeechBusy()`. `startOwnedSpeech` then awaited engine start without any admission. A Preview could therefore start for an old account, or while dictation or a meeting had taken the microphone. Stop/close could not cancel a start that had no playback token yet.

**Change (small, shared, no architectural replacement):**

- **`src/ai/tts/speechPreferences.ts`.** New `PreviewTicket` (`createPreviewTicket(userId)`): a cancellable admission ticket for one Preview.
  - `startVoicePreview(userId, ticket?)` revalidates a synchronous admission function after every awaited step:
    1. the native recording check;
    2. applying the owner's choice (here the "applied owner" must still be this owner);
    3. `initTts()` engine start;
    4. a second native recording check;
    5. finally inside the playback call.
  - Conditions checked: ticket not cancelled, owner still active, applied owner, no app speech, no dictation capture, no app-side recording claim.
  - A handle is returned only once playback really started.
  - `ticket.cancel()` before that means it never plays; after that, it stops this Preview only (owned token).
  - The new refusal `cancelled` reads "Preview stopped."
- **`src/ai/tts/ttsService.ts`.** `startOwnedSpeech(text, owner, admit?)`: `admit` is called inside `speakOwned`, in the same synchronous turn as `Tts.speak`, after the engine is ready. False means nothing is spoken and the outcome is `refused`. That outcome is added to `OwnedSpeechOutcome` and never reaches the sheet as a handle result.
- **`src/ai/native/meetingRecorder.ts`.** `isRecordingClaimed()`: set synchronously when the app calls `start()`; cleared when that start fails or a stop returns.
  - It lets the final, synchronous check see a recording the app is starting, which the native `isRecording()` answer (still used, bounded at 1.5 s) cannot provide synchronously.
  - It does not change recording behavior.
- **`src/ui/components/profile/OfflineVoice.tsx`.** Pressing Preview creates the ticket, marks the sheet as previewing (so Stop is enabled during startup) and shows "Starting Preview…".
  - Stop, the sheet's close button, the app leaving the foreground and unmount all cancel the pending ticket, as well as any playing handle.

**Preserved:**

- A valid Preview still plays once with the owner's saved choice.
- Refusals while speech, dictation or recording is busy, and after an account change, are unchanged.
- The hung recording check still counts as recording.
- Reminder calls and meetings have no new behavior. `speakTextWithTts` is untouched, and the recorder start/stop results are unchanged.
- Preview, dictation and meetings are not disabled.

## F2: bounded ducking

`startEngine()` awaited `Tts.setDucking(true)` without a bound. It is now `enableDucking()`, bounded with the same `bounded()` helper and the 3 s setting bound used for the other optional engine settings.

- **On timeout or rejection:** it recovers. Other audio is simply not lowered, and the timeout is logged.
- **Same start attempt:** after it, the shared start checks its generation as before.
- **Unchanged:**
  - positive offline-voice eligibility (`isPositivelyOffline`, the frozen `speech-contract-v1` passes unmodified);
  - bounded retry and late-result retirement;
  - neutral settings;
  - cloud speech fallback.

**Other pre-playback awaits audited:**

| Await | Bound |
|---|---|
| `getInitStatus` | 5 s |
| `setDefaultLanguage` / `setDefaultRate` / `setDefaultPitch` / `setDefaultVoice` | 3 s |
| `voices()` | 3 s |
| the recording check | 1.5 s |
| `Tts.speak` | not awaited for readiness; event-matched, with its own timeout |

**Remaining unbounded awaits** are on the stop paths only: `Tts.stop()` in `stopOwnedSpeech` and `stopSpeechPlayback`. These settle the owned utterance before awaiting, so a hang there cannot start or hold playback. They were left unchanged (not a pre-playback wait).

## F3: truthful Clear All Data

`ProfileScreen.handleClearData` now runs three steps, each in its own try/catch:

1. planner data (notes, tasks, events, reminders, calendar blocks);
2. chat history and attachments;
3. `personalMemoryStore.clearForDataReset`.

**Result messages:**

- **All steps succeed:** "Data Cleared" with the unchanged success text. The existing `auditA3ClearAllData` assertion still holds.
- **Any step fails:** "Data Partly Cleared".
  - It names what was cleared and what was **not deleted**, adding "some items may remain" for a failed planner step.
  - A failed defaults step gives a recovery step: open Event Defaults and choose Forget all event defaults.
  - A failed planner or chat step says to try Clear All Data again.
  - It keeps the explanation that the offline voice, theme and time format were kept.

**Unchanged:** owner isolation (`assertActive`) and the revision fence inside `clearForDataReset`.

## F4: process death is not Force Stop

The residual is **process death or interruption between the SQLite commit and the native cancel**. Android Settings Force Stop and `adb shell am force-stop` are a different condition: on Android 15 the package enters the stopped state and its pending intents, alarms included, are cancelled until the user launches it ([Android 15 enhanced stop states](https://developer.android.com/about/versions/15/behavior-changes-all#enhanced-stop-states)).

**Corrections in commit `0c1b99a`.** Each is a dated correction; earlier wording is kept struck through or quoted, and no result was rewritten. All the items touched were NOT_RUN instructions, not observations.

| Document | Correction |
|---|---|
| SUMMARY | Area #2, the PARTIAL list, the install sequence and next action 4 |
| MANUAL-QA | M06, M15, and a new **M18** with three separate procedures: **R1** ordinary process death during reconciliation (may ring once; a no-ring is not proof), **R2** explicit Force Stop (nothing is promised while stopped; never used to probe R1), **R3** relaunch/re-registration recovery |
| PRESERVED-FEATURES | PF11 |
| Phase 13 handoff | the PF11 residual and checklist item 2 |
| audit-remediation.md | checklist item 4 |
| Phase 05 | checklist item 2i (meeting process death) |
| ADR-023 | Its analysis already said process death. A correction note now states that prerequisites 2–3 mean ordinary process death (a QA fault-injection point, not built, or killing the debuggable QA process), never Force Stop |

**Not claimed:**

- **The A4 protocol (option C) is not implemented.** The window remains, and #2 stays PARTIAL.
- No delivery is promised while force-stopped.
- Nothing bypasses Android's stopped state.

## Regression tests (added first) and real outcomes

| Test file | Tests | What it holds and asserts |
|---|---|---|
| `__tests__/ai/finalAuditF1PreviewAdmission.test.ts` | 16 | **Pending-step triggers (12 tests).** Configuration (held `setDefaultRate`) and engine initialization (held `getInitStatus`) are each held pending. During the hold: account change, real dictation capture acquisition, app meeting start (the native fake still says not recording), native `isRecording` = true, or ticket cancel. After release, `Tts.speak` is never called and the refusal is exact. The valid Preview still plays once (×2 holds).<br>**Ticket (2 tests).** Cancel after playback stops only that Preview. A ticket for another owner is refused.<br>**Final check (2 tests).** The account changes, or dictation takes the microphone, during the last recording check; only the check immediately before `Tts.speak` catches it |
| `__tests__/ui/finalAuditF1OfflineVoicePending.test.tsx` | 8 | The sheet with configuration or initialization held, then Stop, close (×), background or unmount. After release nothing is spoken; Stop shows "Preview stopped." |
| `__tests__/ai/finalAuditF2Ducking.test.ts` | 4 | **Never-settling ducking:** bounded, and two concurrent `initTts` calls plus readiness all recover.<br>**Rejected ducking:** ready.<br>**Hung, then a later start with working ducking:** succeeds.<br>**Hung ducking with only an unknown-metadata voice:** still not offline |
| `__tests__/ui/finalAuditF3ClearAllDataFailure.test.tsx` | 1 | `clearForDataReset` throws. The planner data is really gone; the defaults and revision really remain; the message does not claim their deletion, names what was not deleted, points to Event Defaults and keeps the device-settings explanation. Another owner's defaults and voice, and this owner's voice, are untouched |

All paths below are under `evidence/agy-port-20261106/final-audit-remediation/`.

**Pre-fix run, against the audited code** (`pre-fix-regressions-1.log`, HEAD `940802c`, no src change): 4 suites failed, **26 failed / 1 passed / 27 total**. Every failure is the intended one:

- `Tts.speak` called once in each of the 8 trigger cases and all 8 sheet cases;
- `createPreviewTicket` not a function (6);
- F2 never-answering cases exceeded the test timeout (3);
- the F3 message contained "saved event defaults have been deleted".

The rejected-ducking test passed before the fix, as expected, because the old code already caught rejection. The two final-check tests were added after this run, so they were not run against `940802c`.

**Focused run after the fixes** (`focused-1.log`): the 4 new suites plus the speech, Preview, A1, A3, TTS, cloud-speech and AGY-PORT 05 microphone/recording suites. **13 suites, 114/114 passed.** This was before the two final-check tests were added.

**Mutation run** (`mutation-1.log`, harness `mutate-final-audit.py`, same rules as Phase 12): **8 of 9 killed**, and every file was restored byte-identical (sha256). The `git diff src` hash was identical before and after the run.

- **Q2 SURVIVED.** It removes only the revalidation right after applying the voice choice. That check is redundant on its own: the post-engine-start check and the final synchronous check refuse the same cases, and no outcome changes. The log says CHECK FAILED and is kept; Q2 is not reported as killed.
- **Killed:**
  - Q1, the final pre-`Tts.speak` check;
  - Q3, the owner check;
  - Q4, the dictation-microphone check;
  - Q5, the app-side recording claim;
  - Q6, the cancelled ticket;
  - Q7, the sheet not cancelling a pending start;
  - Q8, unbounded ducking;
  - Q9, a failed defaults step reported as a full deletion.

**Preflight** (`preflight-1.log`, 13:45:05Z–13:47:08Z): **PASS**.

- Typecheck and lint (max-warnings 0) pass.
- Jest: **50 suites, 713 passed + 1 skipped** (Phase 13: 46 suites, 684 + 1; +29 new tests).
- Architecture: 215 modules, 0 cycles, 0 forbidden dependencies, 71 offline leaves with no network reach.
- **The skip** is the existing opt-in query-timing benchmark, unchanged.
- **Unchanged and passing:**
  - every original test, including `agyPort10Speech`, `agyPort10OfflineVoice`, `auditA1OfflineEligibility`, `auditA3ClearAllData`, `phase05TtsAndCloudSpeech` and the AGY-PORT 05 microphone/recording suites;
  - the protected-feature contracts (`agyPreservedContracts`, PF01–PF13);
  - `evaluationContracts` with the frozen v1 fixtures (`git diff 940802c -- evaluation` is empty).
- The 29 `console.error` lines equal the Phase 13 baseline count.

**No original test or assertion was changed or removed.** The existing Offline Voice UI test (which mocks `startVoicePreview`) passes unchanged.

## Native tests and builds (one job at a time, one Gradle worker)

About 1.18 GB of RAM was free. No unrelated process was stopped and no setting was changed. Recipes are the documented Phase 11/13 ones: JDK 17, the bundle from the real path, native work from the `X:` alias, and `skip-prebuilt-bundle.init.gradle`.

| Step | Log | Result |
|---|---|---|
| JS bundle `:app:createBundleDataQaJsAndAssets` | `gradle-bundle-dataqa-1.log` | BUILD SUCCESSFUL, bundle task **executed** (1 executed, 10 up to date). New Hermes bundle `f86e13af…bc67`, 5,231,904 B (Phase 13: `e448f8ea…a91c`, 5,226,992 B) |
| dataQa assemble (`--offline`, prebuilt bundle) | `gradle-assemble-dataqa-1.log` | BUILD SUCCESSFUL, 12 executed / 244 up to date; bundle task SKIPPED by the init script, as designed |
| Kotlin `:app:testDebugUnitTest --rerun` + `:app:assembleDebug` | `gradle-unit-assemble-debug-1.log`, `kotlin-results-1.txt` | BUILD SUCCESSFUL. The test task **executed** (not UP-TO-DATE): **43 tests in 6 suites, 0 failures/errors/skips**, XML timestamps 13:51:12Z |
| Debug APKs | the same log | **Not rewritten.** Gradle found every input unchanged. The debug APKs package no JS (they load from Metro), and no native or resource input changed. Their hashes equal Phase 13's, and they serve the corrected JS from Metro |

## Fresh artifact receipts

These are build outputs, not committed. Sources: `artifact-hashes-1.txt`, `apk-audit-*-1.json`, `sdk-tools-1.log`, `sdk-tools-apksigner-1.log` and `bundle-markers-1.txt`.

| File (under `android/app/build/outputs/apk/`) | Bytes | SHA-256 |
|---|---|---|
| `dataQa/app-arm64-v8a-dataQa.apk` (phones) | 163,257,936 | `2502aec34ffb3f349e43dd9d1c202e8f549a26a0595e8961c58a51ecb95689ba` |
| `dataQa/app-x86_64-dataQa.apk` (emulators) | 169,577,888 | `a0bf18e5ce2b87a03097895231e67e3f1b7735a656b05272e1ca12417b5c91f2` |
| `debug/app-arm64-v8a-debug.apk` (unchanged) | 159,718,559 | `0629c828072dfd5c3f8ab27e0f9838251965d78018dbf9ff32b2a0cc6d2b466e` |
| `debug/app-x86_64-debug.apk` (unchanged) | 166,317,039 | `0756c1236c0a5f1942feb6de651acd470d71606825813629146e8f54d073d63a` |

**The packaged JS comes from the corrected code:**

- **Bundle hash.** Each dataQa APK's `assets/index.android.bundle` hashes to `f86e13afe42dfc9588a6bea6aaf70a75cc0e10c83cdaeece943f7fefd5d8bc67`, the bundle built from `f61d1eb`.
- **Fix-only markers.** Strings that exist only in the fix are present once in each bundle (ASCII or Hermes UTF-16): "Data Partly Cleared", "Ducking setup did not answer", `isRecordingClaimed` and "Starting Preview…".
  - "Preview stopped." is also listed in that receipt. It existed before the fix, so it is only a control string, despite the receipt header.
- **Why the APK sizes did not change.** The APK byte sizes equal Phase 13's although the stored (uncompressed) bundle grew by 4,912 B: the following entries are aligned to 16 KiB, and the padding absorbed the growth. The file hashes and the packaged-bundle hashes differ, as expected.

**Audits and identity:**

- **APK audits, both ABIs: PASS.**
  - Inventory: bundled JS, Whisper `ggml-base.en-q5_1.bin` and `silero_vad.onnx` present, no Kokoro entries.
  - ELF: 16/16 libraries meet the 16 KiB `PT_LOAD` check.
  - ZIP: 302 stored entries, 0 alignment failures.
- **`zipalign -c -P 16 4`:** exit 0 on both ABIs.
- **Identity (`aapt2`), unchanged:** `com.lafina.capstone`, versionCode 6, versionName `0.6.0-data-qa`, target/compile SDK 36, debuggable, the same permission list as Phase 13.
- **Signer (`apksigner`):** verifies with v2. One signer, `CN=Android Debug`, certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`, unchanged.
  - `sdk-tools-1.log`'s apksigner step printed nothing because of a shell-quoting mistake. It is kept as written, and the signer was recorded separately in `sdk-tools-apksigner-1.log`.
- **Unchanged since `940802c`:** ONNX Runtime 1.22.0, `android/`, `package.json`/lock, the cloud client hosts and wire, the signing references, and the release/update behavior.

## Still NOT_RUN, and what stays partial

**Device, emulator and live checks: all NOT_RUN.** These include:

- M18, the new device checks for F1 (a Preview cancelled during startup, contention with dictation, recording and account change);
- the normal Clear All Data path, and reminder procedures R1–R3;
- the M01–M17 checks.

No phone was installed or touched, and no emulator was started.

**Still partial or external:**

- **#2:** the ADR-023 option C invalidation marker and its QA fault-injection point.
- **The other PARTIAL areas:** 14, 17, 24, 25, 26 and 27.
- **DEFERRED_EXTERNAL:** backend 29 and 30.

**Not proven on the host:**

- **F1:** the real Android audio and microphone race on a device. The host tests use the Jest react-native-tts fake and fake native recorder and capture modules.
- **F2:** a real vendor-engine ducking hang.
- **F3:** a real storage failure during reset. In the host test it is induced by a mock.

## Manual checklist (all NOT_RUN)

1. Install only the arm64 dataQa APK, in place, on an authorized test phone. Check SHA-256 `2502aec3…89ba` first. Follow the safe-update rules in MANUAL-QA.md and never uninstall or clear data.
2. **Preview cancellation (M18 a).** Profile → Offline Voice with a saved speed. Press Preview, then immediately Stop, close the sheet, or press Home.
   - Expected: no Preview audio afterwards, and the notice says "Preview stopped."
3. **Preview contention (M18 b).** Press Preview, then immediately start dictation, start a meeting recording, or switch account.
   - Expected: no Preview audio once the microphone, a recording or another account is active.
   - A plain Preview still plays and stops.
4. **Clear All Data (M18 c).** Save Event Defaults, then Clear All Data.
   - Expected: "Data Cleared", no defaults offered on a new event draft, and the offline voice is kept.
   - The failure wording can only be host-tested.
5. **Reminders (M18 d).** Run R1, R2 and R3 separately, as written in MANUAL-QA.md. Do not use Force Stop to probe R1.
