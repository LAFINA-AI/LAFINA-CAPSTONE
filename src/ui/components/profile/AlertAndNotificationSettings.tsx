import React, {useCallback, useEffect, useState} from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Bell,
  ChevronRight,
  ExternalLink,
  Moon,
  RotateCcw,
  Volume2,
} from 'lucide-react-native';
import {ToolSheet} from '../tools';
import {TonePickerModal} from '../alerts/TonePickerModal';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../../theme';
import {
  alertPreferencesStore,
  DEFAULT_ALERT_PREFERENCES,
  preferencesStore,
  remindersStore,
} from '../../../storage';
import type {
  AlarmVolumeRampSec,
  AlertPreferences,
  AlertPreferencesPatch,
  LockScreenPrivacy,
  NotificationSnoozeMinutes,
  VibrationPattern,
} from '../../../storage';
import {
  getActiveNotificationChannelId,
  openChannelNotificationSettings,
  reconcileReminderAlarms,
  resolveToneTitle,
  syncAlertPreferencesToNative,
} from '../../../scheduler';
import type {SoundPickerKind} from '../../../scheduler';

interface AlertAndNotificationSettingsProps {
  userId: string;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const ALARM_PATTERNS: ReadonlyArray<{value: VibrationPattern; label: string}> =
  [
    {value: 'off', label: 'Off'},
    {value: 'gentle', label: 'Gentle'},
    {value: 'standard', label: 'Standard'},
    {value: 'urgent', label: 'Urgent'},
  ];

const NOTIFY_PATTERNS: ReadonlyArray<{
  value: VibrationPattern;
  label: string;
}> = [
  {value: 'gentle', label: 'Gentle'},
  {value: 'standard', label: 'Standard'},
  {value: 'urgent', label: 'Urgent'},
];

const RAMP_OPTIONS: ReadonlyArray<{value: AlarmVolumeRampSec; label: string}> =
  [
    {value: 0, label: 'Instant'},
    {value: 15, label: '15s'},
    {value: 30, label: '30s'},
    {value: 60, label: '60s'},
  ];

const SNOOZE_OPTIONS: ReadonlyArray<NotificationSnoozeMinutes> = [
  5, 10, 15, 30,
];

export const AlertAndNotificationSettings: React.FC<
  AlertAndNotificationSettingsProps
> = ({userId, visible, onClose, onChanged}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const accent = isModern ? modernPalette.accent : colors.blue;

  const [prefs, setPrefs] = useState<AlertPreferences>(() =>
    alertPreferencesStore.read(userId),
  );
  const [sleepWindow, setSleepWindow] = useState('23:00–07:00');
  const [alarmTitle, setAlarmTitle] = useState('Default alarm tone');
  const [notifyTitle, setNotifyTitle] = useState('Default notification sound');
  const [pickerKind, setPickerKind] = useState<SoundPickerKind | null>(null);

  const loadCurrent = useCallback(() => {
    const current = alertPreferencesStore.read(userId);
    setPrefs(current);
    const userPrefs = preferencesStore.get(userId);
    setSleepWindow(`${userPrefs.sleepTime}–${userPrefs.wakeTime}`);
    setAlarmTitle(current.defaultAlarmSoundTitle || 'Default alarm tone');
    setNotifyTitle(
      current.notificationSoundUri === 'silent'
        ? 'Silent'
        : current.notificationSoundTitle || 'Default notification sound',
    );
    if (current.defaultAlarmSoundUri && !current.defaultAlarmSoundTitle) {
      void resolveToneTitle(current.defaultAlarmSoundUri, 'alarm').then(
        setAlarmTitle,
      );
    }
    if (
      current.notificationSoundUri &&
      current.notificationSoundUri !== 'silent' &&
      !current.notificationSoundTitle
    ) {
      void resolveToneTitle(current.notificationSoundUri, 'notification').then(
        setNotifyTitle,
      );
    }
  }, [userId]);

  useEffect(() => {
    if (!visible) {
      setPickerKind(null);
      return;
    }
    loadCurrent();
  }, [visible, loadCurrent]);

  const applyPatch = useCallback(
    (patch: AlertPreferencesPatch) => {
      const saved = alertPreferencesStore.save(userId, patch);
      setPrefs(saved);
      if (patch.defaultAlarmSoundTitle !== undefined) {
        setAlarmTitle(saved.defaultAlarmSoundTitle || 'Default alarm tone');
      } else if (patch.defaultAlarmSoundUri === null) {
        setAlarmTitle('Default alarm tone');
      }
      if (patch.notificationSoundTitle !== undefined) {
        setNotifyTitle(
          saved.notificationSoundUri === 'silent'
            ? 'Silent'
            : saved.notificationSoundTitle || 'Default notification sound',
        );
      } else if (patch.notificationSoundUri === null) {
        setNotifyTitle('Default notification sound');
      }
      void syncAlertPreferencesToNative(userId);
      if (
        patch.defaultReminderDeliveryStyle !== undefined ||
        patch.quietHoursDowngradeToNotify !== undefined
      ) {
        const pending = remindersStore.getPendingReminders(userId);
        void reconcileReminderAlarms(pending);
      }
      onChanged?.();
    },
    [onChanged, userId],
  );

  const handleReset = useCallback(() => {
    const reset = alertPreferencesStore.reset(userId);
    setPrefs(reset);
    setAlarmTitle('Default alarm tone');
    setNotifyTitle('Default notification sound');
    void syncAlertPreferencesToNative(userId);
    void reconcileReminderAlarms(remindersStore.getPendingReminders(userId));
    onChanged?.();
  }, [onChanged, userId]);

  const handleOpenChannelSettings = useCallback(async () => {
    const channelId = await getActiveNotificationChannelId('notify');
    await openChannelNotificationSettings(channelId);
  }, []);

  return (
    <>
      <ToolSheet
        visible={visible}
        title="Alert Tones & Notifications"
        onClose={onClose}
      >
        <View style={styles.container} testID="alert-notification-settings">
          {/* Default Reminder Delivery */}
          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            DEFAULT REMINDER DELIVERY
          </Text>
          <Text style={[styles.helperText, themed.helperText]}>
            Choose how new reminders reach you when no per-reminder override is
            set.
          </Text>
          <View style={styles.chipRow}>
            {(
              [
                {
                  value: 'call',
                  label: 'Incoming Call',
                  testID: 'alert-settings-delivery-call',
                },
                {
                  value: 'notify',
                  label: 'Notification Only',
                  testID: 'alert-settings-delivery-notify',
                },
              ] as const
            ).map(option => {
              const selected =
                prefs.defaultReminderDeliveryStyle === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  testID={option.testID}
                  accessibilityRole="radio"
                  accessibilityState={{selected, checked: selected}}
                  onPress={() =>
                    applyPatch({defaultReminderDeliveryStyle: option.value})
                  }
                  style={[
                    styles.chip,
                    themed.chip,
                    selected && {backgroundColor: accent, borderColor: accent},
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, themed.divider]} />

          {/* Alarm Audio Defaults */}
          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            ALARM DEFAULTS
          </Text>
          <TouchableOpacity
            testID="alert-settings-alarm-sound"
            onPress={() => setPickerKind('alarm')}
            activeOpacity={0.78}
            style={[styles.pickerRow, themed.rowCard]}
          >
            <View style={styles.pickerRowLeft}>
              <Volume2 size={16} color={accent} />
              <View style={styles.pickerTextCol}>
                <Text style={[styles.rowTitle, themed.rowTitle]}>
                  Default Alarm Sound
                </Text>
                <Text
                  testID="alert-settings-alarm-sound-title"
                  style={[styles.rowSubtitle, themed.helperText]}
                  numberOfLines={1}
                >
                  {alarmTitle}
                </Text>
              </View>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <Text style={[styles.subLabel, themed.rowTitle]}>
            Alarm vibration pattern
          </Text>
          <View style={styles.chipRow}>
            {ALARM_PATTERNS.map(opt => {
              const selected = prefs.alarmVibrationPattern === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  testID={`alert-settings-alarm-vibrate-${opt.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{selected, checked: selected}}
                  onPress={() => applyPatch({alarmVibrationPattern: opt.value})}
                  style={[
                    styles.chip,
                    themed.chip,
                    selected && {backgroundColor: accent, borderColor: accent},
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.subLabel, themed.rowTitle]}>
            Alarm volume fade-in
          </Text>
          <View style={styles.chipRow}>
            {RAMP_OPTIONS.map(opt => {
              const selected = prefs.alarmVolumeRampSec === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  testID={`alert-settings-alarm-ramp-${opt.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{selected, checked: selected}}
                  onPress={() => applyPatch({alarmVolumeRampSec: opt.value})}
                  style={[
                    styles.chip,
                    themed.chip,
                    selected && {backgroundColor: accent, borderColor: accent},
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, themed.divider]} />

          {/* Notification Settings */}
          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            REMINDER NOTIFICATIONS
          </Text>
          <TouchableOpacity
            testID="alert-settings-notify-sound"
            onPress={() => setPickerKind('notification')}
            activeOpacity={0.78}
            style={[styles.pickerRow, themed.rowCard]}
          >
            <View style={styles.pickerRowLeft}>
              <Bell size={16} color={accent} />
              <View style={styles.pickerTextCol}>
                <Text style={[styles.rowTitle, themed.rowTitle]}>
                  Notification Sound
                </Text>
                <Text
                  testID="alert-settings-notify-sound-title"
                  style={[styles.rowSubtitle, themed.helperText]}
                  numberOfLines={1}
                >
                  {notifyTitle}
                </Text>
              </View>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.rowTitle, themed.rowTitle]}>
                Notification vibration
              </Text>
              <Text style={[styles.rowSubtitle, themed.helperText]}>
                Vibrate when notify-only reminders arrive
              </Text>
            </View>
            <Switch
              testID="alert-settings-notify-vibrate"
              value={prefs.notificationVibrate}
              onValueChange={val => applyPatch({notificationVibrate: val})}
              trackColor={{false: colors.border, true: accent}}
              thumbColor="#FFFFFF"
            />
          </View>

          {prefs.notificationVibrate ? (
            <View style={styles.chipRow}>
              {NOTIFY_PATTERNS.map(opt => {
                const selected =
                  prefs.notificationVibrationPattern === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    testID={`alert-settings-notify-pattern-${opt.value}`}
                    onPress={() =>
                      applyPatch({notificationVibrationPattern: opt.value})
                    }
                    style={[
                      styles.chip,
                      themed.chip,
                      selected && {
                        backgroundColor: accent,
                        borderColor: accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        themed.chipText,
                        selected && styles.chipTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <Text style={[styles.subLabel, themed.rowTitle]}>
            Notification Snooze button duration
          </Text>
          <View style={styles.chipRow}>
            {SNOOZE_OPTIONS.map(mins => {
              const selected = prefs.notificationSnoozeMinutes === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  testID={`alert-settings-notify-snooze-${mins}`}
                  onPress={() => applyPatch({notificationSnoozeMinutes: mins})}
                  style={[
                    styles.chip,
                    themed.chip,
                    selected && {backgroundColor: accent, borderColor: accent},
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {mins} min
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.subLabel, themed.rowTitle]}>
            Lock-screen privacy
          </Text>
          <View style={styles.chipRow}>
            {(
              [
                {
                  value: 'hide_task',
                  label: 'Hide task text',
                  testID: 'alert-settings-privacy-hide',
                },
                {
                  value: 'show',
                  label: 'Show task text',
                  testID: 'alert-settings-privacy-show',
                },
              ] as ReadonlyArray<{
                value: LockScreenPrivacy;
                label: string;
                testID: string;
              }>
            ).map(opt => {
              const selected = prefs.lockScreenPrivacy === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  testID={opt.testID}
                  onPress={() => applyPatch({lockScreenPrivacy: opt.value})}
                  style={[
                    styles.chip,
                    themed.chip,
                    selected && {backgroundColor: accent, borderColor: accent},
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <View style={styles.inlineLabelRow}>
                <Moon size={14} color={accent} />
                <Text style={[styles.rowTitle, themed.rowTitle]}>
                  Quiet hours (sleep schedule)
                </Text>
              </View>
              <Text style={[styles.rowSubtitle, themed.helperText]}>
                Deliver as notifications instead of ringing during {sleepWindow}
              </Text>
            </View>
            <Switch
              testID="alert-settings-quiet-hours"
              value={prefs.quietHoursDowngradeToNotify}
              onValueChange={val =>
                applyPatch({quietHoursDowngradeToNotify: val})
              }
              trackColor={{false: colors.border, true: accent}}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, themed.divider]} />

          <TouchableOpacity
            testID="alert-settings-channel-btn"
            onPress={() => void handleOpenChannelSettings()}
            activeOpacity={0.78}
            style={[styles.actionBtn, themed.rowCard]}
          >
            <ExternalLink size={16} color={accent} />
            <Text style={[styles.actionBtnText, {color: accent}]}>
              Open Android Notification Channel Settings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="alert-settings-reset-btn"
            onPress={handleReset}
            activeOpacity={0.78}
            style={[styles.actionBtn, themed.rowCard]}
          >
            <RotateCcw size={16} color={colors.textSecondary} />
            <Text style={[styles.actionBtnText, {color: colors.textSecondary}]}>
              Reset Tones &amp; Notification Defaults
            </Text>
          </TouchableOpacity>
        </View>
      </ToolSheet>

      <TonePickerModal
        visible={pickerKind !== null}
        kind={pickerKind ?? 'alarm'}
        selectedUri={
          pickerKind === 'notification'
            ? prefs.notificationSoundUri
            : prefs.defaultAlarmSoundUri
        }
        selectedTitle={
          pickerKind === 'notification'
            ? prefs.notificationSoundTitle
            : prefs.defaultAlarmSoundTitle
        }
        allowSilent={pickerKind === 'notification'}
        onSelect={(uri, title) => {
          if (pickerKind === 'notification') {
            applyPatch({
              notificationSoundUri: uri,
              notificationSoundTitle:
                uri === null ? DEFAULT_ALERT_PREFERENCES.notificationSoundTitle : title,
            });
          } else {
            applyPatch({
              defaultAlarmSoundUri: uri,
              defaultAlarmSoundTitle:
                uri === null ? DEFAULT_ALERT_PREFERENCES.defaultAlarmSoundTitle : title,
            });
          }
        }}
        onClose={() => setPickerKind(null)}
      />
    </>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  sectionTitle: {color: colors.textSecondary},
  helperText: {color: colors.textSecondary},
  rowTitle: {color: colors.textPrimary},
  chip: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  chipText: {color: colors.textPrimary},
  divider: {backgroundColor: colors.divider},
  rowCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: Spacing.xs,
  },
  subLabel: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  helperText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.xs,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  pickerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  pickerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  switchTextCol: {
    flex: 1,
  },
  inlineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionBtnText: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    fontWeight: '600',
  },
});
