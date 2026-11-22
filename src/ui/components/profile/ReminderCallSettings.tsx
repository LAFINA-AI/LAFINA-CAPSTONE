import React, {useCallback, useEffect, useState} from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ChevronRight,
  ExternalLink,
  Mic,
  PhoneCall,
  Play,
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
  DEFAULT_CALLER_SUBTITLE,
  MAX_CALLER_SUBTITLE_LENGTH,
} from '../../../storage';
import type {
  AlertPreferences,
  AlertPreferencesPatch,
  CallAnswerMode,
  CallGreetingStyle,
  CallRingTimeoutSec,
  VibrationPattern,
} from '../../../storage';
import {
  buildAnnouncement,
  getActiveNotificationChannelId,
  openChannelNotificationSettings,
  resolveToneTitle,
  syncAlertPreferencesToNative,
} from '../../../scheduler';

interface ReminderCallSettingsProps {
  userId: string;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
  onOpenOfflineVoice?: () => void;
  onOpenOnlineVoice?: () => void;
  onPreviewCall?: () => void;
}

const CALL_PATTERNS: ReadonlyArray<{value: VibrationPattern; label: string}> = [
  {value: 'gentle', label: 'Gentle'},
  {value: 'standard', label: 'Standard'},
  {value: 'urgent', label: 'Urgent'},
];

const RING_TIMEOUTS: ReadonlyArray<CallRingTimeoutSec> = [30, 45, 60];

const ANSWER_MODES: ReadonlyArray<{
  value: CallAnswerMode;
  label: string;
  help: string;
  testID: string;
}> = [
  {
    value: 'auto_online',
    label: 'Online AI when available',
    help: 'Talks with online LAFINA when you are signed in, online and agreed to Call LAFINA; otherwise Offline Voice. No pop-up while it rings.',
    testID: 'call-settings-mode-auto',
  },
  {
    value: 'offline_voice',
    label: 'Always Offline Voice',
    help: 'Uses on-device speech & whisper.cpp without streaming',
    testID: 'call-settings-mode-offline',
  },
  {
    value: 'buttons_only',
    label: 'Buttons Only (Silent)',
    help: 'Skips microphone & spoken readout; tap Acknowledge or Snooze',
    testID: 'call-settings-mode-buttons',
  },
];

const GREETING_STYLES: ReadonlyArray<{
  value: CallGreetingStyle;
  label: string;
  testID: string;
}> = [
  {value: 'friendly', label: 'Friendly', testID: 'call-settings-greet-friendly'},
  {value: 'concise', label: 'Concise', testID: 'call-settings-greet-concise'},
  {value: 'urgent', label: 'Urgent', testID: 'call-settings-greet-urgent'},
];

const SNOOZE_OVERRIDES: ReadonlyArray<number | null> = [null, 5, 10, 15, 30];
const RETRY_OVERRIDES: ReadonlyArray<number | null> = [null, 0, 1, 3, 5];

export const ReminderCallSettings: React.FC<ReminderCallSettingsProps> = ({
  userId,
  visible,
  onClose,
  onChanged,
  onOpenOfflineVoice,
  onOpenOnlineVoice,
  onPreviewCall,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const accent = isModern ? modernPalette.accent : colors.blue;

  const [prefs, setPrefs] = useState<AlertPreferences>(() =>
    alertPreferencesStore.read(userId),
  );
  const [ringtoneTitle, setRingtoneTitle] = useState('Default ringtone');
  const [subtitleDraft, setSubtitleDraft] = useState(DEFAULT_CALLER_SUBTITLE);
  const [tonePickerVisible, setTonePickerVisible] = useState(false);

  const loadCurrent = useCallback(() => {
    const current = alertPreferencesStore.read(userId);
    setPrefs(current);
    setSubtitleDraft(current.callCallerSubtitle || DEFAULT_CALLER_SUBTITLE);
    setRingtoneTitle(
      current.callRingtoneUri === 'silent'
        ? 'Silent'
        : current.callRingtoneTitle || 'Default ringtone',
    );
    if (
      current.callRingtoneUri &&
      current.callRingtoneUri !== 'silent' &&
      !current.callRingtoneTitle
    ) {
      void resolveToneTitle(current.callRingtoneUri, 'ringtone').then(
        setRingtoneTitle,
      );
    }
  }, [userId]);

  useEffect(() => {
    if (!visible) {
      setTonePickerVisible(false);
      return;
    }
    loadCurrent();
  }, [visible, loadCurrent]);

  const applyPatch = useCallback(
    (patch: AlertPreferencesPatch) => {
      const saved = alertPreferencesStore.save(userId, patch);
      setPrefs(saved);
      if (patch.callRingtoneTitle !== undefined) {
        setRingtoneTitle(
          saved.callRingtoneUri === 'silent'
            ? 'Silent'
            : saved.callRingtoneTitle || 'Default ringtone',
        );
      } else if (patch.callRingtoneUri === null) {
        setRingtoneTitle('Default ringtone');
      }
      void syncAlertPreferencesToNative(userId);
      onChanged?.();
    },
    [onChanged, userId],
  );

  const commitSubtitle = useCallback(() => {
    const clean = subtitleDraft.trim().slice(0, MAX_CALLER_SUBTITLE_LENGTH);
    const nextValue = clean || DEFAULT_CALLER_SUBTITLE;
    setSubtitleDraft(nextValue);
    if (nextValue !== prefs.callCallerSubtitle) {
      applyPatch({callCallerSubtitle: nextValue});
    }
  }, [applyPatch, prefs.callCallerSubtitle, subtitleDraft]);

  const handleResetCallDefaults = useCallback(() => {
    applyPatch({
      callRingtoneUri: DEFAULT_ALERT_PREFERENCES.callRingtoneUri,
      callRingtoneTitle: DEFAULT_ALERT_PREFERENCES.callRingtoneTitle,
      callVibrate: DEFAULT_ALERT_PREFERENCES.callVibrate,
      callVibrationPattern: DEFAULT_ALERT_PREFERENCES.callVibrationPattern,
      callRingTimeoutSec: DEFAULT_ALERT_PREFERENCES.callRingTimeoutSec,
      callAnswerMode: DEFAULT_ALERT_PREFERENCES.callAnswerMode,
      callGreetingStyle: DEFAULT_ALERT_PREFERENCES.callGreetingStyle,
      callCallerSubtitle: DEFAULT_CALLER_SUBTITLE,
      callSnoozeMinutesOverride:
        DEFAULT_ALERT_PREFERENCES.callSnoozeMinutesOverride,
      callMaxAutoSnoozesOverride:
        DEFAULT_ALERT_PREFERENCES.callMaxAutoSnoozesOverride,
    });
    setSubtitleDraft(DEFAULT_CALLER_SUBTITLE);
  }, [applyPatch]);

  const handleOpenCallChannel = useCallback(async () => {
    const channelId = await getActiveNotificationChannelId('call');
    await openChannelNotificationSettings(channelId);
  }, []);

  return (
    <>
      <ToolSheet
        visible={visible}
        title="Reminder Call Settings"
        onClose={onClose}
      >
        <View style={styles.container} testID="reminder-call-settings">
          {/* Ringtone & Vibration */}
          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            INCOMING CALL RINGTONE
          </Text>
          <TouchableOpacity
            testID="call-settings-ringtone-row"
            onPress={() => setTonePickerVisible(true)}
            activeOpacity={0.78}
            style={[styles.pickerRow, themed.rowCard]}
          >
            <View style={styles.pickerRowLeft}>
              <Volume2 size={16} color={accent} />
              <View style={styles.pickerTextCol}>
                <Text style={[styles.rowTitle, themed.rowTitle]}>
                  Call Ringtone
                </Text>
                <Text
                  testID="call-settings-ringtone-title"
                  style={[styles.rowSubtitle, themed.helperText]}
                  numberOfLines={1}
                >
                  {ringtoneTitle}
                </Text>
              </View>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.rowTitle, themed.rowTitle]}>
                Call vibration
              </Text>
              <Text style={[styles.rowSubtitle, themed.helperText]}>
                Vibrate while a reminder call rings
              </Text>
            </View>
            <Switch
              testID="call-settings-vibrate"
              value={prefs.callVibrate}
              onValueChange={val => applyPatch({callVibrate: val})}
              trackColor={{false: colors.border, true: accent}}
              thumbColor="#FFFFFF"
            />
          </View>

          {prefs.callVibrate ? (
            <View style={styles.chipRow}>
              {CALL_PATTERNS.map(opt => {
                const selected = prefs.callVibrationPattern === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    testID={`call-settings-pattern-${opt.value}`}
                    onPress={() => applyPatch({callVibrationPattern: opt.value})}
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

          <Text style={[styles.subLabel, themed.rowTitle]}>Ring duration</Text>
          <View style={styles.chipRow}>
            {RING_TIMEOUTS.map(sec => {
              const selected = prefs.callRingTimeoutSec === sec;
              return (
                <TouchableOpacity
                  key={sec}
                  testID={`call-settings-timeout-${sec}`}
                  onPress={() => applyPatch({callRingTimeoutSec: sec})}
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
                    {sec}s
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, themed.divider]} />

          {/* Answer Behavior */}
          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            WHEN YOU ANSWER
          </Text>
          <View style={styles.optionColumn}>
            {ANSWER_MODES.map(mode => {
              const selected = prefs.callAnswerMode === mode.value;
              return (
                <TouchableOpacity
                  key={mode.value}
                  testID={mode.testID}
                  accessibilityRole="radio"
                  accessibilityState={{selected, checked: selected}}
                  onPress={() => applyPatch({callAnswerMode: mode.value})}
                  style={[
                    styles.modeCard,
                    themed.rowCard,
                    selected && {borderColor: accent},
                  ]}
                >
                  <View style={styles.modeHeader}>
                    <Text
                      style={[
                        styles.rowTitle,
                        {color: selected ? accent : colors.textPrimary},
                      ]}
                    >
                      {mode.label}
                    </Text>
                  </View>
                  <Text style={[styles.rowSubtitle, themed.helperText]}>
                    {mode.help}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.subLabel, themed.rowTitle]}>
            Spoken greeting style
          </Text>
          <View style={styles.chipRow}>
            {GREETING_STYLES.map(opt => {
              const selected = prefs.callGreetingStyle === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  testID={opt.testID}
                  onPress={() => applyPatch({callGreetingStyle: opt.value})}
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
          <View style={[styles.previewBox, themed.rowCard]}>
            <Text
              testID="call-settings-greeting-preview"
              style={[styles.previewText, themed.helperText]}
            >
              “{buildAnnouncement('Review Capstone Notes', prefs.callGreetingStyle)}”
            </Text>
          </View>

          <Text style={[styles.subLabel, themed.rowTitle]}>
            Incoming call subtitle
          </Text>
          <TextInput
            testID="call-settings-subtitle-input"
            value={subtitleDraft}
            onChangeText={val =>
              setSubtitleDraft(val.slice(0, MAX_CALLER_SUBTITLE_LENGTH))
            }
            onBlur={commitSubtitle}
            onSubmitEditing={commitSubtitle}
            maxLength={MAX_CALLER_SUBTITLE_LENGTH}
            placeholder={DEFAULT_CALLER_SUBTITLE}
            placeholderTextColor={colors.textMuted}
            style={[
              styles.textInput,
              themed.rowCard,
              {color: colors.textPrimary},
            ]}
          />

          <View style={[styles.divider, themed.divider]} />

          {/* Snooze & Auto-Retry Overrides */}
          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            SNOOZE &amp; AUTO-RETRY
          </Text>
          <Text style={[styles.subLabel, themed.rowTitle]}>
            Call snooze length
          </Text>
          <View style={styles.chipRow}>
            {SNOOZE_OVERRIDES.map(val => {
              const selected = prefs.callSnoozeMinutesOverride === val;
              return (
                <TouchableOpacity
                  key={String(val)}
                  testID={`call-settings-snooze-${val ?? 'auto'}`}
                  onPress={() => applyPatch({callSnoozeMinutesOverride: val})}
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
                    {val === null ? 'Auto' : `${val} min`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.subLabel, themed.rowTitle]}>
            Max missed-call retries
          </Text>
          <View style={styles.chipRow}>
            {RETRY_OVERRIDES.map(val => {
              const selected = prefs.callMaxAutoSnoozesOverride === val;
              return (
                <TouchableOpacity
                  key={String(val)}
                  testID={`call-settings-retries-${val ?? 'auto'}`}
                  onPress={() => applyPatch({callMaxAutoSnoozesOverride: val})}
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
                    {val === null ? 'Auto' : String(val)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, themed.divider]} />

          {/* Voice links & Preview */}
          {onOpenOfflineVoice ? (
            <TouchableOpacity
              testID="call-settings-open-offline-voice"
              onPress={onOpenOfflineVoice}
              activeOpacity={0.78}
              style={[styles.pickerRow, themed.rowCard]}
            >
              <View style={styles.pickerRowLeft}>
                <Mic size={16} color={accent} />
                <Text style={[styles.rowTitle, themed.rowTitle]}>
                  Offline Voice (TTS speed, pitch &amp; voice)
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          {onOpenOnlineVoice ? (
            <TouchableOpacity
              testID="call-settings-open-online-voice"
              onPress={onOpenOnlineVoice}
              activeOpacity={0.78}
              style={[styles.pickerRow, themed.rowCard]}
            >
              <View style={styles.pickerRowLeft}>
                <PhoneCall size={16} color={accent} />
                <Text style={[styles.rowTitle, themed.rowTitle]}>
                  Online Voice · ElevenLabs &amp; Call LAFINA
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          {onPreviewCall ? (
            <TouchableOpacity
              testID="call-settings-preview-btn"
              onPress={onPreviewCall}
              activeOpacity={0.82}
              style={[styles.primaryBtn, {backgroundColor: accent}]}
            >
              <Play size={15} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Preview Reminder Call</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            testID="call-settings-channel-btn"
            onPress={() => void handleOpenCallChannel()}
            activeOpacity={0.78}
            style={[styles.actionBtn, themed.rowCard]}
          >
            <ExternalLink size={16} color={accent} />
            <Text style={[styles.actionBtnText, {color: accent}]}>
              Open Android Call Channel Settings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="call-settings-reset-btn"
            onPress={handleResetCallDefaults}
            activeOpacity={0.78}
            style={[styles.actionBtn, themed.rowCard]}
          >
            <RotateCcw size={16} color={colors.textSecondary} />
            <Text style={[styles.actionBtnText, {color: colors.textSecondary}]}>
              Reset Call Defaults
            </Text>
          </TouchableOpacity>
        </View>
      </ToolSheet>

      <TonePickerModal
        visible={tonePickerVisible}
        kind="ringtone"
        selectedUri={prefs.callRingtoneUri}
        selectedTitle={prefs.callRingtoneTitle}
        allowSilent
        onSelect={(uri, title) =>
          applyPatch({
            callRingtoneUri: uri,
            callRingtoneTitle:
              uri === null ? DEFAULT_ALERT_PREFERENCES.callRingtoneTitle : title,
          })
        }
        onClose={() => setTonePickerVisible(false)}
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
  optionColumn: {
    gap: 8,
  },
  modeCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  previewText: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 2,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
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
