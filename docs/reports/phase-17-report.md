# Phase 17 — Tab switching and application performance

**Date:** 2026-11-17 (Asia/Manila).  
**Branch / base commit:** `feature/uniguide-inspired-ui-overhaul` / `1757a0a`; substantial existing working-tree changes were preserved. Exact inspected file hashes are in the evidence directory.  
**Approval:** Owner: “approved, proceed to fix everything without stopping.” Subsequent owner instruction: “continue.” This authorizes the complete performance plan without intermediate phase approval pauses. The six plan stages were implemented within this performance phase.  
**Device:** Infinix X6880, Android API 35, ARM64; display reports 1080×2436 at approximately 60 Hz during testing; no private serial included.  
**Status:** AWAITING DEVICE VALIDATION. Implementation, automated checks and the final 60-round physical-phone navigation trace are complete. Human acceptance under real-user scroll/drag/keyboard, authenticated sync and live-call load remains pending.

## 1. Scope completed

- Lazy, account-keyed retained tabs use React Activity: UI state survives navigation; hidden effects are cleaned up. Native modal visibility is gated in a separate overlay boundary so the screen itself does not subscribe to tab visibility.
- Memoized screen roots and stable callbacks isolate sibling tab changes. Home remains retained and memoized. Call meter updates and duration ticks belong to the mini call bar rather than AppContent.
- In-memory table revisions are published after committed SQLite writes, with rollback discarding pending invalidations. Screen subscriptions select relevant tables. Native alarm/reminder writes are invalidated on app resume. No schema, outbox transaction, durability, reminder acknowledgment or entitlement semantics were relaxed.
- Month/Week schedules initially render 20 items with explicit expansion; Day view limits each hour independently so a busy hour does not hide later appointments. The selected date and expanded page survive warm tab navigation. Full stored data remains available.
- Calendar shares a planner-window snapshot across block/event/task loaders, caches unchanged range/revision reads, skips repeated visibility/class-summary work on warm activation, queries class blocks specifically, and leaves the closed View Classes modal uninitialized.
- Notes does not fetch full task rows merely to display the To-Do badge. To-Do task reads are limited to an initial 100 rows with explicit expansion and SQL search across the owner's full task dataset. Existing ordering/filtering and exact pending task counts remain. Checklist bodies are parsed in small yielding batches and reused by local revision; deleted entries are pruned. A temporary ellipsis avoids presenting an incomplete badge as a final count.
- Notes grid and To-Do sections are virtualized. Grid drag coordinates account for the virtualized cell origin and section-header offset. Grid preview parsing is bounded to a 4,000-character projection, leaving the authoritative note/editor text intact.
- Notes search debounces input for 150 ms and indexes at most eight notes with a 50,000-character soft batch budget. Existing per-note indexing bounds and search ownership rules remain. Completed search cache coverage is unchanged; the soft budget may be exceeded by the final individual note, as in the original batching contract.
- Chat renders the newest messages first in an inverted, paginated list: 12 initial items rather than 50. Earlier paging preserves position, completed message rows are memoized, attachment callbacks are stable, and a warm visit reuses history without the initial opacity reveal. Model status checks are throttled during routine activation, while explicit model/download updates force a fresh status read. Duplicate initial connectivity reports are coalesced.
- Detailed Profile statistics reuse an owner/minute/revision snapshot; a cheap storage probe prevents cached values from concealing a read failure.
- Splash minimum timing is reduced from 1,740 ms to 600 ms after mount for normal motion; readiness remains required. Reduced-motion timing is honored. These are configured durations, not startup measurements.
- An isolated `.performance` release-mode APK provides opt-in synthetic fixtures and query/JS timing telemetry. Ordinary builds have the harness disabled. No production account or existing installed app was overwritten.

## 2. Change summary

| Module | Change | Evidence |
|---|---|---|
| App / RetainedTab / ScreenOverlays | Lazy state retention, account reset, inactive effect/portal behavior, stable callbacks | performanceTabLifecycle, screen suites |
| Database / useStorageRevision | Commit-aware table invalidation and native resume invalidation | rollback, subscription and query tests |
| LiveMiniCallBar | Meter isolation and local duration timer | existing call/mini bar checks; real live-call acceptance remains manual |
| Calendar hooks / class reads / schedule views | Shared range snapshot, warm query reuse, lazy modal reads, bounded visible rows with expansion | Calendar read-error, warm activation and calendarSchedulePagingPerformance tests |
| Notes / To-Do hooks and virtual lists | Bounded task queries, incremental checklists, debounced search, virtual layout | Notes consistency, To-Do integration, pagination tests |
| Chat / message rows | Inverted viewport, retained history, isolated rows, explicit model refresh | history paging, history/memory and model sheet tests |
| Profile statistics / splash | Revision cache, read-error behavior, shorter motion-aware splash | Profile/storage and existing splash tests |
| Android build / measurement script | Isolated release-mode package, telemetry and synthetic data | Gradle logs and guarded-fixture test |

## 3. Tests and actual outcomes

Evidence directory: `docs/reports/evidence/performance-20261117/`.

| Check | Exact command | Result / evidence |
|---|---|---|
| Final complete preflight | `npm run preflight` | PASS (`preflight-final.log`): TypeScript, ESLint, 146 Jest suites / 2,027 tests passed, one skipped; architecture gate: 380 modules, zero cycles or forbidden dependencies |
| Calendar paging and current-time behavior | `npx jest --runInBand __tests__/ui/calendarSchedulePagingPerformance.test.tsx __tests__/ui/phase02CalendarAndNotesScreens.test.tsx` | PASS: 16 tests / two suites (`calendar-day-budget-tests.log`); verifies complete item reachability and later-hour visibility |
| Lifecycle / retention | `npx jest --runInBand __tests__/ui/performanceTabLifecycle.test.tsx` | PASS in complete preflight; also prior combined lifecycle/overlay run (`overlay-isolation-tests.log`) |
| Formatter | Targeted `npx prettier --check` on performance files, including all three Calendar views | PASS (`format-check.log`, `calendar-format-final.log`); unrelated files were not reformatted wholesale |
| Android builds and native tests | JDK 17; `android/gradlew.bat :app:assemblePerformance :app:assembleRelease :app:testDebugUnitTest -PreactNativeArchitectures=arm64-v8a --no-daemon` | PASS (`gradle-final.log`): 620 tasks, 15 executed / 605 up-to-date. Native tests up-to-date after prior successful run: 76 tests / eight suites, zero failures/errors (`native-tests.json`) |
| Isolated test APK installation | `adb install -r android/app/build/outputs/apk/performance/app-arm64-v8a-performance.apk` | PASS; separate `com.lafina.capstone.performance`, synthetic data only |
| Final repeated navigation | `scripts/measure-tab-switches.ps1 -Rounds 60 -OutputDirectory docs/reports/evidence/performance-20261117/device-final-60-streamed` | COMPLETE: 300 expected / 300 received, all warm; see raw JSON, frame and memory snapshots |

Initial JDK 25 native configuration failed; using installed JDK 17 succeeded. Earlier test failures led to fixes for first-load chat errors, explicit model/download refresh, cached Profile read failures and search lifecycle handling. Tests asserting old chat presentation order and batch sizes now exercise the new presentation and bounded-work behavior.

Voice/parser files and tests changed concurrently in this checkout and were preserved. Earlier failed runs and the limited old-database resolver comparison are diagnostic history, not controlled baselines or proof that those failures belonged to this performance work. The final checks above are authoritative for their recorded source state.

## 4. Performance and device matrix

**Original whole-app baseline: NOT RUN.** The installed main app could not be tied to this source state. The valid comparison is narrower: the initial performance fixes were already present in the 30-round pre-Calendar-budget build. That trace exposed an unbounded selected-day list. Month/Week and crowded Day-hour rendering were then bounded, followed by a complete final 60-round trace on the same phone and synthetic data. Runs were sequential, not randomized; background activity, thermal state and concurrent checkout changes were not controlled as in a laboratory A/B test.

Fixture: 500 tasks (a deliberately crowded selected day), 100 longer Markdown/checklist notes, 32 recurring class blocks and 80 chat messages. Initial fixture creation and cold first visits are excluded from the warm trace. The ordinary preview does not seed fixtures or emit this telemetry. Both test APK hashes are recorded in compact JSON summaries. The final streamed 60 rounds followed the earlier extended run in the same app process; see `device-ui-checks.md` for this additional warm-up and log-buffer limitation.

Instrumentation measures **JS press-handler → React layout commit** and the next JS animation callback. It excludes native input dispatch, first-presented pixels and fully usable-screen latency. All final samples are warm; each tab has 60 samples. Android frame statistics describe the whole repeated-navigation interval, not per-tab tap latency.

| Tab | n | Final JS commit p50 ms | Final JS commit p95 ms | Next JS animation p95 ms | Before Calendar bound: JS commit p95 ms (n=30) |
|---|---:|---:|---:|---:|---:|
| Home | 60 | 49.7 | 71.7 | 121.8 | 131.9 |
| Schedule | 60 | 50.5 | 66.4 | 83.4 | 123.1 |
| AI | 60 | 26.8 | 37.9 | 77.0 | 100.2 |
| Tools | 60 | 27.4 | 41.1 | 59.9 | 94.9 |
| Profile | 60 | 30.4 | 51.1 | 72.0 | 88.8 |

Native views retained after visiting all tabs: **6,198 → 2,087**. Peak **sampled** PSS: **927.6 → 449.8 MiB**. These are periodic snapshots, not continuous peak allocation measurements.

Final memory snapshots (MiB): after: 406.0, before: 336.8, round-10: 435.0, round-20: 424.7, round-30: 449.8, round-40: 415.4, round-50: 397.2, round-60: 417.0. Memory reclamation/variation is visible; this finite run is not proof of leak freedom or a long-session plateau.

**Android frame statistics, final run:**

```text
Applications Graphics Acceleration Info:
Uptime: 159274345 Realtime: 271395916

** Graphics info for test process [com.lafina.capstone.performance] **

Stats since: 159032208388170ns
Total frames rendered: 1838
Janky frames: 368 (20.02%)
Janky frames (legacy): 599 (32.59%)
50th percentile: 17ms
90th percentile: 53ms
95th percentile: 73ms
99th percentile: 81ms
Number Missed Vsync: 0
Number High input latency: 1842
Number Slow UI thread: 300
Number Slow bitmap uploads: 334
Number Slow issue draw commands: 265
Number Frame deadline missed: 368
Number Frame deadline missed (legacy): 300
```

The earlier pre-bound run had 957 rendered frames, 240 janky frames (25.08%) and frame p95 400 ms. The intermediate Month/Week-bound run had 828 frames, 178 janky (21.50%) and frame p95 81 ms. Remaining deadline misses are a real limitation: a sub-100 ms JS commit does not establish consistently smooth 60 Hz presentation. Real-user acceptance and more focused native profiling remain necessary if that latency is noticeable.

Evidence: `device-warm-30/tab-timings.json`, `calendar-budget-before-summary.json`, `device-calendar-budget-30/`, `device-final-60-streamed/`, `device-final-summary.json`, source hashes and build/test logs. Missing-sample sleeping/lock pilots remain nonqualifying. The first extended `device-final-60/` run lost early timings to the 256 KiB shared phone log ring; it is not used for timing acceptance. The final script streams logcat to disk during navigation and verifies all 300 samples. Speech/alarm timing is outside this performance trace and was NOT RUN.

## 5. Reliability and scope

- Only this checkout was edited. Existing uncommitted work was retained; no commit, push, backend write, deployment or legacy repository edit was made.
- Account-bound retained trees reset on account changes. Hidden effects/BackHandlers are cleaned up. Active modal portals are hidden without making ordinary closed overlays remount on every visit.
- No Kokoro, new cloud provider, entitlement bypass, autonomous execution, always-on microphone or alarm timing changes were introduced.
- The performance APK is a test artifact with synthetic data. The normal preview APK retains the repository's existing preview/debug signing convention and must not be treated as a store release.
- Existing Jest suites print expected injected-error logs and some act warnings. A green suite is not proof of phone frame rate or real speech/call delivery.

## 6. Human phone verification

Install/open the normal preview APK for real-user acceptance, or use the separate `.performance` APK for synthetic measurements. Unlock the phone and keep it awake during a trace.

1. Run Home → Schedule → AI → Tools → Profile → Home for at least 30 complete rounds. Every tap must register; compare first-entry and warm measurements separately. Expect preserved scroll, date/view/filter and applicable drafts, with no blank chat reveal or hidden modal intercepting touches.
2. In Schedule, change Month/Week/Day and dates; load the next page of a crowded schedule and verify every item remains reachable, including later hours. Add/edit a local item, leave/return and verify updated data. Toggle layer visibility and verify Home and Schedule agree.
3. In Tools, scroll grid/list modes, load more notes and to-dos, search for a task beyond the first page, drag notes after loading the complete unfiltered collection, and tick a note checklist. Expect correct positions, full saved note contents, and consistent counts after loading.
4. In AI, verify latest message positioning, earlier-history paging, streamed answers, reply format changes, model download/selection status, temporary-chat privacy, review expiry and account isolation.
5. Open/close Profile statistics and settings; verify fresh counts after mutations. Minimize a consenting live call, navigate every tab and verify controls/audio while the rest of the UI stays responsive. This live provider/audio test is NOT RUN here.
6. Repeat during sync, after background/resume, and after logout/account switching. Verify alarm/reminder changes from native Android are refreshed. Record CPU/PSS/frame traces and check that memory stabilizes across rounds.

Agent-run complete warm navigation is VERIFIED (300/300 samples). Human acceptance still NOT RUN/NOT CONFIRMED: real-user scroll/drag/keyboard/accessibility, authenticated sync/minimized-call load, long-session memory behavior, and speech/alarm reliability. Targeted physical Calendar observations are recorded in `device-ui-checks.md`.

## 7. Documentation and evidence

This report follows `templates/PHASE-REPORT.md`. `scripts/measure-tab-switches.ps1` is the repeatable synthetic-device protocol. Source hashes distinguish this work from concurrent checkout edits. React Activity support was checked in the installed React 19.2 / React Native Fabric renderer and against [official React documentation](https://react.dev/reference/react/Activity).

## 8. Remaining validation

Human acceptance of real-user navigation and editing, keyboard/accessibility, concurrent sync and a consenting live call remains pending. The warm JS commit target is a useful proxy, not native tap-to-usable qualification. Native frame deadline misses remain and must not be described as eliminated. No unrelated next phase was started.

## 9. Review decision

- [x] Performance implementation completed across the approved plan.
- [x] Automated preflight and Android verification passed at the recorded checked revisions.
- [x] Final complete 60-round phone performance trace collected.
- [ ] Human acceptance under real-user and authenticated load completed.
- [x] No backend/legacy writes or fabricated benchmark results.

Owner approval already covers the complete performance task; no new per-stage approval is requested.

## Final artifact and environment handoff

Normal ARM64 preview: `android/app/build/outputs/apk/release/app-arm64-v8a-release.apk` (123,078,808 bytes). It has synthetic seeding/telemetry disabled and uses the repository's existing preview signing configuration. It was built but not installed over the owner's app. The separate `.performance` test package remains installed. Final artifact hashes/sizes are in `verification.json`.

The phone initially slept/locked during pilot runs. The owner unlocked it; no PIN or credential was requested, entered or bypassed. The plugged-in stay-awake setting was temporarily enabled and restored to its original value `0` after testing. Test-app notification permission was declined; the existing main app's data and permissions were preserved.

Final complete checks: `preflight-final.log`, `gradle-final.log`, `calendar-format-final.log`; final phone evidence: `device-final-summary.json` and `device-final-60-streamed/`. The measured improvement is scoped to the crowded Schedule follow-up, not the whole original plan against a measured original-app baseline.
