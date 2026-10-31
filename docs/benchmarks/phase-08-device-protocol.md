# Phase 08 — reproducible physical-device measurements

**Protocol only. Physical measurements: NOT RUN.** It defines new evidence;
do not relabel historical hardening/emulator measurements as this cohort. Follow
the [manual acceptance matrix](../../qa/PHASE-08-MANUAL.md) alongside timing.

## Cohort and safe baseline

Record date/time/timezone, exact source commit plus local diff, APK SHA256,
variant/ABI/version, model/API/RAM tier, display/font/theme, locale/timezone,
offline TTS voice/engine and STT engine/model hashes. Record power state,
temperature, free storage, battery/idle policy, permissions, radio state,
background load and whether the run is cold/warm. Use general device identifiers
only in shared artifacts; no phone serials, private transcripts or recordings.

Use the reviewed pre-Phase08 capstone candidate at `98bef88` as an old/new
baseline when it was measured on the same phone before a compatible upgrade.
The remote replacement app at `9c183a2` is not that baseline. Do not reset data,
uninstall or downgrade to manufacture a baseline. If the phone already has the
new candidate and no matched old measurement exists, record baseline NOT RUN
and provide absolute new results only. Legacy comparison at
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e` requires a separately reviewed,
matched procedure; the legacy checkout remains read-only.

Use the same synthetic reminder titles and supported response utterances,
voice/engine/model versions and test conditions for both cohorts. No automatic
model or voice download is part of measurement. TTS must select an installed
offline voice; Wi-Fi and mobile data explicitly OFF in airplane mode. Record
engine unavailability, refusal and fallback as results. Do not enable host mic
or record anyone without deliberate consent.

## Events and clocks

Use one monotonic clock for each duration. An external stopwatch or consented
screen/audio capture with a defined timestamp resolution can measure visible/
audible events; record its uncertainty. Never subtract unrelated host/phone
clocks. Wall-clock timestamps are for scheduled/actual alarm drift only; keep
clock-change cases in a separate cohort. Capture only synthetic content. A
programmatic test event is not proof of audible speech or live microphone input.

| Metric | Start | End / result |
|---|---|---|
| TTS startup | Visible Read/Answer request that requests TTS | First audible sample of the correct reminder |
| TTS completion | Same request | Last audible sample; separate stopped/interrupted runs |
| STT preparation | Explicit new hold | Visible recording/actual mic start |
| STT transcription | Release ends capture | Final visible editable transcript |
| Full interaction | User opens due reminder/Answer (record which) | Confirmed durable action and close; verify planner state/reopen separately |
| Confirm-to-close | Explicit Confirm | Saved/reconciled response screen closes; report reconciliation failure separately |
| Alarm drift | Stored scheduled due instant | First observed OS notification/eligible reminder UI; report lateness and earliness |
| Cold startup | Launch request after an ordinary stopped process | First usable Chat/Calendar screen; state whether `am start -W` timing is also recorded |
| Warm startup | Bring background app forward | First usable interactive screen |

Speech/manual interaction includes human think time; do not call it model
inference latency. Record Answer-to-voice and recognition-to-review separately
if isolating a component. ACK semantics are independent of task completion.
Record negative drift, missed alarms, expired reviews, duplicate attempts and
unavailable voices rather than deleting them from the dataset.

## Sampling and summary rules

1. Per reference device, collect at least 10 live interactions per test voice
   using V01–V12 and at least 30 alarms using A01–A36. For latency comparisons,
   use repeated identical successful utterances/actions in an additional cohort
   so heterogeneous refusal cases are not silently mixed with simple ACKs.
2. Label first initialization separately from warm repetitions. Use at least 10
   cold and 10 warm launches if claiming startup percentiles. Do not force-stop
   immediately before alarm-delivery timing; force-stop restrictions are a
   separate case. Never clear app data to simulate a cold run.
3. Keep one raw row per attempt including failures/timeouts and reason. For each
   metric, report attempted n, successful n, failures, p50, p95, maximum and timing
   resolution. Compute nearest-rank p50/p95 from sorted successful durations:
   one-based ranks `ceil(0.50*n)` and `ceil(0.95*n)`. Failures remain a separate
   denominator and cannot disappear from a speed claim. Small-n p95 is a coarse
   observation, not a stable population estimate.
4. Report outcomes by device/engine/voice/cold-or-warm and condition. No pooled
   performance claim across different phones. Repeat matched old/new runs under
   comparable load, power and temperature; no numeric speedup without both raw
   cohorts. Missing baseline or physical results remain NOT RUN.

## RAM, startup and battery

Peak memory: sample app PSS with `adb shell dumpsys meminfo com.lafina.capstone`
at a documented cadence (for example one second) across idle, TTS, hold,
transcription, review, Confirm and post-close. Record raw totals/units, cadence,
sample count and device/app state. Report maximum observed PSS, not an exact
allocation peak; sampling and ADB add overhead. Check microphone/model release
after cancel, close, background, timeout and new reminder. JVM/host heap or APK
size is not phone PSS.

For startup, record both cold/warm UI readiness and any available Android
activity launch duration. A launch command completing does not establish that
the planner is usable; inspect the visible state. Preserve existing data and
use ordinary process lifecycle, not storage resets. Do not treat emulator
startup as ARM64 low-memory acceptance.

For battery, compare matched idle and active windows on the same phone with
fixed brightness, radios, volume, charger state and workload. Prefer repeatable
60-minute or longer windows and record actual duration; repeat when feasible.
Do not discharge a phone artificially or publish private system dumps. Record
start/end level and available OS charge/energy readings with units and device
support. Percentage-only readings are coarse; report insufficient resolution
instead of precise energy/power claims. State temperature/thermal changes,
charging, screen-on duration and number of reminder/speech interactions. Leave
battery NOT RUN if a controlled window cannot be completed. Restore any test
idle/battery overrides afterward.

## Raw result format and release decision

Write a fresh privacy-safe JSON/CSV file under a new run name, for example
`docs/benchmarks/phase-08-<run-id>-device-results.json`; never overwrite an older
baseline. This example contains no measurements and must not be presented as a
completed run:

```json
{
  "status": "NOT RUN",
  "runId": null,
  "candidate": {"commit": null, "apkSha256": null, "variant": null},
  "baseline": {"status": "NOT RUN", "runId": null},
  "device": {"model": null, "api": null, "abi": null, "ramTierGb": null},
  "speech": {"ttsVoice": null, "ttsEngine": null, "sttEngine": null, "modelHash": null},
  "conditions": {"airplaneMode": null, "wifiOff": null, "mobileDataOff": null},
  "timing": {"clock": null, "resolutionMs": null, "percentileMethod": "nearest-rank"},
  "attempts": [],
  "summary": {},
  "peakObservedPssKb": null,
  "battery": {"status": "NOT RUN", "durationMinutes": null, "unit": null},
  "humanReviewer": null,
  "humanReviewDate": null
}
```

Each attempt needs case ID, synthetic fixture ID, condition, success/failure,
requested action, final reminder/job/task state, relevant raw timestamps or
duration and failure reason. Exclude recorded audio/private text. Summaries
must be reproducible from the raw attempts; manually signed acceptance remains
separate from machine timings. Link the files and unresolved defects in the
Phase 08 report. No physical measurements, claimed performance improvement or
human release approval are supplied by this protocol.
