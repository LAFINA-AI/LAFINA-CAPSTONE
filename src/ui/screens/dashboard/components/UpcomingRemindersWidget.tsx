import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {BellRing, ChevronRight} from 'lucide-react-native';
import type {Reminder} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import {formatLocalDateStr} from '../dashboardCalculations';

interface UpcomingRemindersWidgetProps {
  reminders: readonly Reminder[];
  todayStr: string;
  onPressReminder: (reminder: Reminder) => void;
  onOpenCalendar: () => void;
}

const formatReminderTrigger = (isoStr: string, todayStr: string): string => {
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  const datePart = formatLocalDateStr(dt);
  const timeLabel = dt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (datePart === todayStr) return `Today · ${timeLabel}`;
  const dayLabel = dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${dayLabel} · ${timeLabel}`;
};

export const UpcomingRemindersWidget: React.FC<
  UpcomingRemindersWidgetProps
> = ({reminders, todayStr, onPressReminder, onOpenCalendar}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  return (
    <View
      style={[styles.card, themed.card, Shadows.card]}
      testID="dashboard-widget-upcoming-reminders"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <BellRing size={17} color={colors.primary} />
          <Text style={[styles.headerTitle, themed.primaryText]}>
            Upcoming Reminders
          </Text>
        </View>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={onOpenCalendar}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAllText, {color: colors.primary}]}>
            Schedule
          </Text>
          <ChevronRight size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {reminders.length === 0 ? (
        <View style={[styles.emptyBox, themed.emptyBox]}>
          <Text style={[styles.emptyText, themed.secondaryText]}>
            No active alarm reminders pending right now.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {reminders.map(rem => {
            const isSnoozed = rem.status === 'snoozed';
            const chipColor = isSnoozed ? colors.warning : colors.blue;

            return (
              <TouchableOpacity
                key={rem.id}
                style={[styles.row, themed.row]}
                onPress={() => onPressReminder(rem)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Reminder: ${rem.task}`}
              >
                <View style={styles.rowBody}>
                  <Text
                    style={[styles.rowTitle, themed.primaryText]}
                    numberOfLines={1}
                  >
                    {rem.task}
                  </Text>
                  <Text style={[styles.rowTime, themed.secondaryText]}>
                    {formatReminderTrigger(rem.triggerAt, todayStr)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusChip,
                    {backgroundColor: chipColor + '1A'},
                  ]}
                >
                  <Text style={[styles.statusChipText, {color: chipColor}]}>
                    {isSnoozed ? 'Snoozed' : 'Scheduled'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  row: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  emptyBox: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: '700',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  rowTime: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: 2,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Layout.borderRadiusPill,
  },
  statusChipText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyBox: {
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    padding: Spacing.md,
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 19,
  },
});
