# Alarms (A1–A4) and five tabs (T1) / Completion Report

**Branch / commit SHA:** `Lem-branch`, on top of `5f69782` (audit 2 fixes B1–B8). This work is in the commit that adds this report.
**Date/time UTC:** 2026-11-15T05:15Z
**Device(s) available:** NONE. No phone or emulator was used in this session.
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner: "proceed fix all" (2026-11-15), after `docs/plans/alarm-feature-plan.md` and `docs/plans/tab-redesign-plan.md`. The recommended defaults were used for the four alarm decisions: local-only, briefing off by default, convert old "Alarm" reminders, default tone.

## 1. Scope completed

### T1: tabs (ADR-035)
- The bar is now Home | Schedule | **AI** (centred, raised) | Notes | Profile. Internal keys are unchanged.
- The product tour follows the new order.

### A1: native core (ADR-034)
- `AlarmSchedule.kt` holds the pure rules:
  - next trigger: repeat days, one-shot, DST gap and overlap, timezone;
  - snooze;
  - the definition codec, now `a2`, which still reads `a1`;
  - the event queue and the registry.
- `LafinaAlarms.kt` books with `setAlarmClock` and falls back to `setAndAllowWhileIdle`. It also handles restore after boot, update, time and timezone changes, and exact-alarm permission changes.
- `AlarmFireReceiver` books a repeating alarm's next occurrence before ringing.
- `LafinaAlarmService` is a foreground `mediaPlayback` service:
  - `USAGE_ALARM` default tone, looped, ramping up over 30 s;
  - vibration and a wake lock;
  - stops after 10 minutes;
  - native Dismiss and Snooze.
- `AlarmRingingActivity` is a native full-screen screen over the lock screen and never uses the microphone.
- `LafinaAlarmModule` provides `reconcile`, `drainEvents`, `testAlarm`, `stopRinging`, `getStatus` and `openBatterySettings`.

### A2: data and UI
- Migration 27 adds the `alarms` table. `alarmsStore` handles generations, one-shot dates, validation and the 50-alarm limit; Clear All Data deletes alarms.
- `alarmService`:
  - serialized reconcile, with none when signed out;
  - event drain and one-shot completion;
  - health checks and OEM battery guidance.
- UI:
  - **Schedule → Alarms** switch, with the list, toggles, editor (time, repeat chips, label, snooze, vibrate, briefing), health issues with fixes, and "Test alarm in 1 minute";
  - Home **Next alarm** card;
  - Profile "Alarm & Reminder Health".

### A3: language and agent
- Intents:
  - `create_alarm`, `update_alarm`, `delete_alarm` and `toggle_alarm` are review cards (`alarmReview.ts`) with generation fencing;
  - `list_alarms` is answered locally.
- The fast path reads English and Taglish:
  - "wake me up at 5:30 on weekdays", "set a 5:30 alarm every monday and wednesday", "turn my alarm back on", "change my 6am alarm to 6:30";
  - "gisingin mo ako ng 6 bukas", "alarm ko 5:30 tuwing weekdays", "patayin mo yung alarm ko".
  - A bare hour means the morning.
- Online, DeepSeek extraction is skipped for recognised alarms. It may add only `create_alarm`, and the repeat comes from the student's own words.
- Agent:
  - `prepare_lafina_action` gains `create_alarm`, `toggle_alarm` and `enabled`; there is no delete;
  - `read_lafina_data` gains kind `alarms`, with labels fenced as untrusted;
  - the tool contract was regenerated.
- Eval: 19 alarm cases were added, and the frozen intent contract v3 adds 6 alarm cases.

### A4: migration and briefing
- Pending "Alarm" / "Wake up" reminders that are still due become alarms at start-up.
  - This happens in one transaction, together with the removal of the reminder and its linked companion "Alarm" to-do, through the outbox.
  - It is idempotent through `source_reminder_id`.
- Morning briefing (per alarm, off by default):
  - Dismiss on the ringing screen opens LAFINA, unlocking first if needed;
  - `react-native-tts` reads today's schedule from local data, if the app opens within 10 minutes of Dismiss.

### Deviations from the plans
1. **The Home card is fixed, not customizable.** It is a card above the widgets that hides itself without an alarm, instead of a customizable widget.
2. **SmolLM2 is unchanged** (not given alarm intents). It only cleans titles for task, block and reminder creation; alarm intents return before it runs.
3. **No conversion notice yet.** Decision 3 mentioned "a one-time note to the student" after conversion. The conversion runs, but no note is shown yet (open item 3).
4. **DST gap:** a 2:30 alarm on a spring-forward day rings at **3:30** (shifted by the gap, java.time's rule), not 3:00 as the plan said.
5. **Briefing from the notification:** Dismiss from the notification cannot open an activity on Android 10+. The briefing then plays only if the student opens LAFINA within 10 minutes.
6. **"wake up at 7:30"** without "me" stays a to-do titled "Wake up", as before. Only "wake me (up)" means an alarm.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/ui/components/CustomTabBar.tsx`, `src/ui/tour/tourSteps.ts` | Five tabs, AI centred; tour order | T1 | `__tests__/ui/phase01ThemeAndTour.test.tsx` |
| `android/.../AlarmSchedule.kt`, `LafinaAlarms.kt`, `AlarmFireReceiver.kt`, `LafinaAlarmService.kt`, `AlarmRingingActivity.kt`, `LafinaAlarmModule.kt`, `CapstoneBuildPackage.kt`, `AndroidManifest.xml` | Native alarm core; codec `a2` adds `briefing` | A1, A4 | `AlarmScheduleTest` 13/13 |
| `scripts/check-architecture.mjs` | Allow `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | A1 | preflight architecture PASS |
| `src/storage/alarmSchema.ts`, `alarmsStore.ts`, `dbInit.ts` (v27), `accountDataReset.ts`, `index.ts` | Alarms table and store | A2 | `__tests__/scheduler/alarms.test.tsx`, `schemaMigrations.test.ts` |
| `src/scheduler/alarmSchedule.ts`, `alarmService.ts`, `index.ts`, `App.tsx` | JS mirror, reconcile and events, lifecycle | A2 | `alarms.test.tsx` |
| `src/ui/screens/calendar/CalendarScreen.tsx`, `components/AlarmsView.tsx`, `AlarmEditorModal.tsx`, `dashboard/components/NextAlarmCard.tsx`, `DashboardScreen.tsx`, `profile/ReminderHealth.tsx`, `ProfileScreen.tsx`, `navigation/callNavigation.ts` | Schedule → Alarms, Home card, health | A2 | `alarms.test.tsx`, `agyPort09ProfileHealth.test.tsx` |
| `src/ai/nlu/types.ts`, `intentRoutes.ts`, `fastPathParser.ts`, `alarmReview.ts`, `commandReview.ts`, `actionExecutor.ts`, `onlineIntentExtractor.ts` | Alarm intents, parser, review cards | A3 | `__tests__/ai/alarmLanguage.test.ts` (35) |
| `src/ai/voiceActions/actionRegistry.ts`, `actionValidator.ts`, `structuredAction.ts`, `src/cloud/voiceConversation/localVoiceData.ts`, `personaPolicy.ts`, `backend_integration/call_lafina_v2/tool-contract.json` | Agent alarm tools | A3 | `alarmLanguage.test.ts`, `generate-contract.cjs --check` |
| `__tests__/fixtures/agentEvalCases.ts`, `__tests__/evaluation/agentEval.test.ts`, `evaluation/intent-contract-v3.json`, `fixture-manifest-v1.json`, `evaluationContracts.test.ts` | Eval 52→71 cases; frozen v3 (v1/v2 bytes untouched) | A3 | `docs/reports/agent-eval-alarms-2026-11-15.json` |
| `src/scheduler/alarmMigration.ts`, `src/ai/briefing/morningBriefing.ts` | Conversion; briefing | A4 | `__tests__/scheduler/alarmMigrationAndBriefing.test.ts` (7) |
| `docs/decisions/ADR-034-device-local-alarms.md`, `ADR-035-five-tab-layout.md` | Decisions | — | — |

**Backend** (LAFINA-backend, by PR only):
- [PR #7](https://github.com/LAFINA-AI/LAFINA-backend/pull/7), branch `claude/chat-agent-quota-alarm-tools` from `main` `417f242`.
- It carries audit-2 **B5** (one Chat question charged once; continuation steps metered as `chat_agent_step` at 3× the chat limit; more than three tool rounds refused) and the alarm contract.
- PR #5 had already been merged at `25de26c`, so this went to a new PR. The note briefly added to #5's description was removed again.

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence |
|---|---|---|---|
| Typecheck + lint + Jest + architecture | `npm run preflight` | **PASS**: 129/129 suites, 1798 passed, 1 skipped; 333 modules, 0 cycles | local log (scratchpad `preflight_final2.log`) |
| Agent eval (offline) | `AGENT_EVAL_OUTPUT=docs/reports/agent-eval-alarms-2026-11-15.json npx jest __tests__/evaluation/agentEval.test.ts` | **61/71** (alarm 17/17; baseline raised 42→61) | `docs/reports/agent-eval-alarms-2026-11-15.json` |
| Tool contract | `node backend_integration/call_lafina_v2/generate-contract.cjs --check` | **PASS**, 14 tools | — |
| JVM unit tests | `gradlew :app:testDebugUnitTest` | **PASS**: 71 tests in 8 suites, 0 failures (`AlarmScheduleTest` 13) | `android/app/build/test-results/testDebugUnitTest/` |
| Android build | `gradlew :app:assembleDebug` | **PASS**: `app-arm64-v8a-debug.apk`, `app-x86_64-debug.apk` | `android/app/build/outputs/apk/debug/` |
| Backend tests | `python -m pytest -q` (backend clone, PR #7 branch) | **PASS**: 280 passed | — |
| Backend lint | `ruff check` on changed files | No new findings (33 before / 33 after; 237 repo-wide before / after) | — |
| Device: alarm rings, Doze, reboot, OEM | see §6 | **NOT RUN**: no device | — |
| Online DeepSeek / ElevenLabs with alarm tools | — | **NOT RUN**: needs PR #7 deployed and the agent re-provisioned | — |

## 4. Performance and device matrix

N/A for this change, apart from alarm drift, which is **NOT RUN** (it needs a device). Nothing here claims an alarm rang: Jest mocks `NativeModules.LafinaAlarm`.

## 5. Reliability, privacy, permissions, licenses

- **New permission:** `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. The existing `USE_EXACT_ALARM` and `USE_FULL_SCREEN_INTENT` need the Play declaration to say that alarms are a core function.
- **Privacy:**
  - Alarms never leave the phone (not synced, not sent to the backend).
  - The agent reads alarm labels only as fenced, untrusted data.
  - The briefing uses local data and on-device TTS only.
- **Microphone:** the ringing screen never opens it.
- **Licences:** no bundled audio; the system default alarm tone is used.
- **Known risks:**
  - OEM battery savers (Xiaomi, Oppo, Vivo, Samsung and others) may still stop alarms; guidance is shown, but this is unverified on devices.
  - Full-screen intent may be denied on Android 14+; a heads-up notification is the fallback, also unverified.

## 6. Human phone verification

See the checklist in the chat handoff. It covers: install the debug APK; create alarms by UI and by voice or Chat; ring on silent, locked, in Doze, after reboot and after a timezone change; snooze and dismiss with the app killed; briefing; conversion of an old "Alarm" reminder; tab layout at small widths. The agent cannot certify any of these.

## 7. Docs/ADRs changed

- ADR-034 (alarms) and ADR-035 (tabs).
- Plans updated with implementation status and deviations: `docs/plans/alarm-feature-plan.md`, `docs/plans/tab-redesign-plan.md`.
- `docs/reports/agent-audit-2-2026-11-15.md`: status of B1–B8.
- Import-cycle check: `node scripts/check-architecture.mjs` reports 0 cycles.

## 8. Open blockers and recommended next steps

1. **Device validation** of every alarm path (highest priority; see the checklist).
2. Merge backend PR #7, then re-provision the ElevenLabs agent (`provision_voice_agent --apply --update`, then `--check`) so Call Lafina has the alarm actions.
3. Show a one-time note after old "Alarm" reminders are converted (deviation 3).
4. Optional later: an alarm sound picker; a customizable Home widget; alarm sync as an eighth entity, if the owner wants it.

## 9. Review decision

- [x] All automated required checks passing
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change (no Kokoro, no wake word, no always-on mic, no business/Gmail/study tools)
- [x] Report accurate; links point to files in this commit

`STATUS: AWAITING DEVICE VALIDATION`, then `STOPPED — awaiting explicit human approval`.
