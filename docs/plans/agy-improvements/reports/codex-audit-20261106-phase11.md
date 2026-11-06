# Codex audit — paused during AGY-PORT 11

**Date:** 2026-11-06, Asia/Manila. **Outcome:** NOT COMPLETE; useful committed improvements with remaining correctness/validation work.

**Audit scope:** lightweight read-only inspection of Git history/status, phase specifications/reports, saved command evidence and focused source. No build, test suite, APK audit, emulator, phone or live-service operation was started by this audit. This is not exhaustive independent certification of every changed line. One separate audit document is added; Claude's implementation, state and log are not edited.

**Observed branch:** `codex/agy-preservation-improvements`.
**Observed HEAD:** `c85b0238429b264819f1d959d30e02bdbf0f26a6` (documentation index after the Phase 10 implementation commit `335de87e3325c45e01af2a9851c9d64eee21748e`).

## Completion assessment

| Work | Observed state |
|---|---|
| AGY-PORT 00–10 | Each has a committed implementation and phase report. Several subfeatures are explicitly deferred; these statuses do not mean every corresponding inventory goal is complete. |
| Previous review remediation | `541dbfb` adds a native foreground claim, stronger legacy source evidence and recovered excerpts for lost logs. See residual limitations below. |
| AGY-PORT 11 | In progress, uncommitted audit script/tests/evidence; standalone dataQa build interrupted. No phase report yet. |
| AGY-PORT 12 | Not started: remaining architecture/evaluation/diagnostics/emulator/STT/doctor work. |
| AGY-PORT 13 | Not started: integrated preservation review, final checks, actual artifact receipts and final all-30 summary. |
| Phone/emulator/live backend | NOT_RUN in the inspected phase state/reports. No physical reliability, audibility or live-service claim can be made. |

The uncommitted Phase 11 work is `scripts/apk_audit.py`, `scripts/tests/test_apk_audit.py`, its evidence folder and a run-log update. At this snapshot no application/Gradle/manifest change is uncommitted. Preserve this work on resume; do not reset/clean/stash it.

## Saved evidence verified by inspection

- Phase 06 final log: 30 suites, 446 passed and 1 skipped.
- Phase 07 final log: 32 suites, 471 passed and 1 skipped.
- Phase 08 final log: 34 suites, 497 passed and 1 skipped.
- Phase 09 final log: 36 suites, 524 passed and 1 skipped.
- Phase 10 final log: 38 suites, **545 passed and 1 skipped**, typecheck/lint and the existing architecture check pass. The single skipped case is a newly added opt-in query timing test controlled by `AGY_MEASURE`; it is not a disabled original correctness test.
- Later saved Gradle debug/unit command logs end in BUILD SUCCESSFUL. Reports distinguish native UP-TO-DATE tasks from newly executed native tests. These debug builds are not proof that the current standalone QA variant works.
- Phase 11 Python test log: **13 tests passed**. The audit script is bounded/streaming in the inspected native-prefix and hashing paths, performs separate inventory/ELF/ZIP checks and writes receipts with exclusive creation. This static review does not prove all edge cases or a real target APK pass.
- Phase 11 attempt 1 failed in Metro SHA-1 resolution under X:; attempt 2 failed resolving the skipped bundle task. A bundle-only C: task succeeded. Attempt 3 has no final build verdict; user and run log report termination for low memory. **Record it as INTERRUPTED/NO_VERDICT, not a successful QA build or evidence of an app compile defect.** No completed target APK audit receipt appears in the Phase 11 evidence folder inspected.

Primary evidence is under `evidence/agy-port-20261106/phase-06/` through `phase-11/`. Existing logs are evidence from Claude's runs, not commands independently rerun by this audit.

## Findings to address or classify before final acceptance

### A1 — High: automatic local TTS still lacks positive offline eligibility

`src/ai/tts/ttsService.ts:109` filters automatic choices with `notInstalled !== true` and `networkConnectionRequired !== true`, accepting unknown metadata. At `245–264`, unavailable enumeration, no eligible selection or voice-setting failure can still lead to `ttsAvailable = true`. The new explicit-choice list is stricter (`143–144`), but reset/missing-explicit-voice paths return to the automatic behavior. Phase 10 itself documents this at `phase-10-speech.md:149`.

**Consequence:** the app can label/use its automatic local speech path without having established an installed offline-capable selected voice. A network leak was not observed; this is a static eligibility/fallback risk and an unmet safety requirement, not a claim of real audio/network behavior.

**Follow-up:** retain react-native-tts and the intended neutral/default experience, but positively establish offline capability for every offline playback path. Unknown/unselectable capability should report unavailable/text recovery, not silently trust an arbitrary engine default. Add tests for missing flags, failed enumeration/selection, removed selected voice and reset; verify actual airplane-mode speech later. Do not add Kokoro or change cloud entitlement policy.

### A2 — Medium: Calendar read failures appear as an empty agenda

`src/ui/screens/calendar/hooks/useCalendarData.ts:128–135` logs a block-query error and substitutes `[]`; `170–182` similarly leaves task/event arrays empty and sets empty overdue results. Phase 06 explicitly deferred on-screen read-failure feedback.

**Consequence:** users cannot distinguish unavailable storage/query failure from genuinely having no schedule. Phase 01's startup recovery does not cover every transient query error while storage health remains ready.

**Follow-up:** add a recoverable owner-bound Calendar error/retry state; retain the previous valid view where safe and avoid claiming an empty schedule. Cover failure/empty/success/account-switch separately in meaningful UI tests. Mark this requirement incomplete until done.

### A3 — Medium: existing Clear All Data does not cover new scheduling memory

`src/ui/screens/ProfileScreen.tsx:249–273` clears existing planner records/Chat but does not forget `event_memory_v1` or reset the new speech preferences. Phase 09 explicitly acknowledges retained event defaults (`phase-09-health-preferences-stats.md:188,215`).

**Consequence:** after the destructive action, saved event defaults can remain enabled and apply to a later draft. This is new retained scheduling state and the scope is not explained in the existing completion message. Whether speech settings should persist is a product-scope choice; it must be explicit rather than assumed.

**Follow-up:** clear/forget newly introduced personal scheduling memory under the same owner, or deliberately clarify the action's scope and give an explicit memory-reset option. Preserve revision fences against old pending reviews, other owners and guest-link choices. Add a regression test. Do not clear unrelated device/student data as an audit workaround.

### A4 — Medium: background reconcile reduces, but does not eliminate, stale-alert exposure

The remediation now arbitrates foreground/native claims under one native lock, and legacy matching requires owner + title + item time + unique evidence before exact linking. These are substantive fixes over the last audit.

However, `App.tsx:315–322` starts asynchronous reconciliation on background entry. Native still cannot validate the authoritative SQLite job when firing. `pre-advance-remediation.md:86` acknowledges that killing the app before reconciliation finishes can leave an obsolete native registration able to ring. Its headline that stale-alert gaps are closed is broader than the documented behavior.

**Follow-up:** retain this residual limitation explicitly, add a controlled interruption/fault-injection case, and assess the smallest AGY-compatible durable invalidation/claim protocol before claiming the full process-death guarantee. A background callback alone is not durable completion. This audit does not mandate copying the donor's native-SQLite architecture or claim Android can guarantee exactly-once audible delivery.

### A5 — Tracking/evidence: completion labels need reconciliation

- The phase array still calls Phase 11 NOT_STARTED while current_phase and the run log show Phase 11 in progress. Update it on resume and retain the interrupted-build evidence.
- `SUMMARY.md` remains the initial NOT EXECUTED placeholder. Phase 13 must replace it with actual results, all 30 dispositions and preserved-feature evidence; it must not be mistaken for current progress.
- Android on-device STT and TTS engine switching are deferred, event metadata is device-local with backend/cross-device work deferred, and recurring/override ICS import and >24-hour events have limits. Report these as partial/deferred subfeatures rather than claiming all 30 complete.
- Phase 05 lost two logs. Later Phase 09/10 reports also acknowledge a log overwritten by an identical rerun. The disclosure is useful, but violates the non-overwrite evidence rule. Use fresh run filenames/exclusive writes for every later attempt; never fabricate lost originals.
- Several later phases were parent self-review only. That is explicitly disclosed. Final independent review is still valuable; do not label a self-review as an independent check.

## AGY preservation checks

Compared with base `b9433dc`, these inspected seams remain unchanged: package.json, android/app/build.gradle, authService, entitlements, cloudClient, cloud speechService, documentSkill, meetingNotesSkill, onlineChatSkill, Login/Register screens, meeting screen directory and update modules. Shared Chat/storage/calendar/TTS and meeting capture modules changed as intended, so unchanged clients plus host tests are useful evidence, not proof of all end-to-end behavior.

No feature removal or Kokoro restoration was found in the sampled changes. Existing account/subscription gates, online AI/RAG/documents/meetings and cloud speech must still receive the integrated PF01–PF13 checks in Phase 13. The LAFINA donor HEAD and dirty status match the recorded read-only baseline.

## Safe pause and next session

The owner is using the PC for gaming. **Do not restart builds, tests, APK audits, emulators or background implementation based on this report.** Resume only when the owner starts Claude later. The cancelled attempt must not be automatically retried while the owner is away from development.

When resumed:

1. Read this audit, owner authorization, PLAN, state/log, Phase 10 and existing Phase 11 evidence. Inspect Git status first; preserve all uncommitted audit code/tests.
2. Mark Phase 11 IN_PROGRESS, document the exact interrupted attempt and keep all prior logs. Treat no verdict honestly. Finish its report and identify the actual next safe command.
3. Address A1–A4 in focused reviewed units, or accurately retain their incomplete status and acceptance prerequisites. No feature removal, entitlement weakening or blanket network whitelisting.
4. When the owner is ready for builds, use the documented JDK/path workaround, one build worker/session at a time and a deliberate resource-bounded retry. A standalone bundle-only success is not an APK success. Do not change global PC settings, kill unrelated processes or deploy to work around resource limits.
5. Complete Phase 11 artifact checks, Phase 12 tooling/evaluation and Phase 13 integrated review/handoff. Document every deferred unit and actual device/live NOT_RUN case. Do not push/deploy/merge or claim production readiness.

**Audit conclusion:** work can be resumed later from the existing branch/working tree, but the project is not done or device-qualified. No new runtime test/build result was produced by this audit.
