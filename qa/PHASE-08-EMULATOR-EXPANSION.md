# Phase 08 — expanded emulator execution matrix

This is a new execution plan, not a result or release certificate. The owner
authorized further Phase 08 development and emulator testing. The machine-readable
[matrix](../docs/reports/evidence/phase-08-emulator-expansion-matrix.json) starts
with every case **NOT_RUN**. Fill it only from this expansion's actual attempts;
earlier Phase 08 passes remain historical references. The
[physical acceptance matrix](PHASE-08-MANUAL.md) remains unsigned and separate.

## Run order and evidence

1. Verify the existing checkout, source/APK hashes and connected emulator. Record
   the actual model/API/ABI/page size, build, locale and test entry path. Preserve
   newer work and the installed app. Do not uninstall, clear storage, replace a
   database, downgrade or use a fresh remote clone as the baseline.
2. Capture a fresh private baseline before changing settings: schema and original
   rows; complete preference payload/hash; native delivery/full-screen flags;
   granted permissions **and flags**; AppOps modes; radios; automatic time/timezone;
   clock offset; font/display; volume; idle/standby/battery overrides; TTS/STT
   configuration. Confirm no unrelated PENDING/RINGING jobs. Keep private snapshots
   and raw system dumps ignored/local; publish only redacted comparisons.
3. Configure only the planned test preferences through correctly identified
   controls. Compare every saved preference key immediately; reject accidental
   nickname/timezone/other edits before creating an alarm. Use uniquely named
   `QA08` fixtures and exact reviewed cleanup. Keyboard input, a field label and
   the editable field are distinct targets. Prefer active-window accessibility
   actions and whole-field replacement for test drivers.
4. Execute the table below in bounded batches: basic actions; lifecycle; permission
   loss; competing/stale work; speech; accessibility. Create one fresh actual alarm
   per alarm case. Do not reuse an expired review or count several assertions on
   one alarm as several delivered alarms. Record failures/timeouts, not only passes.
5. Verify both layers after every action: visible result and independent real
   SQLite reminder/job/task state. ACK must leave the task TODO; snooze must create
   one replacement generation; refused/cancelled/stale proposals must not mutate
   the target. Record OS scheduling/notification evidence and delivery constraints.
6. Restore in a `finally`/recovery path, verify the restoration checklist below,
   and save a new report/evidence cohort. Do not overwrite any earlier baseline.

Synthetic response follow-up: enable virtual-device audio support (do not use
`-no-audio`) while leaving host microphone input disabled; never pass
`-allow-host-audio`. After the actual visible hold reports Recording, inject only
the checksum-pinned synthetic WAV with SDK server pacing, one-second zero
pre/post-roll and explicit test-only gain 500/1000. The latter compensates for
the measured virtual input gain near two; it is not a production capture gain.
Check host-input false before/after, actual capture/reference, exact review and
independent SQLite state. Stream delivery alone is insufficient. Preserve failed
attempts; no automatic mic or pre-arm protocol is permitted. See
[remaining-case report](../docs/reports/phase-08-remaining-emulator-report.md).

The saved `Medium_Phone` startup used `-port 5554 -no-window
-no-snapshot-load -no-snapshot-save -grpc 8554 -grpc-use-token`; the SDK creates
its own authentication/discovery files. Preserve saved userdata and verify the
actual host-input state after boot before any speech case. Missing discovery or
an unavailable state blocks testing; it does not prove the microphone is enabled.
The [transport finding](../docs/reports/evidence/phase-08-remaining-audio-transport-finding.md)
records intermittent injection loss and the limits of a successful stream.
Do not invent a timer, enable host recording or relax exact transcript gates to
turn a failed capture into a pass. V06 uses documented synthetic 20dB noise;
V05 stays owner-deferred until suitable reviewed accent audio is available.

Every attempt needs case ID, synthetic fixture ID, UTC/monotonic timestamps,
condition, actual entry method, expected/observed UI, final paired state, task
completion state, outcome and evidence paths. PASS means that case's stated
emulator assertion passed. A missing capability stays NOT_RUN with its exact
reason; a supported attempted assertion that fails is FAIL. Physical acceptance
stays HUMAN_REQUIRED regardless of the emulator outcome.

## Alarm cases

| ID | Emulator execution and assertion | Boundary still requiring phone/human evidence |
|---|---|---|
| A01 | Due alert → manual ACK review/Confirm; verify one ACK, TODO and close | Physical interaction/accessibility |
| A02 | Answer → typed ACK → review/Confirm; compare state before/after confirmation | Physical end-to-end acceptance |
| A03 | Only after proven synthetic input: visible hold/release → transcript copy/review → ACK | Real mic, speech accuracy, audibility |
| A04 | Manual snooze review/Confirm; verify one future job/generation and TODO | Physical repeated delivery |
| A05 | Typed ten-minute snooze; verify exact duration, paired state and no duplicate | Phone timing and delivery |
| A06 | Synthetic-input supported snooze through the visible recording flow | Real spoken interaction and acoustics |
| A07 | Background/unlocked before due; observe actual OS notification and open it | OEM behavior and physical notification presentation |
| A08 | Lock before due; inspect permitted notification/eligible full-screen UI | Secure-lock/OEM/API phone matrix |
| A09 | Screen off before due; record wake/presentation and drift | Hardware wake behavior |
| A10 | Force and confirm Doze; wait for due; record policy-constrained delivery/recovery | Natural Doze and OEM power management |
| A11 | Enable/confirm battery saver; verify warning/fallback and actual due result | Battery consumption and OEM policy |
| A12 | Background then kill only safe-to-kill capstone processes; verify PID loss and durable recovery | Genuine low-memory/OEM process eviction |
| A13 | Remove app task from recents; observe the due result and surviving record | OEM recents semantics |
| A14 | Force-stop before due; observe absence/limits, reopen and verify reconciliation | No immediate delivery guarantee while force-stopped |
| A15 | Reboot existing AVD without wiping; unlock as required and inspect restored alarm | Phone/OEM boot and locked-boot behavior |
| A16 | Restart with an outstanding alarm; inspect original identity and one registration | Phone process/startup behavior |
| A17 | In a separate clock cohort, move emulator wall time forward across due; inspect late policy | Physical automatic-time/OS behavior |
| A18 | Move emulator wall time backward; verify old review/window cannot extend or cross-target | Physical time service and reboot combinations |
| A19 | Change emulator timezone; verify the stored UTC instant and displayed semantics | Phone timezone/provider behavior |
| A20 | Record then revoke notification grant; verify capability warning and planner fallback | API/OEM permission UX |
| A21 | Deny exact-alarm special access through supported OS controls; observe inexact/unavailable result | API31+ phone access/precision behavior |
| A22 | Deny full-screen access; inspect the actual notification fallback | A direct private Activity intent cannot pass this case |
| A23 | Deny mic; deliberately request input and verify typed/manual reviewed actions | Physical permission UX and capture behavior |
| A24 | Request mic, release before grant, then grant; no recording until a fresh visible hold | Permission-dialog/lifecycle behavior on phones |
| A25 | Reversibly remove availability or select a known missing explicit TTS engine; verify honest text/manual fallback | A missing-engine selection is narrower than unavailable voice data; real audibility pending |
| A26 | Select a genuinely unavailable offline STT path; verify recoverable failure and manual controls | Vendor recognizer availability and real capture |
| A27 | Simulate audio-focus/audio-mode interruption; check release and late-result fencing | Real cellular call, Bluetooth/headset and OEM routes |
| A28 | Background/resume during recognition or a pending review; old work must retire | Real microphone interruption/lifecycle |
| A29 | Hold an unconfirmed review beyond the original deadline, then attempt confirmation | Phone timing under load |
| A30 | Rapid duplicate Confirm/current notification action; inspect one transition/receipt/job | Human rapid-input combinations |
| A31 | Two distinct alarms due together; replace/open targets and verify identity/title/state | OEM concurrent presentation behavior |
| A32 | Edit/delete exactly the reviewed synthetic source before Confirm; reject the stale snapshot | Phone multi-screen interaction |
| A33 | Snooze, wait for replacement due, then replay the old identity; one current alert only | Long-running phone timing/power |
| A34 | Test large font, soft keyboard and accessibility actions with every required control reachable | Accessibility actions are not a complete TalkBack/user certification |
| A35 | Press the actual notification ACK action twice; one ACK and task TODO | Direct receiver/test-intent calls are separate, narrower evidence |
| A36 | Press actual notification snooze, then attempt the old notification; one replacement job | Physical System UI/notification behavior |

An accepted `notify()`/saved `notified_at` is not proof that the alert was seen.
An explicit test-UID private Activity launch can test app UI/state, but cannot
certify notification tapping, full-screen eligibility, lock-screen presentation
or the notification action cases. Label each entry path in the result.

## Voice cases

| ID | Available emulator equivalent | What it does not establish |
|---|---|---|
| V01 | Synthetic `acknowledge` through a proven virtual-mic path, then explicit review | Live human microphone/voice quality |
| V02 | Synthetic supported ten-minute snooze through the same path | Physical recognition and acoustics |
| V03 | Repeat identical supported synthetic ACK attempts; retain failures | Real speaker/voice variation |
| V04 | Repeat identical synthetic snooze attempts and inspect one future job each | Phone repeated-delivery reliability |
| V05 | Public/consented accent corpus only if actually available | A generic synthesizer voice is not a local-accent evaluation |
| V06 | Public synthetic PCM plus documented noise, if actually run | Real room/device microphone noise response |
| V07 | Typed and, if available, synthetic ambiguous phrase; refuse safely | Typed refusal is not ASR accuracy |
| V08 | Typed and, if available, synthetic destructive phrase; no action | No live false-action rate follows |
| V09 | Deliberate visible hold with verified synthetic silence/short release; manual fallback | Host mic must stay off; no accidental recording |
| V10 | Cancel actual preparation/capture/decode; late results cannot review or act | Phone audio hardware and interruptions |
| V11 | Edit the draft after recognition and before confirmation; old proposal retires | Human review comprehension |
| V12 | Stop TTS, deliberate synthetic-input hold, then cancel review; release resources | Real audibility, acoustic echo and phone audio routes |

Record speech evidence by its actual layer:

- **Typed text:** tests parser/review/state only.
- **Direct PCM decoding:** tests the real decoder/model for the exact public
  clips; bypasses microphone, visible hold, recorder and audio routing.
- **Synthetic virtual microphone:** counts only after SDK input injection and
  the actual app capture path are observed, with host input OFF. Keep injected
  clips/manifests/checksums; never infer this from direct decoding.
- **TTS engine callbacks:** installed offline voice selection and actual
  requested/start/done events can show engine execution. They do not establish
  audible/intelligible speech, particularly with emulator audio disabled.
- **Physical voice/acoustics/audibility:** HUMAN_REQUIRED. Do not fill phone
  voice/quality/latency cells with any of the rows above.

No host microphone is enabled for this run. If synthetic virtual input cannot be
proved safely, keep microphone-path cases NOT_RUN and execute their typed/manual
fallback subchecks separately. No voice/model download or cloud recognizer is a
test workaround. Keep cold/warm synthetic timings separate from speech/full-loop
measurements and from the physical [measurement protocol](../docs/benchmarks/phase-08-device-protocol.md).

## Bounded platform commands

The parent operator selects the fresh emulator serial explicitly in every call.
The examples below are procedures, not executed evidence. Verify command support
on the actual image and record preconditions/output; do not use a broad kill or
change the host clock.

```powershell
$phaseAdb='C:/Users/USER-PC/AppData/Local/Android/Sdk/platform-tools/adb.exe'
# Background the app before the process-death case; confirm its process really dies.
& $phaseAdb -s emulator-5554 shell am kill com.lafina.capstone
# Separate force-stop case; reopening/reconciliation is required afterward.
& $phaseAdb -s emulator-5554 shell am force-stop com.lafina.capstone
# Doze pair, only after capturing original idle/battery simulation state.
& $phaseAdb -s emulator-5554 shell dumpsys deviceidle force-idle
& $phaseAdb -s emulator-5554 shell dumpsys deviceidle unforce
# Reboot the existing AVD with its data intact; do not use wipe-data/clear/uninstall.
& $phaseAdb -s emulator-5554 reboot
```

`am kill` may leave a process that is not safe to kill; record that instead of
silently substituting force-stop. These operations have different semantics.
The Android [ADB reference](https://developer.android.com/tools/adb) documents
the activity-manager commands and `install -r` data-preserving upgrade option.

Confirm forced idle actually took effect, allow platform throttling to remain
visible, and observe recovery after exit. If this run introduced a battery
simulation override on a previously normal baseline, `dumpsys battery reset`
returns control to the normal source; preserve an already-existing override
instead of blindly resetting it. Android's
[Doze test procedure](https://developer.android.com/training/monitoring-device-state/doze-standby)
documents the force/unforce and reset sequence. This reference does not authorize
adding a cloud/push dependency to the offline app.

Permission tests must snapshot grant flags and AppOps modes, then restore those
exact values. Do not grant every permission or clear all flags to manufacture a
clean state. The official
[notification-permission test guidance](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
distinguishes grants and user-set/user-fixed flags; its fresh-install simulation
must not replace this run's preservation requirement. Exact-alarm and full-screen
special access must use controls actually supported by this image; inspect the
capability before/after and retain a NOT_RUN reason when a requested condition
cannot be established.

## Restoration and final handoff

The versioned runner is [phase08-emulator-suite.py](../scripts/phase08-emulator-suite.py).
Its global options precede the command: `--serial emulator-5554 --run-id SAFE_ID`
and optionally `--baseline .local/PRIVATE_BASELINE.json`. Run `--help` for the
bounded `baseline`, `configure`, `compose`, `state`, `wait`, `response`,
`lifecycle`, `notification`, `cleanup`, `restore-preferences` and `compare` commands. It changes
only requested app controls through opt-in instrumentation UI drivers; the parent
operator owns actual System UI actions and OS condition changes/restoration.

Use fresh `baseline` before creating work, then `configure --lead 0 --reply text
--quiet false --delivery true --full-screen false`. Create an exact title with
`compose --action create --title "QA08 EX SAFE_ID A01"`, observe due state using
`wait --title "QA08 EX SAFE_ID A01" --status RINGING`, and run the intended case.
The runner records the exact title as owned before attempting creation so a
partial UI failure remains recoverable. `cleanup --title ...` accepts only those
exact registered titles. It retains tombstones/history and refuses a title that
already existed before its attempted creation.

Every invocation creates new public redacted JSON/log files under
`docs/reports/evidence/phase-08-emulator-expansion/SAFE_ID/`; raw instrumentation,
preferences, system dumps and stable paired main/WAL database snapshots stay in
ignored `.local/phase08-emulator-suite/SAFE_ID/`. The runner's PASS covers its
specific UI/storage assertion. It does not populate this matrix. Only
`notification` uses the actual owned System UI notification; `response` and
`lifecycle` open the private Activity directly. `restore-preferences` uses saved
UI controls and rejects an
unsupported changed private field; `compare` checks original rows and exact
preferences. Both leave permission/radio/time/audio/power restoration to the
parent's captured baseline checks. Do not run two mutation commands concurrently.

- Remove only this run's exact reviewed fixtures; retain disclosed tombstones and
  receipts. Verify no new active jobs/registrations remain. Do not mutate original
  rows or replace a live database from a snapshot.
- Restore the **complete original preference payload**, native delivery/full-screen
  flags, grant flags/AppOps, radios, automatic time/timezone, date offset, font,
  display, volume and any battery/idle/standby overrides. Verify each changed
  setting against its captured baseline, not a guessed default.
- Compare original non-diagnostic rows and preference values/hash; report any
  expected bounded diagnostic-event rotation separately. Keep private nickname,
  schedule, text and audio out of public evidence. A hash alone does not repair a
  changed value; a mismatch requires correction or an explicit unresolved result.
- Verify no active recording/retained test engine, inspect the intended final
  foreground screen and record the installed APK hash. Preserve failed logs and
  restore status even if execution stops early.
- Publish the actual emulator matrix/report with PASS/FAIL/NOT_RUN and known
  platform conditions. Minimum/newer API coverage absent from the installed AVDs,
  physical ARM64/low-memory, real TalkBack/audibility/acoustics, OEM/Doze behavior,
  matched phone startup/PSS/battery and signed human review stay pending.

Do not certify the stable offline release or begin Phase 09+ from emulator passes.
