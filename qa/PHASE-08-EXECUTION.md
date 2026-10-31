# Phase 08 execution checklist

Approved in chat: `APPROVE PHASE 08`, followed by the owner's instruction to
continue implementation and retain physical-device checks as pending.
Starting checkpoint: `98bef88`, branch `codex/phase-07-audit-hardening`, clean.

## Initial implementation cohort — historical completion

The checked items below describe the initial Phase 08 cohort. Its cleanup and
restoration record does not establish restoration after the later emulator
expansion.

- [x] Read standing instructions, Phase 08, current status and hardening handoff.
- [x] Verify branch/status; use the installed Graphify for scoped navigation.
- [x] Integrate Answer, offline TTS, explicit speech/manual response, reviewed
  ACK/snooze, atomic native persistence, reconciliation and close.
- [x] Run available automated duplicate/stale, timeout, lifecycle, permission and
  speech-failure checks; real phone interruption/speech checks remain pending.
- [x] Run focused tests, preflight, Android JVM/build/instrumentation where
  available; preserve fresh logs separately from historical evidence.
- [x] Refresh Graphify; update ADR/contracts, requirements and current status.
- [x] Save Phase 08 report, offline release gate and concrete manual checklist.
- [x] Complete the recorded emulator typed/manual UI subset; remove owned
  fixtures and restore original preferences, delivery and radios.
- [ ] Human validation: 30+ alarm cases, 10+ voice interactions per voice,
  airplane mode, reboot/concurrency, accessibility and device benchmarks.

## Emulator expansion — separate current cohort

- [x] Preserve the existing branch/HEAD and local Phase 08 work; no reset,
  reinstall with data loss, remote merge or publication.
- [x] Diagnose the notification ACK instrumentation-completion race; wait for
  the existing receiver worker before teardown and independently verify the
  final A35 paired ACK, task TODO and zero registrations.
- [x] Fix reminder reopening with OPEN flags and a dedicated reminder task;
  final A28 verifies old-review retirement and preservation of an unsent Main
  draft without extending the original ringing deadline.
- [x] Build the final task-isolated candidate and matching test APK; archive
  81 JVM tests and statically verify seven APKs, 84 native libraries and the
  six application model payloads in distinct expansion evidence.
- [x] Record fresh JS preflight (528 tests/35 suites) separately from the
  initial phase checks; refresh the AST graph and run read-only format checks.
- [x] Preserve synthetic speech failures and limited successes as separate
  cohorts; exact-reference mismatches do not become human voice acceptance.
- [x] Finish remaining selected emulator cases and reconcile the factual
  expansion matrix, including failures, scoped passes and NOT RUN conditions.
- [x] Complete and independently verify current expansion fixture cleanup and
  restoration of original preferences, permissions, radios and OS overrides.
  The initial cohort's checked restoration item above does not fill this gate.
- [x] Finish the updated report and concrete manual handoff, using the current
  [APK ledger](../docs/reports/evidence/phase-08-expansion-artifacts-matched.json) and
  [expansion report](../docs/reports/phase-08-emulator-expansion-report.md).
- [ ] Obtain human physical-device results and the signed offline release
  decision; all physical A01–A36/V01–V12 entries remain NOT RUN.

Physical ARM64/API30/31/low-memory, live speech/audibility, OEM delivery and phone
performance/battery remain NOT RUN until actual evidence exists. No Phase 09+
work, model/dependency downloads, remote publication or legacy edits authorized.

## Spoken response correction — approved follow-up, 2026-10-29

- [x] Verify existing branch/HEAD and preserve the closed expansion evidence.
- [x] Reproduce the pinned ACK/snooze failure; distinguish audio capture,
  decoder output and strict command validation before choosing a correction.
- [x] Add focused regressions and apply the supported fix without weakening
  review/confirmation, source fences or manual fallbacks.
- [x] Rerun the affected real-emulator decoder and visible speech cases;
  record fresh build/test/artifact evidence and refresh Graphify after code edits.
- [x] Restore recorded emulator state, update the report/manual/matrix and
  keep every physical-device acceptance gate pending.

Current correction: [report](../docs/reports/phase-08-speech-correction-report.md),
[APK ledger](../docs/reports/evidence/phase-08-speech-floor-artifacts-final.json).
All physical checks above remain unchecked.

## Remaining emulator cases — approved follow-up, 2026-10-29

- [x] Preserve branch/HEAD and existing work; capture a fresh private baseline
  and verify all ten starting state/hash/restoration checks.
- [x] Record owner decision to keep V05 pending until reviewed public/consented
  local-accent audio is available. Generic synthetic voices do not fill V05.
- [x] Establish A08 unsecured keyguard with the supported read-only
  `cmd lock_settings is-user-secure` probe; run actual notification ACK and
  independently check TODO/paired ACK/zero registrations and power restoration.
- [x] Execute A25/A26/A27 and V01–V04/V06 with actual observed conditions,
  explicit narrow scopes, independent SQLite checks and retained failed attempts.
- [x] Fix the reproduced decoder/message/checker issues and rerun affected
  checks; refresh source/APK ledgers and AST Graphify after final code changes.
- [x] Restore and verify baseline data/settings, update current report/matrix
  and concrete manual checklist; leave physical acceptance unsigned/NOT RUN.

Final remaining-case handoff: [report](../docs/reports/phase-08-remaining-emulator-report.md),
[artifact ledger](../docs/reports/evidence/phase-08-remaining-relative-artifacts-final.json).
Every prior failed trial is retained. Intermittent SDK synthetic-input loss is
still open as documented; no client protocol fix or phone defect is established.
V05 remains owner-deferred. All physical gates and the human signature remain pending.

## Intermittent emulator input loss — approved continuation

- [x] Verify the existing branch/HEAD, preserved local changes and available saved emulator.
- [x] Reproduce capture loss with bounded private route observations; distinguish
  transport, actual app signal and decoder outcomes before changing behavior.
- [x] Add optional format-only test-producer initialization and rerun focused
  captures. Four diagnostic captures passed, then clean A03 failed recognition;
  no reliable repair is claimed. Preserve all failures and manual safeguards.
- [x] Run the complete available host, JVM and native suites, frozen command
  regression and all runnable emulator scenarios; record exclusions explicitly.
- [x] Restore original data/settings, refresh the graph if code changes, verify
  artifacts/evidence and update the phase report and concrete checklist.
- [ ] V05: owner-deferred until suitable reviewed accent audio exists.
- [ ] All physical-device checks and signed human acceptance: NOT RUN.

Final execution: [report](../docs/reports/phase-08-input-loss-report.md),
[ledger](../docs/reports/evidence/phase-08-input-loss-case-ledger.json).
All47 runnable cases executed:44PASS/3FAIL/1NOT RUN(V05). These checked execution
items do not mean the failed voice gates passed. A03/V03/V04 remain unresolved;
optional initialization is not a reliable repair. Restoration10/10PASS. Physical
acceptance/signature remain pending and Phase09+ remains unapproved.

<!-- phase08-capture-fix-current -->

## Reviewed capture follow-up — 2026-10-31

- [x] Preserve prior failures; diagnose rebased producer drift separately from ASR.
- [x] Anchor sender timing;30 host checks and5 Windows-clock dry runs PASS without SDK/audio.
- [x] Rebuild/upgrade diagnostic test APK, verify installed identity and three negative gate controls.
- [x] Complete both declared five-trial cold cohorts; retain all10 outcomes: {'FAIL': 5, 'PASS': 5}.
- [x] Reconcile48-case ledger/matrix and verify original-state restoration10/10.
- [x] Final host integrity after report generation: six groups PASS; [record](../docs/reports/evidence/phase-08-capture-fix-validation-final.json). Final document hashes are rechecked separately; this is not a phase pass.
- [ ] V05: owner-deferred until reviewed accent audio exists.
- [ ] All48 physical rows and human signoff: NOT RUN / NOT SIGNED.

[Report](../docs/reports/phase-08-capture-fix-report.md); [ledger](../docs/reports/evidence/phase-08-capture-fix-case-ledger.json). Checked execution items do not turn failed trials into passes. Current aggregate 45 PASS / 2 FAIL / 1 NOT RUN; Phase09+ unapproved.

## Separate stable Android continuation — 2026-10-31

- [x] Preserve original emulator via fresh10/10 read-only checks; create separate stable API35 guest and verify unchanged installed hashes.
- [x] Complete anonymous setup and separate `st20261031` baseline; initial A03 diagnostic PASS.
- [x] Cold cohorts cold1/block1/sdk1 retained with failures (superseding the two-cohort plan; see the stable report). Unchanged repeats stopped.
- [x] Localize the observed faults (Claude Code, 2026-10-31): emulator audio-path (virtio-snd/HAL) I/O errors with silence insertion during every failing sdk1 capture; producer pacing on time; decoder exact on the clean fixture only. Root cause not established; decoder/app behaviour on actual captured PCM not excluded ([correction](../docs/reports/evidence/phase-08-stable-claims-correction.json)). [Retrospective](../docs/reports/evidence/phase-08-stable-hal-integrity-retrospective.json).
- [x] Freeze and run one repair experiment (`-audio none`): probe PASS; cohort null1 2 PASS/3 FAIL; the null backend did not eliminate the faults (not every backend contribution excluded); null2 NOT RUN by stop rule. Deviation: null1 continued after its A03/1 pre-recording UI failure although the plan required a stop. [Plan](../docs/reports/evidence/phase-08-stable-null-audio-plan.json).
- [x] Manual/typed fallback smoke A01/A02/A04 on API35: PASS 3/3. [Smoke](../docs/reports/evidence/phase-08-stable-fallback-smoke.json).
- [x] Restore API35 to its own baseline ([verified](../docs/reports/evidence/phase-08-stable-final-restoration-verified.json)); original Medium_Phone read-only checker [10/10](../docs/reports/evidence/phase-08-stable-original-after.json); both guests stopped.
- [x] Archive and reconcile matrix; [stable ledger](../docs/reports/evidence/phase-08-stable-case-ledger.json); [stable report](../docs/reports/phase-08-stable-emulator-report.md). Aggregate unchanged 45/2/1.
- [ ] Emulator spoken-ACK reliability: BLOCKED (host-contention experiment needs the owner).

## Report correction and low-load comparison — 2026-10-31 (Claude Code)

- [x] Correct the stable report's overstated diagnosis claims and disclose the null1 frozen-plan deviation; v1 archived unchanged ([correction record](../docs/reports/evidence/phase-08-stable-claims-correction.json)).
- [x] Freeze the low-load plan with thresholds, stop rules, hashes and null1-matched arguments ([plan](../docs/reports/evidence/phase-08-stable-lowload-plan-20261031T094218Z.json)).
- [x] Host admission with ≥30 s telemetry: three checks, all UNMET (memory/commit/CPU/paging), even after owner action; [record](../docs/reports/evidence/phase-08-stable-lowload1-not-run.json).
- [ ] Five-trial low-load cohort A03/1, V03/1, V03/2, V04/1, V04/2: NOT RUN (admission unmet; no guest launched; H3b untested).
- [x] Closing checks: 0 engines/devices/controllers; both saved guests untouched since the previous session. Guest-side checkers NOT RUN (no guest launched).
- [x] Report, status, [ledger v2](../docs/reports/evidence/phase-08-stable-case-ledger-v2.json) and matrix updated (matrix archived first); aggregate 45/2/1 unchanged.

## Microphone-state anomaly — host-only investigation, 2026-10-31 (Claude Code)

- [x] Reconstruct timelines of the 3 post-abort "enabled" readings from retained records and private logs; verify proto fields in both local SDKs.
- [x] Rule out harness enable requests, malformed/stale responses, wrong instance and field overwrite; cause is unproven (emulator-side teardown state most consistent).
- [x] Demonstrated summary-layer omission only; no producer/parent patch. [Investigation record](../docs/reports/evidence/phase-08-microphone-state-anomaly-investigation.json).
- [x] Host tests: node 41/41 (30 existing + 11 new), Python 9/9; no emulator, microphone or phone used.
- [ ] Mechanism of the enabled reading on the shipped binaries: public-source review done 2026-11-01 (below). Confirmation on the shipped binaries is still open; a controlled experiment would need its own separate approval.
- [ ] V05 and all physical-phone checks remain NOT RUN; no human signature or Phase09 approval.

## Emulator source review — documentation checkpoint, 2026-11-01

- [x] Verify Git state read-only (`codex/phase-07-audit-hardening`, base `98bef88`, dirty tree preserved). No emulator, ADB, injection, microphone, build or test run.
- [x] Record verified public-source findings at the closest located revisions (R1 `3f4160f6`, R2 `8aaadeb1`) and the later upstream fixes `1ac571c`/`a6c0b4f` in the [source-review record](../docs/reports/evidence/phase-08-microphone-state-emulator-source-review.json).
- [x] Scope comparisons precisely: R1 and R2 `EmulatorService.cpp` differ as whole files; only the cited functions match.
- [x] Correct overstatements in the status, report and README. Actual observations: no harness enable request; flag true transiently after each abort; false at the next check; host capture unproven.
- [x] Archive the stable report's pre-edit text unchanged ([v2](../docs/reports/evidence/phase-08-stable-emulator-report-v2-before-source-review.md)).
- [ ] Exact shipped source for 37.1.11/37.2.13: not located or matched.
- [ ] A03/V03 spoken-ACK reliability unresolved; low-load comparison NOT RUN (the old frozen plan does not describe the modified classifier).
- [ ] V05 and all 48 physical rows NOT RUN; human acceptance unsigned; Phase09 unapproved.
