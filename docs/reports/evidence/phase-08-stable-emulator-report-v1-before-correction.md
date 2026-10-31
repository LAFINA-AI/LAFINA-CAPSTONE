# PHASE 08 — Stable-emulator spoken-ACK diagnosis / Follow-up Report

**Branch / commit SHA:** `codex/phase-07-audit-hardening` / base HEAD `98bef88c3ae0fabee677c1466417fc34c0af738c` (local working-tree patch; no commit, push, merge or deployment)  
**Date/time UTC:** 2026-10-31, approximately 01:50–02:50  
**Device(s) available:** emulators only — `LAFINA_Phase08_API35` (Android 15/API35, Google APIs x86_64 rev9, 4 KiB pages) and the original `Medium_Phone` (observed SDK 37, codename `REL`, x86_64, 16 KiB pages). No physical phone.  
**Status:** `BLOCKED` (emulator spoken-ACK reliability unresolved; physical validation NOT RUN)  
**Phase approval provenance:** Phase 08 approved by the owner; scope from [Claude Code handoff 2026-10-31](phase-08-claude-code-handoff-20261031.md). Phase 09+ NOT approved.

## 1. Scope completed

- Fresh Git/device verification: branch and HEAD as expected; the dirty Phase 08 tree preserved; one emulator (`LAFINA_Phase08_API35`, API35) connected; no instrumentation process.
- Bounded diagnosis of retained A03/V03 failures, separating producer, guest HAL/capture, decoder and gate/confirmation layers. **Failing layer identified** (section 5).
- One evidence-driven repair experiment (null host audio backend), frozen before execution; **refuted** by its first cohort. The second cohort is NOT RUN under the frozen stop rule.
- Manual/typed fallback smoke (A01/A02/A04) on API35: **PASS 3/3**.
- API35 guest restored to its own baseline; original `Medium_Phone` reopened and verified **10/10** read-only; both guests gracefully stopped.
- Derived evidence corrections, a stable-guest case ledger, matrix reconciliation (archived first) and this report.

Not done: no production, test, model, prompt, threshold, grammar or public-harness change; no new candidate APK. V05 and every physical-phone row remain NOT RUN.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `.local/phase08_hal_integrity.py` (ignored, new) | Read-only guest HAL integrity summary per capture: virtio-snd capture/playback I/O errors, HAL late-frame silence insertions, captured/fixture energy ratio | Evidence-field accuracy: distinguish device-faulted capture from ASR failure; never changes a trial status | [retrospective](evidence/phase-08-stable-hal-integrity-retrospective.json) |
| `.local/phase08-stable-audio-cold.py` (new) | Copy of reviewed `phase08-stable-sdk-cold.py` plus explicit `--audio-backend` and verification of the running engine command line | Test-platform experiment only | [nullaudio1 boot](evidence/phase-08-stable-nullaudio1-boot.json) |
| `.local/phase08-stable-hal-cohort.py` (new) | Copy of reviewed `phase08-stable-sdk-cohort.py` plus engine-backend binding, `--probe`, per-trial HAL record | Same parent, SQL and restoration rules | [probe](evidence/phase-08-stable-nullprobe-20261031T022333343243Z-99a1d2.json), [null1](evidence/phase-08-stable-null1-20261031T022535065671Z-9fbf9f.json) |
| `.local/phase08-stable-fallback-smoke-v2.py` (new) | Corrected copy of the never-executed prepared smoke: A04 expects PENDING/SNOOZED (the prepared copy wrongly required PENDING/PENDING), replacement 9–11 min ahead, reviewed interpreter, FAIL recording, before/after baseline comparison | Prepared helper would have falsely failed A04 | [smoke](evidence/phase-08-stable-fallback-smoke.json) |
| `.local/phase08-stable-final-restore.py` (new) | API35-only restore/verify via suite `restore-preferences`/`compare`, allow-listed radio commands, compare-only permissions/AppOps/power/audio | Restoration to the guest's own baseline | [first FAIL retained](evidence/phase-08-stable-final-restoration.json), [verified PASS](evidence/phase-08-stable-final-restoration-verified.json) |
| `.local/phase08-stable-switch-to-original.py` (new) | Identity-checked graceful stop of API35 and single original launch (installed SDK, global registry, last documented arguments) | Avoids the old boot helper that hardcodes working lead0/delivery-ON | [switch](evidence/phase-08-stable-switch-to-original.json) |
| `docs/reports/evidence/*` (new) | Plan, retrospective, derived prepared-parent interpretation, follow-up ledger, case ledger, matrix archive and reconciliation | Factual, versioned evidence | links below |
| Docs | This report; status/index/checklist/manual/matrix/release-gate pointers | Keep docs current | section 7 |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence |
|---|---|---|---|
| Git/device identity | `git rev-parse HEAD`; `git status --short`; `adb devices -l`; `adb -s emulator-5554 emu avd name`; `getprop ro.build.version.sdk` | PASS (98bef88…, API35 guest) | this report |
| Graph navigation | `graphify query "pcm capture boundary silence signal whisper transcriber" --budget 1800` | PASS (navigation only) | — |
| Retrospective HAL review (read-only) | `adb -s emulator-5554 logcat -d -v UTC -b main,system` (saved privately); `python -I .local/phase08-stable-hal-retrospective.py <saved-logcat> 0.44` | RECORDED | [retrospective](evidence/phase-08-stable-hal-integrity-retrospective.json) |
| Frozen plan | written before any mutation | FROZEN | [plan](evidence/phase-08-stable-null-audio-plan.json) |
| Preserved-data cold boot, `-audio none` | `python -I .local/phase08-stable-audio-cold.py --reboot-preserving-data --label nullaudio1 --audio-backend none` | PASS (rows/prefs/settings/APKs equal, host input OFF) | [boot](evidence/phase-08-stable-nullaudio1-boot.json) |
| Probe A03 (excluded from comparison) | `python -I .local/phase08-stable-hal-cohort.py --run --probe --label nullprobe --expect-audio-backend none` | PASS (exact reference, review/Confirm, SQL; 0 device I/O errors) | [probe](evidence/phase-08-stable-nullprobe-20261031T022333343243Z-99a1d2.json) |
| Cohort null1 (A03, V03×2, V04×2) | `python -I .local/phase08-stable-hal-cohort.py --run --label null1 --expect-audio-backend none` | 2 PASS / 3 FAIL | [null1](evidence/phase-08-stable-null1-20261031T022535065671Z-9fbf9f.json) |
| Cohort null2 | — | NOT RUN (frozen stop rule) | [plan](evidence/phase-08-stable-null-audio-plan.json) |
| Manual/typed fallback smoke | `python -I .local/phase08-stable-fallback-smoke-v2.py --run` | PASS 3/3 | [smoke](evidence/phase-08-stable-fallback-smoke.json) |
| API35 restoration | `python -I .local/phase08-stable-final-restore.py --run` then `--run --output docs/reports/evidence/phase-08-stable-final-restoration-verified.json` | first FAIL (audio comparison too strict, nothing overwritten); verified PASS | [FAIL](evidence/phase-08-stable-final-restoration.json), [PASS](evidence/phase-08-stable-final-restoration-verified.json) |
| Stop API35 / reopen original | `python -I .local/phase08-stable-switch-to-original.py --run` | PASS | [switch](evidence/phase-08-stable-switch-to-original.json) |
| Original read-only checker | `python -I .local/phase08-capture-fix-restoration-sha-root.py --output docs/reports/evidence/phase-08-stable-original-after.json` (no mutation switches) | PASS 10/10 | [original after](evidence/phase-08-stable-original-after.json) |
| Stop original | identity `Medium_Phone` then `adb -s emulator-5554 emu kill`; 0 engines remaining | PASS | this report |
| Source/APK identity | follow-up ledger recomputation | 33/33 sources, 7/7 host APKs equal | [ledger](evidence/phase-08-stable-followup-ledger.json) |
| JS preflight, JVM, native, Android build, interruption/denial/gate controls | — | NOT RUN: no production, test or public-harness source changed; historical results remain historical | [capture-fix report](phase-08-capture-fix-report.md) |
| Physical phone rows (48), V05 | — | NOT RUN | [manual](../../qa/PHASE-08-MANUAL.md) |

## 4. Performance and device matrix

No performance claim. The API35 guest ran on the isolated Google emulator 37.2.13 with WHPX, `-gpu host`, 4 cores; requested RAM 2048 MiB was raised by the SDK to 2560 MiB (not a matched-memory or phone comparison). Producer pacing values below are host scheduling observations, not STT latency.

## 5. Reliability, privacy, permissions, licenses

### Diagnosis (evidence)

1. **Energy accounting.** For the pinned ACK fixture at 500-permille transport gain, the exact fixture energy is 84.5944. Every intact capture holds exactly 4.000 times that (an exact ×2 amplitude scalar in the emulator path), passing *and* failing. In sdk1: V03/1 (lexical FAIL) = 4.000002 (all samples present), A03/1 (lexical FAIL) = 3.913 (≈2% speech lost), V03/2 (NO_AUDIO) = 0 (pure digital zeros), both V04 passes = 4.000002. The reminder decoder boundary re-anchors the first above-floor sample, so identical samples would give identical decoder input. Intact-energy failures therefore had their samples re-timed, not lost.
2. **Guest HAL logs.** The ranchu audio HAL logged virtio-snd `pcm_readi`/`pcm_writei` I/O errors and `pcm_readi was late delivering frames, inserting 16000 us of silence` inside the failing captures only: A03/1 22 playback I/O errors; V03/1 13 capture I/O errors and 1456 ms inserted silence; V03/2 48 capture I/O errors and 5088 ms inserted silence; both passes 0 errors and ≤112 ms (startup).
3. **Not the producer.** Host pacing stayed inside the guards (max lateness 16–24 ms). Correcting for the measured guest clock offset (+0.44 s), V03/2's capture errors began about 1.8 s before its injection RPC started.
4. **Not the decoder.** Retained direct-decoder runs on the clean pinned ACK fixture are exact and deterministic across offsets 0/250/500/1000 ms, floors 0/8 and three repeats.
5. **Not the app capture or confirmation path.** The app records exactly what the HAL delivers (exact energy). Gate ALLOW, copy/review/Confirm and paired SQL behaved as designed; the native exact-reference check correctly refused the wrong hypotheses.

**Failing layer:** the emulator's virtual sound device (virtio-snd via the guest ranchu HAL). It intermittently stalls or fails I/O in both directions, and the HAL then inserts silence (time-stretch), drops data or delivers none.

### Hypotheses

| ID | Hypothesis | Result |
|---|---|---|
| H1 | Producer pacing/overwrite corrupts speech | Not supported: failures with on-time pacing and before injection |
| H2 | Decoder nondeterminism on intact PCM | Refuted for retained failures |
| H3a | Host audio backend (DirectSound) clocking virtio-snd causes the faults | **Refuted**: null1 V03/1 had 11 capture I/O errors and 80 insertions with `-audio none` |
| H3b | Host scheduling contention (other host workloads were running) stalls the emulator audio service | **Unresolved**: null1 V03/2's host producer was itself late by 112 ms (guard abort); host load at trial times was not recorded. Guest-side load (dexopt, skipped frames, GC) showed nothing at the fault minute. |

### Retained attempts (stable guest; all kept)

| Cohort | Platform | A03/1 | V03/1 | V03/2 | V04/1 | V04/2 |
|---|---|---|---|---|---|---|
| cold1 | SDK 37.1.11 realtime | PASS | PASS | FAIL (HAL not recorded) | PASS | NOT RUN (pre-recording UI-dump timeout) |
| block1 | SDK 37.1.11 blocking | FAIL (HAL not recorded) | FAIL (HAL not recorded) | PASS | PASS | PASS |
| sdk1 | 37.2.13 realtime | FAIL (device fault) | FAIL (device fault) | FAIL (device fault, no signal) | PASS | PASS |
| null1 | 37.2.13 realtime, `-audio none` | FAIL (pre-recording: another app's heads-up notification covered the hold control; NOT RUN for recognition) | FAIL (device fault) | FAIL (host producer lateness abort; gate correctly refused; NOT RUN for recognition) | PASS | PASS |
| nullprobe | same as null1 | PASS (excluded from comparison) | — | — | — | — |

Comparison tallies on API35 (not an ASR accuracy denominator, not mixed with the original guest): ACK 3 PASS / 9 FAIL; snooze 7 PASS / 0 FAIL / 1 NOT RUN. Per-attempt layers: [stable case ledger](evidence/phase-08-stable-case-ledger.json). Earlier diagnostics remain separate and retained: [realtime wrong-word finding](evidence/phase-08-stable-realtime-finding.json), [prepared stall recovery](evidence/phase-08-stable-prepared-stall-recovery.json), [saved-disk recovery](evidence/phase-08-stable-saved-disk-recovery.json), [primer recovery](evidence/phase-08-stable-primer-recovery.json) and [primer re-verification](evidence/phase-08-stable-primer-reverified.json).

Evidence-field corrections: the prepared-parent early failure's preparation Node process *did* launch and offered a format header only (0 PCM bytes, no SDK acknowledgement); the pinned speech was never submitted. See the [derived interpretation](evidence/phase-08-stable-prepared-parent-interpretation.json); the raw record is unchanged. The reviewed parent labels null1 A03/1 `SOURCE_PRODUCER_OR_PRIVACY_GUARD`; the actual layer is pre-recording UI (the ledger records the derived layer).

### Fallback, restoration and privacy

- Fallback smoke on API35: A01 manual ACK and A02 typed ACK → ACKNOWLEDGED/ACKNOWLEDGED, task TODO, generation 1, 0 registrations; A04 manual snooze → PENDING/SNOOZED, generation 2, 1 registration, replacement due 602.6 s after Confirm, task TODO. Fixtures soft-removed (saved text/history/receipts retained; not erasure).
- API35 restored to its own baseline (lead 15, delivery OFF, airplane 0/Wi-Fi 1/mobile data 1): suite compare PASS (complete preference payload, delivery, original rows, owned fixtures inactive); settings/timezone/clock, permissions, AppOps, power, ringer and every baseline volume index equal; no gate markers or `qa08-` files; host input OFF; no active recording. AudioService added default `STREAM_MUSIC` indexes for absent Bluetooth/USB device types; no harness or app volume command exists; recorded, not overwritten. The first, stricter comparison FAIL is retained.
- Original `Medium_Phone`: read-only checker 10/10 against its four historical baselines; 33-source and seven-APK ledgers still equal; installed `7300f2ae…`. No data copied between guests.
- Host input stayed OFF (double `getMicrophoneState=false` before/after every trial); `-allow-host-audio` was never used; Windows' microphone-use record shows no entry for the isolated engine. Raw hypotheses stay in ignored private logs only. The engine command line verification, not the AVD config, sets `-audio none`; the saved AVD configuration is unchanged.

## 6. Human phone verification

All NOT RUN. See the [48-row manual](../../qa/PHASE-08-MANUAL.md). Short checklist:

1. Install by in-place upgrade the ARM64 DataQa build `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk` (SHA-256 `8e23905948af3ad89563dacdd0e988d997b912505c41251ddf85b5f0dccf2335`) only over a known-lineage, same-signature install; never uninstall or clear data. Stop on any signature/schema mismatch.
2. Open Profile, Calendar, Notes: existing items/settings preserved. Record original Profile settings; enable reminder delivery and set lead time 0.
3. Airplane mode on, Wi-Fi/mobile data off. In Chat create and Confirm a reminder two minutes ahead; background/lock.
4. At due time tap **Answer**: visible text (optional offline system TTS), **no ACK, no completion, no microphone start**.
5. Deliberately hold to talk, say “acknowledge this reminder”, release; copy/edit the transcript, **Review**, **Confirm**. Expect exactly one acknowledgement, window closes, task still **TODO**. Misrecognition: cancel/edit; typed and manual ACK must work.
6. Fresh reminder: snooze 10 minutes via voice or button, Review/Confirm. Expect one future reminder ~10 minutes later, task TODO, no duplicate original.
7. Deny the microphone permission and interrupt/background a capture: clear recovery, no late action; typed/manual controls work.
8. Optional: Read/Stop with an installed offline system voice; audibility is a human judgement.
9. Restore the recorded Profile settings, radios and permissions; remove only your test reminders.

V05 (local-accent audio) remains owner-deferred; all 48 physical rows NOT RUN; human review NOT SIGNED.

## 7. Docs/ADRs changed

Updated: [current status](CURRENT-STATUS.md), [Phase 08 report](phase-08-report.md), [release gate](phase-08-offline-core-release-gate.md), [execution checklist](../../qa/PHASE-08-EXECUTION.md), [manual](../../qa/PHASE-08-MANUAL.md), [requirements matrix](../../qa/REQUIREMENTS-MATRIX.md), [offline loop contract](../phase-08-offline-loop.md), [README](../../README.md). Primary matrix [`phase-08-emulator-expansion-matrix.json`](evidence/phase-08-emulator-expansion-matrix.json) reconciled after an exact [pre-stable archive](evidence/phase-08-emulator-expansion-matrix-pre-stable.json). No ADR: no architecture, production or performance-affecting change (test-platform launch flag only). Graphify: `graphify update .` result in [log](evidence/phase-08-stable-graphify.log); navigation evidence only.

## 8. Open blockers and recommended next steps

1. **Blocker:** automated emulator spoken-ACK reliability. The cause sits below the app, in the emulator's virtual sound device; a reliable emulator ACK gate is not achievable by app changes, and weakening recognition/confirmation is not allowed.
2. **Next concrete experiment (H3b, needs the owner):** with other heavy host workloads closed (the agent did not close user applications), record host CPU and a per-trial host scheduling-stall probe alongside the HAL record, then run one frozen five-trial cohort. Keep the HAL record as a precondition layer: a trial with virtual-sound I/O errors is reported as a device-faulted capture, never as an ASR pass or fail.
3. **Primary acceptance path:** the physical-phone checklist above (ARM64, real microphone), where this emulator device does not exist.
4. Optional harness hygiene: have the reviewed parent label pre-recording input-injection refusals as UI failures, and dismiss/avoid foreign heads-up notifications before the hold.

Do not start Phase 09.

## 9. Review decision

- [ ] All automated required checks passing — emulator A03/V03 reliability remains FAIL
- [ ] Manual device tests completed and human-confirmed — NOT RUN; V05 deferred
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

**STATUS: BLOCKED**

**STOPPED — awaiting explicit human approval.**
