# Call feature bug remediation plan

Date: 2026-11-17 (Asia/Manila)  
Status: **IMPLEMENTATION AUTHORIZED — 2026-11-17 follow-up: “ok, start fixing all. dont stop until everything is finished”.**

The follow-up authorizes sequential implementation of CALL-FIX-00 through 05 without repeated phase approval. It supersedes this plan's per-phase approval stops for this task. Reports, truthful device results, repository boundaries and all product privacy rules still apply. Missing device checks remain outstanding and never count as passing.

## Evidence and boundaries

This plan addresses the owner's code-review findings for reminder calls and live **Call LAFINA**. Targeted source inspection confirms the cited control flows exist. The reported phone behavior, first-permission cancellation and foreground-service crash remain hypotheses requiring reproduction. No Jest, Gradle, emulator, device, network voice session or parser scratch execution was run while writing this plan. Earlier reports' passing checks do not validate these defects or this plan.

At the planning handoff, only this plan document was added. Existing uncommitted Floating Assistant work, including `MainActivity.kt` and `AndroidManifest.xml`, must be preserved. Before implementation, refresh the diff and coordinate ownership of shared files with that session; use a clean isolated checkout when necessary without copying or committing another session's changes. Do not run competing builds or device actions against its session.

The follow-up authorization at the top of this document supersedes the original per-phase approval stops for this task. Report actual gates and device checks for every phase. Historical Call LAFINA and Floating Assistant unattended authorizations do not approve this new remediation sequence. No backend changes, new providers, dependencies or permissions are proposed. Existing unrelated capabilities stay outside this work. Use `react-native-tts`; no Kokoro, wake word or background listening.

Reference material:

- `docs/reports/call-flow-audit-2026-11-16.md`
- `docs/decisions/ADR-017-durable-reminder-delivery-identity.md`
- `docs/decisions/ADR-031-background-call-and-multimodal-feasibility.md`
- `templates/PHASE-REPORT.md`

## Required behavior and implementation decisions

1. **One foreground call owns audio and presentation.** Carry delivery identity `{ownerId, reminderId, generation}` plus a local session token through UI, dispatcher, native pending records, timers, speech, capture and cleanup. A matching reminder ID alone is insufficient. After every asynchronous boundary, verify the session token before publishing state, opening capture, playing a result or closing a call. An old cleanup must not stop a new owner's speech, ringtone, microphone or service.
2. **Arrivals queue; they do not replace an answered call.** Keep the active call stable. Order queued calls by due time, then arrival sequence; deduplicate by delivery identity. A duplicate notification tap can update the pending action for that identity but cannot restart its UI. Answering B from its notification while A is active queues B's request and requires a fresh Answer when B is presented; it must not open B's microphone later without that visible interaction. Never auto-answer a queue entry.
3. **Queue admission is durable and replayable.** Native persists all pending identities, not a single overwrite slot. Reading pending entries does not delete them: explicitly acknowledge transfer/disposition after JS has durably accepted or settled the entry. Recover after process death between read, admission and presentation. Keep local call lifecycle metadata in the existing SQLite database; native uses its existing preferences/registry architecture and receipts, without opening a second SQLite connection. Native-to-JS operations must be idempotent because the stores cannot share a transaction. Migrate the old single pending slot once without dropping it; do not destructively repair an unknown newer format.
4. **Account hydration is different from signed out.** Buffer/defer during database/account startup, without showing content or dismissing the pending notification. Once ready, apply the owner and generation fence. A confirmed wrong owner or stale generation is rejected and only that identity's artifacts are cleared. Sign-out/account switch ends audio and suppresses the previous owner's pending calls; it never presents their content to the next owner.
5. **Only a restricted reminder surface may appear above keyguard.** MainActivity must have no permanent lock-screen exemption. The safe first fix is to require unlock to enter the React Native app. Preserve notification Answer/Decline behavior through the normal keyguard flow. If an above-keyguard answer surface is retained, it must be a dedicated, non-exported reminder-only activity with no route to notes, chat, profile, Quick Chat, tools or planner data; entry to the full app requires OS unlock. Do not merely clear flags after the call: that leaves the app exposed during it. Document any change to the locked-phone answer experience before implementation; do not reuse the separate alarm activity without reviewing its lifecycle.
6. **Native ringing has a deadline without JS.** Preserve the existing 45-second ring policy using a native deadline and identity-fenced timeout receiver. Notification timeout is a defensive audible cutoff, not the snooze mechanism. Persist a timeout receipt/disposition; reconcile through the existing transactional reminder action when JS becomes available. Arrange a durable native retry from the last known snooze policy where possible, consume that receipt before the retry is presented, and adopt the resulting SQLite generation. Validate snooze limits and retire retries when newer owner/generation state supersedes them. If native cannot safely schedule a retry under the existing contract, implement only the bounded ring cutoff first and explicitly report deferred auto-snooze as incomplete; do not claim notification expiry changed SQLite.
7. **Queued, ringing, answered and settling calls have distinct lifetimes.** Queued calls cannot ring indefinitely behind another call; silence their competing native alert while preserving the pending request. Give queued requests a bounded 15-minute waiting deadline with an explicit missed disposition. Start the 45-second ring window when a request actually becomes the presented ringing call. Answer atomically cancels the native ring deadline for that token before capture starts. Rescheduling must exclude valid active/queued leases from the generic 15-minute overdue rule. Leases have finite expiry and are reconciled after crash, reboot and time changes. Source deletion, completion, owner change and newer generations still invalidate a lease.
8. **An answered call is bounded even with buttons only.** Add a session deadline independent of STT/online state, initially 10 minutes to match the existing maximum wake-lock duration. Show the remaining time and a warning before expiry. Expiry releases audio/service and applies the existing no-response/snooze-limit policy once; it does not silently acknowledge or complete a task. A pending unconfirmed card is discarded on expiry. Keep Acknowledge, Snooze and End available throughout failures.
9. **Live voice registration follows active ownership, not mounting order.** An idle mounted controller must not displace a running one. Every start/restart acquires an exclusive app-wide lease, awaits the previous owner's release, and publishes a reactive snapshot. Unmount unregisters only its own token. The full call panel or mini bar must be visible whenever capture is live; if ownership/presentation is lost, stop capture. Reminder calls, sign-out, Online Mode withdrawal and genuine backgrounding terminate the actual owner without automatic restart.
10. **Failure is not a student answer.** Permission denial, audio focus loss, unavailable/broken STT, model errors and busy capture transition to visible buttons-only mode and release resources. They never consume the three unanswered-prompt attempts or immediately auto-snooze. Silence/unrecognized successful captures can retain the existing bounded retry policy. Connection failure may fall back to offline capture only while foreground, permission allowed, audio available and the same session remains current.
11. **Mutations precede success claims.** Buttons, transcript commands and client tools use one fenced settlement path. Its structured result drives the UI, spoken feedback and tool response. A rejected snooze at the limit leaves the call actionable and reports the actual reason. `acknowledged` continues to mean alert received, never task completed. Local writes and outbox changes remain transactional.

## Issue coverage

| ID | Finding | Primary phase | Required regression |
| --- | --- | --- | --- |
| H1 | Overlapping calls, same-poll losses, cold-start overwrite, stale disconnect | CALL-FIX-01 / 02 | A remains bound to A; B survives in queue; late A cannot speak into or hang up B; both cold-start entries recover |
| H2 | Whole app exposed above lock screen | CALL-FIX-00 | Lock from each app screen and end each call path; private screens require OS unlock |
| H3 | Live voice controller lost; hidden microphone | CALL-FIX-01 | Live call → reminder → reminder unmount → live restart → minimize → next reminder; mini bar visible and mic stops |
| M4 | No native ring timeout | CALL-FIX-02 | JS absent/full-screen intent denied: ring ends at native deadline; durable disposition/retry follows policy |
| M5 | Active call retired as missed; answered call hangs indefinitely | CALL-FIX-02 | Resume/sync beyond 15 minutes cannot retire a valid active lease; all answered modes reach their finite deadline |
| M6 | Offline connection attempt reads reminder twice | CALL-FIX-03 | Online Mode enabled + airplane mode, and connection loss after announcement: one announcement |
| M7 | First permission dialog cancels start | CALL-FIX-03 | Fresh permission grant starts on first tap; deny and Home during prompt leave mic off |
| M8 | Recognizer faults consume attempts and auto-snooze | CALL-FIX-03 | Repeated engine errors keep manual controls and do not mutate snooze state |
| L1 | Audio-focus reason overwritten; unsafe offline fallback | CALL-FIX-03 | Native focus denial preserves typed audio failure; no fallback capture during a real phone call |
| L2 | Early cold-start call dismissed before account loads | CALL-FIX-02 | Delayed hydration defers; confirmed wrong account rejects without exposing content |
| L3 | Onboarding replay hides reminder screen | CALL-FIX-02 | Reminder presentation overlays replay, preserves replay progress and never bypasses required first-use setup |
| L4a | Negated remind/call phrases snooze | CALL-FIX-04 | “don't remind me again” / “do not call me back” cause no mutation; show explicit available choices |
| L4b | “sneeze” / “snore” snooze | CALL-FIX-04 | No fuzzy action on unrelated words/noise |
| L4c | Compound numbers and hours ignored | CALL-FIX-04 | “twenty five minutes” → 25; “an hour” → 60; invalid/out-of-range values never silently use default |
| L4d | Online “noted” passes regex then is dropped | CALL-FIX-04 | Shared parser returns the documented online acknowledgement consistently |
| L5 | Agent claims snooze success before save | CALL-FIX-04 | Tool waits for result; limit/storage failure never produces success wording |
| L6 | Immediate foreground-service start/stop crash risk | CALL-FIX-01 | Missing speech engine and immediate close cannot violate foreground promotion or leave a service/wake lock |
| L7 | Minimize idle call leaves hidden mount and blocks auto-open | CALL-FIX-01 | Minimize/end with no live session clears minimized state; configured Chat auto-entry works next time |

## CALL-FIX-00 — Contain lock-screen exposure

**Scope:** H2 only. Reproduce on a secure-keyguard device before claiming a confirmed exploit. Remove permanent MainActivity lock-screen attributes and its unconditional reminder-intent flag elevation. The initial deliverable uses normal OS unlock to open the app, preserving safe notifications. If review requires answering above keyguard, finish a restricted-activity design and validation in this phase before restoring that behavior. Reject untrusted/stale intent metadata before showing private content; do not treat `hasExtra("reminderId")` as authorization.

**Files:** `AndroidManifest.xml`, `MainActivity.kt`, reminder activity intent creation in `LafinaReminderModule.kt`; activity/privacy tests as needed. Preserve Floating Assistant lifecycle hooks and permissions. Leave `AlarmRingingActivity` behavior intact and verify it cannot expose the app either.

**Acceptance:** Notes, chat, profile, recents, Back/Home, new intents, cold start, notification taps and completed/declined/timed-out calls cannot reach full app content without unlock. Locking an already open app has the same protection. Calls/alarms still provide permitted notifications.

**Phone checklist:** Install the debug APK on a phone with PIN/biometric lock; open Notes then lock; try Back, recents and reminder notification; repeat from Chat/Profile and after Answer/Decline. Expected: OS keyguard protects the full app every time. All checks currently **NOT RUN**.

## CALL-FIX-01 — Enforce session, microphone and service ownership

**Scope:** H1's stale asynchronous actions, H3, L6, L7. Introduce the shared token/ownership contract before changing queue behavior. Fence dispatcher state events, STT partial/final events, outcome TTS, stop/disconnect and native cleanup. Replace global singleton-by-mount registration with exclusive acquire/release on start and a subscribed snapshot. Await actual resource release before switching owners; release failure keeps the next mic closed with buttons available.

Use one presentation state (`closed`, `full`, `minimized`) derived with the live session snapshot. Minimize without a live session closes the panel. Ending a minimized session clears it, and Chat's start-with-call preference remains effective. Keep the minimized bar mounted/visible reactively rather than relying on a nonreactive `isVoiceConversationActive()` render check.

For the reminder foreground service, return success only after foreground promotion; serialize start/stop under a session token, promote before processing cancellation, and avoid starting a microphone service when capture will not run. Inspect Android microphone-service eligibility and permission ordering in the existing paths. Test rapid stop while startup is pending, denied startup and repeated stop. Do not bypass the OS lifecycle contract with arbitrary delays.

**Files:** `callDispatcher.ts`, `voiceConversation/index.ts`, `controller.ts`, `useVoiceConversation.ts`, `App.tsx`, `LiveMiniCallBar.tsx`, `IncomingCallScreen.tsx`, `reminderAlarm.ts`, `LafinaReminderModule.kt`, `LafinaReminderService.kt`; native voice module only where required for ownership.

**Automated regressions:** Deferred promises for A's settlement/TTS completing after B takes ownership; old UI close/dispose after restart; old STT events; live/reminder/live sequence; sign-out while starting; missing recognizer immediate stop; mini-bar visibility and idle-minimize auto-entry. Verify token fences at both JS and native cleanup, including same reminder with a newer generation.

**Phone checklist:** Start Call LAFINA, let a reminder interrupt it, settle it, restart live voice, minimize, then trigger another reminder. Expected: visible mini bar whenever live, reminder stops the current live mic, no stale audio/hangup. Repeat with unavailable offline speech and rapid Answer/End; no crash, stuck mic indicator, service or wake lock. **NOT RUN**.

## CALL-FIX-02 — Durable queue, native deadlines and reconciliation

**Depends on:** CALL-FIX-01 ownership contract. **Scope:** remaining H1, M4, M5, L2, L3.

Create a local lifecycle store/coordinator and migration in the existing database. Persist queue acceptance before acknowledging native transfer. Extend native pending records and bridge with list/ack semantics, full delivery identities, synchronized read-modify-write, absolute deadlines and idempotent timeout receipts. Retain existing registry/one-engine claims and generation rules from ADR-017. Do not introduce a new wire entity or sync local call leases to the backend.

Route foreground poller, native events, activity intents, startup drain and resume through the coordinator. Protect concurrent poller runs and deduplicate sources. Revalidate owner, source, generation and deadline on dequeue and at mutation time. Resolve only the matching entry; advancing the queue waits for audio release. Keep pending requests across process death and reconcile terminal entries before presentation. Bound storage using terminal receipt retention and explicit expiry, never silent eviction of live requests.

Mount the reminder host above authenticated onboarding replay without granting access through first-use consent, login, loading/error or keyguard gates. Requests that cannot yet be presented remain durable and expire through the defined policy rather than disappearing.

Implement native ring cutoff, Answer/timeout arbitration, queued/active leases and the answered-call deadline described above. Consume timeout/snooze receipts before generic overdue processing. Timer callbacks, rescheduler and sync must share fenced terminal transitions, with exactly one outbox mutation/next recurrence. Valid source deletion or remote terminal status still closes the call. Recovery never resurrects a microphone or auto-answers.

**Files:** `App.tsx`, `callAdmission.ts`, `reminderPoller.ts`, `reminderRescheduler.ts`, `deliveryReconciler.ts`, `reminderActions.ts`, delivery/store schema and `dbInit.ts`, `IncomingCallScreen.tsx`, native module/receiver/registry, bridge types; add a coordinator and pure native deadline/queue rules as needed.

**Automated regressions:** Two reminders in one poll; B's notification tapped while A listens or settles; duplicate native/JS intents; same-ID newer generation; kill between native read and JS commit, and between commit and native ack; old-slot upgrade; delayed hydration; logout/account switch; replay; queue expiry; 45-second Answer/timeout race; reboot/time changes; repeated timeout receipts; snooze limit; sync/resume beyond 15 minutes; expired lease after crash; buttons-only/online-ended deadline; source invalidation. Assert reminder, delivery job and outbox results in real in-memory SQLite, not only mock calls.

**Phone checklist:** Create two reminders for the same minute; answer A, tap B's notification, settle A, then answer B. Kill/reopen between delivery and presentation and verify both identities survive. Deny full-screen intents while another app is visible and leave the reminder unanswered: ringing stops after the bounded window and retry/disposition is recorded correctly. Test replay, resume and clock/reboot recovery. Expected: no overwritten call, endless ring, orphan trigger or active-call retirement. **NOT RUN**.

## CALL-FIX-03 — Permission, connectivity and speech failure recovery

**Scope:** M6–M8, L1. Check connectivity before selecting online reminder voice, while retaining controller checks for races. Track announcement progress on the session: fallback skips a completed announcement and uses a short instruction; if speech was interrupted, permit an explicit replay without running two simultaneous voices. Recheck identity after network, permission and release waits.

Move permission acquisition into an explicit pre-capture stage. Distinguish the app's permission dialog from genuine backgrounding; do not broadly ignore `inactive`/`background` while connecting. After the permission promise resolves, require current token, active/visible app, unchanged owner, consent and mode before starting native audio. Home/lock during the prompt cancels the pending start with no automatic mic restart.

Preserve the first typed native startup failure through promise rejection and subsequent `ended` events. Audio focus denied must remain `audio`, not `connect_failed`; block offline fallback for audio/permission/busy failures and real calls. Classify recognizer startup/result errors separately from silence/unrecognized speech. Stop automatic capture and present buttons plus an explicit Retry voice action when appropriate; engine faults must not consume answer attempts.

**Files:** `IncomingCallScreen.tsx`, `callDispatcher.ts`, `useVoiceConversation.ts`, `controller.ts`, voice transport types/native module, microphone permission helper if needed.

**Automated regressions:** Connectivity false, disconnect during connect and after announcement; failed TTS; permission prompt lifecycle grant/deny/Home/lock; focus error then ENDED event/rejection in either order; stale permission resolution; unavailable model, repeated decode errors, capture busy and silence as distinct outcomes. Verify no unintended snooze, second announcement or background microphone.

**Phone checklist:** Clear microphone permission, explicitly start live voice and grant once; expect first-tap success. Repeat with denial and Home during the dialog; expect mic off. Enable Online Mode then airplane mode; answer a reminder and hear it once. Test during a real phone call/audio-focus contention and with offline STT unavailable; expect truthful status and working buttons. **NOT RUN**.

## CALL-FIX-04 — Conservative command parsing and truthful settlement

**Scope:** L4a–d, L5. Extract a shared pure parser with explicit `offline_prompt` and `online_conversation` contexts. Replace the online regex-plus-second-parser gate. Normalize apostrophes/punctuation, handle negation before all action synonyms, and use complete command shapes. Remove broad edit-distance snooze matching; allow only reviewed speech variants with negative test coverage. Do not infer acknowledgement from unrelated conversational sentences.

Support digit/compound-word durations, including “twenty five”, “twenty-five”, “an hour” and “one hour”, within the existing 1–120 minute limits. A missing duration can use the preference; a stated but invalid/unparsed duration requires clarification instead of silently using it. “Don't remind me again” does not acknowledge, snooze or permanently disable reminders; show the explicit choices. Keep bare casual acknowledgements confined to the offline prompted response; explicitly documented online forms such as “noted” use the same parsed result all the way through.

Refactor the manual/tool settlement boundary to return the actual structured action result. Remove the zero-delay deferred snooze success response. Commit once, show the result, produce a matching tool response, then close only on success and only for that session. Coordinate app TTS and agent output so a closing transport cannot lose or duplicate feedback. Failure leaves controls usable and cancels no unrelated call. Preserve confirm-before-write for planner cards and existing no-card-claim protections.

**Files:** shared call-command parser, `callDispatcher.ts`, `IncomingCallScreen.tsx`, reminder action result types/tool wiring if necessary. No server prompt/provider changes.

**Automated regressions:** Table-driven examples from every reported phrase, positive aliases, negated aliases with curly apostrophes, mixed commands, ordinary questions, noise, “sneeze”, “snore”, compound/hyphenated numbers, hour conversions, zero/negative/>120/unparseable durations. Test “noted” end-to-end in both contexts. Tool snooze at limit, storage failure, double tap/tool race, stale session during mutation/TTS and successful mutation: response text must match saved state and exactly one outbox transition. Retain no-task-completion and pending-card tests.

**Phone checklist:** Say the negative phrases and noise words: reminder stays actionable. Say “snooze for twenty five minutes” and “snooze for an hour”: displayed/saved times match. At the snooze limit, invoke agent snooze: no false success and controls remain. Confirm a normal acknowledgement never completes the task. **NOT RUN**.

## CALL-FIX-05 — Integrated device acceptance and closure

**Depends on:** all previous phases approved and their blockers resolved. Avoid unrelated refactors. Re-run the complete call journey across queue, keyguard, permission, transport, fallback, manual actions and recovery on one integrated build. Add only regressions revealed by failures.

Minimum device matrix: a physical secure-keyguard Android phone (the Floating Assistant record identifies Infinix X6880 / Android 15 as a candidate; availability and use must be coordinated afresh), plus an available emulator/API target for controlled process-death and denied-permission cases. Record actual model/API/build and APK revision. A previous device record is not a current successful check. Other OEM/API rows remain NOT TESTED unless run.

Cover foreground, background, locked, JS cold process, notification/full-screen intent denied, battery restrictions, reboot, time change, airplane mode, signed-in Online Mode, local guest, mic denied/busy, missing STT and actual audio-focus loss. Distinguish ordinary process kill from Android force-stop: do not promise alarms after force-stop before the app is reopened. Test online voice only with an available authorized account; missing credentials are NOT RUN, never a fabricated pass.

Exit requires: no cross-call identity effects, full app protected by keyguard, no hidden microphone, bounded ringing and answered sessions, no missing pending identities, accurate action feedback, correct recurrence/outbox state and working manual controls through failures. Existing card visibility, confirm/cancel, interruption, mute, navigation, theme and minimize regressions must remain passing. Floating Assistant behavior must remain intact where touched.

**Short final phone checklist:** Install the integrated APK; lock from Notes; trigger A+B; answer/settle each; restart/minimize live voice and interrupt with another reminder; repeat offline, mic denied and full-screen intent denied; cold-reopen and inspect reminder outcomes. Expected: private app stays locked, one call owns audio, both reminders accounted for, bounded timeouts and truthful saved results. **NOT RUN**.

## Gates and reports for every implementation phase

The following are planned commands, **not commands executed for this plan**. Confirm module/task availability at implementation time and capture actual exit codes and logs.

```powershell
# Repository root
npm run preflight
npm run format:check

# android directory
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug

# With an available, coordinated Android device/emulator
.\gradlew.bat :app:connectedDebugAndroidTest
```

Run targeted meaningful regressions during development, then full preflight and Android verification before handoff. Update behavioral tests in `__tests__/scheduler/`, `__tests__/cloud/`, `__tests__/ui/` and native contract tests; avoid relying solely on source-string assertions. Use fake clocks and deferred promises for races, real SQLite for mutations, JVM tests for pure native rules and instrumentation/device tests for Android lifecycle. Unit mocks cannot certify ringing, keyguard, microphone release, foreground promotion or physical speech.

For each phase write `docs/reports/phase-CALL-FIX-NN-report.md` using `templates/PHASE-REPORT.md`, with evidence under `docs/reports/evidence/call-fix-NN/`. Include approval provenance, actual base revision/diff, exact commands/outcomes, APK path, device identifiers, manual steps/results, pending checks and deviations. Capture redacted identity/state events and deadline timings in JSON; do not log reminder text, tokens, conversation audio or private planner content. No performance claim without a measured baseline; inapplicable benchmarks are N/A.

Update ADR-017 or add a scoped ADR documenting queue ordering, leases, cross-store recovery, timeout retry generations and keyguard behavior. Every phase handoff includes its short install/action/expected-result checklist. Automation passing with phone checks outstanding means **AWAITING DEVICE VALIDATION**, then stop; it does not approve the next phase.

## Approval and current result

CALL-FIX-00 through 04 have implementation changes in the working tree; CALL-FIX-05 automated/native/emulator verification is complete; physical phone acceptance remains pending. See the phase reports for current test outcomes and device limitations. The owner authorized the complete sequence in the follow-up quoted at the top; no additional phase approval is pending.
