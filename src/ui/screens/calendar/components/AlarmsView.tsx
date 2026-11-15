import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {AlarmClock, AlarmClockPlus, TriangleAlert} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {FontSize, Fonts, Layout, Spacing} from '../../../theme';
import {alarmsStore, userStore} from '../../../../storage';
import type {Alarm, AlarmInput} from '../../../../storage';
import {
  describeRepeat,
  describeTimeUntil,
  formatAlarmTime,
  nextAlarmTrigger,
} from '../../../../scheduler/alarmSchedule';
import {
  getAlarmHealth,
  needsBatteryGuidance,
  nextAlarm,
  openBatterySettings,
  ringTestAlarm,
} from '../../../../scheduler/alarmService';
import type {AlarmHealth} from '../../../../scheduler/alarmService';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '../../../../scheduler/reminderAlarm';
import {AlarmEditorModal} from './AlarmEditorModal';

interface AlarmsViewProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

interface HealthIssue {
  key: string;
  text: string;
  action: string;
  onPress: () => void;
}

/** What could stop an alarm from ringing on time, each with its fix. */
export const alarmHealthIssues = (
  health: AlarmHealth | null,
): HealthIssue[] => {
  if (!health || !health.available) return [];
  const issues: HealthIssue[] = [];
  if (!health.notificationsEnabled)
    issues.push({
      key: 'notifications',
      text: 'Notifications are off, so alarms can’t show.',
      action: 'Turn on',
      onPress: () => void openNotificationSettings(),
    });
  if (!health.canScheduleExactAlarms)
    issues.push({
      key: 'exact',
      text: 'Alarms may ring a few minutes late. Allow exact alarms.',
      action: 'Allow',
      onPress: () => void openExactAlarmSettings(),
    });
  if (!health.canUseFullScreenIntent)
    issues.push({
      key: 'fullscreen',
      text: 'The alarm screen can’t open over the lock screen.',
      action: 'Allow',
      onPress: () => void openFullScreenIntentSettings(),
    });
  if (needsBatteryGuidance(health))
    issues.push({
      key: 'battery',
      text: 'This phone’s battery saver may stop alarms. Set LAFINA to “Don’t optimize” or “No restrictions”.',
      action: 'Open',
      onPress: () => void openBatterySettings(),
    });
  return issues;
};

/** Alarm plan A2: Schedule → Alarms. */
export const AlarmsView: React.FC<AlarmsViewProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
}) => {
  const {colors} = useTheme();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [health, setHealth] = useState<AlarmHealth | null>(null);
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [use24h] = useState(() => {
    try {
      return userStore.get24HourFormat(userId);
    } catch {
      return false;
    }
  });

  const load = useCallback(() => {
    try {
      setAlarms(alarmsStore.list(userId));
    } catch (error) {
      console.warn('[AlarmsView] Could not read alarms:', error);
    }
  }, [userId]);

  useEffect(() => {
    load();
    let alive = true;
    void getAlarmHealth().then(result => {
      if (alive) setHealth(result);
    });
    return () => {
      alive = false;
    };
  }, [load, refreshTrigger]);

  const next = nextAlarm(userId);
  const issues = alarmHealthIssues(health);

  const save = (input: AlarmInput): string | null => {
    try {
      if (editing) alarmsStore.update(editing.id, userId, input);
      else alarmsStore.create(userId, input);
      setEditorOpen(false);
      load();
      onRefresh();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not save.';
    }
  };

  const toggle = (alarm: Alarm, enabled: boolean) => {
    try {
      alarmsStore.setEnabled(alarm.id, userId, enabled);
      load();
    } catch (error) {
      console.warn('[AlarmsView] Toggle failed:', error);
    }
  };

  const remove = (alarm: Alarm) => {
    Alert.alert(
      'Delete alarm?',
      `${formatAlarmTime(alarm.hour, alarm.minute, use24h)}${
        alarm.label ? ` · ${alarm.label}` : ''
      }`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            alarmsStore.remove(alarm.id, userId);
            setEditorOpen(false);
            load();
            onRefresh();
          },
        },
      ],
    );
  };

  const test = async () => {
    const at = await ringTestAlarm(60);
    setNote(
      at
        ? 'A test alarm rings in about 1 minute. Lock the phone to check it.'
        : 'Test alarms work on an Android phone only.',
    );
  };

  return (
    <View style={styles.container} testID="alarms-view">
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.nextCard,
            {backgroundColor: colors.cardBg, borderColor: colors.border},
          ]}
        >
          <AlarmClock size={22} color={colors.red} />
          <Text
            style={[styles.nextText, {color: colors.textPrimary}]}
            testID="alarms-next"
          >
            {next
              ? `Next alarm ${describeTimeUntil(next.at)} · ${formatAlarmTime(
                  next.alarm.hour,
                  next.alarm.minute,
                  use24h,
                )}`
              : 'No alarm is on.'}
          </Text>
        </View>

        {issues.map(issue => (
          <View
            key={issue.key}
            accessibilityRole="alert"
            style={[
              styles.issue,
              {borderColor: colors.warning, backgroundColor: colors.inputBg},
            ]}
          >
            <TriangleAlert size={18} color={colors.warning} />
            <Text style={[styles.issueText, {color: colors.textPrimary}]}>
              {issue.text}
            </Text>
            <TouchableOpacity
              onPress={issue.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${issue.action}: ${issue.text}`}
              style={[styles.issueButton, {borderColor: colors.border}]}
            >
              <Text style={[styles.issueAction, {color: colors.red}]}>
                {issue.action}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {alarms.length === 0 ? (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>
            No alarms yet. Tap Add alarm, or ask LAFINA: “wake me up at 6 on
            weekdays”.
          </Text>
        ) : (
          alarms.map(alarm => {
            const upcoming = nextAlarmTrigger(alarm);
            return (
              <TouchableOpacity
                key={alarm.id}
                testID={`alarm-row-${alarm.id}`}
                onPress={() => {
                  setEditing(alarm);
                  setEditorOpen(true);
                }}
                onLongPress={() => remove(alarm)}
                accessibilityRole="button"
                accessibilityLabel={`Alarm ${formatAlarmTime(
                  alarm.hour,
                  alarm.minute,
                  use24h,
                )}, ${describeRepeat(alarm.repeatDays)}${
                  alarm.label ? `, ${alarm.label}` : ''
                }, ${alarm.enabled ? 'on' : 'off'}. Edit`}
                style={[
                  styles.row,
                  {backgroundColor: colors.cardBg, borderColor: colors.border},
                ]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowTime,
                      {
                        color: alarm.enabled
                          ? colors.textPrimary
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {formatAlarmTime(alarm.hour, alarm.minute, use24h)}
                  </Text>
                  <Text
                    style={[styles.rowSub, {color: colors.textSecondary}]}
                    numberOfLines={1}
                  >
                    {[
                      alarm.label,
                      describeRepeat(alarm.repeatDays),
                      alarm.enabled && upcoming
                        ? describeTimeUntil(upcoming)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Switch
                  testID={`alarm-switch-${alarm.id}`}
                  value={alarm.enabled}
                  onValueChange={value => toggle(alarm, value)}
                  trackColor={{false: colors.switchTrackOff, true: colors.red}}
                  thumbColor={colors.switchThumb}
                  accessibilityLabel={`Alarm ${formatAlarmTime(
                    alarm.hour,
                    alarm.minute,
                    use24h,
                  )} on`}
                />
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity
          testID="alarm-add-button"
          onPress={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add alarm"
          style={[
            styles.addButton,
            {backgroundColor: colors.red, borderColor: colors.red},
          ]}
        >
          <AlarmClockPlus size={20} color={colors.white} />
          <Text style={[styles.addText, {color: colors.white}]}>Add alarm</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="alarm-test-button"
          onPress={() => void test()}
          accessibilityRole="button"
          accessibilityLabel="Ring a test alarm in 1 minute"
          style={[styles.testButton, {borderColor: colors.border}]}
        >
          <Text style={[styles.testText, {color: colors.textPrimary}]}>
            Test alarm in 1 minute
          </Text>
        </TouchableOpacity>
        {note && (
          <Text style={[styles.note, {color: colors.textSecondary}]}>
            {note}
          </Text>
        )}
      </ScrollView>

      <AlarmEditorModal
        visible={editorOpen}
        alarm={editing}
        use24h={use24h}
        onSave={save}
        onDelete={editing ? () => remove(editing) : undefined}
        onClose={() => setEditorOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {padding: Spacing.lg, paddingBottom: 140, gap: Spacing.md},
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nextText: {flex: 1, fontFamily: Fonts.heading, fontSize: FontSize.bodyLarge},
  issue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  issueText: {flex: 1, fontFamily: Fonts.body, fontSize: FontSize.body},
  issueButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  issueAction: {fontFamily: Fonts.heading, fontSize: FontSize.body},
  empty: {
    fontFamily: Fonts.body,
    fontSize: FontSize.bodyLarge,
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: {flex: 1, paddingRight: Spacing.md},
  rowTime: {fontFamily: Fonts.heading, fontSize: FontSize.hero},
  rowSub: {fontFamily: Fonts.body, fontSize: FontSize.body, marginTop: 2},
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  addText: {fontFamily: Fonts.heading, fontSize: FontSize.bodyLarge},
  testButton: {
    minHeight: 48,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testText: {fontFamily: Fonts.body, fontSize: FontSize.body},
  note: {fontFamily: Fonts.body, fontSize: FontSize.small, textAlign: 'center'},
});
