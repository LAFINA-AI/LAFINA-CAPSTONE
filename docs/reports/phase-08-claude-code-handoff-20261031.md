# Claude Code implementation handoff — Phase 08 ACK/audio failures

You are taking over implementation and emulator testing of LAFINA-CAPSTONE from Codex. This is a focused repair task, not another full audit. Work from this existing local checkout:

`C:\L3mxr\Github Repositories\LAFINA-CAPSTONE`

The owner has explicitly approved Phase 08 and now wants Claude Code to fix its remaining spoken ACK failures, rerun the affected emulator tests, preserve manual fallbacks and existing data, and finish the report/checklist. Do not request Phase 08 approval again. Phase 09+ is NOT approved. Use one agent and one device controller; do not delegate a broad audit. Codex is handing off and should not run competing tests or edits.

## 1. Non-negotiable safety and product rules

- Read `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\AGENTS.md` first, then `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\.codex\skills\graphify\SKILL.md`. Follow applicable local instructions. This handoff supplies the current owner-authorized Phase 08 scope.
- Expected branch: `codex/phase-07-audit-hardening`; verified HEAD: `98bef88c3ae0fabee677c1466417fc34c0af738c`. Verify afresh. The substantial dirty tracked AND untracked Phase 08 work is intentional and valuable. Preserve newer work. Do not reset, checkout another branch, clean, stash away the implementation, overwrite files wholesale, or start from a clean clone.
- No pull/merge from origin/main: at the last remote check main/Nol pointed to an incompatible replacement application. No commit, push, publication or deployment is requested by this handoff.
- `C:\L3mxr\Github Repositories\LAFINA` is strictly READ ONLY, pinned at `f7e70aec54e6d16e627f444f2a67114cbfb07b5e`. Do not modify it.
- Never uninstall the app, clear app data, replace its database, wipe userdata, delete emulator locks, or reset snapshots. Preserve both saved guests and all historical evidence.
- Answer must not ACK and must not start recording. Microphone capture requires deliberate visible interaction. A permission grant alone must not start recording. Keep typed/manual controls working after all speech failures.
- ACK means alert acknowledged; the task remains TODO. Snooze must make one durable replacement generation with consistent reminder/job state. Keep explicit copy/edit, Review response and Confirm before voice/text side effects.
- Do not make failed recognitions pass by accepting arbitrary words, fuzzy matching, bypassing confirmation, weakening reference assertions, or expanding the grammar to cover a bad synthetic hypothesis.
- No accounts, backend, Gemini, handbook RAG, Kokoro, new/unapproved models, cloud STT or always-on mic. Do not enable live host microphone input for emulator tests.
- V05 remains NOT RUN by owner decision: “Keep V05 pending until suitable audio is available.” Synthetic voices do not meet its local-accent requirement. All 48 physical-phone rows remain NOT RUN, and human acceptance remains unsigned.

## 2. Verified current state and remaining work

Phase 08's native offline reminder response flow is implemented. The remaining blocker is unreliable spoken ACK through the emulator capture/recognition chain. A03 is visible spoken ACK through copy/review/Confirm; V03 repeats that ACK path with independent fixtures; V04 repeats spoken snooze.

The latest completed comparison used the separate stable Android 15 guest with the already downloaded isolated SDK emulator 37.2.13. It retained all five planned trials:

| Trial | Result | Observed failure layer |
|---|---|---|
| A03/1 | FAIL | Transcript ready, 30 characters, expected ACK reference did not match |
| V03/1 | FAIL | Transcript ready, 25 characters, expected ACK reference did not match |
| V03/2 | FAIL | No transcript; terminal `NO_AUDIO_SIGNAL` |
| V04/1 | PASS | Exact pinned snooze, explicit review/Confirm, durable SQL checks |
| V04/2 | PASS | Same scoped checks on an independent fresh fixture |

All five had source RPC completion, host microphone OFF, visible recording proof and native gate ALLOW. Source completion is NOT proof of guest PCM delivery. All five independently verified restoration to the working QA baseline, zero active jobs/registrations, and reviewed fixture removal. The first hold reports LANGUAGE_UNAVAILABLE, then the existing Whisper fallback uses a second deliberate visible hold. Do not assume this fallback is the cause; it is an observed condition.

Authoritative latest cohort:

`C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\docs\reports\evidence\phase-08-stable-sdk1-20261031T002719400928Z-b70212.json`

It links each parent result, SHA-256 and ignored private evidence directory. In particular inspect those linked private `instrumentation.log` files for the pinned synthetic hypotheses; public summaries intentionally omit raw transcripts. Some parent `nativeStrictReferenceAssertionAttempted` fields are null and outcomes UNKNOWN. Distinguish that from an actually observed reference comparison and its true/false match result; do not upgrade UNKNOWN to a passed assertion.

As of this handoff's read-only check, serial emulator-5554 responds as `LAFINA_Phase08_API35`, API35, and no `com.lafina.capstone.test` instrumentation process was found. Discover state again before acting.

The old current matrix still records the prior capture campaign's **45 PASS / 2 FAIL / 1 NOT RUN**. It has NOT yet been reconciled with these newer stable-guest experiments. The stable follow-up report, final restoration of both guests, and the new manual/typed smoke have NOT been completed. Do not treat their absence as a pass.

## 3. Orient efficiently with Graphify and targeted evidence

Graphify official package graphifyy 0.9.96 is installed. If PATH is stale use:

`C:\Users\USER-PC\.local\bin\graphify.exe`

Use `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\.codex\skills\graphify\references\query.md`: derive/select actual graph-vocabulary tokens, then run bounded queries before the first source search/read for each new codebase question. Prefer focused explain/path and located source spans. Known vocabulary includes microphone, capture, audio, speech, whisper, decoder, boundary, transcriber and emulator; verify against the current graph. Do not load the whole graph/report into context, reinstall Graphify, request keys, or invoke paid semantic extraction. The hook is passive. After code edits run `graphify update .` yourself. Partial Kotlin/C++/Gradle coverage is navigation evidence, not proof.

Start with these compact documents, noting stale statements:

- `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\docs\reports\CURRENT-STATUS.md` — the active stable section is stale: it still says the blocking plan is in progress. This handoff and linked terminal results are newer.
- `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\docs\reports\phase-08-capture-fix-report.md` — previous closed capture campaign and host/gate verification.
- `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\qa\PHASE-08-EXECUTION.md`.
- `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\qa\PHASE-08-MANUAL.md`.

Read older audits/reports only to answer a specific question. Historical JS528/35 suites, JVM81/8 suites, native53, frozen64 and storage/decoder/TTS results are not fresh executions for this handoff.

Relevant stable evidence, all under `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\docs\reports\evidence\`:

- `phase-08-stable-plan.json`, `phase-08-stable-provision.json`, `phase-08-stable-create-boot-v2.json`, `phase-08-stable-install.json` — separate guest/tool provenance and setup.
- `phase-08-stable-cold1-20261030T231624920058Z-89a48d.json` — realtime: three PASS/one lexical FAIL; fifth slot NOT RUN after a pre-recording UI dump timeout. The private dump bound was then changed from 5s to 15s, not an audio-budget change.
- `phase-08-stable-realtime-finding.json` — wrong-word diagnostic, not a supported ACK alias.
- `phase-08-stable-block1-20261030T233833043335Z-25abc2.json` — SDK-default blocking: three PASS/two FAIL; an unchanged second block was not run.
- `phase-08-stable-prepared-plan.json`, `phase-08-stable-prepared-stall-recovery.json`, `phase-08-stable-saved-disk-recovery.json` — format-only preopening before native recording stalled the guest; rejected.
- `phase-08-stable-primed-plan.json`, `phase-08-stable-primer-recovery.json`, `phase-08-stable-primer-reverified.json` — generated-zero blocking priming also stalled before speech submission; rejected. Disk integrity/schema3 and exact interrupted-fixture cleanup passed after recovery.
- `phase-08-stable-isolated-sdk-plan.json`, `phase-08-stable-sdk1-boot.json`, and the latest cohort above — changing emulator engine also did not repair ACK reliability.
- `phase-08-stable-source-hashes-final.json` — all 33 reviewed source hashes still match the prior candidate; no production/test/public-harness source change during the stable-guest follow-up.
- `phase-08-stable-artifacts-final.json` — fresh seven-APK /84-ELF /six-model inspection PASS, hashes still verified at handoff.

Retain every failed/preflight attempt. A prepared-parent early failure incorrectly left `sourceProcessLaunched=false` although the preparation Node process had launched; the pinned speech stream was NOT submitted. Correct this interpretation in derived evidence, without rewriting the historical raw result. Generated-zero/format offers are not SDK registration acknowledgements.

## 4. Device ownership, identities and restoration

Only one VM runs at a time; both saved guests can use emulator-5554. Serial alone is insufficient. Validate exact AVD name/API before EVERY mutating workflow. Never target a connected physical phone.

Original saved guest:

- AVD `Medium_Phone`; API37 preview, x86_64, 16KiB pages. Currently shut down, userdata preserved.
- Fresh read-only preservation check passed 10/10 before switching: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\docs\reports\evidence\phase-08-stable-original-before.json`.
- Original app preferences: lead15, text reply, delivery OFF/full-screen OFF; recorded radios 0/1/1. Use its four historical private baselines for exact restoration, not guessed values.

Separate guest:

- AVD `LAFINA_Phase08_API35`; Android15/API35, Google APIs x86_64 image revision9, 4096-byte pages; currently last launched with isolated emulator37.2.13.
- Saved userdata: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\.local\phase08-stable-device-v2\userdata.avd`.
- Isolated AVD registry: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\.local\phase08-stable-device-v2\avd-registry`. Set ANDROID_AVD_HOME only in this guest's child launcher environment. Do not alter the global registry.
- Working QA settings: lead0/text/quiet OFF/delivery ON/full-screen OFF; airplane1/Wi-Fi0/mobile_data0. Its separate baseline has lead15/delivery OFF and radios0/1/1. Baseline:
  `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\.local\phase08-emulator-suite\st20261031\baseline.json`.
- Run ownership registry is `st20261031`; do not use the original `ex20261028` registry on this new guest.
- GPU host/WHPX; requested RAM2048MiB was raised by SDK to2560MiB. Do not describe this as a matched-memory or phone-performance comparison.

Existing tooling:

- Installed SDK remains unchanged at37.1.11: `C:\Users\USER-PC\AppData\Local\Android\Sdk\emulator\emulator.exe`.
- Isolated verified Google SDK37.2.13: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\.local\phase08-emulator-37.2.13\emulator\emulator.exe`. See the existing isolated-SDK provenance/signature JSONs before reuse; do not upgrade the global SDK.
- ADB: `C:\Users\USER-PC\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
- Python: `C:\Python314\python.exe`; Node is available.
- JDK17: `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`.

Both guests' reviewed installed candidate is `com.lafina.capstone`, 0.8.0-data-qa/code11/schema3:

- App SHA256: `7300f2aefeb8d5f90882655d46435b100a12531e16a7c70df4f81230f4160454`.
- Test APK SHA256: `abb103afe1dab0bef0646734d126391a355cf2a1a7fb664401544db57b71b0a9`.

Inspect private helpers before running; older ones hardcode the original AVD/run/baseline. Useful latest helpers under `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\.local\`:

- `phase08-stable-mic.py` — stable wrapper, explicit --run, reviewed realtime parent.
- `phase08-capture-fix-reviewed-mic.py` — reviewed parent. Imports ignored original helpers but stable wrapper overrides RUN/arguments; preserve that ownership fence.
- `phase08-stable-sdk-cohort.py` / `phase08-stable-sdk-cold.py` — latest fixed-order cohort and isolated-engine preserved-data cold boot. Existing evidence paths are exclusive; choose new labels/paths for new runs.
- `phase08-stable-fallback-smoke.py` — PREPARED BUT NOT RUN; inspect before execution. Intended A01 manual ACK/A02 typed ACK/A04 manual snooze with independent SQL and reviewed cleanup.
- `phase08-capture-fix-restoration-sha-root.py` — original guest read-only restoration checker; use ONLY after verifying Medium_Phone, not on API35. New output can be `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\docs\reports\evidence\phase-08-stable-original-after.json` (not yet created).

If a guest stalls, stop issuing audio trials. Attempt bounded graceful shutdown first. If it fails, identify the exact owned new-AVD launcher/engine by executable path and command line before stopping only those processes; never kill all emulator/ADB/Node processes. Preserve disks/locks. Reopen the same disk, verify schema3/quick_check/data/preferences/host-input OFF, and clean only the exact registered interrupted fixture through reviewed UI. The recovery records show what was actually done previously.

## 5. Diagnose before another comparison campaign

Start by stating three or fewer competing hypotheses and the smallest test that distinguishes each. Review existing failed evidence first. Budget roughly 60–90 minutes for a bounded diagnostic round, not as a promise of a fix. If there is no discriminating result, record the blocker and next concrete experiment; do not spend hours repeating an unchanged protocol or report success from occasional passes.

Separate these layers:

1. Producer pacing/byte format, source RPC and guest virtual-input delivery.
2. Android AudioRecord readiness/source/session/audio focus and PCM content, including first-hold on-device failure to Whisper fallback.
3. Boundary trimming/resampling and Whisper decoding on the exact same PCM.
4. Native gate authorization, displayed transcript, explicit copy/review/Confirm and durable paired SQL.

Neither a completed RPC nor a decoder-only pass proves end-to-end microphone success. Compare controlled pinned synthetic PCM through the existing direct decoder with actual-capture evidence where justified. If diagnostics need temporary captured PCM, restrict them to explicit synthetic-only DataQa instrumentation, keep files ignored/private, define bounded retention/cleanup, and ensure no exporter reaches production APKs. Do not log or publish real audio, transcripts, tokens or emulator discovery credentials.

Graph-located starting points under `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\` (use Graphify before new exploration):

- `scripts\phase08-emulator-audio.mjs` — source format, pacing, visible proof, deadline/privacy evidence.
- `scripts\phase08-emulator-audio.test.mjs` and `scripts\phase08-emulator-audio-realtime.test.mjs` — focused host tests.
- `android\app\src\androidTest\java\com\lafina\capstone\reminders\ReminderMicrophoneUiTest.kt` — actual pointer hold, READY/gate/reference diagnostics.
- `android\app\src\androidTest\java\com\lafina\capstone\voice\Phase08ResponseDecoderProbeTest.kt` — existing opt-in pinned decoder probe; not a microphone test.
- `android\app\src\main\java\com\lafina\capstone\voice\PcmCapture.kt`, `SpeechInput.kt`, `WhisperTranscriber.kt`, `AnsweredDictationPanel.kt`.
- `android\app\src\main\cpp\jni\whisper_jni.cpp` — current reminder English hint/beam3/peak-relative boundary. Do not change thresholds/prompt/decoder parameters simply to fit one clip.

Preserve the reviewed timing/privacy safeguards unless concrete evidence justifies a documented change: realtime20ms anchored pacing, 5ms minimum post-prefill spacing, <=200ms prefill, both100ms lag/lateness guards; source gain500/padding1000ms each side/delay0; fresh visible proof before pinned speech; native QA gate12s, production capture15s/ringing60s; independent source deadline and teardown reservation. Prepared format-only and blocking-zero preopening stalled this guest and must not be retried unchanged.

Specifically review evidence-field accuracy, producer-abort accounting and native diagnostics. Distinguish launch requested/launched, source attempted/completed, generator bytes offered versus transport acknowledgements, RPC completion versus captured signal, gate ALLOW/ABORT/INVALID/timeout, observed comparison versus attempted assertion, reviewed UI outcome, SQL outcome and cleanup. Expected gate-abort controls are not recognition passes or ASR errors. A pre-recording UI failure is NOT RUN for recognition, not a decoder failure.

## 6. Implement and verify an evidence-supported repair

- Make a small, testable fix at the layer shown to be wrong. Keep manual/text safety and public error reporting. Prefer a regression test for a demonstrated defect. A performance-affecting architecture/model change needs an ADR and measured evidence; no new models are approved.
- Run focused host/native checks for changed code. If pacing changes, validate both host tests AND a real-clock Windows dry run, without SDK/audio, before actual comparison trials. Historical 30 host checks/five clock dry runs/three gate controls were previously successful but are not fresh for a changed sender.
- Build only what changed. For a new candidate record exact source/APK/model hashes and in-place data-preserving install evidence. Never claim the old installed hash tests a new source edit.
- Only after a justified correction, freeze the comparison protocol and source hashes before running it. Use independent fresh registered fixtures. Target two preserved-data cold cohorts, each A03 once/V03 twice/V04 twice (10 total), retaining every result. If the first cohort still shows the same failure and nothing changed, do not run an unchanged second cohort merely to accumulate passes. Mark it NOT RUN and diagnose or close truthfully.
- A positive ACK requires actual visible hold/capture, exact supported pinned reference, explicit copy/review/Confirm, paired ACKNOWLEDGED, task TODO and zero registrations. Snooze requires the correct future job/generation and consistent paired state. Verify SQL independently of the UI driver.
- Run the manual/typed fallback smoke and relevant interruption/denial/gate controls if affected. Do not rerun every unaffected full suite/build merely to orient. Before completion, run repository-required gates appropriate to the actual final change and state exactly what was NOT RUN.
- After each trial verify source/controller termination, host microphone OFF, no active recording, exact permission/AppOps restoration and owned-fixture cleanup. Soft removal hides fixtures while retaining saved text/history/operation receipts; never describe it as permanent erasure.

## 7. Finish restoration and factual documentation

Restore the new guest to its own saved baseline through reviewed UI/settings: complete preference payload and native delivery, radios/automatic time/timezone/display, permission flags/AppOps, audio/power state, original rows, zero active jobs/registrations/recording, host input OFF and exact owned synthetic-file cleanup. Compare baseline raw observations where necessary; do not invent baseline values.

Preserve and gracefully stop the new guest, then reopen original Medium_Phone with its original registry/SDK and run the original read-only checker against its four baselines. Do not copy data between guests or blindly reuse a helper expecting lead0/deliveryON against the original restored lead15/deliveryOFF. Report any mismatch without overwriting unknown state.

The existing original checker also pins the previous 33-source/seven-APK ledgers. If your fix changes source or rebuilds those host APK paths, its old artifact checks will correctly fail. Preserve that checker and its evidence. Create a reviewed follow-up checker that keeps the original data/settings comparisons, binds the original guest's actually installed candidate separately from the new test guest, and verifies new host source/APK identities against fresh ledgers. Do not rewrite historical hashes, suppress a mismatch, or upgrade the original app merely to satisfy the old checker.

Create `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\docs\reports\phase-08-stable-emulator-report.md` using `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE\templates\PHASE-REPORT.md`, and update the current Phase 08 report/index, execution checklist, manual, relevant requirements/release gate and matrix. Archive the exact previous matrix before reconciliation. Keep earlier cohort results historical and all failed attempts linked; do not cherry-pick a later pass or mix platforms into an unqualified accuracy denominator.

The report must state changes, diagnosis versus unresolved hypotheses, exact commands/logs, tested APK/source identities, engine/guest/API/page-size/effective RAM, each retained attempt, host/native/SQL evidence layers, restoration, test counts, NOT RUN checks and risks. No phone accuracy/audibility/performance claims from emulator or mock success.

Finish with a plain-language reviewer summary, report/evidence links and a concrete short manual checklist: what compatible ARM64 QA build to install without losing known-lineage data; what to open; how to create a fresh airplane-mode reminder; Answer without ACK/auto-mic; deliberate hold/copy/edit/Review/Confirm ACK leaving TODO; fresh snooze creating one future job; deny/interrupt capture and use typed/manual controls; optional offline system TTS Read/Stop; expected results and settings restoration. Mark all physical checks and V05 NOT RUN.

Do not certify Phase 08 as passed while emulator reliability failures or required human validation remain. End with `STATUS: BLOCKED` if automated reliability remains unresolved, or `STATUS: AWAITING DEVICE VALIDATION` if those automated gates pass but phones remain pending, followed by `STOPPED — awaiting explicit human approval`. Do not start Phase 09.

Begin now with fresh Git/device verification, a short execution checklist and the first discriminating diagnostic. Continue the authorized repair; do not stop at a proposal or repeat the whole audit.
