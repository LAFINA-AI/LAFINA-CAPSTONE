# CALL-FIX-02 — Durable queue and native timeouts / Completion report

**Branch / base commit:** `feature/lafina-floating-assistant` / `d331b970d946ae02d3df34f6ed2c7ee84a74164e`, uncommitted working tree.  
**Report UTC:** 2026-11-17T07:34:29.140187+00:00  
**Status:** `AWAITING DEVICE VALIDATION`  
**Phase approval provenance:** Owner follow-up on 2026-11-17: “ok, start fixing all. dont stop until everything is finished”; subsequently “continue”. This authorizes the complete sequential remediation run without repeated phase approval.  
**Devices:** Infinix X6880 initially visible to ADB, subsequently disconnected. Headless Android emulator available for framework checks. No phone execution is inferred from initial ADB discovery.

## 1. Scope completed

Findings: **H1 (delivery), M4, M5, L2, L3**.

App serializes reminder presentation with durable identity-deduplicated leases in existing SQLite local_settings. Native pending storage is a map with non-destructive reads and old-slot adoption. Startup defers unknown owners. Queued Answer needs a fresh visible Answer. Native 45-second notification/deadline cutoffs persist snooze snapshots and bounded retries without JS; JS adopts them with reminder/outbox/queue/recurrence consistency. Answer arbitrates with native timeout. Active sessions are protected from overdue retirement, answered sessions have a ten-minute limit, and replay can be interrupted by a reminder. Quick Chat retains foreground-delivery exclusion.

This report describes implementation. Hardware acceptance remains outstanding. No legacy repository or backend writes, provider configuration changes, new permissions/dependencies or Kokoro were introduced by this task. Existing Floating Assistant changes were retained; the tree is shared, and its unrelated files are not claimed as call fixes.

## 2. Change summary

Files/modules for this phase: callLifecycle.ts; nativeCallRecovery.ts; reminderPoller.ts; reminderRescheduler.ts; reminderAlarm.ts; remindersStore.ts; App.tsx; IncomingCallScreen.tsx; LafinaReminderModule.kt; LafinaReminderReceiver.kt; PendingReminderCalls.kt.

Modules/files: `App.tsx; callLifecycle.ts; nativeCallRecovery.ts; reminderPoller.ts; reminderRescheduler.ts; remindersStore.ts; reminderAlarm.ts; LafinaReminderModule.kt; LafinaReminderReceiver.kt; PendingReminderCalls.kt` (paths are relative to their normal src/android/docs directories).

All changes are local refactors/new reliability code. No full legacy port. The shared design/recovery decision is [ADR-037](../decisions/ADR-037-call-lifecycle-remediation.md).

## 3. Tests and real outcomes

Verification evidence is shared across the integrated working tree, not six independent clean-checkout runs. Earlier failures are retained in logs and are not described as passes.

| Check | Command/procedure | Actual outcome | Evidence |
| --- | --- | --- | --- |
| TypeScript, ESLint, Jest, architecture | `npm run preflight` | PASS: 156 suites, 2100 tests passed, 1 skipped; architecture 391 modules, 0 cycles/forbidden dependencies | `evidence/call-fix-05/preflight-release-check.log` |
| Scoped formatting | `npx prettier --check` on call files and tests | PASS | `evidence/call-fix-05/format-check.log` |
| Android JVM, lint, ARM64 standalone/test APK | Gradle tasks in consolidated evidence | PASS on the recorded integrated build; final native incremental verification tracked separately | `evidence/call-fix-05/gradle-verification.log` |
| x86_64 build | Gradle then Java 17 short-path helper | First attempt FAILED in CMake configuration; helper retry in progress when this report was drafted | `evidence/call-fix-05/gradle-emulator.log`, `standalone-emulator.log` |
| Android instrumentation | Installed-package flags, pending-map migration/isolation, native deadline persistence | Pending execution; see consolidated device results | `evidence/call-fix-05/device-results.json` |
| Physical phone/manual audio | Checklist below | NOT RUN: phone disconnected | Human required |

The initial full run failed because changes were still being developed; the later UI gate failures exposed an unrealistic AppState mock, and the stronger race test found cancellation could complete an old outcome during a new answer. Those were fixed before the passing integrated run. Android lint found two microphone permission rechecks; they were implemented. Instrumentation's first compile used hidden SDK constant names; the test now uses the verified AOSP manifest masks. No failed log is discarded.

## 2. Change summary

Files/modules for this phase: callLifecycle.ts; nativeCallRecovery.ts; reminderPoller.ts; reminderRescheduler.ts; reminderAlarm.ts; remindersStore.ts; App.tsx; IncomingCallScreen.tsx; LafinaReminderModule.kt; LafinaReminderReceiver.kt; PendingReminderCalls.kt.

The call remediation changes are in the working tree alongside the owner's Floating Assistant work. No commit, push, merge, backend change, new dependency or new permission was performed. See ADR-037 and the plan's issue ledger for the file-by-finding mapping. The reports share one integrated verification run across the sequential implementation phases; six independent identical suites were not run. The existing schema supports the versioned local_settings queue, so no schema-version migration was needed; native single-slot preferences are migrated separately.

## 3. Tests and real outcomes

| Check | Command / procedure | Result | Evidence |
| --- | --- | --- | --- |
| Full preflight | `npm run preflight` | PASS: 156 suites, 2102 tests passed, 1 skipped; TypeScript, ESLint and architecture passed | `evidence/call-fix-05/preflight-complete.log` |
| Final regressions | Targeted Jest runs for races, queue transactions, replay, parser, voice ownership and errors | PASS: 132-test final regression run; 44-test atomic acceptance run; later 23-test replay/queue run | `regression-final.log`, `atomic-regressions.log`, `replay-regressions.log` under `evidence/call-fix-05/` |
| JVM tests / Android lint | `:app:testDebugUnitTest :app:lintDebug` with Java 17 | PASS: 87 JVM tests; lint completed | `evidence/call-fix-05/android-device-verification-online.log`, `android-results.json` |
| Android instrumentation | `:app:connectedDataQaAndroidTest` on emulator-5554 | PASS: 9 tests, zero failures/errors | `evidence/call-fix-05/android-results.json` and its copied `instrumentation-*.xml` reports |
| APK build | `scripts/build-provider-test-apk.ps1 -Architecture arm64-v8a -Backend hosted` | PASS: ARM64 standalone APK built; packaged JS hash verified; configured provider keys absent | `evidence/call-fix-05/standalone-phone-final.log` and `.local/provider-testing/artifact-hosted-arm64-v8a.json` |
| Formatting, changed call files | Scoped Prettier check | PASS | `evidence/call-fix-05/format-check.log`; last touched files were formatted before their final checks |
| Repository formatting | `npm run format:check` | FAIL: 260 files; 252 already unformatted at HEAD, 8 untracked Floating Assistant files | `evidence/call-fix-05/format-repository.log`, `format-baseline-audit.json` |
| Physical device / signed-in voice | Phase checklist below | NOT RUN: Infinix disconnected; no physical audio, real phone-call contention or secure-keyguard acceptance claimed | `evidence/call-fix-05/android-results.json` |

Instrumentation proves installed manifest flags, preference persistence/upgrade, identity separation and native timeout recording/retry registration. It does **not** prove an audible 45-second ring, a live provider conversation or the physical phone's keyguard behavior. Emulator: `sdk_gphone16k_x86_64`, Android 17 / API 37, `emulator-5554`. No production app data was cleared; native tests use synthetic identities and test-named preferences. Repository-wide formatting remains an explicit unrelated outstanding check, not a passing gate or an excuse to reformat another session's work.

## 4. Performance and device matrix

No performance benchmark was run. P50/P95, PSS, alarm drift, STT/TTS latency and offline-speech proof: **NOT RUN**. No invented benchmark JSON. Redacted native deadline timings may be recorded by instrumentation; they do not certify audible ringing.

Physical OEM matrix: Infinix X6880 Android 15 candidate **NOT TESTED in this task**; other OEMs **NOT TESTED**. Emulator results are reported only after execution.

## 5. Reliability, privacy, permissions and provenance

Acknowledgement still means reminder received, never underlying task completed. SQLite/outbox mutations remain fenced by owner/generation. Native timeout recovery is idempotent across its separate preferences and SQLite; exactly-once audible delivery is not promised. Android can delay an inexact deadline alarm; the notification has its own cutoff. Force-stop restrictions from ADR-017 remain.

No cloud keys or private transcripts are part of the evidence. No new permission. Package-manifest masks are factual constants verified against AOSP; see ADR-037. Existing lint warnings/deprecations are recorded by Gradle and were not hidden with a new baseline.

## 6. Human phone verification

Create two distinct reminders for one minute. Answer A, tap B, settle A, then explicitly Answer B. Kill/reopen between delivery and presentation. With full-screen intent denied, leave a reminder untouched in another app: native ringing must stop after 45 seconds and retry/limit state must reconcile. Repeat during onboarding replay and after a long resume. Physical ringing, cold start and reboot checks NOT RUN.

Do not treat Jest or a compiled APK as proof of Android alarms/calls/STT/TTS. Capture only redacted lifecycle/identity events; do not include conversation audio, tokens or private planner text.

## 7. Docs and decisions

Plan: `docs/plans/call-feature-bug-remediation-plan.md`. Decision: ADR-037. This report follows `templates/PHASE-REPORT.md`. Architecture verification is the actual `check:architecture` gate in the preflight log. Graphify: NOT RUN (not required for this change).

## 8. Open blockers and next steps

Automated behavior checks and Android framework checks passed as listed above. Physical phone and signed-in voice/real-call/keyguard checks require the Infinix to be reconnected and available; they remain acceptance gates. The full repository format check is not green; the existing/unrelated violations were preserved. No implementation-phase approval is pending under the owner's follow-up. No push, commit, merge, backend deployment or release was performed.

## 9. Review decision

- [x] Required preflight, JVM, Android lint, APK and emulator instrumentation checks passed
- [x] No forbidden scope, keys, backend writes, new dependency or new permission introduced
- [x] Scope/deviations and raw evidence recorded
- [ ] Physical phone acceptance and signed-in voice checks completed
- [ ] Repository-wide formatting clean (unrelated existing work; scoped call formatting passes)

- [x] Implementation for this phase recorded and scoped
- [x] Integrated JS gates passing on the recorded run
- [ ] Final Android framework results attached
- [ ] Physical device manual checks completed/human confirmed
- [x] No unavailable hardware result claimed as passing

STATUS: AWAITING DEVICE VALIDATION

## 9. Review decision

- [x] Required preflight, JVM, Android lint, APK and emulator instrumentation checks passed
- [x] No forbidden scope, keys, backend writes, new dependency or new permission introduced
- [x] Scope/deviations and raw evidence recorded
- [ ] Physical phone acceptance and signed-in voice checks completed
- [ ] Repository-wide formatting clean (unrelated existing work; scoped call formatting passes)

- [x] Required preflight and Android build/lint/JVM/framework checks have passing evidence.
- [x] Specific regressions cover the changed behavior, including transactional queue acceptance and preserved replay mounting.
- [ ] Physical phone / signed-in voice / secure-keyguard checks completed and human-confirmed.
- [ ] Whole-repository format check green (existing/unrelated violations recorded).
- [x] Unrelated Floating Assistant work preserved; no disallowed backend/provider change.

**STATUS: AWAITING DEVICE VALIDATION.** Implementation is not represented as fully device-accepted. The owner's unattended follow-up supersedes repeated phase-approval stops; device reconnection/observations remain required.
