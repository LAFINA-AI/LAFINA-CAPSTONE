# 06 — Offline Voice, TTS, STT, Local AI Pipeline

## Goals

Fast **hold-to-talk** input (student presses, speaks, releases), readable transcript, safe structured intent, immediate text confirmation and optional spoken reply. Reliability/latency on a **4 GB Android** device matters more than celebrity-quality TTS. No always-on hot mic, no voice wake word, no model inference on alarm delivery path, no network required.

## TTS — platform first

1. Make a Kotlin bridge to `android.speech.tts.TextToSpeech` with one-time per lifecycle initialization, `onInit` readiness, `UtteranceProgressListener` timing callbacks, cancel/stop/dispose and audio-focus hygiene.
2. Enumerate installed voices/locales, choose preferred voice only if `voice.isNetworkConnectionRequired == false` (or equivalent verified local behavior). Validate language support and user choice. Don't assume every Android handset has a downloaded English voice.
3. For a missing offline voice, explain the problem and use visual text/notification instead of silently going online. Optional user-directed offline voice installation guide; never force install.
4. Text UI renders after durable action **without blocking on TTS**. Configure `text-only`, `voice`, or `both`; reminder calls default to audio+visible text if offline voice ready.
5. Compare Android TTS startup latency, warm response, voice clarity and RAM against legacy Kokoro baseline. **Don't import Kokoro or its ONNX/voice data into APK by default.** Optional pre-generated sound files only for proven useful fixed prompts, with cache hygiene and privacy review.
6. Prevent duplicate utterances, leaked TextToSpeech instances, overlapping audio, TTS speaking itself into mic, audio focus interference with other apps/cellular calls.

## STT — adaptive offline pipeline

- On Android versions/devices supporting `SpeechRecognizer.isOnDeviceRecognitionAvailable` and `createOnDeviceSpeechRecognizer`, benchmark truly offline recognition in airplane mode. Note API availability, model install dependence and inconsistent OEM support; never assume Android 11 has it.
- Use pinned tested native Whisper.cpp Tiny quantized bridge as explicit offline fallback when needed. Audit JNI, asset licensing, memory and APK cost before inclusion; model installation may be staged with consent. If no engine, allow typed commands.
- Push-to-talk microphone: press-and-hold starts capture only after permission; release stops; cancellation discards audio; show transcript preview and recoverable failure. Test mic permission denied/revoked, rapid taps, mic busy, notification interruptions, lock-screen transitions, silent/noise inputs, short/long utterances and audio-focus loss.
- Single-owner capture via session/capture ID; late async callbacks must not mutate a newer conversation/reminder.
- VAD optional after benchmark. Do not build hands-free barge-in inside reminders unless approved and compatible with platform restrictions; call-like UI defaults to a visible mic button after answer.
- Measure word error rate (WER), command success rate, p50/p95 after release, model cold load, RAM and battery; test Filipino-accented English and varied noise with consented/public data.

## Local intent actions

**Routing:**

```text
Typed or transcribed text
  -> normalize + validation
  -> deterministic command pattern (simple ACK/SNOOZE/REPEAT + common schedule)
  -> if unambiguous, structured intent
  -> else optional small on-device NLU (SmolLM2 after measurements)
  -> validate against fixed schema and local current time/timezone
  -> show confirmation for ambiguous or destructive effects
  -> use-case command executor (one owner of writes)
  -> SQLite transaction + platform alarm reconcile
  -> immediate UI text; optional Android native TTS
```

**Schema outline:** `intent` enum (`CREATE_TASK`, `CREATE_EVENT`, `CREATE_REMINDER`, `EDIT_ITEM`, `CANCEL_REMINDER`, `LIST_TODAY`, `ACKNOWLEDGE`, `SNOOZE`, `REPEAT`, `HELP`, `UNKNOWN`), optional target ids, canonical ISO date/time, timezone, duration, confidence/uncertain slot list, original transcript, `needsConfirmation`. Parsing output has **no direct DB write**. Validate non-past time, invalid dates, unknown target, collision policy and user confirmation. No arbitrary executable code/tools in AI output.

**Examples:**

| Input | Expected |
|---|---|
| 'Okay' while reminder active | ACK only when high-confidence and no contradictory content |
| 'Okay, but remind me later' | ASK CLARIFICATION / snooze time, never simple ACK |
| 'Snooze 10 minutes' | SNOOZE(10) if active reminder |
| 'Remind me to study tomorrow at 7 PM' | CREATE REMINDER with explicit parsed date/time, confirm if ambiguous |
| 'Move it to Friday' | Resolve current referenced item, request clarification if none |
| 'Delete all my reminders' | Requires explicit confirmation before destructive mutation |
| Nonsense/silence | No action, communicate failure without looping infinitely |

## Offline AI model selection

SmolLM2-135M from legacy is a **candidate**, not a must. Laya is **research-only**, not required. The system should meet essential command tests even with local model disabled. Compare high-accuracy deterministic parser, a compact intent classifier, and SmolLM2 on real phone; evaluate memory, fallback, valid JSON, false commands, WER-dependent errors, and battery. Do not bundle new models without approval and reproducible benchmark.

## Honest availability matrix

- Offline text CRUD works on every supported install.
- System TTS works offline **only on devices with installed offline-capable voice**; otherwise text fallback.
- Native on-device STT works offline **if installed and available**; otherwise verified Whisper fallback if shipped. If neither, typed input.
- Complex free-form AI offline is intentionally bounded; not a general-purpose GPT replacement.
- Handbook Q&A is online-only in first capstone release, with explicit unavailable state offline.

## Performance experimental plan

On same phone and input corpus compare old Kokoro, new native Android TTS, Whisper and platform STT. Record cold/warm first-audio, transcription p50/p95, WER, RAM footprint, mean voice-command completion, model load time, battery, failures and human-rated intelligibility. At least 30 runs per latency case when feasible; don't overclaim formal statistical power without it. Device/build/model/locale/OS versions always recorded. Suggested targets are in `docs/08-QA-AND-PERFORMANCE.md` and must remain provisional.
