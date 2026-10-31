# PHASE 08 — Stable-emulator spoken-ACK diagnosis / Follow-up Report

**Branch / commit SHA:** `codex/phase-07-audit-hardening` / base HEAD `98bef88c3ae0fabee677c1466417fc34c0af738c` (local working-tree patch; no commit, push, merge or deployment)  
**Date/time UTC:** 2026-10-31, approximately 01:50–02:50 (diagnosis); 09:20–10:10 (correction and low-load comparison attempt; no guest launched); later the same day (host-only microphone-state investigation; no emulator); 2026-11-01 (documentation-only emulator source review; no emulator, device, injection, build or test run)  
**Device(s) available:** emulators only — `LAFINA_Phase08_API35` (Android 15/API35, Google APIs x86_64 rev9, 4 KiB pages) and the original `Medium_Phone` (observed SDK 37, codename `REL`, x86_64, 16 KiB pages). No physical phone.  
**Status:** `BLOCKED` (emulator spoken-ACK reliability unresolved; physical validation NOT RUN)  
**Phase approval provenance:** Phase 08 approved by the owner; scope from [Claude Code handoff 2026-10-31](phase-08-claude-code-handoff-20261031.md). Phase 09+ NOT approved.  
**Revision:** 2 (2026-10-31, owner-requested correction). Diagnosis wording narrowed to what the evidence shows, and a frozen-plan deviation disclosed (section 5). The unrevised text is archived unchanged as [v1](evidence/phase-08-stable-emulator-report-v1-before-correction.md) (sha256 `468ef7f7…5d4aca`). No trial result, status, count or evidence hash was changed; see the [correction record](evidence/phase-08-stable-claims-correction.json).  
**Revision 3** (2026-11-01, documentation checkpoint): adds the emulator source review (section 5) and corrects microphone-state wording. The pre-edit text is archived unchanged as [v2](evidence/phase-08-stable-emulator-report-v2-before-source-review.md) (sha256 `14b87286…8a5cf5`). No trial result, status, count or existing evidence hash changed; see the [source-review record](evidence/phase-08-microphone-state-emulator-source-review.json).

## 1. Scope completed

- Fresh Git/device verification: branch and HEAD as expected; the dirty Phase 08 tree preserved; one emulator (`LAFINA_Phase08_API35`, API35) connected; no instrumentation process.
- Bounded diagnosis of retained A03/V03 failures, separating producer, guest HAL/capture, decoder and gate/confirmation layers. The observed faults are **localized, with supporting evidence, to the emulator audio path**; the root cause is not established (section 5).
- One evidence-driven repair experiment (null host audio backend), frozen before execution. Removing the host backend **did not eliminate** the faults in its first cohort. The second cohort is NOT RUN under the frozen stop rule. The first cohort **deviated** from that plan: it continued after a pre-recording UI failure that required a stop (section 5).
- Manual/typed fallback smoke (A01/A02/A04) on API35: **PASS 3/3**.
- API35 guest restored to its own baseline; original `Medium_Phone` reopened and verified **10/10** read-only; both guests gracefully stopped.
- Derived evidence corrections, a stable-guest case ledger, matrix reconciliation (archived first) and this report.
- **ABORT classification fix (host-only):** the cohort classifier no longer labels every gate ABORT as a pacing failure. It now records pacing, source/RPC, privacy or unexplained-ABORT causes from explicit evidence, and every ABORT still stops. Python 17/17 and Node 41/41 pass. The frozen low-load plan no longer describes the modified helper (section 5).
- **Microphone-state anomaly (host-only investigation):** the post-abort "enabled" reading is tied to client-cancelled source streams (3/3). The producer and parent behaved fail-closed, and no defect in either was demonstrated. A summary-layer omission in historical cohort rows was demonstrated and is corrected in a derived record. New host tests: 41/41 node and 9/9 Python pass (section 5).
- **Low-load comparison (owner-requested, H3b):** a uniquely named plan was frozen before any device change, with explicit host thresholds, stop rules, hashes and null1-matched arguments. Windows-native telemetry ran for about 20 minutes. Three formal admission checks failed, including after the owner closed applications. The guest was **not launched**, and all five cohort slots are **NOT RUN** (section 5).
- **Emulator source review (documentation only, 2026-11-01):** public emulator source at the closest located revisions supports an explanation for the post-abort flag readings. The exact shipped source was not located or matched, so the mechanism on the installed binaries is unconfirmed. Actual host capture remains unproven, and the fail-closed guards are unchanged (section 5).

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
| `scripts/phase08-emulator-audio-privacy.test.mjs` (new test) | 11 host tests against a mock loopback gRPC server: read-only state requests, fail-closed reads, proto3 defaults, abort/enabled/unknown sequences, error preservation | Microphone-state investigation; producer unchanged | 41/41 with existing tests |
| `.local/test_phase08_privacy_harness.py` (ignored, new) | 9 host tests running the parent's real `node_audio`/`release_gate` with stubbed I/O, the three retained producer outputs and the cohort-summary regression | Same; parent and cohort helpers unchanged | 9/9 |
| `.local/phase08_host_telemetry.py` (ignored, new) | 1 Hz PDH counters (CPU, available memory, commit, hard paging, per-process CPU by image name) and a 2 ms scheduling-latency probe; UTC + monotonic per row; no command lines/window titles | Host-load evidence for H3b | [not-run record](evidence/phase-08-stable-lowload1-not-run.json) |
| `.local/phase08_lowload_common.py`, `.local/phase08-lowload-boot.py`, `.local/phase08-lowload-cohort.py`, `.local/phase08-lowload-switch-to-original.py` (ignored, new) | Frozen thresholds and evaluation, clock probes (min-RTT ± RTT/2), ownership checks; admission-gated null1-matched launch; cohort with the explicit stop rules null1 lacked; output-parameterized switch copy | Controlled low-load comparison; the reviewed parent, audio and assertions are unchanged | [plan](evidence/phase-08-stable-lowload-plan-20261031T094218Z.json), [amendment 1](evidence/phase-08-stable-lowload-plan-amendment-1.json), [amendment 2](evidence/phase-08-stable-lowload-plan-amendment-2.json) |
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
| Report correction | v1 archived; derived correction record | DONE (no result/hash changed) | [record](evidence/phase-08-stable-claims-correction.json) |
| Telemetry sampler, host-only test | `python -I .local/phase08_host_telemetry.py --out <scratch> --stop-file <scratch> --max-seconds 40` | RECORDED (sampler 0.4% of host CPU) | plan `measuredBeforeFreezing` |
| Low-load plan freeze | plan generator, exclusive create | FROZEN; amendments 1 (private folder name) and 2 (PDH instance pairing) before any device mutation; thresholds unchanged | [plan](evidence/phase-08-stable-lowload-plan-20261031T094218Z.json) |
| Host admission 1–3 | `python -I .local/phase08-lowload-boot.py --run --telemetry <private> --pid-file <private> --output docs/reports/evidence/phase-08-stable-lowload-admission-{1,2-boot,3}.json` | UNMET ×3, no launch | [1](evidence/phase-08-stable-lowload-admission-1.json), [2](evidence/phase-08-stable-lowload-admission-2-boot.json), [3](evidence/phase-08-stable-lowload-admission-3.json) |
| Cohort lowload1 (A03/1, V03/1, V03/2, V04/1, V04/2) | `.local/phase08-lowload-cohort.py --run …` (never invoked) | NOT RUN ×5 (admission unmet) | [record](evidence/phase-08-stable-lowload1-not-run.json) |
| Closing checks | engine count, `adb devices`, helper PIDs, `netstat` emulator ports, AVD newest-file timestamps | PASS: 0 engines/devices/controllers; both saved guests untouched since 02:44/02:46 UTC | [record](evidence/phase-08-stable-lowload1-not-run.json) |
| Guest-side restoration/original checker this continuation | — | NOT RUN: no guest was launched; previous verification stands | [API35](evidence/phase-08-stable-final-restoration-verified.json), [original](evidence/phase-08-stable-original-after.json) |
| JS preflight, JVM, native, Android build, interruption/denial/gate controls | — | NOT RUN: no production, test or public-harness source changed; historical results remain historical | [capture-fix report](phase-08-capture-fix-report.md) |
| Audio-client host tests (existing + new privacy guard) | `node --test scripts/phase08-emulator-audio.test.mjs scripts/phase08-emulator-audio-realtime.test.mjs scripts/phase08-emulator-audio-privacy.test.mjs` | PASS 41/41 (mock loopback gRPC; no emulator/microphone) | [investigation](evidence/phase-08-microphone-state-anomaly-investigation.json) |
| Parent/cohort privacy host tests | `python -I .local/test_phase08_privacy_harness.py -v` | PASS 9/9 at the investigation; after the ABORT classification fix PASS 17/17, 0 skipped (pre-fix helper: 5 FAIL, reproduced) | [investigation](evidence/phase-08-microphone-state-anomaly-investigation.json), [ABORT fix](evidence/phase-08-abort-classification-fix.json) |
| New emulator recognition trial during the investigation | — | NOT RUN (host-only by instruction) | — |
| Emulator public-source review (2026-11-01) | Read-only reads of `android.googlesource.com/platform/external/qemu`; retained copies re-hashed with `git hash-object`; no emulator executable invoked, no downloaded code executed | DONE: source-supported explanation at the reviewed revisions; shipped binaries not matched | [source review](evidence/phase-08-microphone-state-emulator-source-review.json) |
| Test suites, builds, device checks in the 2026-11-01 checkpoint | — | NOT RUN (documentation only; earlier results are historical and unchanged) | — |
| Physical phone rows (48), V05 | — | NOT RUN | [manual](../../qa/PHASE-08-MANUAL.md) |

## 4. Performance and device matrix

No performance claim. Host for the low-load attempt: AMD Ryzen 5 6600H (6 cores/12 logical), 15.19 GiB RAM, Windows 11. The telemetry sampler cost 0.24–0.45% of host CPU. The API35 guest ran on the isolated Google emulator 37.2.13 with WHPX, `-gpu host`, 4 cores; requested RAM 2048 MiB was raised by the SDK to 2560 MiB (not a matched-memory or phone comparison). Producer pacing values below are host scheduling observations, not STT latency.

## 5. Reliability, privacy, permissions, licenses

### Diagnosis (evidence)

1. **Energy accounting.** For the pinned ACK fixture at 500-permille transport gain, the fixture energy is 84.5944. Captured total energy (rms² × frames, from the app's capture log line) was 4.000 times that in both passing and some failing trials, consistent with a ×2 amplitude scalar somewhere in the emulator path. In sdk1: V03/1 (lexical FAIL) 4.000002; A03/1 (lexical FAIL) 3.913; V03/2 (NO_AUDIO) 0 (only digital zeros); both V04 passes 4.000002. *Limits:* a matching total energy does **not** establish sample-for-sample fidelity, sample order, timing integrity or identical decoder input. Silence insertion or reordering leaves total energy unchanged. A ≈2% energy deficit is consistent with partial loss, attenuation or clipping of some samples. It does **not** measure how many speech samples were lost. Captured PCM was not retained or compared with the fixture, by design (raw audio is never read).
2. **Guest HAL logs (observed faults).** In sdk1 the ranchu audio HAL logged virtio-snd `pcm_readi`/`pcm_writei` I/O errors and `pcm_readi was late delivering frames, inserting 16000 us of silence` during each failing capture and not during either passing capture: A03/1 22 playback I/O errors; V03/1 13 capture I/O errors and 1456 ms inserted silence; V03/2 48 capture I/O errors and 5088 ms inserted silence; both passes 0 errors and ≤112 ms (startup). The inserted silence alters the timing of the decoder input even where total energy is unchanged. HAL logs were not recorded for cold1/block1.
3. **Producer pacing not implicated in sdk1.** Host pacing stayed inside the guards (max lateness 16–24 ms). V03/2's capture errors began about 1.8 s before its injection RPC started. That ordering relies on a single guest−host clock probe (+0.44 s) taken *after* the cohort, with no stated uncertainty. Later boots measured about −1.04 to −1.09 s, so offsets are boot-specific. The 1.8 s margin exceeds the probe's bound, but the ordering is an inference, not a measured certainty.
4. **Decoder on tested inputs.** Retained direct-decoder runs on the clean pinned ACK fixture are exact and deterministic across offsets 0/250/500/1000 ms, floors 0/8 and three repeats. This establishes behaviour for those inputs only. It does not rule out a decoder or application issue on the actual captured PCM, which was not replayed through the decoder.
5. **App capture and confirmation path.** The app's captured total energy matched the expected scalar, which shows no net amplitude loss at that layer but not sample-level fidelity (item 1). Gate ALLOW, copy/review/Confirm and paired SQL behaved as designed; the native exact-reference check refused every wrong hypothesis.

**Localization (evidence-supported, not a fully established root cause):** the observed HAL I/O errors and silence insertions coincide with every failing sdk1 capture and with neither pass. They strongly implicate the emulator's audio path (virtio-snd via the guest ranchu HAL) as a contributor. What makes that device stall is not established, and contributions from app capture or the decoder on the actual captured PCM are not excluded.

### Hypotheses

| ID | Hypothesis | Result |
|---|---|---|
| H1 | Producer pacing/overwrite corrupts speech | Not supported in sdk1: failures occurred with on-time pacing, and one fault began before injection (clock-offset caveat, item 3) |
| H2 | Decoder nondeterminism on intact PCM | Not supported on the tested clean fixture; untested on actual captured PCM |
| H3a | The host audio backend (DirectSound) clocking virtio-snd is required for the faults | **Not supported as a necessary condition**: with `-audio none`, null1 V03/1 still had 11 capture I/O errors and 80 insertions. This does not exclude every backend contribution, e.g. a backend that adds faults when present. |
| H3b | Host scheduling contention (other host workloads were running) stalls the emulator audio service | **Untested**: null1 V03/2's host producer was itself late by 112 ms (guard abort), and host load at trial times was not recorded. Guest-side load (dexopt, skipped frames, GC) showed nothing at the fault minute. The low-load comparison could not run because the host never met the frozen admission condition (below). |

### Low-load comparison (H3b) — NOT RUN, admission unmet

Frozen [plan](evidence/phase-08-stable-lowload-plan-20261031T094218Z.json) (sha256 `48f40922…`). It changes only the host load condition: same isolated emulator 37.2.13, AVD registry and arguments as null1 (`-audio none`, confirmed from the recorded launch parameters), and the same reviewed parent, pinned audio, gain/padding, pacing guards, deadlines and assertions. Differences from null1 were declared in advance: launch from a stopped guest, the working state applied after verifying the guest's own baseline, a stabilization wait, no probe trial, and explicit stop rules.

Thresholds were frozen after measuring the host and before any recognition result. Admission (guest stopped, 30 s window) requires:

| Metric | Threshold |
|---|---|
| Available memory | ≥ 6.5 GiB (2.5 GiB guest + 1 GiB overhead + 3 GiB floor) |
| Available commit | ≥ 7.5 GiB |
| Total CPU | median ≤ 15%, p95 ≤ 30% |
| Hard paging | median ≤ 25/s, p95 ≤ 250/s |
| Scheduling probe | max lateness ≤ 30 ms; median per-second p99 ≤ 2 ms |
| Sampler's own CPU | ≤ 1% of host |

The post-boot and pre-trial gates require ≥ 3 GiB available memory, ≥ 4 GiB commit, and non-emulator CPU median ≤ 12% / p95 ≤ 25%. Rationale is in the plan.

| Admission (UTC window) | Available memory min / median | Commit min | Total CPU median / p95 | Hard paging median / p95 | Probe max | Result |
|---|---|---|---|---|---|---|
| 1 (09:42:52–09:43:22), before owner action | 2.24 / 2.45 GiB | 2.96 GiB | 44.7% / 71.0% | 360 / 8122 per s | 27.9 ms | UNMET: memory, commit, CPU, paging |
| 2 (09:49:02–09:49:32), after the owner closed a game client | 1.79 / 1.85 GiB | 5.49 GiB | 15.5% / 29.3% | 145 / 21028 per s | 1.6 ms | UNMET: memory, commit, CPU, paging |
| 3 (10:02:28–10:02:58), after the owner exited more applications; two could not be closed | 6.01 / 6.11 GiB | 15.71 GiB | 7.5% / 15.5% | 4 / 3249 per s | 5.2 ms | UNMET: memory, paging |

- **Outcome:** the guest was never launched. Slots A03/1, V03/1, V03/2, V04/1 and V04/2 are **NOT RUN** ([record](evidence/phase-08-stable-lowload1-not-run.json)). No busy run is labelled low load, no threshold was relaxed, and the agent closed no application. Defender and other security protections stayed enabled.
- **Comparison with null1:** not possible, since no low-load trial exists. Every evidence layer still rests on null1/sdk1 alone. H3b is neither supported nor refuted. The host-side numbers show only that typical owner workloads on this 6-core/15 GiB host cause memory pressure and paging bursts. Whether that pressure affects the emulator audio path is unmeasured.
- **Telemetry:** about 20 minutes over two sampler runs. The sampler's own CPU was 0.45% and 0.24% of host. Clock alignment was NOT MEASURED because no guest ran; the old +0.44 s offset was not reused. Raw telemetry, including process image names, stays private; public records hold aggregates only.
- **Declared amendments, all before any device mutation, thresholds unchanged:**
  1. A fixed private folder name collided, and that invocation failed before any evaluation or device call.
  2. The sampler collapsed processes that share an image name, so its per-process attribution (emulator/harness/telemetry split) was unreliable in admissions 1–2. Their failing metrics come from unaffected scalar counters.

### Retained attempts (stable guest; all kept)

| Cohort | Platform | A03/1 | V03/1 | V03/2 | V04/1 | V04/2 |
|---|---|---|---|---|---|---|
| cold1 | SDK 37.1.11 realtime | PASS | PASS | FAIL (HAL not recorded) | PASS | NOT RUN (pre-recording UI-dump timeout) |
| block1 | SDK 37.1.11 blocking | FAIL (HAL not recorded) | FAIL (HAL not recorded) | PASS | PASS | PASS |
| sdk1 | 37.2.13 realtime | FAIL (device fault) | FAIL (device fault) | FAIL (device fault, no signal) | PASS | PASS |
| null1 | 37.2.13 realtime, `-audio none` | FAIL (pre-recording: input injection refused because another app's window covered the hold control; NOT RUN for recognition; plan required a stop here) | FAIL (device fault; post-deviation) | FAIL (host producer lateness abort; gate correctly refused; NOT RUN for recognition; post-deviation) | PASS (post-deviation) | PASS (post-deviation) |
| nullprobe | same as null1 | PASS (excluded from comparison) | — | — | — | — |

Comparison tallies on API35 (not an ASR accuracy denominator, not mixed with the original guest): ACK 3 PASS / 9 FAIL; snooze 7 PASS / 0 FAIL / 1 NOT RUN. Per-attempt layers: [stable case ledger v2](evidence/phase-08-stable-case-ledger-v2.json) (adds null1 post-deviation labels and the five NOT RUN low-load slots; [v1](evidence/phase-08-stable-case-ledger.json) retained). Earlier diagnostics remain separate and retained: [realtime wrong-word finding](evidence/phase-08-stable-realtime-finding.json), [prepared stall recovery](evidence/phase-08-stable-prepared-stall-recovery.json), [saved-disk recovery](evidence/phase-08-stable-saved-disk-recovery.json), [primer recovery](evidence/phase-08-stable-primer-recovery.json) and [primer re-verification](evidence/phase-08-stable-primer-reverified.json).

**Protocol deviation (null1, disclosed 2026-10-31).** The frozen [plan](evidence/phase-08-stable-null-audio-plan.json) says: "Any guest stall/pre-recording UI failure: stop issuing audio trials". null1 A03/1 was a pre-recording UI failure: input injection was refused because another window covered the hold control, and the capture never reached visible Recording. The cohort helper had no status-based stop and ran V03/1, V03/2, V04/1 and V04/2 anyway. Those four trials ran **outside the frozen plan**. Their results are retained unchanged and are labelled as post-deviation in the [correction record](evidence/phase-08-stable-claims-correction.json). The null1 conclusion above rests on V03/1, a post-deviation trial.

Evidence-field corrections: the prepared-parent early failure's preparation Node process *did* launch and offered a format header only (0 PCM bytes, no SDK acknowledgement); the pinned speech was never submitted. See the [derived interpretation](evidence/phase-08-stable-prepared-parent-interpretation.json); the raw record is unchanged. The reviewed parent labels null1 A03/1 `SOURCE_PRODUCER_OR_PRIVACY_GUARD`; the actual layer is pre-recording UI (the ledger records the derived layer).

### Fallback, restoration and privacy

- Fallback smoke on API35: A01 manual ACK and A02 typed ACK → ACKNOWLEDGED/ACKNOWLEDGED, task TODO, generation 1, 0 registrations; A04 manual snooze → PENDING/SNOOZED, generation 2, 1 registration, replacement due 602.6 s after Confirm, task TODO. Fixtures soft-removed (saved text/history/receipts retained; not erasure).
- API35 restored to its own baseline (lead 15, delivery OFF, airplane 0/Wi-Fi 1/mobile data 1): suite compare PASS (complete preference payload, delivery, original rows, owned fixtures inactive); settings/timezone/clock, permissions, AppOps, power, ringer and every baseline volume index equal; no gate markers or `qa08-` files; host input OFF; no active recording. AudioService added default `STREAM_MUSIC` indexes for absent Bluetooth/USB device types; no harness or app volume command exists; recorded, not overwritten. The first, stricter comparison FAIL is retained.
- Original `Medium_Phone`: read-only checker 10/10 against its four historical baselines; 33-source and seven-APK ledgers still equal; installed `7300f2ae…`. No data copied between guests.
- **Host microphone-state observations** (wording corrected 2026-11-01; these were not a continuous OFF record). The parent's double `getMicrophoneState=false` checks passed before and after every trial, and no harness enable request was found. In null1 V03/2, however, the producer's own read immediately after its lateness abort returned `realAudioEnabled=true`. The producer failed closed (`HOST_MICROPHONE_ENABLED_AFTER_ABORT`), the parent published ABORT, and the parent's next check about 24 s later read OFF. The same pattern occurred in two earlier aborts on the original guest (see the investigation below). In the reviewed public emulator source, the injected-audio forwarder itself sets this flag while injection is active (see the source review below). On the shipped binaries the setter and the duration are unconfirmed, and actual host capture is unproven. The v1 summary omitted this reading. `-allow-host-audio` was never used; under `-audio none` no host audio backend was configured. Windows' microphone-usage record has no entry for either headless engine; that absence is not proof that no capture occurred. Raw hypotheses stay in ignored private logs only. The engine command line verification, not the AVD config, sets `-audio none`; the saved AVD configuration is unchanged.

### Microphone-state anomaly investigation (host-only, 2026-10-31)

Record: [investigation](evidence/phase-08-microphone-state-anomaly-investigation.json). No emulator was launched, no audio was injected and host input was never enabled.

- **What the field means.** Both local SDK protos (37.1.11 and 37.2.13, identical for these messages) define `MicrophoneState.realAudioEnabled = 1` as "whether or not host microphone access is enabled". It reports an access setting, not capture or audio level.
- **Pattern.** All 3 retained source-stream aborts were client-side lateness aborts (102.9–112.7 ms over the 100 ms guard): null1 V03/2 and two original-guest aborts on 2026-10-30. In each, the read issued right after the client cancelled the stream returned enabled. All 37 retained completed streams read false afterwards. Each time, the next observation (21–25 s later, after cleanup) was OFF, and nothing was observed in between.
- **Harness behaviour.**
  - The producer issues only `getMicrophoneState` (empty request) and `injectAudio`. No code anywhere sends `setMicrophoneState`.
  - It failed closed and kept the pacing code (`injectionFailureReason=SYNTHETIC_REALTIME_LATE`) alongside the privacy code.
  - The parent published ABORT, never ALLOW. The native gate recorded `BLOCK_PRODUCER_ABORT` with no review or Confirm.
  - The app recording continued about 0.3–0.6 s after the enabled read, until the ABORT released the hold.
- **Ruled out by code and tests:** a harness enable request, a stale or cross-stream or malformed response, a wrong emulator instance, and a field overwrite in the producer or parent.
- **Most consistent explanation (inferred, mechanism unproven at the time):** emulator-side state reported while or after a client-cancelled injection is torn down. The 2026-11-01 source review below supports this at the reviewed public revisions; it is unconfirmed on the shipped binaries.
- **Live host capture** (wording corrected 2026-11-01): unproven. The runtime evidence does not support it and does not exclude it for any run. null1 had no host audio backend configured. Windows records no microphone use by the headless engines, which does not prove no capture occurred. The one original-guest abort with retained capture metadata captured near-silence (≈ −83 dBFS); energy does not establish sample content.
- **Demonstrated defect (summary layer only):** the cohort rows for all three incidents kept only `hostMicrophoneDisabledAtEnd=true` and dropped the earlier enabled observation. The ledgers and reports built on them (the capture-fix report and v1 of this report) then described host input as OFF. The authoritative parent records kept both. The historical helpers and records stay unchanged; the current cohort helper (`.local/phase08-lowload-cohort.py`) keeps both observations and stops on the privacy flag, and a new regression test locks that in.
- **No producer or parent defect was demonstrated, so no harness code was patched.**
- **Latent gap, not changed:** the producer validates the global SDK proto rather than the running engine's. The relevant definitions are identical, so the anomaly is unaffected.
- **Host tests:**
  - `node --test scripts/phase08-emulator-audio.test.mjs scripts/phase08-emulator-audio-realtime.test.mjs scripts/phase08-emulator-audio-privacy.test.mjs`: **41/41 pass** (30 existing and 11 new, using a mock loopback gRPC server).
  - `python -I .local/test_phase08_privacy_harness.py -v`: **9/9 pass**. These run the parent's real `node_audio`/`release_gate` code with stubbed I/O, the three retained producer outputs, and the cohort-summary regression.
  - Prettier passes. ESLint is not applicable: the repo parser rejects `import.meta` in every existing `.mjs`.
  - The Windows real-clock pacing dry run is NOT RUN because pacing is unchanged.
  - These were the totals at the time; the ABORT classification fix below raises the Python suite to 17.

### ABORT classification fix (host-only, 2026-10-31)

Record: [ABORT classification fix](evidence/phase-08-abort-classification-fix.json). This fixes evidence classification only. No emulator, ADB/device call, audio injection, microphone access or phone was used.

- **Defect (independently reproduced).** `classify()` in `.local/phase08-lowload-cohort.py` treated any gate ABORT marker as `PRODUCER_PACING_ABORT`. ABORT is a stop/authorization decision; it does not say why the producer failed. It mislabelled:
  - a completed source RPC followed by an enabled state reading;
  - an RPC rejection with host input OFF;
  - an ABORT with no known cause;
  - a contradictory PASS status with ABORT.
- **Every reproduced case already stopped.** The wrong part was the stated reason, not the stop decision.
- **Fix:**
  - Pacing is now flagged only from explicit evidence: `lateAbort` is true, or the failure code is `SYNTHETIC_REALTIME_LATE` or `SYNTHETIC_REALTIME_DRIFT`.
  - Other source/RPC failures flag `SOURCE_RPC_FAILURE`.
  - An ABORT that nothing explains flags `GATE_ABORT_UNEXPLAINED`.
  - All applicable flags are kept. The primary reason follows pipeline order: pre-recording UI, producer pacing, source/RPC failure, privacy guard, then unexplained ABORT.
  - The set of outcomes allowed to continue is unchanged (PASS, completed recognition mismatch, `NO_AUDIO_SIGNAL`). Any ABORT still stops and can never count as a successful recognition trial.
- **Before → after:**

  | Scenario | Before | After |
  |---|---|---|
  | Genuine pacing abort | `PRODUCER_PACING_ABORT` | `PRODUCER_PACING_ABORT` |
  | Completed RPC, then enabled state | `PRODUCER_PACING_ABORT` | `PRIVACY_GUARD` |
  | RPC rejection, host OFF | `PRODUCER_PACING_ABORT` | `SOURCE_RPC_FAILURE` |
  | Pacing plus privacy | pacing + privacy flags | pacing + privacy flags (unchanged) |
  | ABORT with no known cause; PASS with ABORT | `PRODUCER_PACING_ABORT` | `GATE_ABORT_UNEXPLAINED` |

- **Historical records preserved.** All 43 retained parent records classify identically before and after, including the three incidents (still pacing plus privacy). The bound historical record hashes are unchanged, and no trial result changed.
- **Helper identity.** The low-load cohort helper changed from `a723067f…` (the hash bound in the frozen [low-load plan](evidence/phase-08-stable-lowload-plan-20261031T094218Z.json)) to `24adb808…`. A byte-identical pre-fix copy is preserved privately. **The frozen plan no longer describes this helper and does not authorize a run with it**; any future run needs a new, separately approved plan. The sender (`a5231b7b…`), timing limits, grammar, models and confirmation rules are unchanged.
- **Host tests:**
  - Tests were written first. Against the unpatched helper: 17 run, 12 pass, **5 fail**, every one a false pacing label.
  - After the patch: `python -I .local/test_phase08_privacy_harness.py -v` gives **17/17 pass**, 0 skipped (9 existing + 8 new).
  - `node --test scripts/phase08-emulator-audio.test.mjs scripts/phase08-emulator-audio-realtime.test.mjs scripts/phase08-emulator-audio-privacy.test.mjs` gives **41/41 pass**, 0 skipped.
  - Android build, emulator tests and the pacing dry run are NOT RUN; nothing that affects them changed.
- **Still open:** the microphone-state mechanism is unproven, spoken-ACK reliability is unresolved, no emulator recognition test ran, and the low-load comparison is NOT RUN.

### Emulator source review (documentation checkpoint, 2026-11-01)

Record: [source review](evidence/phase-08-microphone-state-emulator-source-review.json). This is documentation and derived evidence only. No emulator was launched or invoked, and there was no ADB call, audio injection, microphone access, build, installation or test run. Downloaded public source was read, not executed. The owner reports that Codex independently fetched the cited code from Google's repository and confirmed the retained copies matched.

**Revisions and comparisons.**
- The shipped engines are 37.1.11 (build 15917651; the two original-guest incidents, default backend) and 37.2.13 (build 16740729; null1, `-audio none`). Their exact source revisions were **not located or matched**: the binaries report `CL:N/A`.
- The closest located public candidates were reviewed:
  - R1 [`3f4160f6`](https://android.googlesource.com/platform/external/qemu/+/3f4160f6871e832fe62ea9cb51be8c1c495d2dbb) (37.1.8 Canary merge);
  - R2 [`8aaadeb1`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e) (37.2.12 Stable).
- **Whole files identical** at R1 and R2 (same git blob IDs): `audio_forwarder.c`, `audio.c`, `AudioStream.cpp`/`.h`, `audio-capturer.cpp`/`.h`, `AudioCaptureEngine.cpp`, `audio_forwarder.h`, `noaudio.c`, `dsoundaudio.c` and `virtio-snd.c`.
- **Whole files that differ** between R1 and R2: `EmulatorService.cpp`, `qemu-vm-operations-impl.cpp`, `main.cpp`, `vl.c` and `console.cpp`. Only the cited functions or regions inside them were shown to match. For example, the `injectAudio` and `get/setMicrophoneState` method texts are identical at R1, R2 and the later tip. Matching functions do not make the files identical.
- Two later upstream fixes are in neither R1 nor R2:
  - [`1ac571c`](https://android.googlesource.com/platform/external/qemu/+/1ac571c9780abc7c23aec02a5dd5a22efa490d2c) synchronizes stream start/stop with the QEMU global lock;
  - [`a6c0b4f`](https://android.googlesource.com/platform/external/qemu/+/a6c0b4f60ee75af6ff6a4f10f2634eddad62dd93) makes the flag atomic.

  37.1.11 predates both. Whether 37.2.13 includes either is unknown.

**Verified public-source behaviour** (R2 links; the same code is at R1):
- `getMicrophoneState` returns the emulator's real-audio flag. Call chain: [`EmulatorService.cpp#777`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/EmulatorService.cpp#777) → [`is_real_audio_allowed`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/android-qemu2-glue/qemu-vm-operations-impl.cpp#1071) → [`allow_real_audio`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio.c#1207).
- [`audio_forwarder_enable`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#83):
  - saves the previous flag ([`#104`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#104));
  - disables the previous input voice ([`#106`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#106));
  - sets the flag true ([`#127`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#127));
  - activates the injected-audio voice ([`#128`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#128)).
- [`audio_forwarder_disable`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#132):
  - re-activates the previous input voice ([`#157`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#157));
  - then restores the **saved** flag value ([`#162`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio_forwarder.c#162)).

  It does not unconditionally set false.
- The audio core uses the flag as a guest-input mute gate: [`AUD_read`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/audio/audio.c#1363) mutes data returned to the guest when the flag is false. The reviewed files do not consult the flag when host input devices are opened, started or stopped. The flag alone therefore does not establish whether a host device is open or recording.
- [`injectAudio`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/EmulatorService.cpp#641) keeps the forwarder-backed stream for the RPC's lifetime. After the client ends or cancels, it runs a silence drain whose wall-clock timeout is 300 ms ([`#710`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/EmulatorService.cpp#710)), then returns. Only after that does the stream's destructor ([`AudioStream.cpp#121`](https://android.googlesource.com/platform/external/qemu/+/8aaadeb1fea1202b287f1b8361f764a98950a27e/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/audio/AudioStream.cpp#121)) stop the forwarder.
- **Protocol wording preserved.** The SDK proto defines `realAudioEnabled` as "whether or not host microphone access is enabled". The reviewed implementation also sets this flag while synthetic audio is injected. This does not redefine the protocol, and it was not verified on the shipped binaries.

**Source-supported explanation** (inference; unconfirmed on the shipped binaries):
- A read issued immediately after the client cancels can be answered before server teardown restores the flag.
- On completed RPCs, the producer reads only after receiving the final status (`scripts/phase08-emulator-audio.mjs:366-378`), after handler cleanup. That ordering is general gRPC C++ behaviour; the bundled gRPC version was not verified.
- This is consistent with the retained 3/3 post-abort true and 37/37 post-completion false readings, and with OFF at the next check.
- No external writer is needed to explain the readings. That does not prove none occurred.

**Qualifications.**
- **Timing.** About 300 ms is the source's drain timeout. It is not a measured duration, not the whole teardown time and not a guaranteed exposure window for the installed binaries. Whether the drain runs to the timeout depends on the linked `RingStreambuf`, whose version is unverified.
- **Races.** At R1/R2, stream start/stop runs without the QEMU global lock. `1ac571c` later describes this as racing with the audio timer and with concurrent start/stop. A final OFF reading 21–25 s later does not rule out an earlier transient race. The source permitting a race does not show that one occurred.
- **Teardown order.** Teardown re-activates the previous input voice before it restores the flag. The source therefore permits a short interval in which that voice is read unmuted. Whether that happened, and whether it carried host samples, is unknown.
- **Backends.** Under `-audio none`, the reviewed `none` driver has no host input device; this is not verified on the shipped binary. On the default backend, the reviewed DirectSound driver starts and stops capture with the guest's input voice, independent of the flag.

**Host microphone: actual observations.**
- No harness enable request was found.
- The flag read true transiently after each abort.
- It read false at the next check.
- Actual host capture is unproven. This report does not claim that host capture happened, that it was impossible on every backend, or that the readings were harmless.

**Unchanged.**
- Fail-closed guards, the producer, the parent, cohort helpers, application code and tests are unchanged.
- No harness change or experiment is approved.
- Historical results were not rerun:
  - classification fix: Python 17/17 and Node 41/41, independently verified at the time;
  - the preserved old classifier's five reproduced failures;
  - all 43 retained classifications unchanged.
- No new emulator recognition result exists.

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

Updated: [current status](CURRENT-STATUS.md), [Phase 08 report](phase-08-report.md), [release gate](phase-08-offline-core-release-gate.md), [execution checklist](../../qa/PHASE-08-EXECUTION.md), [manual](../../qa/PHASE-08-MANUAL.md), [requirements matrix](../../qa/REQUIREMENTS-MATRIX.md), [offline loop contract](../phase-08-offline-loop.md), [README](../../README.md). Primary matrix [`phase-08-emulator-expansion-matrix.json`](evidence/phase-08-emulator-expansion-matrix.json) reconciled after an exact [pre-stable archive](evidence/phase-08-emulator-expansion-matrix-pre-stable.json), then again for the corrected wording and the NOT RUN low-load cohort after an exact [pre-low-load archive](evidence/phase-08-emulator-expansion-matrix-pre-lowload.json). Counts are unchanged at 45/2/1. No ADR: no architecture, production or performance-affecting change (test-platform launch flag only). Graphify: `graphify update .` results in [log](evidence/phase-08-stable-graphify.log), [low-load log](evidence/phase-08-stable-lowload-graphify.log) and [microphone-state log](evidence/phase-08-microphone-state-graphify.log) (exit 0; AST-only; the only code addition is a test file); navigation evidence only. The 2026-11-01 source-review checkpoint changed documentation and derived evidence only: this report (v2 archived first), [current status](CURRENT-STATUS.md), the [execution checklist](../../qa/PHASE-08-EXECUTION.md), one [README](../../README.md) sentence and the new [source-review record](evidence/phase-08-microphone-state-emulator-source-review.json). No code changed, so no Graphify update was needed.

## 8. Open blockers and recommended next steps

1. **Blocker:** automated emulator spoken-ACK reliability. The evidence localizes the observed faults to the emulator audio path, and no app change is proposed from it. Whether some application or harness change could make emulator ACK testing reliable has not been established either way. Weakening recognition/confirmation is not allowed.
2. **H3b still needs a qualifying host (owner decision).** The cohort was never invoked. The frozen plan binds the pre-fix cohort helper, so it no longer describes the current helper and authorizes no run; any rerun needs a new, separately approved plan. Options:
   - (a) Under a new plan with the same conditions, rerun when the owner can also exit the remaining IDE and network-simulator applications. Admission 3's minimum available memory was 6.01 GiB, about 0.5 GiB short, and it was also over the paging limit.
   - (b) Run it on a host with more free memory, declaring any platform difference.
   - (c) A separate, explicitly approved plan change, for example a smaller guest RAM. That changes the platform and must not be combined with the load reduction in one experiment.
   Keep the HAL record as a separate layer either way: a trial with virtual-sound I/O errors is reported as a device-faulted capture, never as an ASR result.
3. **Microphone-state anomaly (separate decisions):** a source-supported explanation now exists at the reviewed public revisions, and the mechanism on the shipped binaries is unconfirmed. The options below are separate decisions, and none weakens the fail-closed guard:
   - (a) Public-source review: done on 2026-11-01 for the closest located revisions (section 5). The matching build's exact source was not located or matched.
   - (b) A controlled experiment that observes the state around a deliberately cancelled stream on `-audio none`, with no live host input. This remains an unapproved option and needs its own frozen plan and explicit owner approval.
   - (c) Bind the producer's schema check to the running engine.
   - (d) Optionally have cohort summaries carry an ordered list of state observations.
4. **Primary acceptance path:** the physical-phone checklist above (ARM64, real microphone), where this emulator device does not exist.
5. Optional harness hygiene: have the reviewed parent label pre-recording input-injection refusals as UI failures, and dismiss/avoid foreign heads-up notifications before the hold.

Do not start Phase 09.

## 9. Review decision

- [ ] All automated required checks passing — emulator A03/V03 reliability remains FAIL
- [ ] Manual device tests completed and human-confirmed — NOT RUN; V05 deferred
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

**STATUS: BLOCKED**

**STOPPED — awaiting explicit human approval.**
