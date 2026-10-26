# Phase 07.1 — Incoming native, speech and gate audit

Reviewed 2026-10-26 (Asia/Manila), against incoming commit
`9c183a20eca2377b5e54f219c5f83460b18af81b`. This is an independent source review
plus the narrow pure-helper probes below, not a claim that the incoming Android
application was built, installed or exercised. The existing Phase 07 native
baseline has separate, versioned build/device evidence. Physical-phone behavior
and incoming native runtime behavior are **NOT RUN** in this audit.

## Decision

Retain the Phase 07 native reminders, Android system TTS, STT adapters, native
tests, restricted permissions and build/provenance controls. Adapt incoming
visuals against those interfaces. Do not run two schedulers or two speech owners,
replace the capstone database with the incoming stores, import cloud accounts,
or promote incoming instructions/reports to owner authorization. The owner
authorized integration and testing, not online services or Phase 08.

## Confirmed findings

Paths and line numbers in this section identify **incoming commit** files.

| Finding | Evidence and effect | Integration resolution |
|---|---|---|
| P1 — Negated or contradictory speech can acknowledge an alert | `src/scheduler/callDispatcher.ts:245-294` searches for an acknowledgement token anywhere, then returns ACK before considering remaining language. Actual extracted helper returns ACK for `do not acknowledge`, `acknowledge but remind me later`, and the unrelated word `knowledge`; `do not snooze` returns SNOOZE. `processCallTranscript` invokes reminder actions with that result. | Exclude incoming dispatcher/keyword parser. Keep strict Phase 07 validation and reviewed mutation boundary. Do not translate raw recognition directly into actions. |
| P1 — Offline TTS does not fail closed | `src/ai/tts/ttsService.ts:43` accepts an unspecified network requirement because it tests `!== true`; lines 96-100 swallow enumeration failure and mark TTS available even when no offline voice was selected. The extracted selector accepts an English voice with its network flag absent. Calling the engine default cannot establish offline capability. | Retain existing Android TTS adapter with explicit offline voice/capability checks and text fallback. No `react-native-tts` migration or cloud speech provider. |
| P1 — Alarm identity can collide | `android/app/src/main/java/com/lafina/capstone/LafinaReminderModule.kt:396-410` uses `reminderId.hashCode()` as the request code, same component/action and no unique Intent data; extras do not supply a distinct Intent identity. Distinct IDs `FB` and `Ea` both hash to 2236. Cancel uses the same request identity at lines 293-310; notification IDs also hash at line 453. | Retain collision-resistant identity keys, occurrence/generation fencing and current native policy/tests. Probe demonstrates hash collision only; Android registration was not run. |
| P1 — Native delivery loses durable state checks and can replay stale alarms | `LafinaReminderModule.kt:335-339` removes a SharedPreferences entry and unconditionally calls `showIncomingCall` without checking database status, generation, deleted source, stale occurrence, duplicate delivery or a response deadline. Repeating the broadcast can re-notify. `restoreScheduledAlarms:314-332` immediately displays any past record, with no overdue horizon. Registration precedes asynchronous preference persistence at lines 260-290. | Retain SQLite transactional reminder/job state, idempotent due claim, bounded recovery and the existing `:reminders` process/provider. No second SharedPreferences alarm authority. |
| P1 — Simultaneous reminders share one pending payload | `LafinaReminderModule.kt:387-394` writes every due reminder to the same three preference keys. `finishIncomingCall:97-106` clears that entire pending payload when any reminder finishes. A second due call can replace the first, or be erased by finishing another. | Keep current durable per-occurrence reminder/job queue; retain concurrency/duplicate tests. |
| P1 — Incoming voice modal bypasses confirmation and target uniqueness | `src/ui/components/VoiceModal.tsx` `executeDefaultCommand` finds the first incomplete task whose title includes the spoken substring and immediately calls `tasksStore.updateTask`. Recognized text is passed into that function on release, with no editable review or confirmation. | Reuse visual ideas only. Keep existing editable draft → Message → Send → Confirm flow and exact bounded target lookup. |
| P2 — Cancellation during native inference can still publish a final result | `LafinaSpeechToTextModule.kt:242` checks discard before inference; lines 267-280 infer and publish/resolve success without rechecking discard afterward. Cancellation methods set the flag, but this success path can expose a cancelled late transcript. The bridge also lacks a cooperative abort callback for `whisper_full`. | Retain current ownership/cancellation fences and bounded inference bridge. No incoming native capture/decoder accepted. Source finding; no real microphone used. |
| P2 — Native feature availability is overstated | `LafinaSpeechToTextModule.kt:181-188` reports availability based on microphone permission alone. `LafinaWhisperBridge` catches failed `System.loadLibrary` but availability does not reflect library/model integrity. | Retain real library/build/asset capability states and checksum validation, with usable manual input. |
| P2 — Permission and architecture gates broaden beyond the approved offline core | Main manifest adds `INTERNET`, `ACCESS_NETWORK_STATE`, both exact-alarm permissions, `WAKE_LOCK`, foreground service and microphone foreground-service permissions. It removes the existing isolated provider/activity and declares `LafinaReminderService` as microphone FGS. Incoming architecture guard explicitly allows network permissions and even `REQUEST_INSTALL_PACKAGES`, removes network-global/auth/cloud restrictions, and scans `src` without including root `App.tsx`. | Preserve owner instructions and current manifest/gate. No online endpoint, account, entitlement, updater or microphone service accepted. These declarations are source facts, not proof a platform-specific FGS crash occurred. |
| P2 — Automated checks lose coverage | Incoming package preflight omits `format:check`. It deletes native reminder policy/identity/store tests, substituting constant/class/service availability checks. The new three instrumentation tests do not schedule/deliver or verify SQLite state. Existing 42 Android checks and 62 JVM checks cannot be represented as preserved by those replacement tests. | Keep current behavioral/migration/native tests and all preflight gates; test integrated build afresh. Counts of the final integration belong in its completion report. |
| P2 — Speech metrics/report/model identity disagree | Native bridge now names `ggml-base.en-q5_1.bin`; `src/scheduler/callDispatcher.ts:90` still labels its speech metric Tiny English. Incoming Phase 06 report also describes Tiny English payload rather than the actual tracked Base English asset. | Do not mix cohorts or use incoming timings as comparable evidence. Preserve original Phase 06 benchmark records and model identity. |

Additional source limitation: incoming TTS completion listeners do not filter by
utterance ID, and its timeout resolves success without stopping native playback.
Incoming `LafinaAudioPlayerModule` ignores audio focus request denial and focus
loss, and has no module invalidation cleanup. These are further reasons to keep
the existing speech ownership implementation; no audible playback claim is made.

## Model, runtime and build provenance comparison

| Item | Retained capstone baseline | Incoming tree |
|---|---|---|
| Speech model | Tiny **multilingual** Q5_1, optional checksum-verified ignored build asset, 32,152,673 bytes | Base **English** Q5_1 committed as `assets/models/ggml-base.en-q5_1.bin`, 59,721,011 bytes; Git blob `1f4c05156d1b51998d811949a0a75c5ad1ffdcbd` |
| Model identity | SHA256 `818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7`, publisher/revision/license/notice recorded in [model ledger](../third-party/phase-06-model.json) | Filename and Git blob are identifiable, but no matching model publisher/revision/SHA256/license decision was found in incoming `docs/third-party/` |
| VAD | Existing bounded energy/capture implementation; no ONNX runtime package | Committed `silero_vad.onnx`, 1,289,603 bytes, blob `625ad8909b1abdba2292f3a9a10db6864fd5d561`; ONNX Runtime Android 1.19.2 added |
| Model payload difference | Original baseline remains unchanged | Incoming Base+VAD total 61,010,614 bytes, **28,857,941 bytes more raw model payload** than retained Tiny. This is not an APK-size, memory, quality or latency measurement. |
| Runtime source | Reviewed 95-file CPU-only Whisper 1.9.5 selection pinned `d1be6fde11ac6e0407606b4e42fe72d34add8037`; source/notice hashes preserved | Broad Whisper/GGML tree includes many unneeded platform/backend sources; top-level MIT notice exists, but no matching reviewed source selection manifest found |
| Build controls | Explicit baseline CPU features, no dynamic/GPU backends, bounded Ninja pools, hidden private static archives, explicit 16KiB JNI alignment; existing ELF/build evidence | Simpler CMake uses full subdirectory, no equivalent explicit alignment/source-selection controls. Actual incoming ELF alignment/load compatibility is **NOT RUN**, not presumed broken. |
| Native dependencies | Existing React Native/Hermes/OP-SQLite and custom tested speech modules | Adds ONNX runtime and `react-native-tts`, filesystem, network-state, sharing, document-picker, calendar parser and related UI libraries; no measured low-RAM case justifies importing this runtime graph wholesale |

No incoming binary was loaded, redistributed or benchmarked by this audit. The
retained baseline is also **not** certified for low-end phones merely by its
smaller raw model size. Speech accuracy, background interruption, PSS/battery and
physical ARM64 checks remain human/device work under the documented protocol.

## Useful incoming work

Launcher artwork and calendar/theme/navigation presentation can be selectively
reviewed and connected to the existing domain. Safe-area improvements are useful
design references, but should be checked on the integrated emulator and with large
text. Incoming native interfaces are not compatible replacements for current
generation-aware reminder identities or voice ownership. Retaining the older
core and adapting presentational work avoids competing databases, alarms and
speech engines. No native replacement is required to preserve the visual intent.

## Reproducible probes and limits

Run from the repository root (the pinned incoming Git object must be present):

```powershell
node scripts/audit-incoming-native.cjs
```

To save a new cohort, pass a new file path; existing evidence is never overwritten:

```powershell
node scripts/audit-incoming-native.cjs docs/reports/evidence/phase-07-1-incoming-native-probes.json
```

[Recorded result](../reports/evidence/phase-07-1-incoming-native-probes.json)
includes source SHA256, Node/TypeScript versions, six exact command outcomes,
unknown-network-flag voice selection and the ASCII Java-hash collision example.
The script extracts only named pure variable declarations through the TypeScript
AST and executes those helpers in a bounded context. It does not import the
incoming application, connect services, invoke native modules, read a student
database, capture microphone audio or alter alarm state. These probes reproduce
defects; they are **not** a passing incoming acceptance suite.

Incoming full preflight, Android build, native model inference, native delivery,
audio playback, peak PSS, startup and battery comparison are **NOT RUN by this
independent audit**. Integrated-build results and actual emulator manual checks
must be recorded separately by the integration owner. No private credentials
were saved or used.
