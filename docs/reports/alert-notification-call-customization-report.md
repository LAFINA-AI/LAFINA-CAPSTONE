# ALERT-01..04 — Alert Tones, Notifications & AI Reminder Call Customization / Completion Report

**Branch / commit SHA:** `codex/skills-hub` @ `f03f128` (+ uncommitted workspace changes)  
**Date/time UTC:** `2026-11-21T11:39:56Z`  
**Device(s) available:** `NONE`  
**Status:** `AWAITING DEVICE VALIDATION`  
**Phase approval provenance:** Owner approved continuous execution across all 4 phases on `2026-11-21` (`"APPROVE, Continue developing without stopping - report back to me when its finished. i'll test it my self"`).

## 1. Scope completed

All four phases of `docs/plans/alert-notification-call-customization-plan.md` were newly implemented (zero legacy imports outside student scope):

- **ALERT-01 (Tone Foundation, Native Picker & Preferences Store):**
  - Reproducible generator `scripts/generate-alert-tones.mjs` + 4 synthesized 16-bit PCM WAV tones in `android/app/src/main/res/raw/` (`lafina_tone_gentle.wav`, `lafina_tone_chime.wav`, `lafina_tone_classic_ring.wav`, `lafina_tone_urgent.wav`; 357,386 bytes total).
  - Pure-Kotlin `AlertPreferencesContract.kt` (URI sanitization, bundled lookup, alarm/call/notify vibration waveforms, clamp helpers, deterministic FNV-1a dynamic channel IDs, overnight quiet-hours calculation) + `AlertPreferencesStoreNative.kt` (`SharedPreferences` mirror `lafina_alert_prefs_v1`, per ADR-016).
  - `LafinaSoundPickerModule.kt` registered in `CapstoneBuildPackage.kt` (`listBundledTones`, `pickSystemTone` via `RingtoneManager.ACTION_RINGTONE_PICKER`, `resolveToneTitle`, `previewTone` / `stopPreview`, `openChannelNotificationSettings`).
  - Device-local `alertPreferencesStore.ts` stored per `userId` in `local_settings`, preserved on Clear All Data (ADR-025), transferred cleanly on guest sign-in (`guestMigration.ts`), and synced to Android native via `alertPreferencesSync.ts` + `App.tsx`.
- **ALERT-02 (Alarm Tone, Vibration Pattern & Volume Ramp):**
  - `LafinaAlarmService.kt` reads per-alarm `soundUri`, falls back to global `defaultAlarmSoundUri` then Android default alarm/ringtone URIs, honors configured `alarmVolumeRampSec` (`0`, `15`, `30`, `60s`), and applies `alarmVibrationPattern` while keeping the never-silent-and-still safety invariant (`STANDARD_ALARM_WAVEFORM` when tone fails).
  - `LafinaAlarmModule.kt`, `LafinaAlarms.kt`, `AlarmFireReceiver.kt`, and `alarmService.ts` support `setAlarmAudioPreferences` and `testAlarmWithSound`.
  - Reusable `TonePickerModal.tsx` with Play/Stop tone preview, bundled tones, system tone picker, and Silent control (`allowSilent={false}` on alarms).
  - `AlarmEditorModal.tsx` adds an **Alarm sound** picker row wired to `soundUri`.
- **ALERT-03 (Notifications: Delivery Default, Dynamic Channels, Snooze, Privacy & Quiet Hours):**
  - `LafinaReminderModule.kt` computes dynamic versioned Android 8+ notification channels (`lafina_notify_<8hex>`) from sound URI, vibration toggle/pattern, and lock-screen privacy, deletes retired LAFINA dynamic channels, uses configured `"Snooze N min"` action labels (`5 / 10 / 15 / 30`), and respects `VISIBILITY_PUBLIC` vs `VISIBILITY_PRIVATE`.
  - `reminderDeliveryStyleStore.ts` (`getExplicit`), `reminderDeliveryPolicy.ts` (`resolveReminderDeliveryStyle`), `notifyOnlyDelivery.ts` (`getNotifySnoozeMinutes`), `reminderAlarm.ts`, and `App.tsx` resolve delivery in precedence: explicit per-reminder override > global `defaultReminderDeliveryStyle` > sleep-time quiet-hours downgrade (`sleepTime..wakeTime`).
  - `AlertAndNotificationSettings.tsx` modal wired into **Profile → Notifications → Alert Tones & Notifications**.
- **ALERT-04 (AI Reminder Calls: Ringtone, Timeout, Answer Mode, Greeting Style & Retries):**
  - `LafinaReminderModule.kt` computes dynamic call channels (`lafina_call_<8hex>`), deletes retired dynamic call channels, respects custom `callRingtoneUri` (`silent`, bundled, or system URI with fallback) in `showIncomingCall` and `startRingtone`, and enforces configurable `callRingTimeoutSec` (`30 / 45 / 60s`).
  - `userPreferences.ts` applies `callSnoozeMinutesOverride` and `callMaxAutoSnoozesOverride`.
  - `callDispatcher.ts` parameterizes `buildAnnouncement` and `buildOnlineAnnouncement` across `'friendly' | 'concise' | 'urgent'` and adds `buttonsOnly` mode (skips `LafinaReminderService` microphone service and TTS readout & confirmation speech).
  - `IncomingCallScreen.tsx` synchronously reads `alertPreferencesStore.read(userId)` via `useMemo` on open so configured vibration (`off`/`gentle`/`standard`/`urgent`), ring timeout, caller subtitle, and answer mode (`auto_online` / `offline_voice` / `buttons_only` skipping `RECORD_AUDIO` prompt) apply on frame 1 without breaking 6-arg `answerCall` callers for default `'friendly'` greetings.
  - `ReminderCallSettings.tsx` modal wired into **Profile → Notifications → Reminder Call Settings** with quick links to Offline Voice, Online Voice · ElevenLabs, Preview Reminder Call, and Android Call Channel Settings.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `scripts/generate-alert-tones.mjs`, `android/app/src/main/res/raw/*.wav` | Synthesize 4 license-free offline tones | Built-in tone choices without external assets | Generator exit 0; bundled into debug APKs |
| `android/app/src/main/java/com/lafina/capstone/AlertPreferencesContract.kt` | Pure-Kotlin contract (URI sanitize, waveforms, channel hash, clamp, quiet hours) | Shared native rules & JVM testability | `AlertPreferencesContractTest` (6/6 PASS) |
| `android/app/src/main/java/com/lafina/capstone/AlertPreferencesStoreNative.kt` | `SharedPreferences` (`lafina_alert_prefs_v1`) native mirror | Native access without opening `lafina.db` (ADR-016) | `gradlew testDebugUnitTest assembleDebug` |
| `android/app/src/main/java/com/lafina/capstone/LafinaSoundPickerModule.kt`, `CapstoneBuildPackage.kt` | Native picker, bundled listing, title resolver, preview player, channel settings intent | System & bundled sound selection/preview | `alertCustomizationUi.test.tsx`; `gradlew assembleDebug` |
| `android/app/src/main/java/com/lafina/capstone/LafinaAlarm*.kt`, `AlarmFireReceiver.kt` | Default alarm tone fallback, vibration waveforms, configurable ramp, test alarm sound | Customizable alarm audio (ALERT-02) | `gradlew testDebugUnitTest assembleDebug` |
| `android/app/src/main/java/com/lafina/capstone/LafinaReminderModule.kt` | Dynamic notify/call channels, channel cleanup, privacy, snooze label, ringtone & timeout | Customizable notifications & call ringing (ALERT-03/04) | `LafinaReminderTest` (3/3 PASS); `gradlew assembleDebug` |
| `src/storage/alertPreferencesStore.ts`, `src/storage/index.ts`, `src/storage/guestMigration.ts`, `src/storage/reminderDeliveryStyleStore.ts` | Device-local settings store, guest transfer, explicit override lookup | Persist alert/notification/call settings per account | `alertPreferencesStore.test.ts`; `notifyOnlyDelivery.test.ts` |
| `src/scheduler/soundPicker.ts`, `alertPreferencesSync.ts`, `reminderDeliveryPolicy.ts`, `notifyOnlyDelivery.ts`, `reminderAlarm.ts`, `userPreferences.ts`, `callDispatcher.ts`, `alarmService.ts`, `index.ts`, `App.tsx` | JS bridge, quiet-hours & delivery policy, snooze/retry overrides, greeting styles, `buttonsOnly` mode | Apply customization across scheduling & calls | `alertCustomization.test.ts`; `onlineReminderCall.test.tsx` |
| `src/ui/components/alerts/TonePickerModal.tsx`, `src/ui/screens/calendar/components/AlarmEditorModal.tsx` | Tone picker modal & alarm sound selector row | Alarm tone UI (ALERT-02) | `alertCustomizationUi.test.tsx`; `alarms.test.tsx` |
| `src/ui/components/profile/AlertAndNotificationSettings.tsx`, `ReminderCallSettings.tsx`, `src/ui/screens/ProfileScreen.tsx`, `src/ui/screens/IncomingCallScreen.tsx` | Profile customization sheets & `IncomingCallScreen` runtime integration | Notification & AI call customization (ALERT-03/04) | `alertCustomizationUi.test.tsx`; `callDispatcherAndCallScreen.test.tsx`; `onlineReminderCall.test.tsx` |
| `jest.setup.js`, `android/.../AlertPreferencesContractTest.kt`, `__tests__/storage/alertPreferencesStore.test.ts`, `__tests__/scheduler/alertCustomization.test.ts`, `__tests__/ui/alertCustomizationUi.test.tsx` | Native mocks + unit/UI coverage | Automated verification of all 4 phases | `npm run preflight` & `gradlew testDebugUnitTest` |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | PASS/FAIL/NOT RUN/HUMAN REQUIRED | Evidence path / error |
|---|---|---|---|
| Tone generation | `node scripts/generate-alert-tones.mjs` | PASS | 4 WAV files in `android/app/src/main/res/raw/` (357,386 bytes) |
| Typecheck | `npm run typecheck` (part of `npm run preflight`) | PASS | Exit 0 (`tsc --noEmit`) |
| Lint | `npm run lint` (part of `npm run preflight`) | PASS | Exit 0 (`--max-warnings 0`) |
| Jest full suite | `npm test` (part of `npm run preflight`) | PASS | 192/192 suites passed; 2,556 passed, 1 pre-existing skipped, 2,557 total |
| Architecture & import cycle check | `npm run check:architecture` (part of `npm run preflight`) | PASS | 472 TS modules, 0 import cycles, 0 forbidden dependencies |
| Android JVM unit tests | `Push-Location android; .\gradlew.bat testDebugUnitTest assembleDebug; Pop-Location` | PASS | 11 suites / 107 tests passed (`AlertPreferencesContractTest` 6/6, `AlarmScheduleTest` 13/13, `LafinaReminderTest` 3/3) |
| Android Debug APK build | `Push-Location android; .\gradlew.bat testDebugUnitTest assembleDebug; Pop-Location` | PASS | `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`, `app-x86_64-debug.apk` |
| Physical Android device audio/UI/channel checks | Manual verification on Android phone (see §6) | NOT RUN — HUMAN REQUIRED | No physical Android device attached during automated run |

## 4. Performance and device matrix

- Baseline / physical device benchmark: **NOT RUN** (no device attached). Bundled tone assets add 357,386 bytes across 4 WAV resources in `res/raw/`.

## 5. Reliability, privacy, permissions, licenses

- **Permissions:** No new `AndroidManifest.xml` permissions added. System tone picking uses Android's built-in `RingtoneManager.ACTION_RINGTONE_PICKER` (no `READ_MEDIA_AUDIO` / storage permissions).
- **Fallbacks:** Invalid/revoked `content://` URIs fall back deterministically to the phone's default alarm/ringtone/notification sound (and standard alarm vibration when alarm audio fails).
- **Audio provenance & licenses:** All 4 bundled `.wav` tones are freshly synthesized from sine/harmonic math by `scripts/generate-alert-tones.mjs` (zero third-party copyrighted audio).
- **Privacy & Sync:** All customization stays device-local in `local_settings` and `lafina_alert_prefs_v1`; zero changes to the 7 cloud-synced entities or `/v1/sync/batch`; `Clear All Data` preserves device preferences per ADR-025.

## 6. Human phone verification

Install the built debug APK (`android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` for physical ARM64 phones, or `app-x86_64-debug.apk` for x86_64 emulators):

1. **Alarm tones & ramp:** Open **Schedule → Alarms → +** → tap **Alarm sound**, preview **Academic Bell**, select it (or pick a phone tone via **Choose from phone…**), and save an alarm 1–2 min ahead. Also test **Profile → Notifications → Alert Tones & Notifications** (set **Alarm volume fade-in** to `Instant`, **Alarm vibration** to `Urgent`). Verify the alarm plays the chosen tone over lock screen even when the phone is on Silent/Vibrate.
2. **Notify-only notifications & dynamic Android 8+ channels:** In **Profile → Notifications → Alert Tones & Notifications**, set **Default Reminder Delivery** to `Notification Only`, pick **Gentle Chime** (or `Silent`), set **Notification Snooze** to `15 min`, toggle **Lock-screen privacy** to `Show task text` (or `Hide`), and optionally enable **Quiet hours**. Schedule a reminder 1 min ahead; verify the notification plays the newly selected sound (even after changing tones in-app), displays **Snooze 15 min**, and hides/shows task text on the lock screen. Tap **Open Android Notification Channel Settings** to confirm Android opens the active LAFINA channel directly without stale duplicate channels.
3. **AI Reminder Call customization:** In **Profile → Notifications → Reminder Call Settings**, set a custom **Call Ringtone** (or `Silent`), choose `30s` **Ring duration**, set **Greeting style** to `Urgent`, customize **Incoming call subtitle**, and test **Answer modes**:
   - **`Buttons Only (Silent)`**: tap **Preview Reminder Call** → tap **Answer** → verify it does NOT ask for microphone permission and does NOT speak aloud, letting you tap **Acknowledge** / **Snooze** directly.
   - **`Always Offline Voice`**: with **Chat → Online Mode** enabled, answer a reminder call → verify it stays offline (`Hear the reminder`, offline TTS/STT) instead of opening an ElevenLabs session.
   - **`Online AI when available`**: confirm custom subtitle, ringtone, and `30s` timeout auto-decline behavior.
4. **Reset defaults:** Tap **Reset** in both Profile sheets and confirm defaults (`Call default`, `45s`, `10 min` notify snooze, default system tones) restore cleanly.

> Note: Automated Jest and JVM tests verify storage, sanitization, scheduling policies, dynamic channel hashing, UI controls, and mocked native calls — they **cannot** certify real OEM Android audio routing, lock-screen heads-up behavior, or physical vibration hardware.

## 7. Docs/ADRs changed

- Plan created: `docs/plans/alert-notification-call-customization-plan.md`
- Report created: `docs/reports/alert-notification-call-customization-report.md`
- Import cycle check (`node scripts/check-architecture.mjs`): **PASS** (`472 TypeScript modules checked; 0 import cycles`).

## 8. Open blockers and recommended next steps

- **Open blocker:** Physical Android device validation is pending (`NOT RUN`).
- **Next step:** Owner runs the phone verification checklist in §6 against `app-arm64-v8a-debug.apk`.

## 9. Review decision

- [x] All automated required checks passing (`npm run preflight`, `gradlew testDebugUnitTest assembleDebug`)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

**End of response:** `STATUS: AWAITING DEVICE VALIDATION` then `STOPPED — awaiting explicit human approval`.
