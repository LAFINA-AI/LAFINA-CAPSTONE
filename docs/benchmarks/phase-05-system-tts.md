# Phase 05 — system TTS emulator callback pilot

This is an exploratory **five-sample emulator cohort**, collected 2026-10-25 UTC.
It measures Android engine initialization and a native request-to-`onStart`
callback interval. It does **not** measure first audible speaker output,
intelligibility, physical-phone latency, peak memory or energy. No matched
legacy Kokoro runtime baseline is available; no speed ratio is claimed.

## Frozen initial cohort

Raw samples, device/engine metadata, network state and summaries are in
[phase-05-system-tts-emulator.json](phase-05-system-tts-emulator.json).
They belong to the **initial** 0.5.0-data-qa x86_64 APK:

`46e3e4acb863cf496429e286951f9000f941181a9fb1e6b537cca45a6119e0c5`

Source identity is the [initial source manifest](../reports/evidence/phase-05-source-hashes.json),
and artifact metadata is the [initial artifact manifest](../reports/evidence/phase-05-artifacts.json).
The tested emulator was `sdk_gphone16k_x86_64`, API37/x86_64. Airplane mode was 1,
Wi-Fi 0 and mobile data 0 for these trials. Requested engine selection was
`com.google.android.tts`, version
`googletts.google-speech-apk_20260511.02_p3.919856684`, code 210645709. Selected
voice was `en-US-language`, locale `en-US`, rate 1 and pitch 1. Requested package
selection is not independent proof of the bound service identity.

Every sample used the visible fixed preview:

> Reminder: your study session starts soon. Your task stays open until you mark it complete.

Each preview initializes a **new client**. The separate vendor service was not
forcibly stopped between trials, so repeated trials may benefit from a warm
service. Do not call these cold-engine measurements or same-client warm requests.
No voice/model assets were downloaded or bundled for this pilot.

| Trial | Initialization ms | Native request→`onStart` ms |
|---|---:|---:|
| 1 | 1234 | 342 |
| 2 | 1148 | 243 |
| 3 | 1094 | 254 |
| 4 | 1091 | 259 |
| 5 | 1187 | 247 |
| p50 | 1148 | 254 |
| Nearest-rank p95 | 1234 | 342 |

There were **zero recorded initialization/start failures** in these five trials.
The terminal observation was that the Stop button became disabled and the UI
returned idle; do not relabel that observation as recorded human hearing or a
sampled acoustic completion time. For n=5, nearest-rank p95 is the maximum sample
and is not a stable phone acceptance percentile.

`initializationMs` is the reported native initialization duration. The native
request interval begins after initialization, includes audio-focus acquisition
and the speak call, and ends at the engine's `onStart` callback. It excludes
full UI/bridge-to-init latency and does not identify first audible output.
Do not sum independently aggregated p50/p95 columns into an end-to-end percentile.

## Later navigation fix and evidence separation

The same emulator session exposed an off-screen inline unsaved-voice navigation
confirmation after Android Back. The guard now uses a visible React Native Modal;
an AppSpeech regression failed before the fix and passes in the later suite.
See [the pre-fix regression](../reports/evidence/phase-05-navigation-regression-before.log)
and [the Phase 05 report](../reports/phase-05-report.md).

The [handoff source manifest](../reports/evidence/phase-05-source-hashes-handoff.json)
and [handoff artifact manifest](../reports/evidence/phase-05-artifacts-handoff.json)
identify the rebuilt app. Relative to the initial speech cohort, only `App.tsx`
and its AppSpeech test changed; the native speech policy/bridge and SpeechSettings
preview path stayed unchanged. This is still a **different app cohort**. The five
raw trials remain attributed to the original hash; they are not presented as
fresh measurements of the rebuilt APK. Any final emulator retest belongs in its
own cohort/evidence, not an overwrite of these samples.

## Current-build ready-idle memory snapshot

[Raw snapshot](phase-05-memory-snapshot.json) records a separate current-build
dataQa observation at2026-10-25 06:59:42 UTC. Speech settings had completed voice
inventory, with no utterance playing, while offline. `dumpsys meminfo` reported
109,589 KiB PSS for the main app,43,308 KiB for the cached reminder process and
148,142 KiB for Google TTS. These are sequential process snapshots, not a summed
synchronized peak. They describe a debuggable API37 emulator, not a release phone
or proof of the low-end memory target. Helpers outside the observed process
names may be omitted. The vendor service owns its process lifecycle; shutting
down the client does not certify immediate reclamation of all vendor memory.

## Remaining measurements

Physical airplane-mode listening/quality, request-to-first-audible timing,
real incoming-call/audio-route interruption, low-RAM phones, app plus actual
engine peak PSS and controlled battery use remain **NOT RUN**. Follow the
[Phase 05 phone checklist](../../qa/PHASE-05-MANUAL.md) and
[shared baseline protocol](phase-00-baseline.md). A paired Kokoro comparison needs
a separately prepared, provenance-approved pinned baseline under matched
conditions. Static model payload size and callback timing do not establish a
Kokoro/system performance comparison or justify a synthesis cache.
