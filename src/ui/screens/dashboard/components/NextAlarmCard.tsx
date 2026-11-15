import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AlarmClock, ChevronRight} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {
  describeRepeat,
  describeTimeUntil,
  formatAlarmTime,
} from '../../../../scheduler/alarmSchedule';
import {nextAlarm} from '../../../../scheduler/alarmService';

interface NextAlarmCardProps {
  userId: string;
  timeFormat24h: boolean;
  now: Date;
  onOpenAlarms: () => void;
}

/**
 * Alarm plan A2 / tab plan T1: Home's "Next alarm" card. Shown only when an
 * alarm is on, so students who never use alarms never see an empty card.
 */
export const NextAlarmCard: React.FC<NextAlarmCardProps> = ({
  userId,
  timeFormat24h,
  now,
  onOpenAlarms,
}) => {
  const {colors} = useTheme();
  let next: ReturnType<typeof nextAlarm> = null;
  try {
    next = nextAlarm(userId, now);
  } catch {
    next = null;
  }
  if (!next) return null;
  const time = formatAlarmTime(
    next.alarm.hour,
    next.alarm.minute,
    timeFormat24h,
  );
  const detail = [
    next.alarm.label,
    describeRepeat(next.alarm.repeatDays),
    describeTimeUntil(next.at, now),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <TouchableOpacity
      testID="dashboard-next-alarm"
      onPress={onOpenAlarms}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Next alarm ${time}, ${detail}. Open alarms`}
      style={[
        styles.card,
        Shadows.card,
        {backgroundColor: colors.cardBg, borderColor: colors.border},
      ]}
    >
      <View style={[styles.icon, {backgroundColor: colors.inputBg}]}>
        <AlarmClock size={18} color={colors.red} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, {color: colors.textPrimary}]}>
          Next alarm · {time}
        </Text>
        <Text
          style={[styles.detail, {color: colors.textSecondary}]}
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {flex: 1},
  title: {fontFamily: Fonts.heading, fontSize: FontSize.bodyLarge},
  detail: {fontFamily: Fonts.body, fontSize: FontSize.small, marginTop: 2},
});
