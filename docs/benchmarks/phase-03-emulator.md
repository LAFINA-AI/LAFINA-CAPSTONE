# Phase 03 emulator observations

Captured UTC: 2026-10-22T18:36:13.494230+00:00. These are small pilot observations, **not a controlled physical-phone benchmark**. No speedup, low-RAM support floor or reliability rate is established.

Device: API 37 `sdk_gphone16k_x86_64`, 16 KiB emulator, MemTotal 4,008,376 kB. Bundled-JS dataQa build; 15-second synthetic TODO tasks with lead 0; notification/exact access allowed for timing samples. Airplane mode on, Wi-Fi/mobile data off during tests. Original radio states restored afterward. Initial and reviewed APK hashes are separate below.

Native event lag = `atUtc - plannedAt`, in milliseconds. `NOTIFICATION_POSTED` records the return from the Android notification post call, not first visible pixels, human receipt or audible sound. `CLAIM_RING` is the paired storage claim time. UTC wall clock was not changed during sampling.

| APK / condition | n | Notification lag p50 ms | p95 ms | Max ms |
|---|---:|---:|---:|---:|
| initial awake notification observations | 4 | 140.0 | 2607.0 | 2607.0 |
| final non-reboot observations | 5 | 77.0 | 169.0 | 169.0 |
| final reboot catch-up observations | 2 | 151985.0 | 262511.0 | 262511.0 |

p50 is median; p95 uses nearest rank `ceil(0.95*n)`. These tiny mixed workloads are descriptive. Final non-reboot observations include one delivered task during the first overlap automation attempt; that attempt did not create its intended second task and is not a passed two-reminder test. Reboot catch-up includes boot and broadcast delay and is excluded from awake timing. The first reboot UI attempt was inconclusive; its notification timestamp is a valid stored observation, not proof of unattended UI receipt. Raw per-event/scenario data and APK identities are in [the JSON](phase-03-emulator.json).

The initial awake notification lags were 59, 120, 160, 2607 ms. Registration reuse was subsequently hardened to avoid resetting unchanged nearby AlarmManager alarms. The different small sample sets do not prove that this change caused a speed improvement.

One INITIAL QA memory snapshot showed main PSS 91,348 KiB and native `:reminders` PSS 42,531 KiB. This is **not peak PSS**, not a release-like phone measurement and not evidence of meeting the phone memory target. Android/native process overhead remains a low-end validation risk.

Actual scope/results: [final phase report](../reports/phase-03-report.md), [initial ledger](../reports/evidence/phase-03-emulator-initial.json), [final ledger](../reports/evidence/phase-03-emulator-final.json), [memory sample](../reports/evidence/phase-03-emulator-memory.json), [reviewed artifacts](../reports/evidence/phase-03-artifacts-reviewed.json), [source hashes](../reports/evidence/phase-03-source-hashes.json). Historical Phase 00/02 baselines remain unchanged.

Physical old/new baseline, Android 11/API 30 and ARM64 execution, true peak memory, repeated cold startup, battery, sound/vibration, OEM/Doze reliability and speech benchmarks are **NOT RUN**. No speech engine or Kokoro binary is bundled in Phase 03. Use the [frozen matched-device protocol](phase-00-baseline.md) and [Phase 03 manual checklist](../../qa/PHASE-03-MANUAL.md). Freeze the same consenting phone/builds and synthetic workload, repeat at least 30 timing trials where feasible, report all failures, and keep reboot/permission conditions separate.

Read-only measurement commands, once that phone/build is available (replace TEST_DEVICE locally):

```powershell
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone:reminders
adb -s TEST_DEVICE shell dumpsys battery
adb -s TEST_DEVICE shell dumpsys batterystats com.lafina.capstone
adb -s TEST_DEVICE shell am force-stop com.lafina.capstone
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

A single `am start -W` reports Android Activity launch timing, not first usable UI. A single meminfo/battery snapshot cannot establish peak memory or energy use. Follow the protocol for repeated, comparable release-like trials; public reports must omit private serials/schedules/notifications.
