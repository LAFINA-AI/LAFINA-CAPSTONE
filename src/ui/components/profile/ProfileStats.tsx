import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {BarChart3, ChevronRight} from 'lucide-react-native';
import {
  Fonts,
  Layout,
  ModernLayout,
  Shadows,
  Spacing,
  useThemedStyles,
} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import type {DetailedProfileStatistics} from '../../../storage/profileStatisticsStore';
import {formatHoursCompact} from './statsFormatting';

interface ProfileStatsProps {
  statistics: DetailedProfileStatistics;
  onPressViewStats?: () => void;
}

const UNAVAILABLE = '—';

/**
 * Student activity overview card backed by local SQLite records, with a
 * "View Stats" trigger opening the detailed breakdown modal.
 */
export const ProfileStats: React.FC<ProfileStatsProps> = ({
  statistics,
  onPressViewStats,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const avail = statistics.available;
  const completed = statistics.completedTasksCount ?? 0;
  const totalTasks = statistics.totalTasksCount ?? 0;
  const overdueTasks = statistics.overdueTasksCount ?? 0;
  const dueTodayTasks = statistics.dueTodayTasksCount ?? 0;

  const taskValue = !avail
    ? UNAVAILABLE
    : totalTasks > 0
    ? `${statistics.taskCompletionRate ?? 0}%`
    : '0%';
  const taskSublabel = !avail
    ? 'Unavailable'
    : totalTasks > 0
    ? `${completed}/${totalTasks} done`
    : 'No tasks yet';
  const taskA11y = !avail
    ? 'Task completion unavailable'
    : totalTasks > 0
    ? `Task completion: ${
        statistics.taskCompletionRate ?? 0
      } percent, ${completed} of ${totalTasks} done`
    : 'Task completion: no tasks yet';

  const weeklyClasses = statistics.weeklyClassCount ?? 0;
  const weeklyStudy = statistics.weeklyStudyBlockCount ?? 0;
  const weeklyEvents = statistics.weeklyEventCount ?? 0;
  const weekValue = avail
    ? formatHoursCompact(statistics.weeklyScheduledMinutes ?? 0)
    : UNAVAILABLE;
  const weekSublabel = !avail
    ? 'Unavailable'
    : weeklyClasses > 0 || weeklyStudy > 0
    ? `${weeklyClasses} cls · ${weeklyStudy} study`
    : weeklyEvents > 0
    ? `${weeklyEvents} ${weeklyEvents === 1 ? 'event' : 'events'}`
    : 'Free schedule';
  const weekA11y = !avail
    ? 'This week schedule unavailable'
    : `This week: ${weekValue} scheduled (${weekSublabel})`;

  const finishedReminders = statistics.finishedRemindersCount ?? 0;
  const enabledAlarms = statistics.enabledAlarmsCount ?? 0;
  const pendingReminders = statistics.pendingRemindersCount ?? 0;

  let alertsValue = UNAVAILABLE;
  let alertsLabel = 'Alerts';
  let alertsSublabel = 'Unavailable';
  let alertsA11y = 'Alarms and reminders unavailable';

  if (avail) {
    if (finishedReminders > 0 && statistics.onTimeRate !== null) {
      alertsValue = `${statistics.onTimeRate}%`;
      alertsLabel = 'On Time';
      alertsSublabel = `${enabledAlarms} ${
        enabledAlarms === 1 ? 'alarm' : 'alarms'
      } on`;
      alertsA11y = `On-time rate: ${statistics.onTimeRate} percent across ${finishedReminders} reminders, ${enabledAlarms} alarms enabled`;
    } else {
      alertsValue = String(enabledAlarms);
      alertsLabel = 'Alarms On';
      alertsSublabel =
        pendingReminders > 0
          ? `${pendingReminders} due alerts`
          : 'No pending alerts';
      alertsA11y = `Active alarms: ${enabledAlarms}, pending reminders: ${pendingReminders}`;
    }
  }

  const headerSubtitle = !avail
    ? 'Local stats unavailable'
    : (statistics.enrolledCoursesCount ?? 0) > 0
    ? `${statistics.enrolledCoursesCount} courses · ${
        statistics.totalCreditUnits ?? 0
      } units`
    : 'Tasks, schedule & alerts';

  const containerStyle = isModern
    ? [
        styles.container,
        modernShadows.card,
        styles.modernContainer,
        {
          backgroundColor: modernPalette.card,
          borderColor: modernPalette.border,
        },
      ]
    : [styles.container, Shadows.card, themed.container];

  const renderTile = (
    value: string,
    label: string,
    sublabel: string,
    accessibilityLabel: string,
    testID: string,
    modernTint: string,
    highlightWarning = false,
  ) => (
    <View
      style={[
        styles.statCard,
        isModern
          ? [
              modernShadows.subtle,
              styles.modernStatCard,
              {
                backgroundColor: modernTint,
                borderColor: modernPalette.border,
              },
            ]
          : [styles.classicStatCard, themed.statCard],
      ]}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Text
        style={[
          styles.statVal,
          isModern && styles.modernStatVal,
          themed.statVal,
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, themed.statLabel]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.statSublabel,
          themed.statSublabel,
          highlightWarning && {
            color: isModern ? modernPalette.danger : colors.error,
            fontWeight: '700',
          },
        ]}
        numberOfLines={1}
      >
        {sublabel}
      </Text>
    </View>
  );

  return (
    <View style={containerStyle} testID="profile-stats-card">
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <View style={styles.headerTitleRow}>
            <BarChart3
              size={15}
              color={isModern ? modernPalette.accent : colors.primary}
            />
            <Text style={[styles.headerTitle, themed.statVal]}>
              Study Overview
            </Text>
          </View>
          <Text
            style={[styles.headerSubtitle, themed.statLabel]}
            numberOfLines={1}
          >
            {headerSubtitle}
          </Text>
        </View>
        {onPressViewStats && (
          <TouchableOpacity
            onPress={onPressViewStats}
            activeOpacity={0.8}
            testID="profile-view-stats-btn"
            accessibilityRole="button"
            accessibilityLabel="View detailed statistics"
            style={[
              styles.viewStatsBtn,
              {
                backgroundColor: isModern
                  ? modernPalette.softViolet
                  : colors.inputBg,
                borderColor: isModern ? modernPalette.border : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.viewStatsBtnText,
                {color: isModern ? modernPalette.accent : colors.primary},
              ]}
            >
              View Stats
            </Text>
            <ChevronRight
              size={14}
              color={isModern ? modernPalette.accent : colors.primary}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsRow}>
        {renderTile(
          taskValue,
          'Task Rate',
          overdueTasks > 0 && avail ? `${overdueTasks} overdue` : taskSublabel,
          taskA11y,
          'stat-tasks-rate',
          modernPalette.softViolet,
          overdueTasks > 0 && avail,
        )}
        {renderTile(
          weekValue,
          'This Week',
          weekSublabel,
          weekA11y,
          'stat-weekly-load',
          modernPalette.mint,
        )}
        {renderTile(
          alertsValue,
          alertsLabel,
          alertsSublabel,
          alertsA11y,
          'stat-alerts-status',
          modernPalette.blueSoft,
        )}
      </View>

      {avail && (
        <View
          style={[
            styles.footerMetaRow,
            {
              borderTopColor: isModern ? modernPalette.border : colors.divider,
            },
          ]}
        >
          <Text style={[styles.footerMetaText, themed.statLabel]}>
            {`${dueTodayTasks} due today · ${
              statistics.notesCount ?? 0
            } notes · ${statistics.lecturesCount ?? 0} lectures`}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: Layout.borderRadiusCard,
    padding: Spacing.lg,
    marginBottom: 24,
  },
  modernContainer: {
    borderRadius: ModernLayout.borderRadiusCard,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  viewStatsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: ModernLayout.borderRadiusPill,
    borderWidth: 1,
    flexShrink: 0,
  },
  viewStatsBtnText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: Layout.borderRadiusCard,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  classicStatCard: {
    borderWidth: 1,
  },
  modernStatCard: {
    borderRadius: ModernLayout.borderRadiusSubCard,
    borderWidth: 1,
    paddingVertical: 12,
  },
  statVal: {
    fontSize: 18,
    fontWeight: 'bold',
    includeFontPadding: false,
  },
  modernStatVal: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: Fonts.heading,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    fontFamily: Fonts.body,
  },
  statSublabel: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
  footerMetaRow: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerMetaText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  container: {
    backgroundColor: colors.cardBg,
  },
  statCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  statVal: {
    color: colors.textPrimary,
  },
  statLabel: {
    color: colors.textSecondary,
  },
  statSublabel: {
    color: colors.textMuted,
  },
});
