# Phase 05 — offline system speech: physical-device checklist

**Current acceptance boundary:** physical first audibility, intelligibility,
engine/network behavior, audio routing, real-call interruption and energy remain
**NOT RUN / HUMAN REQUIRED** until a named reviewer records them. The
[Phase 05 report](../docs/reports/phase-05-report.md) records actual executed
automation, installed APK hashes, emulator outcomes and failures. ADB-driven taps
and emulator callbacks are automated UI/device checks; they are not human manual
listening. Phase approval does not retroactively pass earlier phone checklists.

Use synthetic titles and a dedicated Android 11+ phone, preferably a modest-RAM
ARM64 device and a second OEM when available. Record reviewer/date, general model,
Android/API/RAM/ABI, APK version/SHA256/build type, app source identity, timezone,
Android default/requested engine package and version, selected voice/locale,
rate/pitch, speaker/headset route, media volume, charging/thermal/battery state and
network state. Do not publish unique serials, account identifiers, student titles
or unrelated notifications.

## 1. Install, preserve data and establish offline conditions

Choose **0.5.0-data-qa**, versionCode **5**, and its exact hash from the phase report.
The dataQa build bundles JavaScript and does not need Metro. ARM64 is for a
matching phone; x86_64 is for the matching emulator. Reusing an APK filename does
not prove it has the reviewed bytes.

```powershell
adb devices -l
Get-FileHash android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk -Algorithm SHA256
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Replace TEST_DEVICE locally. Upgrade with `-r`; do not uninstall, clear storage,
downgrade or replace the primary database to bypass a signing/storage problem.
Existing tasks, classes and preferences must survive. Schema remains **2**;
speech options extend the existing settings payload, not a new account/database.

Before changing anything, note original reply/voice options, Android engine,
media volume, radios and reminder permissions. Use Android settings to inspect
installed offline voice data. If data must be downloaded, do so only through a
separate deliberate user action, then turn airplane mode on and explicitly turn
Wi-Fi/mobile data off before validation. The app must not download speech data.

## 2. Settings and output modes

1. Open **Settings → Offline speech settings**; the subpage heading is **Offline
   speech**. Tap **Refresh installed voices**. Record the
   engine/default labels exactly as displayed, selected language/voice, rate and
   pitch. Only installed non-network voices should be offered. Their metadata is
   a selection safeguard, not independent proof that the vendor service never
   uses the network. If no eligible voice exists, expect guidance and usable
   planner/text controls; record the limitation instead of inventing a pass.
2. With reply preference **Text**, tap **Play voice preview**. The fixed preview
   must already be readable and may speak because this is an explicit action.
   Listen for the complete phrase, without unexpected language/voice switches:
   “Reminder: your study session starts soon. Your task stays open until you mark
   it complete.” Record the exact implemented phrase if it differs. Tap **Stop
   voice preview** during playback; speech should stop, with no task mutation.
3. Change **Speech speed** and **Voice pitch**, save voice options, restart the
   app and verify persistence. Preview again. Confirm the voice options actually
   affect playback and remain intelligible. Return to the original values when
   done. Do not interpret an engine's numeric quality/latency metadata as measured
   speech quality or milliseconds.
4. Set reply preference **Text**, **Voice**, then **Both**, saving each. Use the
   **Chat → Show planner help** action and a normal manual task save. Text must
   appear immediately after a durable save and remain readable in every mode.
   Only Voice/Both may automatically request the associated spoken reply. Text
   mode must stay silent unless an explicit preview/read action is chosen. No
   free-form AI command, microphone or speech recognition is expected here.
5. While preview/canned speech is active, change to Text, press Stop, navigate
   away, press Home and reopen. Speech must stop according to visible ownership;
   stale callbacks must not restart it or overwrite a newer status. Rapidly
   request several previews/replies: replacements must not produce a long hidden
   backlog. All manual navigation and task controls must remain responsive.

## 3. Real reminder with optional speech

1. Keep airplane mode and both data radios off. In **Settings → Reminder
   delivery**, enable the deliberate reminder delivery setting and grant the
   necessary Android notification/exact access if available. Note quiet hours;
   choose a time outside them or temporarily change them and restore afterward.
   Full-screen access is optional; notification access is a separate condition.
2. Choose Voice or Both. Through the normal Calendar form create a synthetic
   timed task “QA speech study”, 2–3 minutes ahead, reminder lead **0**. Save, then
   immediately confirm the durable text/status and academic deadline. The save
   must not wait for speech initialization or completion.
3. Press Home and wait. A background alert must remain usable as a notification.
   Open its visible simulated reminder screen. If an eligible offline voice is
   available, listen for the canned reminder reading while checking that the text
   and Answer/Snooze/Dismiss controls remain visible. No real call or microphone
   is started. If audio focus/voice is unavailable, expect readable fallback,
   rather than a claimed spoken success. Do not require background auto-speech.
4. Stop speech without answering, if that control is shown. The task remains
   TODO and the alert is not acknowledged merely by stopping audio. Then choose
   Answer/Acknowledge; the alert becomes ACKNOWLEDGED and the task stays TODO.
   Complete the task separately in the planner.
5. Repeat with Text mode: the visible reminder must be usable without automatic
   speech. Repeat with Snooze: the next alert time changes while the academic
   deadline stays unchanged. Observe sound/vibration separately from TTS; a
   notification sound is not proof that the reminder text was spoken.

## 4. Missing voice, errors, focus and privacy

On a disposable test environment, use a missing voice/unsupported language or an
engine with only network-required voices. Refresh and try preview. Expect a
readable unavailable/setup result, no silent network/other-language fallback and
normal manual saves. Avoid uninstalling/disabling the owner's engine or deleting
its data. If unavailable on the test phone, mark this physical case NOT RUN;
mocked tests exercise policy only.

During a sufficiently long fixed preview, play another audio app, change output
route, lock/unlock and test a real incoming phone call with a consenting second
phone. Record focus denial/loss and whether speech actually stops. Do not assume
the emulator certifies telephony, Bluetooth or OEM focus behavior. Returning to
the app must not replay old speech unexpectedly. No microphone capture/indicator
should appear. Stop/replacement/focus loss must never ACK or complete a task.

Inspect the current release/dataQa manifest evidence: TTS discovery adds a query,
not a microphone or internet permission. This does not constrain permissions of a
separate engine package. Airplane-mode success establishes the tested offline
condition only; do not call it comprehensive vendor traffic certification.

## 5. Reproducible timing, memory, quality and comparison

Freeze synthetic phrases before timing:

- Short confirmation: “Your task was saved on this phone.”
- Reminder: “Reminder: your study session starts soon. Your task stays open until
  you mark it complete.”
- Academic names/time: “Calculus lecture starts at nine thirty. Review chapter
  twelve before Friday.”

If the installed UI only exposes the fixed preview, use that exact phrase for
both implementations; do not claim arbitrary phrase entry exists. Test English
first and explicitly record any other supported locale. Rate pronunciations of
academic names/numbers and perceived quality with consented human listening,
including every refusal/wrong-language/failure outcome.

1. Record the request milestone, engine init-ready, `onStart`, terminal and
   stop/cancel timestamps from bounded diagnostics. Use one monotonic clock for
   within-process deltas. `onStart`/enqueue/PCM callbacks are **not first audible
   output**; do not subtract unrelated host/device clocks.
2. Measure physical request-to-first-audible speech using an externally recorded
   visible request cue plus speaker output, or a calibrated loopback method with
   known synchronization/error. Do not add microphone permission to the product
   for this experiment. Keep any recording synthetic/consented; do not publish
   private speech. Record sample rate, detection rule, clock alignment and
   uncertainty. Human stopwatch impressions are qualitative, not millisecond
   ground truth.
3. Separate cold app-process/client initialization, warm client requests and
   independently controlled cold engine/service conditions. Force-stopping the
   app does not prove a cold external engine. Do not force-stop a system/vendor
   engine on a personal phone merely to label a trial cold.
4. Aim for **30 trials per defined condition**, retain raw samples and failures,
   report n, p50, nearest-rank p95, maximum and error/cancel counts. Small emulator
   or callback-only cohorts are pilots and do not pass a first-audible target.
5. Collect repeated/traced memory during the complete pipeline for app and actual
   engine processes separately; one `dumpsys meminfo` snapshot is not peak PSS.
   Keep observed snapshots labelled as snapshots. Do not add process PSS as a
   precise deduplicated total without accounting for shared memory.
6. Energy requires a fixed workload/interval, matched screen/radio/volume/charging
   conditions and before/after measurements. Do not reset the owner's battery
   history without agreement. Record thermal and charging effects; CPU time or a
   snapshot is not comparative battery drain.

Useful local metadata/observability commands (not claims of execution):

```powershell
adb -s TEST_DEVICE shell getprop ro.product.model
adb -s TEST_DEVICE shell getprop ro.build.version.sdk
adb -s TEST_DEVICE shell getprop ro.product.cpu.abi
adb -s TEST_DEVICE shell settings get secure tts_default_synth
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone
adb -s TEST_DEVICE shell dumpsys meminfo ENGINE_PACKAGE
adb -s TEST_DEVICE shell dumpsys batterystats com.lafina.capstone
```

ENGINE_PACKAGE must come from actual device inspection, not a guessed vendor.
Keep private serials/settings and unrelated process information out of committed
evidence. The capstone's no-INTERNET manifest does not establish engine traffic.

**Kokoro matched comparison remains NOT RUN** unless a separately prepared,
provenance-approved pinned legacy APK and the same phone/phrases/conditions are
available. Do not build/change the read-only legacy repository or download model
assets. Compare uncached synthesis and cache-hit playback separately; record
engine/model/version/checksum, app and engine memory, all failures and human
quality. No speed ratio is justified by static payload sizes or callback pilots.
See [the shared matched protocol](../docs/benchmarks/phase-00-baseline.md).

## 6. Reproduction, cleanup and reviewer record

Reproduction commands, not an assertion they ran on your physical phone:

```powershell
npm run preflight
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDataQa :app:assembleRelease :app:assembleDataQaAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --no-daemon --console=plain
adb -s TEST_DEVICE install -r android/app/build/outputs/apk/androidTest/dataQa/app-dataQa-androidTest.apk
adb -s TEST_DEVICE shell am instrument -w com.lafina.capstone.test/androidx.test.runner.AndroidJUnitRunner
```

Install the matching main dataQa APK first. These tests do not substitute for
listening, phone interruption, low-RAM/OEM or battery checks. ARMv7 remains an
experimental unverified target, excluded from the standard build above.

Stop speech, delete/cancel only your synthetic items/future alerts, then restore
original engine/voice/mode/rate/pitch, volume/route, quiet hours, reminder access
and radio settings. Preserve personal records and previous evidence. Reopen the
planner and confirm original data remains available.

| Reviewer record | Result to fill after actual execution |
|---|---|
| Reviewer/date; general phone/API/RAM/ABI; APK hash/source identity | NOT RUN |
| Airplane-mode preview: selected engine/voice/locale, heard phrase/quality | NOT RUN |
| Text/Voice/Both, explicit Stop and rapid replacements | NOT RUN |
| Normal reminder speech, ACK≠completion, snooze/deadline unchanged | NOT RUN |
| Missing voice/focus denial: text/manual fallback | NOT RUN |
| Real incoming call, Home/lock, speaker/headset/Bluetooth routing | NOT RUN |
| Physical first-audible raw samples, n/p50/p95/max/failures | NOT RUN |
| App + engine memory/energy and matched Kokoro comparison | NOT RUN |
| Original settings restored; only synthetic alerts removed | NOT RUN |

Phase 06 is not authorized by completing this checklist. The full offline-core
gate still belongs to the Phases 01–08 review.
