# Phase08 input-loss follow-up — 47-case driver inventory

**Scope:** read-only command/source inventory, not fresh emulator execution. Root owns every device call. V05 remains owner-deferred; all physical acceptance remains NOT RUN. Existing scoped case outcomes are preserved in earlier evidence, not inherited as current runs here.

Graph navigation used exact vocabulary `[emulator, suite]`, a bounded query and focused public Suite explanation before inspecting the located source and parent-named ignored controllers. The public suite opens read-only snapshots for independent SQL assertions; owned changes occur through production reviewed UI/native actions.

## Shared preconditions and safety

`S` below denotes `python scripts/phase08-emulator-suite.py --serial emulator-5554 --run-id <fresh-safe-id>`. Use a fresh captured baseline/owned registry and unique printable `QA08 ` fixture title `T` (and distinct `T2`). Compose through the public reviewed UI, wait for the required actual PENDING/RINGING condition, then run the stated operation. Every fixture must be cleaned through exact reviewed Chat soft-removal in a root `finally` path. This retains saved text/history/receipts; it is not erasure. Restore full preferences, delivery/full-screen flags, permissions/AppOps, radios/time/display/power/audio/TTS and verify no active owned work/recording remains.

`MIC_OPTS` is the previous unchanged control condition `--injection-delay-ms 500 --transport-padding-ms 1000 --transport-gain-permille 500`; it is a starting comparison condition, not a proven input-loss fix. Root may replace the test transport only after a targeted fix and must record its current cohort. Before/after host-input OFF and actual visible Recording are mandatory. Direct PCM output and successful gRPC delivery are not substitutes for app capture/exact transcript/copy/review/Confirm.

Private controllers import `.local/phase08-expanded-root.py`, whose `RUN`/`ARGS` are fixed to historical `ex20261028`. They cannot receive a new run ID through their own CLI. Adapt the root-controlled dispatcher/module globals or use the public Suite with fresh unique names; do not assume that changing an output filename creates a new ownership registry. Timestamped per-case controllers otherwise save fresh evidence and `finally` cleanup/restoration.

Do not blindly run the old `basic b1/b2/b3`, `.local/phase08-expanded-more.py` function entrypoints, `.local/phase08-resume-batches.py` or `.local/phase08-final-tts-root.py`: fixed historical titles/output paths can collide or overwrite/append old evidence. `basic()` lacks a `finally`; `expanded-more.log()` appends to historical `phase-08-expanded-extra-cases.json`; `large_font()` restores hardcoded1.0. Carry the reviewed procedure into a fresh root wrapper with finally cleanup/exact baseline restoration and new evidence paths.

## Per-case existing procedures

| Case | Existing command/procedure shape | Required scope / observations |
|---|---|---|
| A01 | `S notification --title T --mode open-manual-ack` | Actual System UI body open, Answer, reviewed manual ACK; paired SQL/TODO. |
| A02 | `S notification --title T --mode open-typed-ack` | Actual System UI body open, typed ACK/review/Confirm; paired SQL/TODO. |
| A03 | `python .local/phase08-remaining-microphone-root.py A03 MIC_OPTS` | Actual visible recording plus pinned ACK; explicit copy/review/Confirm; injection alone is insufficient. |
| A04 | `S response --title T --mode snooze` | Private reminder Activity entry, reviewed manual snooze; not notification-tap proof. |
| A05 | `S lifecycle --title T --mode typed-snooze --minutes 10` | Private reminder Activity; actual typed ten-minute review/Confirm; independent SQL. |
| A06 | `python .local/phase08-remaining-microphone-root.py A06 MIC_OPTS` | Actual visible recording plus pinned ten-minute snooze; exact response and replacement time. |
| A07 | `python .local/phase08-platform-root.py A07` | HOME/background; actual owned notification typed ACK; timestamped finally cleanup. |
| A08 | `python .local/phase08-remaining-power-root.py --case A08 --suffix NEW` | Supported unsecured-keyguard/noninteractive preconditions; actual notification ACK. Not secure-lock/full-screen proof. |
| A09 | `python .local/phase08-platform-root.py A09` | Observed noninteractive sleep state; wake and actual notification ACK. |
| A10 | `python .local/phase08-remaining-power-root.py --case A10 --suffix NEW` | Forced deep-idle observation and explicit wake/Main recovery; not natural Doze or punctuality. |
| A11 | `python .local/phase08-remaining-power-root.py --case A11 --suffix NEW` | Observed battery-saver mode; actual notification ACK; exact original power comparison. |
| A12 | `python .local/phase08-platform-root.py A12` | Owned background PID loss via am kill; not force-stop; actual notification ACK. |
| A13 | `S lifecycle --title T --mode remove-main-task; wait due; S notification --title T --mode open-typed-ack` | Execute while T is PENDING: exact owned MainActivity AppTask.finishAndRemoveTask, not Recents swipe. |
| A14 | `python .local/phase08-platform-root.py A14` | Actual force-stop before due, no notification while stopped, explicit Main reopen/reconcile/ACK; finally reopen and cleanup. |
| A15 | `python .local/phase08-platform-root.py A15` | Guest adb reboot before due on saved emulator; observed changed boot ID/completion and eventual notification/ACK. Preserve user data. |
| A16 | `python .local/phase08-platform-root.py A16` | Safe owned background process kill, explicit relaunch, one pending registration then notification/ACK. |
| A17 | `python .local/phase08-clock-root.py A17` | Actual guest wall-clock +120s crosses due within grace; notification ACK; original host offset/auto-time restored. |
| A18 | `python .local/phase08-clock-root.py A18` | Actual -120s during live review; external gate and stale Confirm; MISSED/TODO; clock and auto-time restored. Not a before-due-only check. |
| A19 | `python .local/phase08-platform-root.py A19` | Actual timezone GMT to Asia/Manila, preserved UTC runAt; original timezone/auto-timezone restored. |
| A20 | `python .local/phase08-permissions-root.py --case A20 --suffix NEW` | POST permission denied through due and reviewed cleanup; honest UNAVAILABLE state/no notification; exact grant flags restored. |
| A21 | `python .local/phase08-permissions-root.py --case A21 --suffix NEW` | Exact-alarm AppOp denied; real INEXACT registration then Main recovery/ACK; no punctuality claim. |
| A22 | `python .local/phase08-permissions-root.py --case A22 --suffix NEW` | Full-screen AppOp denied while preference enabled; actual notification fallback ACK; exact AppOp/preferences restored. |
| A23 | `python .local/phase08-remaining-microphone-root.py A23` | Actual denied permission/manual draft; no PCM injection or automatic recording; restore original grant flags/AppOps. |
| A24 | `python .local/phase08-remaining-microphone-root.py A24` | Release before permission response; grant does not restart recording; draft/manual path survives; exact permission restoration. |
| A25 | `python .local/phase08-remaining-failure-root.py A25` | Disable only observed enabled TTS services after recording original setting/inventory; require zero services/unavailable UI; restore exact original state. |
| A26 | `python .local/phase08-remaining-failure-root.py A26` | Real pre-hold MODE_IN_COMMUNICATION blocks capture; preserved draft/manual reviews; not absent Whisper/model/vendor-engine proof. |
| A27 | `python .local/phase08-remaining-failure-root.py A27` | Must observe actual Recording before mode interruption; visible cancellation, no late transcript, preserved draft/manual reviews; exact audio-mode restoration. |
| A28 | `S lifecycle --title T --mode review-pause` | Private initial entry, pause/resume and stale review rejection, then actual owned System UI notification reopen; unsent draft preserved. |
| A29 | `S lifecycle --title T --mode expired-review` | Actual original deadline expiry and old Confirm attempt; independent paired MISSED/task TODO. |
| A30 | `S lifecycle --title T --mode double-confirm` | Same actual review Confirm node attempted twice; one durable ACK/TODO. |
| A31 | `S lifecycle --title T --mode replace --second-title T2` | Two fresh independently owned overlapping RINGING fixtures; replacement rejects old review. Not exact same-instant collision. |
| A32 | `S lifecycle --title T --mode review-delete-source` | Exact owned source soft-removed through reviewed Chat; old Confirm rejected; no raw SQL write or permanent erasure. |
| A33 | `Adapt .local/phase08-expanded-more.py snooze_replay() with fresh title/output` | Typed one-minute snooze; wait replacement due, retain old generation identity for stale-open check, then actual current notification ACK. |
| A34 | `Adapt .local/phase08-expanded-more.py large_font() with exact fresh baseline restore` | font_scale2.0 and actual manual-control reachability/scrolling. Not TalkBack or soft-keyboard certification. Old helper restores hardcoded1.0. |
| A35 | `S notification --title T --mode ack --duplicate` | Actual System UI ACK action plus duplicate old node; native completion barrier/paired SQL. |
| A36 | `S notification --title T --mode snooze --duplicate` | Actual System UI snooze action plus duplicate old node; one replacement/paired SQL. |
| V01 | `python .local/phase08-remaining-microphone-root.py V01 MIC_OPTS` | Pinned synthetic ACK; actual visible hold/capture/copy/review/Confirm. Keep every failed capture. |
| V02 | `python .local/phase08-remaining-microphone-root.py V02 MIC_OPTS` | Pinned synthetic ten-minute snooze; exact replacement time and paired state. |
| V03 | `python .local/phase08-remaining-microphone-root.py V03 --repeat 2 MIC_OPTS` | Two independent fresh ACK fixtures/trials; one failed trial is not hidden by a retry. |
| V04 | `python .local/phase08-remaining-microphone-root.py V04 --repeat 2 MIC_OPTS` | Two independent fresh ten-minute snooze fixtures/trials; exact duration/SQL. |
| V06 | `python .local/phase08-remaining-microphone-root.py V06 --noise-response snooze MIC_OPTS` | Checksum-pinned deterministic20dB noise sample; not real-room/accent/noisy-phone speech. |
| V07 | `S lifecycle --title T --mode refusal --refusal "okay but remind me later"` | Typed actual native refusal and unchanged SQL; no ASR-quality claim. |
| V08 | `Two fresh T: S lifecycle --title T --mode refusal --refusal "delete this task"; and "mark this task complete"` | Existing exact typed refusal equivalents only. Matrix label says Delete all tasks, but bulk phrase is not in current public/direct-driver whitelist. |
| V09 | `python .local/phase08-remaining-microphone-root.py V09` | One-second visible silent hold/short release, host input OFF, no injection; no durable action. |
| V10 | `python .local/phase08-remaining-microphone-root.py V10` | Actual visible recording cancelled while pointer held; no late result/manual draft preserved. |
| V11 | `python .local/phase08-remaining-microphone-root.py V11 MIC_OPTS` | Pinned synthetic today sample, deliberate copy/edit then unsupported response refusal; independent unchanged SQL. |
| V12 | `python .local/phase08-remaining-microphone-root.py V12` | HOME during actual visible Recording cancels/releases and preserves manual path. Not acoustic TTS/echo/audibility proof. |

V05 has no command: suitable reviewed public/consented local-accent audio is unavailable and the owner explicitly said to keep it pending. Generic synthetic voices must not fill that row.

## Additional probes / automated gates

The [native test inventory](phase-08-input-loss-native-test-inventory.md) gives the exact ordinary53-method class list and11 opt-in methods. Separate each opt-in class/fixture/mode; never supply one shared `qa08_mode` to a package-wide run.

The TTS probe class `com.lafina.capstone.voice.Phase08VoiceProbeTest` supports `runPhase08VoiceProbe=true`, `voiceProbeMode=inventory|speak|stop|cancel_init`, plus explicit engine/voice choices. The old private final-TTS helper shows six prior modes (inventory, default speak, saved voice speak, stop, cancel_init, missing engine) but its output paths already exist. Use fresh logs/output. Actual callbacks are not audibility/intelligibility.

Fresh host gates executed here: [preflight log](phase-08-input-loss-preflight.log), [frozen regression log](phase-08-input-loss-frozen-command-regression.log), [host summary](phase-08-input-loss-host-checks.json), [64-case regression JSON](../../benchmarks/phase-08-input-loss-command-regression.json). Preflight passed typecheck/lint/format,528Jest tests/35suites and architecture61modules. Frozen regression passed64/64 exact,88/88 selected slots,6,400 repeated calls; zero exceptions/nondeterminism/unsafe ready proposals on32refusals. It executes no commands/DB/audio/model/network.

Inspected but NOT EXECUTED here: optional pure-host storage benchmark commands below. Planner/query harnesses use a fresh `node:sqlite :memory:` DB. Notes uses only a newly created `.local/notes-benchmark-*` directory, closes/deletes exact created synthetic SQLite/journal files and checks that directory before nonrecursive removal. They refuse existing output paths; use fresh names. They are host measurements, not phone durability/performance or required evidence of the audio fix.

```powershell
node scripts/benchmark-planner.cjs --output docs/benchmarks/phase-08-input-loss-planner-host.json
node scripts/benchmark-planner-queries.cjs --cohort student --output docs/benchmarks/phase-08-input-loss-queries-student-host.json
node scripts/benchmark-planner-queries.cjs --cohort stress --output docs/benchmarks/phase-08-input-loss-queries-stress-host.json
node scripts/benchmark-notes.cjs --output docs/benchmarks/phase-08-input-loss-notes-host.json
```

`doctor`, Android model preparation/corpus generation, APK inspection and incoming native/data audit scripts were not invoked by this host agent. Some can call SDK tools, manipulate model/corpus outputs or inspect unrelated incoming artifacts; root must choose the applicable read-only/build/evidence workflow, rather than treating every script as an additional unit test.

## Limits

All47 rows above are procedure inventory, not newly passed assertions. Preserve narrower equivalents for A13/A18/A26/A31/A34/V06/V08/V12. No secure-phone lock, natural Doze, exact simultaneous collision, human TalkBack, real echo/call, live accent/noise, physical ARM64/low-memory, audible TTS, battery/performance or signed offline acceptance follows from these scripts. Root must record actual attempted/pass/fail/skip outcomes and every failed attempt after its targeted fix.
