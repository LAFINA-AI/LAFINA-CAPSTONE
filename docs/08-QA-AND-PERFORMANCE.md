# 08 — Testing, Quality Gates, Performance and Comparative Research

## What counts as proof

- Unit test passes prove business logic only; mocked native modules **cannot** certify Android alarm or voice behavior.
- An Android APK building proves buildability, not reliable alarms, speaking voice, STT, or usable UX.
- Physical-device QA includes device manufacturer/model, RAM tier, API level, battery optimization policy, locale/voice, app/OS permissions, and test date. No sensitive device identifiers.
- Baseline metrics are **measured** or labeled **not run**; never make performance claims from estimates or papers alone.

## Test pyramid and tools

| Layer | Examples | Tooling |
|---|---|---|
| Pure domain | Date normalization, state machine, recurrence, guards | Jest with injected clock |
| Repository | SQLite transactions/migrations/idempotency/restore | Jest/SQLite fixture plus Android instrumentation |
| Component | Onboarding, reminder detail, chat composer, accessibility | React Native Testing Library |
| Android platform | Exact alarm, FSI/headsup, notification channel, reboot, mic, audio focus | Kotlin/JUnit, Android instrumentation + physical QA |
| Voice | Offline STT tests, TTS first audio, noise/accents, fallback | Instrumentation + stopwatch trace hooks |
| Backend (later) | Proxy bounds, API validation, RAG retrieval, citation | Pytest, MockTransport & real supervised eval |
| End-to-end | Full student lifecycle airplane mode; alert after app death | Real-device documented recordings/logs |
| Static architecture | Circular deps, disallowed imports, TS strict | ESLint, Graphify/alternative, TS compiler |

## Target device matrix

Required: one **minimum-spec representative Android phone** (ideally Android 11+, ARM64, ~4 GB RAM, local offline speech packages) and one newer Android 13/14/15+ phone. Optional second manufacturer. If unavailable, mark coverage gap and require manual review; don't claim device certification. Emulator helps reproduce logic but is not adequate for battery/OEM alarm policy.

## Performance benchmark tasks

A. Legacy baseline: pinned old app (if safe buildable) Kokoro cold/warm TTS first audio, app startup, STT command completion, voice-response end-to-end, peak RSS/PSS, apk/aab size, alarm delivery.
B. Capstone: same texts, 30+ repetitions where practical, warmed/cold variants, airplane mode, release-like APK, same microphone/audio conditions.
C. Command dataset: common/edge scheduling utterances, ambiguous and intentionally contradictory phrases. Label intent/slots; evaluate WER, critical false actions and exact scheduled UTC.
D. RAG Phase 10: verified ground-truth handbook set with sources and evaluation harness. See `docs/07-RAG-AND-ONLINE.md`.

## Suggested targets (MUST distinguish aspirational vs achieved)

| Metric | Aspirational target | Notes |
|---|---|---|
| Native system TTS warm first audible audio | median < 500 ms | Only if offline voice installed; measure callbacks + audibility |
| Native system TTS cold | median < 1.5 s | Including TTS initialization |
| Local save/confirm event | p50 < 300 ms | DB and UI, not alarm delivery |
| Common voice command | p50 < 3 s from speech end to durable confirmation | STT + parse + DB; p95 reported |
| Reminder delivery | ≥95% within 60 seconds in explicitly supported permission/device conditions | OS OEM variance, FSI separately |
| Critical unsafe auto ACK/delete | 0 in red-team fixtures | If ambiguity, ask user |
| Peak voice-pipeline RAM | Reduce vs legacy, goal ≥25% if comparable | Goal contingent on comparable measured baseline |
| App startup | Target <2 s on agreed reference phone | Physical QA/benchmark |
| Offline core | 100% required offline scenarios | Excluding unsupported OS conditions documented |

If targets cannot be achieved on chosen device, record problem and propose realistic revised target with human approval. Never conceal a regression behind average-only results.

## Measurement data schema

Provide machine-readable benchmark JSON/CSV with fields: `phase`, `build_sha`, `old_or_new`, `phone_model_tier`, `ram_gb`, `android_api`, `cpu_arch`, `voice_engine`, `voice_locale`, `model_name`, `quantization`, `condition` (cold/warm/offline), `test_case_id`, `n`, `p50_ms`, `p95_ms`, `max_ms`, `peak_pss_mb`, `failures`, `notes`, `measured_at_utc`. Use null, not zero, for not-run. Never commit private audio or unique device identifiers.

## Reliability edge cases

- airplane mode before/during scheduling and reminder call;
- app cold start and kill/restart; process death vs force stop distinct;
- OS-restricted exact alarms/full-screen intents; notification blocked; ringtone mute/quiet hours;
- reboot, timezone/date manual change, DST crossing if timezone changes;
- two same-time alarms, duplicate native intents, race with edits/deletes;
- snooze result callback arrives after call ended;
- mic busy, denied audio, screen rotation/background, long input, silent/noisy input;
- Android TTS language/voice missing offline, output queue canceled, cellular interruption;
- SQLite disk full, migration failed, invalid timestamps, cancelled reminders;
- online-only later: Gemini timeout/429, proxy error, handbook index empty/poisoned, citation mismatch.

## Continuous integration minimum

`npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, backend `pytest` + `ruff` when present, build check if available. GitHub Actions may not have Android SDK/NDK; if not, document and arrange separate reproducible local build. Stage heavyweight instrumentation on device/manual, not faked in cloud CI. Adopt one `preflight` script that fails on genuine errors; never disable test suites to green them.

## Phase report semantics

Every test line is `PASS / FAIL / NOT RUN / HUMAN REQUIRED`. A blocking requirement not run means `AWAITING DEVICE VALIDATION` or `BLOCKED`, not complete. Use `templates/PHASE-REPORT.md`, record artifact SHA/log path and user-visible fallback. Compare old/new for all major performance changes.
