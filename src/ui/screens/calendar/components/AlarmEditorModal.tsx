import React, {useEffect, useState} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useTheme} from '../../../contexts/ThemeContext';
import {FontSize, Fonts, Layout, Spacing} from '../../../theme';
import type {Alarm, AlarmInput} from '../../../../storage';
import {
  DAY_BITS,
  DAY_ORDER,
  DAY_SHORT,
  EVERY_DAY,
  WEEKDAYS,
  formatAlarmTime,
} from '../../../../scheduler/alarmSchedule';

const SNOOZE_CHOICES = [5, 9, 10, 15];

interface AlarmEditorModalProps {
  visible: boolean;
  /** null = a new alarm. */
  alarm: Alarm | null;
  use24h: boolean;
  onSave: (input: AlarmInput) => string | null;
  onDelete?: () => void;
  onClose: () => void;
}

/** Alarm plan A2: add or edit one alarm. Returns an error message from onSave, if any. */
export const AlarmEditorModal: React.FC<AlarmEditorModalProps> = ({
  visible,
  alarm,
  use24h,
  onSave,
  onDelete,
  onClose,
}) => {
  const {colors} = useTheme();
  const [hour, setHour] = useState(6);
  const [minute, setMinute] = useState(0);
  const [repeatDays, setRepeatDays] = useState(0);
  const [label, setLabel] = useState('');
  const [snoozeMinutes, setSnoozeMinutes] = useState(9);
  const [vibrate, setVibrate] = useState(true);
  const [briefing, setBriefing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setHour(alarm?.hour ?? 6);
    setMinute(alarm?.minute ?? 0);
    setRepeatDays(alarm?.repeatDays ?? 0);
    setLabel(alarm?.label ?? '');
    setSnoozeMinutes(alarm?.snoozeMinutes ?? 9);
    setVibrate(alarm?.vibrate ?? true);
    setBriefing(alarm?.briefing ?? false);
    setError(null);
    setPickerOpen(false);
  }, [visible, alarm]);

  const toggleDay = (bit: number) => setRepeatDays(days => days ^ bit);

  const chip = (selected: boolean) => [
    styles.chip,
    {
      borderColor: selected ? colors.red : colors.border,
      backgroundColor: selected ? colors.red : colors.inputBg,
    },
  ];
  const chipText = (selected: boolean) => [
    styles.chipText,
    {color: selected ? colors.white : colors.textPrimary},
  ];

  const save = () => {
    const problem = onSave({
      hour,
      minute,
      repeatDays,
      label: label.trim(),
      snoozeMinutes,
      vibrate,
      briefing,
      enabled: true,
      // A changed one-shot rings the next time this clock time comes.
      oneShotDate: null,
    });
    setError(problem);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, {backgroundColor: colors.overlay}]}>
        <View
          style={[
            styles.sheet,
            {backgroundColor: colors.cardBg, borderColor: colors.border},
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, {color: colors.textPrimary}]}>
              {alarm ? 'Edit alarm' : 'New alarm'}
            </Text>

            <TouchableOpacity
              testID="alarm-time-button"
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Alarm time ${formatAlarmTime(
                hour,
                minute,
                use24h,
              )}. Change time`}
              style={styles.timeButton}
            >
              <Text style={[styles.time, {color: colors.textPrimary}]}>
                {formatAlarmTime(hour, minute, use24h)}
              </Text>
            </TouchableOpacity>
            {pickerOpen && (
              <DateTimePicker
                value={new Date(2026, 0, 1, hour, minute)}
                mode="time"
                is24Hour={use24h}
                onChange={(_event, picked) => {
                  setPickerOpen(false);
                  if (picked) {
                    setHour(picked.getHours());
                    setMinute(picked.getMinutes());
                  }
                }}
              />
            )}

            <Text style={[styles.section, {color: colors.textSecondary}]}>
              Repeat
            </Text>
            <View style={styles.row}>
              {(
                [
                  ['Once', 0],
                  ['Weekdays', WEEKDAYS],
                  ['Every day', EVERY_DAY],
                ] as const
              ).map(([name, value]) => (
                <TouchableOpacity
                  key={name}
                  style={chip(repeatDays === value)}
                  onPress={() => setRepeatDays(value)}
                  accessibilityRole="button"
                  accessibilityState={{selected: repeatDays === value}}
                >
                  <Text style={chipText(repeatDays === value)}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              {DAY_ORDER.map(key => {
                const on = (repeatDays & DAY_BITS[key]) !== 0;
                return (
                  <TouchableOpacity
                    key={key}
                    testID={`alarm-day-${key}`}
                    style={[chip(on), styles.dayChip]}
                    onPress={() => toggleDay(DAY_BITS[key])}
                    accessibilityRole="checkbox"
                    accessibilityLabel={DAY_SHORT[key]}
                    accessibilityState={{checked: on}}
                  >
                    <Text style={chipText(on)}>{DAY_SHORT[key][0]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.section, {color: colors.textSecondary}]}>
              Label
            </Text>
            <TextInput
              testID="alarm-label-input"
              value={label}
              onChangeText={text => setLabel(text.slice(0, 60))}
              placeholder="Wake up"
              placeholderTextColor={colors.placeholder}
              maxLength={60}
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                },
              ]}
              accessibilityLabel="Alarm label"
            />

            <Text style={[styles.section, {color: colors.textSecondary}]}>
              Snooze
            </Text>
            <View style={styles.row}>
              {SNOOZE_CHOICES.map(value => (
                <TouchableOpacity
                  key={value}
                  style={chip(snoozeMinutes === value)}
                  onPress={() => setSnoozeMinutes(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Snooze ${value} minutes`}
                  accessibilityState={{selected: snoozeMinutes === value}}
                >
                  <Text style={chipText(snoozeMinutes === value)}>
                    {value} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, {color: colors.textPrimary}]}>
                Vibrate
              </Text>
              <Switch
                value={vibrate}
                onValueChange={setVibrate}
                trackColor={{false: colors.switchTrackOff, true: colors.red}}
                thumbColor={colors.switchThumb}
                accessibilityLabel="Vibrate"
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={[styles.switchLabel, {color: colors.textPrimary}]}>
                  Morning briefing
                </Text>
                <Text style={[styles.hint, {color: colors.textMuted}]}>
                  After you dismiss, LAFINA reads today&apos;s schedule aloud
                  (works offline).
                </Text>
              </View>
              <Switch
                testID="alarm-briefing-switch"
                value={briefing}
                onValueChange={setBriefing}
                trackColor={{false: colors.switchTrackOff, true: colors.red}}
                thumbColor={colors.switchThumb}
                accessibilityLabel="Morning briefing"
              />
            </View>

            {error && (
              <Text
                accessibilityRole="alert"
                style={[styles.error, {color: colors.error}]}
              >
                {error}
              </Text>
            )}

            <View style={styles.actions}>
              {onDelete && (
                <TouchableOpacity
                  onPress={onDelete}
                  style={[styles.button, {borderColor: colors.border}]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete alarm"
                >
                  <Text style={[styles.buttonText, {color: colors.error}]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.spacer} />
              <TouchableOpacity
                onPress={onClose}
                style={[styles.button, {borderColor: colors.border}]}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.buttonText, {color: colors.textSecondary}]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="alarm-save-button"
                onPress={save}
                style={[
                  styles.button,
                  {backgroundColor: colors.red, borderColor: colors.red},
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save alarm"
              >
                <Text style={[styles.buttonText, {color: colors.white}]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: Layout.borderRadiusCard,
    borderTopRightRadius: Layout.borderRadiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.xl,
  },
  title: {fontFamily: Fonts.heading, fontSize: FontSize.subtitle},
  timeButton: {alignItems: 'center', paddingVertical: Spacing.lg},
  time: {fontFamily: Fonts.heading, fontSize: 48},
  section: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  chip: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  dayChip: {width: 40, paddingHorizontal: 0},
  chipText: {fontFamily: Fonts.body, fontSize: FontSize.body},
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.md,
    fontFamily: Fonts.body,
    fontSize: FontSize.bodyLarge,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    marginTop: Spacing.md,
  },
  switchTextCol: {flex: 1, paddingRight: Spacing.md},
  switchLabel: {fontFamily: Fonts.body, fontSize: FontSize.bodyLarge},
  hint: {fontFamily: Fonts.body, fontSize: FontSize.small, marginTop: 2},
  error: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    marginTop: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  spacer: {flex: 1},
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {fontFamily: Fonts.heading, fontSize: FontSize.body},
});
