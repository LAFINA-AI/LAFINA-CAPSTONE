# PHASE DEVTEST-01 — Developer Testing Hub: request timing, one-click benchmarks, correctness checks and exports / Completion Report

**Branch / commit SHA:** `main` @ `3d27e3d` plus uncommitted working-tree changes (nothing committed or pushed)
**Date/time UTC:** 2026-11-22T16:45Z (local 2026-11-23, UTC+08:00)
**Device(s) available:** NONE used by the agent. No phone, emulator, offline model or online provider was exercised.
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner request "Improve LAFINA's existing Developer Testing Hub with accurate per-message timing, one-click benchmarks, correctness checks, and exportable evidence … This request authorizes the first implementation phase for this developer-testing improvement; do not treat it as approval for later phases."

## 1. Scope completed

Newly implemented (no legacy code ported; `LAFINA` and `LAFINA-backend` were not read or changed in this phase):

- **A. Per-message timing.** Developer → **Perf** → "Show timing under chat replies". Active only when Developer Mode **and** the switch are on. Each Chat send gets its own trace (request id, requested mode, actual path, provider/model or unknown, outcome, fallback reason, cold/warm/unknown, streamed). Stages: Send → user message saved; → processing started; intent parse; offline model load and inference (separately, from the native engine); online dispatch → first reply text (separate from first network data); → reply ready; → first text on screen; → final reply on screen; saving. Missing stages show "unavailable (reason)". A one-line caption appears under the timed reply; the Perf tab shows the full breakdown of the last 8 (50 kept in memory, no text).
- **B. One-click runner** in the existing hub (new **Perf** tab): Run Quick Offline Test, Run Quick Online Test, Compare Supported Commands, Run Extended suite, Run Custom Prompt (offline/online), Cancel Run, View Last Results, Export CSV, Export JSON, Clear benchmark results; repeat ×1/×3/×5/×10; progress, current case, elapsed. Online runs show a preflight (account/session present, connectivity, service reachable via read-only `GET /v1/ai/tts/capabilities`), the planned request count, the provider request count and a quota notice before anything is sent. Runs are sequential and use the real `chatOrchestrator.processMessage`.
- **C. Correctness cases** (suite `devbench-1.0.0`): greeting, simple reminder, task proposal, date/time block, varied wording (offline model only), ambiguous → clarification, unsupported, read-only schedule query, repeated request, note proposal, missing offline model (SIMULATED), online failure → fallback (SIMULATED). Structured assertions (intent, review state, date, time, route, model answered). Statuses PASS / FAIL / SKIPPED / UNAVAILABLE / CANCELLED.
- **D. No unintended writes.** Benchmark isolation option on the orchestrator (temporary chat, no history, no speech, no memory save, no "forget everything", no deciding an existing review card, low-risk commands as dry run, proposals cancelled by their own operation ids). Before/after counts of planner, chat, memory, outbox, receipts, delivery jobs and alarms plus the Online Mode setting; any change FAILs the isolation check. Nothing is deleted for clean-up. Bypassed stages are listed in the results.
- **E. Results and exports.** Latency groups per case × mode × actual path × cold/warm; n/min/max always, median n ≥ 3, p95 n ≥ 20 (nearest rank); failed/interrupted/simulated attempts visible but excluded. CSV (one row per attempt, RFC 4180, formula guard) and JSON (`lafina.devbenchmark/1`: metadata, environment, config, preflight, isolation, attempts with stages and assertions, summary). Environment: run id, timestamp with offset, app version, build type/version code, debug flag, OS/API level, manufacturer/model, model availability, suite version, connectivity. No user id, token, email, student number, planner content or memory. Custom prompt/reply redacted unless opted in. At most 5 runs kept.
- **F. Diagnostics.** "Load model now and time it" (never downloads). Cancellation, timeout, interrupted stream, mode-vs-route mismatch flag, request id isolation, timing-off behaviour, settings unchanged, no mutation of planner/memory/alarms — each covered by tests below.

Refactored: `executeLowRiskCommand` split into a read-only `planLowRisk` + unchanged transaction; new `planLowRiskCommand` dry run. `CHAT_OFFLINE_SLM_TIMEOUT_MS` moved from `ChatScreen` to `chatOrchestrator` (same value, 10 s) so the runner uses the same limit.

Deferred (follow-ups, not started): speech (STT/TTS) timing, OCR, sync and alarm benchmarking. The hub never starts the microphone or plays speech.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/ai/benchmark/requestTrace.ts` (new) | Monotonic per-request trace, path derivation, breakdown rows | A, F | `devBenchmarkTiming.test.ts` |
| `src/ai/benchmark/perfSettings.ts` (new) | Developer Mode + tracking switch with cache | A | `devBenchmarkTiming.test.ts` › instrumentation switch |
| `src/ai/benchmark/chatTimingStore.ts` (new) | In-memory last-50 chat timings | A | `devChatTiming.test.tsx` |
| `src/ai/benchmark/stats.ts` (new) | Nearest-rank percentile, median, small-sample notes | E | `devBenchmarkTiming.test.ts` › statistics |
| `src/ai/benchmark/benchmarkCases.ts` (new) | Suites and structured expectations | B, C | `devBenchmarkRunner.test.ts` |
| `src/ai/benchmark/environment.ts` (new) | Environment, online preflight, data snapshot | B, D, E | `devBenchmarkRunner.test.ts`, `devPerformanceTab.test.tsx` |
| `src/ai/benchmark/benchmarkRunner.ts` (new) | Sequential runner, assertions, cancel/timeout, clean-up, summary | B–E | `devBenchmarkRunner.test.ts` |
| `src/ai/benchmark/benchmarkExport.ts` (new) | CSV/JSON with redaction | E | `devBenchmarkTiming.test.ts` › exports |
| `src/ai/benchmark/benchmarkResultsStore.ts`, `index.ts` (new) | Keep ≤5 runs under the device owner | E | `devPerformanceTab.test.tsx` |
| `src/ui/components/profile/DeveloperPerformanceTab.tsx`, `benchmarkFiles.ts` (new) | Perf tab UI; export to cache dir + share sheet | A, B, E | `devPerformanceTab.test.tsx` |
| `src/ui/components/profile/DeveloperModal.tsx` | Adds "Perf" tab | B | `devPerformanceTab.test.tsx`, `developerSettingsUi.test.tsx` |
| `src/ui/components/profile/developerTestService.ts` | Shared Developer Mode key; refresh tracking cache on toggle/reset | A | `devBenchmarkTiming.test.ts` |
| `src/ai/chatOrchestrator.ts` | `trace`, `signal`, `benchmark` options; route facts; dry-run low-risk; isolation bypasses | A–D | `devBenchmarkRunner.test.ts`, existing chat suites |
| `src/ai/nlu/commandReview.ts` | `planLowRisk` / `planLowRiskCommand` | D | `devBenchmarkRunner.test.ts` › low-risk |
| `src/ai/nlu/intentService.ts` | Trace stages, abort signal, simulated missing model, native timing read | A, F | `devBenchmarkTiming.test.ts` › offline model timing |
| `src/skills/onlineChatSkill.ts` | Dispatch / first network data / first reply text marks; reported model | A | `devBenchmarkRunner.test.ts` › online runs |
| `src/ui/screens/ChatScreen.tsx`, `src/ui/components/chat/ChatMessageItem.tsx` | Trace per send; first/final frame marks; caption | A | `devChatTiming.test.tsx` |
| `android/…/LafinaIntentExtractorModule.kt` | Reports `timing {load_ms, inference_ms, cold}` (`SystemClock.elapsedRealtime`) | A | Kotlin compile; device NOT RUN |
| `android/…/CapstoneBuildPackage.kt` | Exposes `buildType`, `versionCode`, `versionName` | E | Kotlin compile |
| `docs/decisions/ADR-042-developer-benchmarks-and-request-timing.md` (new) | Decision record | — | — |

Note: several of these files already had uncommitted changes from earlier work and from a concurrent session (`ChatScreen.tsx`, `chatStore.ts`, `database.ts`, `App.tsx`, …), so `git diff` for them is larger than this phase.

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence path / error |
|---|---|---|---|
| New Jest suites | `npx jest __tests__/ai/devBenchmarkTiming.test.ts __tests__/ai/devBenchmarkRunner.test.ts __tests__/ui/devChatTiming.test.tsx __tests__/ui/devPerformanceTab.test.tsx` | PASS (21 + 13 + 3 + 2 = 39 tests) | run individually during the phase |
| Typecheck | `npm run preflight` (first step `tsc --noEmit`) | **FAIL — not from this phase** | `docs/reports/logs/devtest-01-preflight.log`: `src/storage/chatStore.ts(1042,18): Cannot find name 'parseMemoryChanges'`; `src/ui/screens/ChatScreen.tsx(51,9): '"../../storage/database"' has no exported member 'getDataRevision'`. Both lines come from a concurrent session's in-progress edits; no other errors. |
| Lint | `npm run lint` | **FAIL — not from this phase** (1 error, 6 warnings) | `docs/reports/logs/devtest-01-lint-jest-arch.log`: `ChatScreen.tsx:352 isTemporaryChat unused` (ChatComposer, concurrent session); no-shadow warnings in `App.tsx`, `ChatReplyText.tsx`, `RetainedTab.tsx`, `ChatScreen.tsx:348`. `npx eslint --max-warnings 0` on all files of this phase: PASS. |
| Full Jest | `npm test` (`jest --runInBand`) | **INCOMPLETE** — stopped by Claude Code after 71 suites because the PC ran low on memory; not re-run | Same log. Of the 71 suites, the FAILs (`devChatTiming`, `chatUniGuideRedesign`, `chatRedesignChatGPT`, `agyPort04ReviewUi`, `chatHistoryAndMemoryUi`, `chatHistoryPaging`, `agyPort06PlannerReplies`, `phase10HandbookRAG`, `ModernColorThemes`, …) all render `ChatScreen`, which throws `(0, _database.getDataRevision) is not a function` from the concurrent edit. `devChatTiming` passed (3/3) before that edit landed. |
| Architecture | `npm run check:architecture` | PASS (run on its own during the phase: 500 modules, 0 cycles, 0 forbidden deps) | console output; not reached in the stopped combined run |
| Android Kotlin | `JAVA_HOME=…jdk-17 gradlew :app:compileDebugKotlin` | PASS | `docs/reports/logs/devtest-01-gradle-compileDebugKotlin.log` |
| Android build | `JAVA_HOME=…jdk-17 gradlew :app:assembleDebug` | PASS (arm64-v8a and x86_64 debug APKs) | `docs/reports/logs/devtest-01-gradle-assembleDebug.log` |
| Device manual | §6 | HUMAN REQUIRED / NOT RUN | — |
| Real offline model timing | §6 | NOT RUN | needs phone with a model installed |
| Real online provider timing | §6 | NOT RUN | needs signed-in account |

No benchmark was run on a device. All numbers in Jest are from mocks and fake clocks and are not performance results.

## 4. Performance and device matrix

N/A for this phase's evidence: no baseline or new-build numbers were measured. The feature that will produce them is the deliverable. After device validation, attach the exported CSV/JSON here.

## 5. Reliability, privacy, permissions, licenses

- No new permissions, dependencies or network endpoints. Online preflight is a read-only GET; online runs use the account's normal AI quota (shown before running).
- Exports contain no user id, tokens, email, student number, planner content or memory; custom text redacted by default. Files go to the app cache (`dev_benchmarks/`) and the system share sheet.
- Risk: in a benchmark, the online request still reaches the provider and counts against quota; the preflight cannot see remaining quota.
- Risk: frame marks use the first `requestAnimationFrame` after commit; this is a close proxy, not a guaranteed pixel-on-glass time.
- Risk: if the app is killed mid-run, any proposal the run created stays in memory only until restart (review cards are not persisted), and the run result is lost.
- The debug APK loads JS from Metro; until the concurrent session finishes `getDataRevision`/`parseMemoryChanges`, Chat may fail at runtime in that build.

## 6. Human phone verification

Preconditions: install `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` (or a release build); Metro running for debug. Profile → Developer → turn on Developer Mode → open **Developer Testing Hub** → **Perf** tab.

1. Turn on "Show timing under chat replies". Go to Chat, send "Hello" offline. Expect a small "⏱ … Parser …" line under the reply; Perf tab lists it with a breakdown; "On screen" values are present.
2. Turn the switch off; send again. Expect no caption and no new entry.
3. With an offline model installed, tap "Load model now and time it". Expect a time; repeat → much shorter (warm).
4. Tap **Run Quick Offline Test** (×1). Expect progress, then results: most cases PASS; "Varied wording" PASS only with a model installed (else UNAVAILABLE); "Personal data unchanged: PASS". Check Planner, Chat history and memories are unchanged and no alarm was scheduled.
5. Signed in with internet: **Run Quick Online Test**. Expect the preflight dialog with request counts and quota notice. Run. Expect online path labels and "First text" times. Signed out / airplane mode: the dialog says preflight failed and online cases become SKIPPED.
6. Start the Extended suite and press **Cancel Run**. Expect remaining cases CANCELLED, results saved.
7. **Export CSV** and **Export JSON** → share sheet → open the files. Check no email/tokens/planner text; custom prompt shows `[redacted]` unless the keep-text switch was on.
8. **Clear benchmark results** → saved runs disappear; planner/chats untouched.

Collect: exported JSON + CSV (privacy-safe by design). The agent cannot certify any of these on a device.

## 7. Docs/ADRs changed

- `docs/decisions/ADR-042-developer-benchmarks-and-request-timing.md` (new).
- Import-cycle/forbidden-dependency check: `npm run check:architecture` — see §3.

## 8. Open blockers and recommended next steps

1. **Preflight blocked by concurrent edits** from peer session `lafina-capstone-agy-development-cont-5e`: typecheck (`parseMemoryChanges`, `getDataRevision`), lint (`ChatScreen.tsx:352` + no-shadow warnings) and every Jest suite that renders `ChatScreen`. Re-run `npm run preflight` once that work is complete and memory allows (full Jest was stopped for low memory).
2. Device validation per §6, then attach real CSV/JSON to §4.
3. Follow-up phases (not started): speech STT/TTS timing suite, OCR timing, sync round-trip benchmark, alarm delivery drift benchmark.

## 9. Review decision

- [ ] All automated required checks passing (typecheck blocked by concurrent edits, see §8)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

`STATUS: AWAITING DEVICE VALIDATION`
`STOPPED — awaiting explicit human approval`
