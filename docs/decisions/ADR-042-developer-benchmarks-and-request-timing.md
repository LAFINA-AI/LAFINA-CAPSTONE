# ADR-042 — Developer request timing and side-effect-free benchmarks

**Status:** accepted for DEVTEST-01 (owner request: "Improve LAFINA's existing Developer Testing Hub with accurate per-message timing, one-click benchmarks, correctness checks, and exportable evidence"; first phase only)
**Date:** 2026-11-23
**Phase:** DEVTEST-01
**Review owner:** human developer

## Context / problem

The Developer Testing Hub could trigger alarms, sync and NLU checks, but there was no honest way to answer "how long did this reply take, and which path answered it?" Ad-hoc stopwatch numbers mixed network receipt with rendering, offline model load with inference, and requested mode with the route that actually answered. Running the real chat pipeline for tests would also write chat history, memories, review cards and sync outbox rows for the student.

## Decision

**One trace per request** (`src/ai/benchmark/requestTrace.ts`).

- Durations use a monotonic clock (`performance.now()` when present). Wall-clock time is used only for ids and the timestamp, written with its timezone offset.
- Marks are first-write-wins and the trace is frozen after `finalize()`, so late or stale callbacks (a retry, a cancelled stream, navigation) cannot change a finished record. Each trace has its own request id; overlapping requests never share one.
- The execution path is derived from what happened (`online_provider`, `fallback`, `offline_model`, `fast_path`, `unknown`), never from the Online switch.
- "Network data" (first stream chunk, including keep-alives) and "first reply text" are separate marks. "On screen" is the first animation frame after React committed the text.
- Online timing is a client round trip. It is never labelled server inference time.
- The native intent extractor reports `load_ms`, `inference_ms` and `cold` (`SystemClock.elapsedRealtime`). Older engines without these fields are shown as "unknown", not guessed.
- A stage that did not happen shows "unavailable" with a reason.

**Per-message timing in Chat** is on only while Developer Mode **and** Developer → Perf → "Show timing under chat replies" are on (`debug.perf_tracking`). With it off, Chat passes no trace and nothing is recorded. Timings are kept in memory (last 50) and contain no message text. Streaming tokens do not set React state for timing; only the first and final frames are marked.

**Benchmarks** (`benchmarkRunner.ts`) call the real `chatOrchestrator.processMessage` with a `benchmark` option that:

- forces a temporary chat with no history, no speech and the `chat` review surface, and never touches the open call;
- refuses "forget everything", skips memory saves and memory "last used" updates, and never decides an existing review card;
- works out low-risk commands with `planLowRiskCommand` (dry run) instead of applying them;
- cancels every proposal the run created, by its own operation id only (also for late answers after a timeout);
- passes the requested mode per request; it never changes settings, signs in, downloads a model or changes connectivity.

Before and after each run, counts and latest-change marks of planner, chat, memory, outbox, receipts, delivery jobs and alarms are compared, plus the Online Mode setting. Any change is reported as a FAIL of the isolation check; nothing is deleted to "clean up".

Simulated cases (missing model, online failure) are labelled `SIMULATED` and excluded from latency statistics. Assertions are structured (intent, review state, date/time, route). A capability that cannot be checked (no offline model) is `UNAVAILABLE`, never `PASS`.

**Statistics.** Nearest-rank percentiles; median only with n ≥ 3, p95 only with n ≥ 20; min/max/n always. Groups are split by case, requested mode, actual path and cold/warm. Failed, timed-out, cancelled and interrupted attempts stay visible but are excluded from latency.

**Exports.** CSV (RFC 4180, one row per attempt, formula-injection guard) and JSON (`lafina.devbenchmark/1`). They contain no user id, token, email, student number, planner content or memory. Custom prompt and reply text is redacted unless "Keep prompt and reply text" is on. At most 5 runs are kept on the device under the device owner; "Clear benchmark results" removes only those runs and export files.

## Consequences

- `chatOrchestrator.processMessage` is now a thin wrapper around the old body that records route facts; behaviour without `trace`/`benchmark` is unchanged (covered by existing chat tests).
- `executeLowRiskCommand` was split into `planLowRisk` (read-only) and the unchanged transaction.
- Speech (STT/TTS), OCR, sync and alarm benchmarking are not part of this phase.

## Alternatives rejected

- Running benchmarks in a separate database or user: would not exercise the student's real model, settings and planner reads.
- Toggling the Online Mode setting during a run: could be left changed after a crash.
- Timing every streamed token in React state: adds re-renders that distort the numbers being measured.
