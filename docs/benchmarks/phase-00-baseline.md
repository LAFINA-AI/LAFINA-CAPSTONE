# Phase 00 baseline and reproducible measurement protocol

**BASELINE NOT RUN.** No physical-device app runtime, startup, battery, speech,
alarm drift, APK size or memory measurement was collected. No new app exists.
The only measured/static values are the Git inventory and host tool probes linked
from the report. “Slow Kokoro” is user/planning anecdote, not a numeric baseline.
The [status JSON](phase-00-baseline-status.json) contains nulls for missing metrics;
it is a status manifest, not raw measurements.

## Prerequisites and safe baseline build

Use the pinned revision in a **separate disposable baseline workspace**. Never
build, install dependencies, generate files, or change branches in the read-only
legacy checkout. Exact preparation/typecheck/Jest/lint/Gradle commands and host
prerequisites are in [the toolchain assessment](../audits/phase-00-toolchain.md).
Keep baseline source outside capstone. No models may be fetched until their origin,
terms, revision and expected SHA-256 are reviewed. The current baseline has known
source defects; record unmodified failures rather than quietly fixing the control.
If a diagnostic fix is needed, record a separate derivative SHA and never label it
the unmodified pinned baseline. Never reuse legacy release credentials.

## Matched experiment

1. Prioritize a low-end ARM64 Android 11+ 2–3 GB test phone if available, the handoff's
   approximately 4 GB reference phone, and a newer Android 13/14+ phone; specific
   models are HUMAN REQUIRED. Owner requested low-end support as far as possible.
   These RAM tiers are validation targets, not minimum-support claims. Prefer a
   second manufacturer. Emulator evidence cannot certify OEM delivery, battery or
   sound. 32-bit/Android Go support remains unverified and needs its own ABI check.
2. Record OS/API, RAM tier, ABI, build SHA/hash, build type, engine package/version,
   selected locale/voice ID, model revision/quantization/checksum, permissions,
   battery restrictions, speaker/volume, thermal state, charging state and timezone.
   Keep unique serials/account identifiers out of committed evidence.
3. Compare old and new on the **same phone**, release-like configurations and
   frozen synthetic/public/consented utterances. Same airplane-mode state, input
   audio, room/noise, screen/idle workload and battery window. Alternate run order
   to reduce warmup/thermal/order bias. Record failures and excluded trials.
4. Separate cold process/engine initialization from warm execution. At least 30
   repetitions per timing condition where feasible. Report n, p50, p95, maximum,
   failures and peak memory. Use nearest-rank p95 consistently. Small-n pilots
   remain pilots; do not claim statistical significance or targets achieved.
5. Test Android TTS against old Kokoro only once the new bridge exists (Phase 05).
   Record request, ready, utterance callback and **first audible audio** timestamps;
   callback start is not proof of sound. Evaluate intelligibility via consenting
   human review with the same phrases. No silent network voice fallback.
6. Evaluate on-device Android STT and reviewed Whisper fallback in Phase 06.
   Record press/release, speech end, transcript readiness, cold load and WER:
   `(substitutions + deletions + insertions) / reference words`. Freeze normalization
   policy before comparison; assess accents/noise and command correctness separately.
7. End-to-end command time ends at durable commit plus visible confirmation, not
   generated text. Separate STT, parsing, DB and voice latency. Parser false ACK,
   delete and wrong-time rates are safety outcomes, not just average accuracy.
8. Alarms: record requested UTC, receiver time, visible notification time, UI mode,
   occurrence/version, outcome and capability state. At least 30 delivery trials in
   the Phase 08 supported matrix. Report drift distribution and denominator;
   permission-denied and force-stopped cases are separate cohorts, not exclusions
   used to inflate delivery success. Never equate ACK with task completion.
9. Battery: fixed idle/active workload and duration, same screen/radio/charging
   conditions; capture batterystats before/after and report units/limitations.
   A snapshot or CPU time alone does not measure energy. Include TTS service memory
   separately from app PSS to avoid hiding work moved into a system process.

## Commands once an authorized test build and phone are available

Run from the disposable baseline root (later repeat with capstone). Select only
one consenting test device. If multiple devices are attached, use local `adb -s`
selection and redact its serial before saving public evidence. First verify
`adb get-state` is `device`. Phase 00 outside-sandbox enumeration passed with an
empty device list after initial restricted daemon failures; no phone is attached.

```powershell
# General metadata only; no serial/account dump.
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.cpu.abi
adb shell dumpsys meminfo com.lafina
adb shell dumpsys battery
adb shell dumpsys batterystats com.lafina
Get-FileHash -Algorithm SHA256 -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk'
(Get-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk').Length

# Confirm launcher first; substitute resolved activity in am start command.
adb shell cmd package resolve-activity --brief com.lafina
adb shell am force-stop com.lafina
adb shell am start -W -n com.lafina/.MainActivity
```

`am start -W` measures launch timing, not interactive readiness; later use
Macrobenchmark/trace instrumentation and a defined usable-screen milestone.
Force-stop only the dedicated test build for startup trials; reopen it before
alarm delivery trials. OS force-stop alarm limitations must be reported.
Memory needs repeated sampling/traces during the full pipeline to obtain a peak;
one `meminfo` snapshot is not peak PSS. Keep other processes/engine package memory
in a separately labeled series. Do not run `batterystats --reset` on a personal
phone without agreeing to discard its existing battery history.

For privacy-safe runtime diagnostics, capture only reviewed event/timing tags
after confirming they do not contain titles/transcripts. Proposed future capstone
command (tag is not implemented yet):

```powershell
adb logcat -v epoch -s LafinaPerf:I '*:S'
```

The pinned legacy has a `profile:call` script; its measurement semantics must be
reviewed before use. None of the commands above were executed as app benchmarks
in Phase 00. Later instrumentation/harness code belongs to its approved phase.

## Phase 00 human device steps

1. Provide model, Android version/API and RAM tier for available phones; no serial
   or personal schedule/audio required. Record timezone and battery optimization.
2. In Android Settings, inspect TTS engine, English offline voice availability and
   downloaded speech recognition languages. A settings entry alone does not prove
   offline functionality; runtime airplane-mode checks follow the authorized build.
3. Enable USB debugging on the dedicated test phone, authorize the local computer,
   run `adb get-state` locally, and share only state/model/API. Host enumeration
   now succeeds, but a phone must be connected. Do not overwrite a personal legacy app without backup
   and a separate build/application-ID plan.
4. After a reviewed baseline build exists, turn airplane mode on and Wi-Fi/mobile
   data off. Use only synthetic tasks. Verify manual creation/relaunch; schedule
   2–3 minutes ahead; record expected/actual UTC, lock/background state, permissions,
   heads-up/full-screen/notification outcome and sound. Test ACK and completion
   separately, snooze, two simultaneous alarms, edit/delete, reboot and denial.
5. Hold mic only while visibly interacting; release, inspect transcript, compare
   synthetic ground truth. Try silent/noise, denied mic, unavailable engine and
   audio interruption. Check that capture ends. TTS missing voice must preserve text.

Native checks remain NOT RUN/HUMAN REQUIRED. Phase 00 cannot certify a phone.
The complete future checklist is [REAL-DEVICE-QA.md](../../qa/REAL-DEVICE-QA.md).
