# Phase 00 — pinned Android, voice, and model audit

Audit date: 2026-10-21 (Asia/Manila). Scope: source inspection and implementation blueprint only. No application source was copied or changed, no model payload was downloaded, and no native build or physical-device test was run by this audit.

## Evidence boundary

All legacy findings below refer to commit **f7e70aec54e6d16e627f444f2a67114cbfb07b5e**, read through the GitHub connector. The recursive Git tree returned 1,849 entries and `truncated: false`. The local legacy checkout is not a substitute for this revision and was not built or modified. Git tree and LFS-pointer sizes are static inventory, not APK, runtime-memory, battery, or latency measurements.

## Source inspection ledger and reuse decisions

Line ranges identify portions actually reviewed; they do not certify unexamined transitive dependencies. PORT means a candidate for a later approved phase, with tests and permission/provenance review; it does not authorize a copy now.

| Pinned source and reviewed lines | Observed behavior and dependencies | Classification and required adaptation |
|---|---|---|
| [AndroidManifest.xml, 1–94][manifest] | Permissions, activity lock-screen behavior, receiver/service declarations; reminder receiver name differs from source class. | **REWRITE** minimal manifest; drop updater/meeting permissions and services; decide alarm permission eligibility; add speech/TTS package-visibility queries when adapters exist. |
| [LafinaReminderModule.kt, 1–480][reminder] | RN bridge, AlarmManager, immutable PendingIntents, NotificationCompat, SharedPreferences registry and single pending-call record. | **REWRITE** durable alarm-job ownership, identities, concurrency and failure results; preserve narrow schedule/cancel/permission-interface concepts. |
| [LafinaReminderReceiver.kt, 1–24][receiver] | Explicit reminder broadcast and boot/package/time/timezone/permission restoration dispatch. | **PORT candidate**, after fixing manifest registration and moving restoration to authoritative job storage. |
| [LafinaReminderService.kt, 1–126][service] | Answered-reminder foreground service, microphone plus mediaPlayback types, low-priority notification, 10-minute bounded partial wake lock, nonsticky lifecycle. | **REWRITE** explicit user interaction and microphone preflight; start only justified types; bound service lifetime independently of wake lock. |
| [MainActivity.kt, 1–58][activity] | Captures reminder launch data; enables lock-screen display for reminder intent. | **PORT candidate** for minimal intent delivery; verify cold/warm activity and locked-device behavior, intent validation and privacy. |
| [LafinaTimerAlarm.kt, 1–136][timer] | Separate timer AlarmManager path with inexact fallback and app-foreground suppression. | **REFERENCE ONLY**; no Pomodoro/timer expansion during initial core work. |
| [LafinaOfflineSpeech.kt, 34–246, 258–688][speech] | Single capture owner, worker executor, 16 kHz mono PCM, manual/automatic modes, Silero VAD through ONNX, lazy Whisper context, recording/cancellation/release. | **PORT candidate** for typed capture protocol and bounded capture concepts; **REWRITE** lifecycle/cancellation and engine selection. No Android SpeechRecognizer adapter in reviewed implementation. |
| [whisper_jni.cc, 1–221][jni] | CPU-only Whisper asset loader, English language, 1–4 threads, greedy decoding, academic prompt and optional short-command configuration; timestamp path also supports meeting transcription. | **PORT candidate** for minimal STT bridge after upstream revision/license verification; omit meeting/timestamp scope. Add safe cancellation/context ownership and explicit native errors. |
| [CMakeLists.txt, 1–40][cmake] | RN appmodules plus vendored Whisper; C++20, OpenMP off, optimized debug native targets. | **REFERENCE ONLY** until RN/NDK/ABI smoke build; do not transfer entire vendor tree automatically. |
| [LafinaVoiceModules.kt, 1–196][intent] | RN intent extractor implemented with Kotlin regexes and JSONObject; no GGUF/model inference in this file. | **REWRITE** one typed deterministic parser and validator in domain layer. Do not describe this bridge as measured small-LLM inference. |
| [speechCapture.ts, 1–162][capture] | Typed capture ID, manual stop/cancel, shared owner, watchdog and mismatched-result rejection. | **PORT candidate** for contract/scenarios; reconcile JS watchdog with native cancellation and confirmed release. |
| [voicePipeline.ts, 1–254][pipeline] | Deterministic scheduling before native intent extraction; JS timeouts; requires extractor availability even before deterministic voice scheduling. | **REWRITE** pipeline without mandatory model dependency, account/user ownership, or direct unconfirmed AI side effects. |
| [LafinaTTSModule.kt, 1–178, 437–754; targeted symbol review elsewhere][tts] | Kokoro v0.19 ONNX synthesis to WAV, cache extraction, raw synthesis threads, MediaPlayer and audio-focus events. No Android TextToSpeech adapter in reviewed bridge. | **REFERENCE ONLY / benchmark baseline**. Exclude Kokoro engine/weights from MVP. Implement system TTS adapter in its approved phase. |
| [ttsService.ts, 1–336][tts-ts] | WAV cache, single-flight cache work, reminder DB mutation, logs containing spoken text; email read-aloud helper. | **REWRITE** small nonblocking TTS service; **DROP** email helper and default WAV precaching; use redacted logs. |
| [modelAssets.ts, 1–27][assets] and [LFS rules, 1–5][lfs] | Named model assets, including SmolLM2, and LFS filters. | **REFERENCE ONLY** inventory; model references are not evidence of loading or inference. |
| [android/build.gradle, 1–21][gradle-root] and [android/app/build.gradle, 1–141][gradle-app] | minSdk 30, compile/target SDK 34, build tools 36.0.0, NDK 27.1.12297006, Kotlin 2.1.20, CMake 3.22.1, ONNX Runtime Android 1.19.2, three ABIs. | **REFERENCE ONLY**. Root toolchain audit must validate a coherent supported stack; no proven build inferred from these declarations. |
| [Whisper debug instrumentation, 1–80][fixture] and [debug manifest, 1–7][debug-manifest] | Fixed float32 fixture; elapsed-time inference counter; success means nonempty transcript. | **PORT candidate** for a stronger corpus harness. Existing status does not measure WER, intent correctness, microphone capture, release performance or system STT. |

## Material native risks

1. **Reminder receiver declaration mismatch.** The manifest names `.LafinaAlarmReceiver` at line 60. The implemented class and explicit scheduling/cancellation PendingIntents use `LafinaReminderReceiver` (receiver line 7; module lines 320 and 422). The complete pinned tree contains no LafinaAlarmReceiver file. This is a static integration defect candidate that can prevent alarm delivery/restoration; it has not been reproduced on a phone. Never copy this manifest unchanged. See [manifest][manifest], [module][reminder], [receiver][receiver].
2. **Multiple sources of truth and no atomic delivery boundary.** The native module writes alarm records with asynchronous SharedPreferences apply after scheduling; trigger removes the registry before posting. The pending-call record holds one reminder, and consume/finish clear the whole record (module 116–145, 286–316, 339–364, 412–418). Concurrent alarms, process death and failures can lose or overwrite state. Use one authoritative SQLite reminder/job transaction plus an idempotent native reconciliation protocol. The OS AlarmManager registration cannot share a SQLite transaction: reconcile committed desired state with actual native effects after crashes. See [module][reminder].
3. **Identity collisions and stale delivery.** PendingIntent and notification identity use String.hashCode without unique intent data; different reminder IDs can collide (module 318–331, 421–452, 478). Registry restoration rings every overdue entry and deletes malformed records (339–357), with no reviewed expiry window or durable diagnostic. Future design needs unique job/generation identity, stale/deleted-item checks, bounded overdue policy, and per-job delivery records. See [module][reminder].
4. **Precision/failure reporting.** Native scheduling returns success when it substitutes an inexact alarm (91–102, 286–306). Notification SecurityException is swallowed (386–390). The new typed result must expose actual delivery capability and degraded precision; durable missed/failure state must remain visible without speech. Existing permission-status methods are useful reference, not proof of fallback UX. See [module][reminder].
5. **Sensitive lock-screen content.** Legacy posts task text with public lock-screen visibility and persists task text in both registries. Default to a generic alert or explicit user preference, minimize native payload content, and redact logs. See [module 366–390, 412–418][reminder].
6. **Microphone service starts require visible user intent.** startActiveCall starts a foreground service without checking permission/visibility in that method; service always requests microphone and mediaPlayback (module 149–158; service 25–43). Later integration must start microphone capture only following suitable visible interaction, ensure runtime permission, support manual answer/snooze/acknowledge, and recover from service-start rejection. Do not use Telecom roles or a phoneCall service type merely to style a simulated reminder. See [module][reminder], [service][service], and [Android foreground-service restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
7. **STT lifetime/cancellation hazard.** A single worker performs inference, but release/invalidate free the context outside that executor (speech 184–245, 618–645); JNI exposes a raw pointer. This presents a potential free-while-inference race requiring ownership serialization. Cancel flags stop/discard capture but do not cancel an in-progress whisper_full call; JS timeout cannot by itself terminate native inference. Keep late results unable to commit commands and prove memory/microphone release. See [speech][speech], [JNI][jni], [capture][capture], [pipeline][pipeline].
8. **Speech accuracy is unmeasured.** Whisper bridge forces English and disables its redundant no-speech gate after VAD. Automatic command context is explicitly disabled at speech line 219 due to a hallucination concern recorded in source. Test local accents, room noise, silence, code switching, compact dates/times and adversarial near-matches before permitting scheduling. Existing comments are not benchmark evidence. See [speech][speech] and [JNI][jni].
9. **Kokoro costs remain hypotheses until measured.** Resources are copied to app cache and held in ONNX session/style/dictionary fields. Synthesis creates one raw Thread per call; playback continues after a failed focus request, and logs include text excerpts. These are reasons to benchmark and simplify, not evidence of a latency/memory value or speedup. Default system TTS avoids importing this pipeline. See [TTS 112–159, 437–580, 716–739][tts] and [TS TTS][tts-ts].
10. **“LLM baseline” must identify the actual path.** The checked Kotlin extractor ignores model/prompt/token fields and performs deterministic parsing. It accepts meridiem hours up to 24 and returns null dates even when stripping today/tomorrow. Compare deterministic behavior as such; the SmolLM2 file alone does not establish inference. See [extractor 22–47, 54–175][intent] and [pipeline][pipeline].

## Model inventory and provenance boundary

Sizes below are **declared LFS payload bytes read from three-line pointers**, except cmudict whose Git tree reports a normal blob. No payload was fetched or hashed. Each LFS SHA-256 is the pointer's expected object ID, **not a locally verified checksum**. Links are pinned to the audited commit; each pointer was read at lines 1–3.

| Asset | Git blob bytes | Declared payload bytes | Expected payload SHA-256 | MVP decision |
|---|---:|---:|---|---|
| [SmolLM2-135M-Instruct.gguf][model-llm] | 134 | 144,811,360 | `5a1395716f7913741cc51d98581b9b1228d80987a9f7d3664106742eb06bba83` | Exclude until benefit, exact origin, license and engine are verified. |
| [ggml-tiny.en-q5_1.bin][model-stt] | 133 | 32,166,155 | `c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b` | Potential separately approved offline fallback. |
| [kokoro-v0_19.onnx][model-tts] | 134 | 325,525,180 | `dece567789190ebe987bd245d95c09d5ac86de28ff0c325c2e3faaf3de04442c` | Exclude MVP; old benchmark only. |
| [af_bella.bin][model-voice] | 132 | 5,758,648 | `157eab2fa1dd1c91b46599ea6f514bf86f66944c0c760250ed324e6cd99af075` | Exclude with Kokoro; exact voice provenance unresolved. |
| [silero_vad.onnx][model-vad] | 132 | 1,289,603 | `7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49` | Re-evaluate only if Whisper capture requires it. |
| [cmudict.txt][model-dict] | 3,618,487 | 3,618,487 (tree blob size) | Not calculated; content/license header retrieval returned empty and was not counted as read. | Exclude with Kokoro; exact dictionary provenance unresolved. |

Arithmetic only: these six assets total **513,169,433 bytes (489.40 MiB)** of expected source payload; Kokoro model + voice + dictionary total **334,902,315 bytes (319.39 MiB)**. These totals exclude native libraries, app assets, duplicated VAD outside the Android asset tree, compression, and extracted cache. They are not installed-size or memory measurements.

The complete pinned tree has no root LICENSE/COPYING/NOTICE. The vendored [Whisper.cpp LICENSE, lines 1–21][whisper-license] is MIT, but an upstream revision/patch manifest and exact model provenance remain needed before porting. Upstream Kokoro's model card identifies Apache-2.0 and describes v0.19, but this does not verify the legacy ONNX conversion or voice archive. [Upstream Kokoro card](https://huggingface.co/hexgrad/Kokoro-82M/blob/ed43a87ac78103dc9af46d33fc9f4414951c9493/README.md). Silero upstream identifies MIT; exact legacy export/version still needs matching. [Upstream Silero metadata](https://github.com/snakers4/silero-vad/blob/master/CITATION.cff). Do not distribute any of these legacy binaries from the capstone based on filenames or pointer hashes alone. Source/brand rights resolution is recorded by the root Phase 00 report.

## Android capability and permission matrix

This is a required validation plan, **all device rows NOT RUN**. Android version/API alone never proves that an offline recognizer or a suitable offline TTS voice is installed.

Owner steering during Phase 00 prioritizes low-end devices. Include a 2–3 GB
ARM64 Android11+ test tier when hardware is available, the ~4 GB handoff reference,
and newer-OS coverage. No minimum-RAM, 32-bit or Android Go support is certified.
The owner also confirmed legacy source/brand authorization (“I have authorization;
details to follow”); third-party/model/voice provenance remains separately reviewed.

| Device class | Alarms and notification checks | Voice and simulated-reminder checks |
|---|---|---|
| Android 11 / API 30 baseline, modest RAM | Notification channels/enabled state, idle delivery, process death, reboot/time/timezone restoration, blocked channel/manual recovery. | On-device recognizer factory API unavailable; separately licensed Whisper fallback or clear text-only state. Offline TTS voice enumeration/installed data; main-thread lifecycle; denied mic and offline airplane mode. |
| Android 12 / APIs 31–32 | Exact-alarm capability/settings; denied access uses explicitly inexact fallback; revoked permission recovery. | Gate on-device recognizer availability before construction; model/language availability and airplane-mode results; background service rejection/manual controls. |
| Android 13 / API 33 | Request notification permission contextually; test refusal and channel disable independently; exact-alarm permission design must match declared choice. | Missing recognizer/voice data and per-language failure; no silent cloud recognition or network TTS. |
| Android 14 / API 34 | Fresh-install exact-access behavior, full-screen access allowed/denied, lock-screen vs heads-up fallback; duplicate delivery. | Foreground-service type permissions and while-in-use mic restrictions; start only after valid user action, denied mic does not block text/manual reminder controls. |
| Android 15+ / API 35+ on an actual current phone | Force stop cancels PendingIntents on Android 15; app must explain delivery suspension and reconcile after user launch. Retest boot restrictions and actual target-SDK behavior. | Audio focus loss, real call interruption, Bluetooth/wired routes, screen lock, battery saver, OEM restrictions, service/mic cleanup. |
| Additional OEM device, e.g. Samsung/Xiaomi | Repeat full idle/reboot/notification/exact-denial matrix under documented battery settings. | Repeat STT noise/latency, TTS missing data, call-style state transitions and audio arbitration. |

Key platform facts verified with primary documentation on 2026-10-21:

- **Exact alarms:** select SCHEDULE_EXACT_ALARM special access or USE_EXACT_ALARM only where eligible; new installs can lack special access, and revocation cancels future exact alarms. Keep an explicit degraded path and reconcile from durable state. [Android alarm guide](https://developer.android.com/develop/background-work/services/alarms), [Android 14 exact access](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms).
- **Full-screen alerts:** Android 14 restricts default full-screen permission to eligible calling/alarm apps; check canUseFullScreenIntent and provide a usable notification fallback. Visual call styling grants no phone-call exemption. [Android 14 behavior](https://developer.android.com/about/versions/14/behavior-changes-14).
- **Notifications:** API 33+ uses POST_NOTIFICATIONS for ordinary nonexempt notifications; manual scheduling must survive denial. [Android notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission).
- **On-device STT:** createOnDeviceSpeechRecognizer was added in API 31, must run on the main thread, requires availability checking, and must be destroyed. Add recognition-service queries when required; test actual offline language support. [SpeechRecognizer API](https://developer.android.com/reference/android/speech/SpeechRecognizer).
- **Default TTS:** enumerate and select a voice with isNetworkConnectionRequired false; Android 11+ TTS discovery needs the TTS_SERVICE manifest query. Test downloaded voice data in airplane mode and expose text when unavailable. [TextToSpeech.Engine API](https://developer.android.com/reference/android/speech/tts/TextToSpeech.Engine).
- **Force stop:** do not promise delivery while stopped. Android 15 cancels PendingIntents and retains stopped state until user interaction; reschedule/reconcile only when permitted. [Android 15 stopped-state behavior](https://developer.android.com/about/versions/15/behavior-changes-all).

## Measurement status and exact manual validation steps

Native compilation, instrumentation, release APK size, startup, TTS first-audio latency/quality, STT WER/latency, peak PSS, battery and reminder reliability are **NOT RUN**. No attached-device identifier was established by this sub-audit. See the root toolchain/performance evidence for environment probes and the shared benchmark plan. No new capstone native executable or harness exists in Phase 00.

Use a dedicated test phone and an independently produced APK whose build metadata proves the pin; do not build or change the read-only legacy checkout. Substitute an actual serial in PowerShell:

```powershell
$deviceSerial = '<actual-test-device-serial>'
adb -s $deviceSerial shell getprop ro.product.manufacturer
adb -s $deviceSerial shell getprop ro.product.model
adb -s $deviceSerial shell getprop ro.build.version.release
adb -s $deviceSerial shell getprop ro.build.version.sdk
adb -s $deviceSerial shell getprop ro.product.cpu.abi
adb -s $deviceSerial shell dumpsys package com.lafina
adb -s $deviceSerial shell pm list instrumentation
```

If the independently produced pinned **debug** APK includes the reviewed debug instrumentation, the existing fixture command is:

```powershell
adb -s $deviceSerial shell am instrument -w -e commandMode false com.lafina/.LafinaWhisperFixtureInstrumentation
```

This measures only one fixture's Whisper inference and reports nonempty output, not end-to-end STT accuracy. Its fixed float32 debug asset is 237,568 tree bytes (59,392 float samples, approximately 3.71 seconds if 16 kHz); no consent/provenance was established, so do not publish or migrate its audio. No system-STT/system-TTS benchmark command is supplied because no such harness was found; a later approved voice phase must add one before comparisons.

For read-only observability during manual reminder and speech runs (save output outside personal-data logs and redact before publishing):

```powershell
adb -s $deviceSerial shell dumpsys alarm
adb -s $deviceSerial shell dumpsys notification
adb -s $deviceSerial shell dumpsys meminfo com.lafina
adb -s $deviceSerial shell dumpsys batterystats com.lafina
adb -s $deviceSerial shell am start -W -n com.lafina/.MainActivity
```

The notification dump may include private schedules from other apps; inspect locally and do not commit raw output. A single dumpsys memory reading is not peak PSS, and batterystats without a defined interval/control is not comparative energy evidence. Startup -W is a sample, not a median/p95 cold-start result.

Manual scenarios for the later approved reminder/voice gates:

1. Record non-sensitive phone model/API/RAM, app commit/build type/version, TTS engine and voice, STT engine/language/model checksum, battery settings, room/noise and network state. Use the same phone/corpus/conditions for old/new comparisons.
2. Enable airplane mode and disable Wi-Fi. Onboard anonymously, create/edit/delete a reminder manually, restart the app, and confirm data/controls remain usable when AI/speech is unavailable.
3. Schedule alerts for distinct times and two alerts at the same time; test screen on/locked, app background, process death, Doze/battery saver, reboot, clock/timezone changes, snooze collisions, deletion, exact/notification/full-screen access denied or revoked, and duplicates. Record scheduled/fired timestamps and every failure. Force-stop recovery must acknowledge the platform limit rather than claim delivery while stopped.
4. With suitable visible interaction, hold/release microphone, cancel mid-recording and during inference, deny/revoke mic, interrupt with media/real call, and verify no continued recording or stale schedule commits. Compare recognized transcript, structured intent and durable action separately.
5. Select an installed offline TTS voice, test missing voice data and denied audio focus, measure cold/warm time to audible output, and rate intelligibility. Repeat exact phrases with legacy uncached/cached Kokoro separately. Do not infer audible onset from successful enqueue or finished synthesis.
6. Acknowledge an alert and verify the task stays incomplete. Complete a task explicitly and verify only its appropriate reminder jobs cancel. Verify manual text/buttons at every denied-permission or voice-engine failure state.

No Phase 01 implementation is authorized by this document.

[manifest]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/AndroidManifest.xml
[reminder]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaReminderModule.kt
[receiver]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaReminderReceiver.kt
[service]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaReminderService.kt
[activity]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/MainActivity.kt
[timer]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaTimerAlarm.kt
[speech]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaOfflineSpeech.kt
[jni]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/cpp/whisper_jni.cc
[cmake]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/cpp/CMakeLists.txt
[intent]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaVoiceModules.kt
[capture]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/native/speechCapture.ts
[pipeline]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/native/voicePipeline.ts
[tts]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaTTSModule.kt
[tts-ts]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/tts/ttsService.ts
[assets]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/modelAssets.ts
[lfs]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/.gitattributes
[gradle-root]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/build.gradle
[gradle-app]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/build.gradle
[fixture]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/debug/java/com/lafina/LafinaWhisperFixtureInstrumentation.kt
[debug-manifest]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/debug/AndroidManifest.xml
[model-llm]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/assets/models/SmolLM2-135M-Instruct.gguf
[model-stt]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/assets/models/ggml-tiny.en-q5_1.bin
[model-tts]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/assets/models/kokoro-v0_19.onnx
[model-voice]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/assets/models/af_bella.bin
[model-vad]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/assets/models/silero_vad.onnx
[model-dict]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/assets/models/cmudict.txt
[whisper-license]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/cpp/third_party/whisper.cpp/LICENSE
