# Call feature remediation — reviewer handoff

Date: 2026-11-17 (Asia/Manila). **Status: AWAITING DEVICE VALIDATION.**

The reported defects have implementation fixes in this working tree. Required JS/native automated checks and emulator framework checks pass. Physical Infinix checks are not run: the phone disconnected after initial discovery. The app has not been committed, pushed or deployed by this task. Existing Floating Assistant work is preserved.

## Result by finding

| Finding | Implemented behavior | Evidence / remaining acceptance |
| --- | --- | --- |
| H1: overlapping calls | One presented identity; durable queue for later arrivals; native map retains cold-start requests; late outcomes/cleanup cannot act on the successor | App A+B/stale-close integration, SQLite queue/rollback, dispatcher deferred-outcome test, native persistence tests. Physical simultaneous reminders still needed |
| H2: full app above keyguard | Removed MainActivity manifest/runtime exemptions. The full app requires normal OS unlock; separate native alarm behavior is retained | Installed-package manifest check passed. Secure Infinix navigation check NOT RUN |
| H3: hidden live microphone | Start/restart reacquires active voice ownership; idle mounts do not steal it; mini bar subscribes to ownership; later reminders stop the real active controller | Controller lifecycle regression and existing rendered call suites passed. Physical mic indicator/audio check NOT RUN |
| M4: no native timeout | Notification cutoff and native 45-second deadline; persisted timeout/retry policy works without JS; identity-scoped cancellation | Android timeout recording/retry scheduling test passed. Audible cutoff, Doze/OEM and retry timing NOT RUN |
| M5: premature missed / unbounded answered call | Valid active/queued leases avoid generic overdue retirement; answered call has an independent ten-minute limit, remaining time and last-minute warning | Lifecycle/dispatcher tests. Long physical call/resume NOT RUN |
| M6: reminder read twice offline | Connectivity gate before online selection; fallback continues with an offline instruction after the existing announcement | Dispatcher/screen tests. Physical playback NOT RUN |
| M7: first permission grant cancels start | Permission-dialog pause is treated as a permission stage; foreground checked again before audio | Controller permission/lifecycle tests. First-grant Android dialog behavior NOT RUN on the Infinix |
| M8: recognizer errors snooze | Decoder/model/capture faults become buttons-only; engine errors do not consume unsuccessful-answer attempts | Recognizer-error regression passed |
| L1: audio focus error overwritten | Specific native error survives ENDED and blocks offline mic fallback | Audio-focus rejection race test passed. Real phone-call contention NOT RUN |
| L2: early call dropped | Unknown startup owner defers admission; native read is non-destructive | Native queue persistence and admission changes. Physical cold start NOT RUN |
| L3: onboarding replay hides call | Reminder host overlays replay while the onboarding component stays mounted, preserving its progress | Replay mount/presentation regression passed |
| L4: parser cases | Whole-command parser shared online/offline; negations/unrelated fuzzy words rejected; compound minutes/hours parsed; noted works online | Positive/negative parser regressions passed; acoustic recognition still needs a phone |
| L5: false snooze claim | Client tool waits for committed result, reports limit/storage failure and keeps controls available | Fenced settlement path and regression suite; signed-in provider dialogue NOT RUN |
| L6: foreground start/stop race | Startup resolves after promotion; pending stop waits for promotion; unavailable STT avoids microphone service startup | Native compile/unit/lint gates passed. Rapid physical start/stop NOT RUN |
| L7: idle minimize breaks auto-entry | Idle minimize closes the retained call surface; live mini bar follows ownership and end state | UI/ownership regressions passed |

JS fallback now commits `triggered`, local queue acceptance and its reminder outbox write in one SQLite transaction before emitting a UI event. Overlapping polls are serialized. Quick Chat's retained main root does not consume pending reminder calls or run foreground delivery while Quick Chat is in front.

## Actual verification

- `npm run preflight`: **156 suites passed; 2,102 tests passed, 1 skipped**. TypeScript, ESLint and architecture passed. A later focused replay/queue run passed **23 tests**, covering the final onboarding mount-preservation change. Final source-only gates were rerun after that change.
- Final race/ownership/queue/parser/error regression run: **132 tests passed**. Atomic acceptance regression run: **44 passed**.
- Android JVM: **87 tests passed**, zero failures/errors. Android lint passed without adding a baseline.
- Android instrumentation: **9 tests passed** on `sdk_gphone16k_x86_64`, Android 17 / API 37 (`emulator-5554`). These prove framework/storage/manifest contracts, not physical speech or ringing.
- ARM64 standalone APK built with the existing Java 17/short-path script. Packaged bundle hash verified, and configured provider keys absent from all APK entries.
- Scoped call-file formatting passed. Whole-repository `format:check` remains **FAIL** for 260 files: 252 already unformatted at HEAD and 8 unrelated, untracked Floating Assistant files. They were preserved rather than reformatted as part of call repairs. See `format-baseline-audit.json`.
- No physical phone call, STT/TTS audio, ElevenLabs dialogue, secure-keyguard or OEM timing success is claimed. No performance benchmark was run.

The first build attempts exposed missing offline lint/instrumentation dependencies and a host Java/CMake issue. The successful checks used the existing Java 17/short-path workflow after fetching the missing build artifacts. Failed attempts remain in evidence; they are not reported as passes.

Full evidence and the final source/APK hashes: [verification.json](evidence/call-fix-05/verification.json). Raw check logs, copied instrumentation XML, Android totals and the build receipt are in that directory.

## Install and phone checks — all NOT RUN on the Infinix

Use `.local/provider-testing/LAFINA-hosted-arm64-v8a.apk`. This is the **isolated** `com.lafina.capstone.providers` test app; it does not replace or inherit the main app's local data. Complete setup and create synthetic reminders there. Sign in and enable Online Mode only for the online voice checks.

1. **Lock-screen privacy:** with a secure screen lock enabled, open Notes, lock, then trigger a reminder and try notification/Back/recents paths. The full app must require OS unlock, including after Answer, Decline and call end. Repeat from Chat and Profile.
2. **Overlap and native timeout:** create distinct reminders A and B for the same minute. Answer A, tap B, settle A, then explicitly Answer B. Neither can disappear or act on the other. Repeat with full-screen intents denied and JS closed: ringing must stop after 45 seconds and retry/limit state must reconcile.
3. **Live ownership:** start Call LAFINA, interrupt with a reminder, settle it, restart live voice, minimize and trigger another reminder. The live mic must have visible controls and must stop for the next reminder. Rapidly Answer/End with STT unavailable; no crash or lingering mic/service.
4. **Permission and failure:** revoke microphone permission, start once and grant it; expect first-tap startup. Repeat with denial and Home during the dialog; expect mic off in background. Online Mode plus airplane mode must read the reminder once and keep buttons usable. Real phone-call focus contention must never start competing capture.
5. **Commands, policy and replay:** verify negated commands and sneeze/snore do nothing; 25 minutes and an hour save the named duration; snooze-limit failure is reported truthfully; online noted acknowledges. Trigger a reminder during onboarding replay and check replay progress survives. Let a buttons-only answered call reach its ten-minute limit; it must release resources and apply the no-response policy.

## Phase reports

[CALL-FIX-00](phase-CALL-FIX-00-report.md), [01](phase-CALL-FIX-01-report.md), [02](phase-CALL-FIX-02-report.md), [03](phase-CALL-FIX-03-report.md), [04](phase-CALL-FIX-04-report.md), [05](phase-CALL-FIX-05-report.md). Architecture and recovery decisions: [ADR-037](../decisions/ADR-037-call-lifecycle-remediation.md).

No further implementation-phase approval is required under the owner's follow-up. Physical acceptance remains open until the Infinix is reconnected and these checks are performed/acknowledged.
