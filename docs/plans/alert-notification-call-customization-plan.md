# Alert Tones, Notifications & AI Call Customization Plan

**Date:** 2026-11-21  
**Branch baseline:** `codex/skills-hub` (`f03f128`)  
**Owner authorization:** Approved on 2026-11-21 (`"APPROVE, Continue developing without stopping - report back to me when its finished. i'll test it my self"`).

## 1. Owner Decisions Applied

1. **Audio tone sources:** 4 license-free synthesized WAV tones bundled in `android/app/src/main/res/raw/` (`lafina_tone_gentle`, `lafina_tone_chime`, `lafina_tone_classic_ring`, `lafina_tone_urgent`) generated deterministically via `scripts/generate-alert-tones.mjs`, plus Android's native `RingtoneManager.ACTION_RINGTONE_PICKER` for device tones.
2. **Android 8+ channel updates:** Dynamic versioned `NotificationChannel` IDs (`lafina_notify_<8hex>`, `lafina_call_<8hex>`) computed from sound URI, vibration settings, and lock-screen privacy, deleting retired LAFINA dynamic channels when settings change.
3. **Storage & sync scope:** Strictly device-local in SQLite `local_settings` (`alert_preferences_v1` per `userId`, preserved across Clear All Data per ADR-025) mirrored to Android `SharedPreferences` (`lafina_alert_prefs_v1`, per ADR-016). No SQLite schema migration and no changes to the 7 cloud-synced entities or `/v1/sync/batch`.

## 2. Phases

| Phase | Scope | Key Files |
|---|---|---|
| **ALERT-01** | Bundled tones, `AlertPreferencesContract.kt`, `AlertPreferencesStoreNative.kt`, `LafinaSoundPickerModule.kt`, `alertPreferencesStore.ts`, `soundPicker.ts`, `alertPreferencesSync.ts` | `scripts/generate-alert-tones.mjs`, `android/.../AlertPreferencesContract.kt`, `android/.../LafinaSoundPickerModule.kt`, `src/storage/alertPreferencesStore.ts` |
| **ALERT-02** | Alarm default/per-alarm tone, vibration waveforms, volume ramp (`0/15/30/60s`), `TonePickerModal`, `AlarmEditorModal` sound row, test alarm with sound | `LafinaAlarmService.kt`, `LafinaAlarmModule.kt`, `LafinaAlarms.kt`, `AlarmFireReceiver.kt`, `TonePickerModal.tsx`, `AlarmEditorModal.tsx` |
| **ALERT-03** | Dynamic notify channels, global delivery default (`call`/`notify`), custom notify snooze duration (`5/10/15/30 min`), lock-screen privacy, sleep-time quiet-hours downgrade, `AlertAndNotificationSettings` in Profile | `LafinaReminderModule.kt`, `reminderDeliveryStyleStore.ts`, `reminderDeliveryPolicy.ts`, `notifyOnlyDelivery.ts`, `reminderAlarm.ts`, `AlertAndNotificationSettings.tsx`, `ProfileScreen.tsx` |
| **ALERT-04** | Dynamic incoming-call channels, custom call ringtone/vibration, ring timeout (`30/45/60s`), answer mode (`auto_online`/`offline_voice`/`buttons_only`), greeting style (`friendly`/`concise`/`urgent`), caller subtitle, snooze/retry overrides, `ReminderCallSettings` in Profile | `LafinaReminderModule.kt`, `userPreferences.ts`, `callDispatcher.ts`, `IncomingCallScreen.tsx`, `ReminderCallSettings.tsx`, `ProfileScreen.tsx` |
