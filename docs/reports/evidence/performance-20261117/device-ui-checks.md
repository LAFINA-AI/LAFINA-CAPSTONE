# Physical-device observations — 2026-11-17

Device: Infinix X6880, API 35, physical display 1080×2436. Test package: `com.lafina.capstone.performance`. Synthetic local data only. The main installed `com.lafina.capstone` app was not replaced.

## Verified by agent on the phone

- Final streamed navigation run: 60 rounds, 300/300 timing records, every sample warm. `device-final-60-streamed/tab-timings.json` contains the raw records; frame and memory snapshots accompany it.
- Month and Week: the crowded selected day exposes `Show next 20 items (345 more)`, consistent with 20 initial rows out of 365 items. UI hierarchy evidence: `device-month-ui.xml`, `device-week-ui.xml`.
- Day: the crowded 4 PM slot initially exposes `Show next 20 items (316 more)`. Later hour rows (5–8 PM) remain present. Evidence: `device-day-bottom-ui.xml`.
- Pressing that Day expansion control reduces the remaining count to 296. After Home → Schedule, the selected Day mode, expanded page and scroll position remain. Evidence: `device-day-expanded-return-ui.xml`, visually inspected `device-day-expanded-return.png`.
- No task/checklist/item edit, cloud-account login, real call, microphone or alarm delivery was exercised in these phone checks. Views and synthetic test preferences were changed.
- The test app was left on Home. Plugged-in stay-awake was restored to the recorded original value `0`, and read back as `0` after testing. Test-app notification permission remains declined.

## Measurement limitations

The first extended `device-final-60/` run ended with only 233 timing records available because early entries had rolled out of the phone's 256 KiB shared log buffer. That incomplete timing trace is not accepted. The script was corrected to stream logcat to disk. The final 60-round streamed run followed in the same app process, without clearing data or restarting the app, and captured all 300 samples. Its memory snapshots therefore also describe a process already exercised by the preceding long run.

JS commit and next-animation-callback timings do not measure native input dispatch, first-presented pixels or tap-to-usable latency. Final Android graphics counters still report frame deadline misses. These checks do not certify consistently smooth 60 Hz presentation or long-session leak freedom.

## Human acceptance still not run

- Real-user keyboard, long scrolling, note dragging, accessibility and editing flows.
- Authenticated sync activity, logout/account switching and a consenting live/minimized call under navigation load.
- Real native alarm/call delivery, offline STT/TTS and long-session memory qualification.
